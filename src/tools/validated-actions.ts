import { createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import {
  noApiKeyResponse,
  errorResponse,
  jsonResponse,
  structuredResponse,
  describeTool,
  READ_ONLY,
  ADDITIVE_WRITE,
  DESTRUCTIVE_NON_IDEMPOTENT,
  SESSION_REQUIRED,
} from "./tool-helpers.js";
import { PLAYER_STATE_OUTPUT } from "./output-schemas.js";

const RUNS_PATH = "/api/v1/app/validated-actions/runs";
const SUBMIT_PATH = "/api/v1/app/validated-actions/submit";
const STATE_PATH = "/api/v1/app/validated-actions/state";

/** Upload path of a requested input log (Part 3, TASK-888). */
export function evidencePath(runId: string): string {
  return `${RUNS_PATH}/${encodeURIComponent(runId)}/evidence`;
}

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

type LogSource = {
  inputLogBase64?: string;
  inputLog?: string;
};

/**
 * Picks the raw input log bytes for an evidence upload from exactly one of
 * two inputs: base64 bytes or UTF-8 text. Returns the standard base64 the
 * server expects (whitespace removed), the decoded byte count and the
 * SHA-256 of the bytes (the hash the run must have been submitted with), or
 * an error text when none or both are given or the base64 is malformed.
 */
export function resolveInputLogBytes(
  source: LogSource,
): { base64: string; bytes: number; hash: string } | { error: string } {
  const given = (["inputLogBase64", "inputLog"] as const).filter((field) => source[field] !== undefined);
  if (given.length !== 1) {
    return {
      error:
        "INVALID_INPUT_LOG: pass exactly one of inputLogBase64 or inputLog" +
        (given.length > 1 ? ` (got ${given.join(", ")})` : ""),
    };
  }

  let raw: Buffer;
  if (source.inputLogBase64 !== undefined) {
    const compact = source.inputLogBase64.replace(/\s+/g, "");
    if (!BASE64_PATTERN.test(compact)) {
      return { error: "INVALID_INPUT_LOG: inputLogBase64 is not valid standard base64" };
    }
    raw = Buffer.from(compact, "base64");
  } else {
    raw = Buffer.from(source.inputLog as string, "utf8");
  }

  if (raw.length === 0) {
    return { error: "INVALID_INPUT_LOG: the input log is empty" };
  }

  return { base64: raw.toString("base64"), bytes: raw.length, hash: computeInputLogHash(raw) };
}

const userIdSchema = z.string().uuid().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*");

const sessionTokenSchema = z
  .string()
  .min(1)
  .max(256)
  .describe("accessToken from horizon_signin_email or horizon_signin_anonymous for this userId; sent as a Bearer session");

const leaderboardKeySchema = (purpose: string) =>
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9_-]+$/, "Lowercase alphanumeric with - or _")
    .optional()
    .describe(purpose);

const START_ERRORS =
  "Errors carry a stable code in the body and the error result names it: 401 SESSION_REQUIRED, 403 SESSION_FORBIDDEN, " +
  "404 PLAYER_NOT_FOUND or LEADERBOARD_NOT_FOUND, 429 RUN_RATE_LIMITED (per player and hour) or RUN_CAPACITY_REACHED (account per UTC hour; do not retry automatically, the wait can be an hour), " +
  "503 VALIDATED_ACTIONS_UNAVAILABLE (server has no ticket key). After 401 sign in again; after 403 SESSION_FORBIDDEN pass the userId that signed in.";

const SUBMIT_ERRORS =
  "Rejections carry a stable code (never the rule values) and the error result names it: " +
  "400 SCORE_REQUIRED (board targeted without score) or PLAYER_NAME_REQUIRED; 401 SESSION_REQUIRED; 403 SESSION_FORBIDDEN, PLAYER_BANNED (banned from the board by a moderator, final; the ticket is not used) or SCORE_LIMIT_REACHED (ticket used up); " +
  "404 PLAYER_NOT_FOUND or LEADERBOARD_NOT_FOUND; 422 TICKET_INVALID, TICKET_EXPIRED, TICKET_FOREIGN, TICKET_CONSUMED, LEADERBOARD_MISMATCH; " +
  "422 rule codes STAGE_REQUIRED, STAGE_UNKNOWN, SCORE_ABOVE_MAX, SCORE_BELOW_MIN, STAGE_SCORE_ABOVE_MAX, STAGE_SCORE_BELOW_MIN, DURATION_TOO_SHORT, SCORE_RATE_TOO_HIGH " +
  "and value codes UNKNOWN_VALUE_KEY (key not defined in the rules' values, also when the rules define none), DUPLICATE_VALUE_KEY, EARNED_ABOVE_MAX (above maxPerRun), " +
  "EARNED_BELOW_MIN (below minPerRun), INSUFFICIENT_BALANCE (spend larger than the balance) (the ticket is consumed, start a new run); 503 VALIDATED_ACTIONS_UNAVAILABLE. " +
  "After a 422 rule or value code or SCORE_LIMIT_REACHED the ticket is spent; after 401, 404, 429 or 503 the same ticket may be sent again. " +
  "Local errors (no request sent, ticket kept): INVALID_INPUT_LOG_HASH when the hash input was missing, doubled or malformed, DUPLICATE_VALUE_KEY when earned lists a key twice.";

const STATE_RESULT_NOTE =
  "state is the player's server-owned values after the run: {day, values: [{key, balance, earnedToday, dailyCap, requested, credited}]}, every value key of the rules sorted by key; " +
  "requested (amount sent) and credited (amount applied) appear only for the keys in earned. credited < requested on a positive amount means dailyCap or maxBalance clamped it (not an error). " +
  "For a spend, credited is either requested or 0 (a concurrent run of the same player used the balance first): grant a purchase only when credited == requested. " +
  "state is null when the rules define no values or the state write failed.";

const EVIDENCE_RESULT_NOTE =
  "evidence is null, or {required: true, runId, uploadBefore, maxBytes} when the server asks for the input log (the run became the player's row and is flagged or lands in the board's evidence top N): " +
  "upload exactly the logged bytes with horizon_upload_evidence before uploadBefore (24 hours); a log that was only hashed via inputLogHash must be kept by the caller.";

const UPLOAD_ERRORS =
  "Errors carry a stable code in the body and the error result names it: 400 EVIDENCE_INVALID_ENCODING (not standard base64), 401 SESSION_REQUIRED, 403 SESSION_FORBIDDEN, " +
  "404 EVIDENCE_NOT_REQUESTED (no request for this run and player; also for a run of another player), 409 EVIDENCE_ALREADY_UPLOADED, " +
  "410 EVIDENCE_EXPIRED (window passed, slot freed), 413 EVIDENCE_TOO_LARGE (decoded log above maxBytes), " +
  "422 EVIDENCE_HASH_MISMATCH (SHA-256 of the log differs from the run's inputLogHash; the request stays open, retry with the correct bytes until uploadBefore), 429 without code (account request limit). " +
  "Only 422 and network errors are worth a retry; the others are final. Local error (no request sent): INVALID_INPUT_LOG when the log input was missing, doubled, empty or not base64.";

export function registerValidatedActionsTools(server: McpServer): void {
  // --- Start a validated run ---
  server.registerTool("horizon_start_run", {
    title: "Start Validated Run",
    description: describeTool({
      summary: "Starts a server-checked run (Validated Actions): issues a single-use ticket with a server seed and starts the server's run timer.",
      use: "before a round whose score or earned currency must be checked by the server, and always for boards marked validatedOnly in horizon_list_leaderboards.",
      avoid: "normal boards where the client may write its own score (use horizon_submit_score) and reading balances (use horizon_get_state).",
      requires: SESSION_REQUIRED + " Pass leaderboardKey to bind the ticket to a board (it must exist; 'default' is created on first use).",
      effects: "issues a new ticket per call and counts against the run limits per player and per account; unused tickets simply expire.",
      returns:
        "{runId, ticket, seed, leaderboardKey, issuedAt, expiresAt, expiresInSeconds}. Seed the game's deterministic randomness with seed, record the input log, " +
        "then send the result with horizon_submit_validated and the unchanged ticket before expiresAt.",
      errors: START_ERRORS,
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
      leaderboardKey: leaderboardKeySchema(
        "Board key to bind the ticket to, from horizon_list_leaderboards (1 to 64 characters: a-z, 0-9, _ and -). Omit for an unbound ticket (currency only runs, or choose the board at submit).",
      ),
    },
    annotations: ADDITIVE_WRITE,
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
    description: describeTool({
      summary: "Submits the result of a run started with horizon_start_run; the server checks ticket and server-only rules before it writes the score and earned values.",
      use: "a validated run ends: send the ticket, the claimed score (and stage) and the SHA-256 commitment of the input log.",
      avoid: "runs without a ticket (use horizon_submit_score on normal boards) and reading balances (use horizon_get_state).",
      requires:
        SESSION_REQUIRED + " The ticket from horizon_start_run and exactly one of inputLogHash (a ready SHA-256), inputLogBase64 (raw log bytes, hashed locally) or inputLog (UTF-8 text, hashed locally); the log itself is never sent. " +
        "score is required when a board is targeted (the ticket's board, or leaderboardKey) and ignored otherwise. " +
        "Send earned ({key, amount}[]) only when the API key's rules define values: positive amounts earn, negative amounts spend.",
      effects:
        "consumes the ticket (single use, also when rejected); an accepted run writes the score (best score kept) and changes the balances of earned values. " +
        "The same ticket cannot be submitted twice.",
      returns:
        "{accepted, runId, leaderboardKey, score, bestScore, isNewHighScore, rank, durationSeconds, state, evidence} plus inputLogHash (the hash that was sent). " +
        STATE_RESULT_NOTE + " " +
        EVIDENCE_RESULT_NOTE,
      errors: SUBMIT_ERRORS,
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
      ticket: z.string().min(1).max(512).describe("ticket from horizon_start_run, sent unchanged (opaque, about 190 characters, max 512)"),
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
    annotations: DESTRUCTIVE_NON_IDEMPOTENT,
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
    description: describeTool({
      summary: "Returns the player's server-owned values (Validated Actions): balance, today's earnings and daily cap per value key, such as currency or loot counters.",
      use: "the game shows the wallet or checks whether a spend is possible before starting a run.",
      avoid: "changing balances: nothing writes a balance directly, only accepted runs through horizon_submit_validated with earned. Also not for the save game (use horizon_load_cloud_data).",
      requires: SESSION_REQUIRED,
      effects: "None (read only).",
      returns:
        "{userId, day, values: [{key, balance, earnedToday, dailyCap}]}: every value key defined in the API key's rules, sorted by key (balance 0 when never earned); " +
        "values is empty when the rules define no values. day is the current UTC day, earnedToday the positive credit on that day (0 after midnight UTC), dailyCap null without a daily cap; " +
        "the other value rules stay hidden. Games may mirror the values into cloud save for offline display but must never send them back.",
      errors:
        "The error result names the stable code: 401 SESSION_REQUIRED (sign in again), 403 SESSION_FORBIDDEN (pass the userId that signed in), 404 PLAYER_NOT_FOUND, 429 without code (account request limit, wait).",
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
    },
    outputSchema: PLAYER_STATE_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get(STATE_PATH, { userId }, sessionHeaders(sessionToken));
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Upload evidence (Part 3, TASK-888) ---
  server.registerTool("horizon_upload_evidence", {
    title: "Upload Validated Run Evidence",
    description: describeTool({
      summary: "Uploads the input log of a validated run after horizon_submit_validated answered with evidence.required = true (evidence review).",
      use: "only when a submit result carries evidence.required: true, before evidence.uploadBefore (24 hours).",
      avoid: "runs without an evidence request (the server answers 404 EVIDENCE_NOT_REQUESTED) and sending the log with the submit (the submit takes only its hash).",
      requires:
        SESSION_REQUIRED + " The runId from the submit result and the raw input log as exactly one of inputLogBase64 (raw bytes as base64) or inputLog (UTF-8 text). " +
        "Its SHA-256 must equal the inputLogHash sent with the run, so pass the same bytes or text that were hashed at submit; at most evidence.maxBytes (32,768 bytes by default).",
      effects: "stores the log for the developer's review; one upload per run (a second one gets 409).",
      returns: "{runId, status: \"UPLOADED\", bytes} plus inputLogHash (the SHA-256 of the uploaded bytes, for comparison with the submit).",
      errors: UPLOAD_ERRORS,
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
      runId: z.string().uuid().describe("runId (UUID) from the horizon_submit_validated result (evidence.runId)"),
      inputLogBase64: z
        .string()
        .min(1)
        .max(2_000_000)
        .optional()
        .describe("Raw input log bytes as standard base64. Use this or inputLog."),
      inputLog: z
        .string()
        .max(1_000_000)
        .optional()
        .describe("Input log as UTF-8 text; its UTF-8 bytes are uploaded. Use this or inputLogBase64."),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ userId, sessionToken, runId, inputLogBase64, inputLog }) => {
    const resolved = resolveInputLogBytes({ inputLogBase64, inputLog });
    if ("error" in resolved) {
      return {
        content: [{ type: "text" as const, text: resolved.error }],
        isError: true,
      };
    }

    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.put<Record<string, unknown> | null>(
        evidencePath(runId),
        { userId, log: resolved.base64 },
        sessionHeaders(sessionToken),
      );
      return jsonResponse({ ...(result ?? {}), inputLogHash: resolved.hash });
    } catch (error) {
      const response = errorResponse(error);
      response.content[0].text += ` (local SHA-256 of the sent ${resolved.bytes} bytes: ${resolved.hash})`;
      return response;
    }
  });
}
