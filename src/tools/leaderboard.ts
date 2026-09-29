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
  IDEMPOTENT_WRITE,
  SESSION_REQUIRED,
  SESSION_ERRORS,
} from "./tool-helpers.js";
import { LIST_LEADERBOARDS_OUTPUT, LEADERBOARD_ENTRIES_OUTPUT, USER_RANK_OUTPUT } from "./output-schemas.js";

/**
 * Slug constraint mirrors the server-side validator on
 * `SubmitScoreRequest.leaderboardKey` and `Leaderboard.key`.
 */
const leaderboardKeySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9_-]+$/, "Lowercase alphanumeric with - or _")
  .optional()
  .describe(
    "Board key from horizon_list_leaderboards (1 to 64 characters: a-z, 0-9, _ and -). Omit to use the API key's default board.",
  );

/**
 * Every leaderboard entry carries the player's profile (TASK-881). The tools
 * pass it through unchanged.
 */
const PROFILE_NOTE =
  "profile is {avatarId, frameId, badges} (IDs from the cosmetics catalog; null or [] when not set, set with horizon_set_profile).";

const USER_ID_DESCRIPTION = "Player user ID (UUID) from horizon_signup_* or horizon_signin_*";

const UNKNOWN_BOARD = "404 for an unknown leaderboardKey: list valid keys with horizon_list_leaderboards.";

function topPath(leaderboardKey?: string): string {
  return leaderboardKey
    ? `/api/v1/app/leaderboards/${encodeURIComponent(leaderboardKey)}/top`
    : "/api/v1/app/leaderboard/top";
}

function rankPath(leaderboardKey?: string): string {
  return leaderboardKey
    ? `/api/v1/app/leaderboards/${encodeURIComponent(leaderboardKey)}/rank`
    : "/api/v1/app/leaderboard/rank";
}

function aroundPath(leaderboardKey?: string): string {
  return leaderboardKey
    ? `/api/v1/app/leaderboards/${encodeURIComponent(leaderboardKey)}/around`
    : "/api/v1/app/leaderboard/around";
}

export function registerLeaderboardTools(server: McpServer): void {
  // --- List leaderboard boards ---
  server.registerTool(
    "horizon_list_leaderboards",
    {
      title: "List Leaderboard Boards",
      description: describeTool({
        summary: "Lists the leaderboard boards of this API key with their keys, sort order and whether they accept only validated runs.",
        use: "first, when a game has several boards (weekly, per level) or before submitting, to learn the leaderboardKey values and whether a board is validatedOnly.",
        avoid: "reading entries (use horizon_get_leaderboard_top, horizon_get_user_rank or horizon_get_leaderboard_around).",
        effects: "None (read only).",
        returns:
          "{boards: [{key, name, sortOrder, isActive, scoreCount, validatedOnly}], totalElements}. Pass a key as leaderboardKey to the submit, top, rank and around tools; without it they use the default board. " +
          "validatedOnly true means scores are accepted only through horizon_start_run plus horizon_submit_validated.",
      }),
      inputSchema: {},
      outputSchema: LIST_LEADERBOARDS_OUTPUT,
      annotations: READ_ONLY,
    },
    async () => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const result = await client.get("/api/v1/app/leaderboards");
        return structuredResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // --- Submit score ---
  server.registerTool(
    "horizon_submit_score",
    {
      title: "Submit Score",
      description: describeTool({
        summary: "Submits a player's score to a leaderboard; the board keeps only each player's best score (higher on DESC boards, lower on ASC boards).",
        use: "a round ends on a normal board. Then call horizon_get_user_rank to show the new position.",
        avoid: "boards marked validatedOnly in horizon_list_leaderboards (use horizon_start_run and horizon_submit_validated) and reading scores (use horizon_get_leaderboard_top).",
        requires: SESSION_REQUIRED,
        effects: "replaces the player's entry only when the new score beats it; a worse or equal score, or the same call again, changes nothing.",
        returns: "{success: true} (also when the score did not beat the best one).",
        errors:
          "403 VALIDATED_SUBMIT_REQUIRED on a validatedOnly board, nothing written: switch to horizon_start_run and horizon_submit_validated, do not retry. " +
          "403 PLAYER_BANNED when a moderator banned the player from the board: final, do not retry. " +
          UNKNOWN_BOARD + " " +
          SESSION_ERRORS,
      }),
      inputSchema: {
        userId: z.string().uuid().describe(USER_ID_DESCRIPTION),
        score: z
          .number()
          .int()
          .min(0)
          .describe("Score to submit, a non-negative integer"),
        leaderboardKey: leaderboardKeySchema,
        sessionToken: z.string().min(1).max(256).describe("accessToken from horizon_signin_email or horizon_signin_anonymous for this userId; sent as a Bearer session"),
      },
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ userId, score, leaderboardKey, sessionToken }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const path = leaderboardKey
          ? `/api/v1/app/leaderboards/${encodeURIComponent(leaderboardKey)}/submit`
          : "/api/v1/app/leaderboard/submit";
        const body = leaderboardKey
          ? { userId, score, leaderboardKey }
          : { userId, score };
        const result = await client.post(path, body, sessionHeaders(sessionToken));
        // The API answers with an empty body on success
        return jsonResponse(result ?? { success: true });
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // --- Get leaderboard top ---
  server.registerTool(
    "horizon_get_leaderboard_top",
    {
      title: "Get Leaderboard Top",
      description: describeTool({
        summary: "Returns the top entries of a leaderboard from position 1, each with the player's profile, plus the requesting player's own entry when they are outside the list.",
        use: "a game shows a global top list (top 10, top 100).",
        avoid: "one player's position alone (use horizon_get_user_rank) or the players around them (use horizon_get_leaderboard_around).",
        requires: "a userId from horizon_signup_* or horizon_signin_* (used to append the player's own entry); no session token.",
        effects: "None (read only).",
        returns:
          "{entries: [{position, username, score, profile}]} in board order. When the userId is not among them, the player's own entry with the real position is added at the end. An empty board returns an empty list. " +
          PROFILE_NOTE,
        errors: UNKNOWN_BOARD,
      }),
      inputSchema: {
        userId: z.string().uuid().describe(USER_ID_DESCRIPTION),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Number of top entries to return, 1 to 100 (default 10)"),
        leaderboardKey: leaderboardKeySchema,
      },
      outputSchema: LEADERBOARD_ENTRIES_OUTPUT,
      annotations: READ_ONLY,
    },
    async ({ userId, limit, leaderboardKey }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const result = await client.get(topPath(leaderboardKey), {
          userId,
          limit: String(limit),
        });
        return structuredResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // --- Get user rank ---
  server.registerTool(
    "horizon_get_user_rank",
    {
      title: "Get User Rank",
      description: describeTool({
        summary: "Returns one player's own position, score and profile on a leaderboard.",
        use: "after horizon_submit_score, or to show 'your rank' in the game.",
        avoid: "a list of entries (use horizon_get_leaderboard_top or horizon_get_leaderboard_around).",
        requires: "a userId from horizon_signup_* or horizon_signin_*; no session token.",
        effects: "None (read only).",
        returns: "{position, username, score, profile}. " + PROFILE_NOTE,
        errors: "404 when the player has no score on this board yet (submit one first) or the leaderboardKey is unknown (check horizon_list_leaderboards).",
      }),
      inputSchema: {
        userId: z.string().uuid().describe(USER_ID_DESCRIPTION),
        leaderboardKey: leaderboardKeySchema,
      },
      outputSchema: USER_RANK_OUTPUT,
      annotations: READ_ONLY,
    },
    async ({ userId, leaderboardKey }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const result = await client.get(rankPath(leaderboardKey), { userId });
        return structuredResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );

  // --- Get leaderboard around user ---
  server.registerTool(
    "horizon_get_leaderboard_around",
    {
      title: "Get Leaderboard Around User",
      description: describeTool({
        summary: "Returns the leaderboard entries directly above and below a player's own position, including the player, each with profile.",
        use: "a game shows 'you and your rivals' instead of the global top.",
        avoid: "the global top list (use horizon_get_leaderboard_top) or the position alone (use horizon_get_user_rank).",
        requires: "a userId from horizon_signup_* or horizon_signin_*; no session token.",
        effects: "None (read only).",
        returns: "{entries: [{position, username, score, profile}]} in board order. " + PROFILE_NOTE,
        errors: UNKNOWN_BOARD,
      }),
      inputSchema: {
        userId: z.string().uuid().describe(USER_ID_DESCRIPTION),
        range: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("How many entries around the player to return, 1 to 50 (default 10)"),
        leaderboardKey: leaderboardKeySchema,
      },
      outputSchema: LEADERBOARD_ENTRIES_OUTPUT,
      annotations: READ_ONLY,
    },
    async ({ userId, range, leaderboardKey }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const result = await client.get(aroundPath(leaderboardKey), {
          userId,
          range: String(range),
        });
        return structuredResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
