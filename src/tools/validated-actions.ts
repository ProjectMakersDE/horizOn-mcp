import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

const RUNS_PATH = "/api/v1/app/validated-actions/runs";
const SUBMIT_PATH = "/api/v1/app/validated-actions/submit";
const STATE_PATH = "/api/v1/app/validated-actions/state";

/** SHA-256 as 64 hex characters (the server accepts upper case and stores it as bytes). */
export const INPUT_LOG_HASH_PATTERN = /^[0-9a-fA-F]{64}$/;

/** Standard base64 with optional padding, whitespace already removed. */
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Stage key rule of the server (`SubmitValidatedRequest.stage`). */
export const STAGE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/;

/** Earned value key rule (Part 2, TASK-887). */
export const EARNED_KEY_PATTERN = /^[a-z0-9][a-z0-9._-]{0,23}$/;

/** Highest score the server accepts (2^53 - 1). */
export const MAX_SCORE = Number.MAX_SAFE_INTEGER;

/** Most earned values per run. */
export const MAX_EARNED = 64;

/** Largest magnitude of an earned amount; value rules and balances stay within 2^53 - 1. */
export const MAX_EARNED_AMOUNT = Number.MAX_SAFE_INTEGER;

/**
 * First key that appears twice in `earned`, or null. The server rejects such
 * a run with 422 DUPLICATE_VALUE_KEY and consumes the ticket, so the tool
 * checks it before sending.
 */
export function findDuplicateEarnedKey(earned: ReadonlyArray<{ key: string }>): string | null {
  const seen = new Set<string>();
  for (const { key } of earned) {
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

/**
 * SHA-256 of the raw input log bytes as 64 lower case hex characters. The
 * SDKs compute the same value (`ComputeInputLogHash`), and the same bytes are
 * what a later evidence upload must contain.
 */
export function computeInputLogHash(inputLog: Uint8Array): string {
  return createHash("sha256").update(inputLog).digest("hex");
}

type HashSource = {
  inputLogHash?: string;
  inputLogBase64?: string;
  inputLog?: string;
};

/**
 * Picks the input log hash from exactly one of the three inputs: a ready
 * hash, base64 bytes or UTF-8 text. Returns the hash in lower case, or an
 * error text when none or more than one is given or the value is malformed.
 */
export function resolveInputLogHash(source: HashSource): { hash: string } | { error: string } {
  const given = (["inputLogHash", "inputLogBase64", "inputLog"] as const).filter(
    (field) => source[field] !== undefined,
  );
  if (given.length !== 1) {
    return {
      error:
        "INVALID_INPUT_LOG_HASH: pass exactly one of inputLogHash, inputLogBase64 or inputLog" +
        (given.length > 1 ? ` (got ${given.join(", ")})` : ""),
    };
  }

  if (source.inputLogHash !== undefined) {
    if (!INPUT_LOG_HASH_PATTERN.test(source.inputLogHash)) {
      return { error: "INVALID_INPUT_LOG_HASH: inputLogHash must be 64 hex characters (SHA-256)" };
    }
    return { hash: source.inputLogHash.toLowerCase() };
  }

  if (source.inputLogBase64 !== undefined) {
    const compact = source.inputLogBase64.replace(/\s+/g, "");
    if (!BASE64_PATTERN.test(compact)) {
      return { error: "INVALID_INPUT_LOG_HASH: inputLogBase64 is not valid base64" };
    }
    return { hash: computeInputLogHash(Buffer.from(compact, "base64")) };
  }

  return { hash: computeInputLogHash(Buffer.from(source.inputLog as string, "utf8")) };
}

const userIdSchema = z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool");

const sessionTokenSchema = z
  .string()
  .min(1)
  .max(256)
  .describe("accessToken returned by horizon_signin_email or horizon_signin_anonymous for this user; sent as a Bearer session");

const leaderboardKeySchema = (purpose: string) =>
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "Lowercase alphanumeric with - or _")
    .optional()
    .describe(purpose);

const SESSION_NOTE =
  "Needs the player's session: sign in with horizon_signin_email or horizon_signin_anonymous first and pass its accessToken. ";

const START_ERRORS =
  "Errors carry a stable code in the body and the error result names it: 401 SESSION_REQUIRED, 403 SESSION_FORBIDDEN, " +
  "404 PLAYER_NOT_FOUND or LEADERBOARD_NOT_FOUND, 429 RUN_RATE_LIMITED (per player and hour) or RUN_CAPACITY_REACHED (account per UTC hour; do not retry automatically, the wait can be an hour), " +
  "503 VALIDATED_ACTIONS_UNAVAILABLE (server has no ticket key). ";

const SUBMIT_ERRORS =
  "Rejections carry a stable code (never the rule values) and the error result names it: " +
  "400 SCORE_REQUIRED (board targeted without score) or PLAYER_NAME_REQUIRED; 401 SESSION_REQUIRED; 403 SESSION_FORBIDDEN or SCORE_LIMIT_REACHED (ticket used up); " +
  "404 PLAYER_NOT_FOUND or LEADERBOARD_NOT_FOUND; 422 TICKET_INVALID, TICKET_EXPIRED, TICKET_FOREIGN, TICKET_CONSUMED, LEADERBOARD_MISMATCH; " +
  "422 rule codes STAGE_REQUIRED, STAGE_UNKNOWN, SCORE_ABOVE_MAX, SCORE_BELOW_MIN, STAGE_SCORE_ABOVE_MAX, STAGE_SCORE_BELOW_MIN, DURATION_TOO_SHORT, SCORE_RATE_TOO_HIGH " +
  "and value codes UNKNOWN_VALUE_KEY (key not defined in the rules' values, also when the rules define none), DUPLICATE_VALUE_KEY, EARNED_ABOVE_MAX (above maxPerRun), " +
  "EARNED_BELOW_MIN (below minPerRun), INSUFFICIENT_BALANCE (spend larger than the balance) (the ticket is consumed, start a new run); 503 VALIDATED_ACTIONS_UNAVAILABLE. " +
  "After a 422 rule or value code or SCORE_LIMIT_REACHED the ticket is spent; after 401, 404, 429 or 503 the same ticket may be sent again. " +
  "Local errors (no request sent, ticket kept): INVALID_INPUT_LOG_HASH when the hash input was missing, doubled or malformed, DUPLICATE_VALUE_KEY when earned lists a key twice. ";

const STATE_RESULT_NOTE =
  "state is the player's server-owned values after the run: {day, values: [{key, balance, earnedToday, dailyCap, requested, credited}]}, every value key of the rules sorted by key; " +
  "requested (amount sent) and credited (amount applied) appear only for the keys in earned. credited < requested on a positive amount means dailyCap or maxBalance clamped it (not an error). " +
  "For a spend, credited is either requested or 0 (a concurrent run of the same player used the balance first): grant a purchase only when credited == requested. " +
  "state is null when the rules define no values or the state write failed. ";

export function registerValidatedActionsTools(server: McpServer): void {
  // --- Start a validated run ---
  server.registerTool("horizon_start_run", {
    title: "Start Validated Run",
    description:
      "Starts a server-checked run (Validated Actions): the server issues a single-use ticket with a server seed and starts measuring the run duration. " +
      SESSION_NOTE +
      "Pass leaderboardKey to bind the ticket to a board (it must exist, 'default' is created on first use); boards marked validatedOnly in horizon_list_leaderboards only accept scores this way. " +
      "Returns {runId, ticket, seed, leaderboardKey, issuedAt, expiresAt, expiresInSeconds}. Seed the game's deterministic randomness with seed, record the input log, " +
      "then send the result with horizon_submit_validated and the unchanged ticket before expiresAt. Every call counts against the run limits. " +
      START_ERRORS +
      API_ERRORS,
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
      leaderboardKey: leaderboardKeySchema(
        "Board key to bind the ticket to (from horizon_list_leaderboards). Omit for an unbound ticket.",
      ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ userId, sessionToken, leaderboardKey }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const body = leaderboardKey ? { userId, leaderboardKey } : { userId };
      const result = await client.post(RUNS_PATH, body, sessionHeaders(sessionToken));
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Submit a validated run ---
  server.registerTool("horizon_submit_validated", {
    title: "Submit Validated Run",
    description:
      "Submits the result of a run started with horizon_start_run. The server checks the ticket and the API key's server-only rules (score limits, minimum duration, score per second, stage rules) " +
      "before anything is written, then consumes the ticket (single use, also when rejected) and writes the score to the board. " +
      SESSION_NOTE +
      "The input log commitment is the SHA-256 of the raw input log bytes as 64 hex characters. Pass exactly one of: inputLogHash (a ready hash), " +
      "inputLogBase64 (the raw log bytes, hashed locally) or inputLog (UTF-8 text, hashed locally). The log itself is never sent. " +
      "Omit leaderboardKey to use the ticket's board; score is required when a board is targeted and ignored for a run without board. " +
      "Pass earned ({key, amount}[]) to earn (positive) or spend (negative) server-owned values defined in the rules (currency, loot counters); " +
      "send it only when the API key's rules define values, and use horizon_get_state to read the balances. " +
      "Returns {accepted, runId, leaderboardKey, score, bestScore, isNewHighScore, rank, durationSeconds, state, evidence} plus inputLogHash (the hash that was sent). " +
      STATE_RESULT_NOTE +
      SUBMIT_ERRORS +
      API_ERRORS,
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
      ticket: z.string().min(1).max(512).describe("ticket from horizon_start_run, unchanged"),
      inputLogHash: z
        .string()
        .regex(INPUT_LOG_HASH_PATTERN, "SHA-256 as 64 hex characters")
        .optional()
        .describe("SHA-256 of the raw input log bytes, 64 hex characters. Use this or inputLogBase64 or inputLog."),
      inputLogBase64: z
        .string()
        .min(1)
        .max(2_000_000)
        .optional()
        .describe("Raw input log bytes as base64; the tool computes the SHA-256 locally. Use this or inputLogHash or inputLog."),
      inputLog: z
        .string()
        .max(1_000_000)
        .optional()
        .describe("Input log as UTF-8 text; the tool hashes its UTF-8 bytes locally. Use this or inputLogHash or inputLogBase64."),
      score: z
        .number()
        .int()
        .min(0)
        .max(MAX_SCORE)
        .optional()
        .describe("Claimed score (0 to 9007199254740991). Required when a board is targeted, ignored for a run without board."),
      stage: z
        .string()
        .regex(STAGE_PATTERN, "Stage key: lowercase letters, digits, '.', '_', '-', 1 to 32 characters")
        .optional()
        .describe("Stage key for stage rules (for example \"level-3\")"),
      leaderboardKey: leaderboardKeySchema(
        "Target board. Omit to use the board the ticket is bound to; required for a leaderboard write with an unbound ticket.",
      ),
      earned: z
        .array(
          z.object({
            key: z.string().regex(EARNED_KEY_PATTERN, "Value key: lowercase letters, digits, '.', '_', '-', 1 to 24 characters"),
            amount: z
              .number()
              .int()
              .min(-MAX_EARNED_AMOUNT)
              .max(MAX_EARNED_AMOUNT)
              .describe("Earned (positive) or spent (negative) amount; checked against maxPerRun and minPerRun of the value"),
          }),
        )
        .max(MAX_EARNED)
        .optional()
        .describe(
          "Earned or spent server-owned values ({key, amount}, at most 64, each key once). Every key must be defined in the values of the API key's rules (else UNKNOWN_VALUE_KEY). Omit when the game uses no server-owned values.",
        ),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  }, async ({ userId, sessionToken, ticket, inputLogHash, inputLogBase64, inputLog, score, stage, leaderboardKey, earned }) => {
    const resolved = resolveInputLogHash({ inputLogHash, inputLogBase64, inputLog });
    if ("error" in resolved) {
      return {
        content: [{ type: "text" as const, text: resolved.error }],
        isError: true,
      };
    }

    const duplicateKey = earned ? findDuplicateEarnedKey(earned) : null;
    if (duplicateKey !== null) {
      return {
        content: [
          {
            type: "text" as const,
            text: `DUPLICATE_VALUE_KEY: earned lists "${duplicateKey}" more than once; merge the amounts into one entry (no request sent, the ticket is still usable)`,
          },
        ],
        isError: true,
      };
    }

    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    const body: Record<string, unknown> = { userId, ticket, inputLogHash: resolved.hash };
    if (score !== undefined) body.score = score;
    if (stage) body.stage = stage;
    if (leaderboardKey) body.leaderboardKey = leaderboardKey;
    if (earned && earned.length > 0) body.earned = earned;

    try {
      const result = await client.post<Record<string, unknown> | null>(SUBMIT_PATH, body, sessionHeaders(sessionToken));
      return jsonResponse({ ...(result ?? {}), inputLogHash: resolved.hash });
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get server-owned player state ---
  server.registerTool("horizon_get_state", {
    title: "Get Player State",
    description:
      "Returns the player's server-owned values (Validated Actions): balances of currency or loot counters that only accepted validated runs change (earned in horizon_submit_validated). " +
      SESSION_NOTE +
      "Returns {userId, day, values: [{key, balance, earnedToday, dailyCap}]}: every value key defined in the API key's rules, sorted by key (balance 0 when never earned); " +
      "values is empty when the rules define no values. day is the current UTC day, earnedToday the positive credit on that day (0 after midnight UTC), dailyCap null when the value has no daily cap; " +
      "the other value rules stay hidden. Read only: there is no tool or endpoint that writes a balance. Games may mirror the values into cloud save for offline display but must never send them back. " +
      "Errors carry a stable code in the body: 401 SESSION_REQUIRED, 403 SESSION_FORBIDDEN, 404 PLAYER_NOT_FOUND, 429 without code (account request limit). " +
      API_ERRORS,
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
    },
    annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get(STATE_PATH, { userId }, sessionHeaders(sessionToken));
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
