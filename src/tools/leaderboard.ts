import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

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
    "Leaderboard key — selects a named board on the API key. Omit to use the default board.",
  );

/**
 * Every leaderboard entry carries the player's profile (TASK-881). The tools
 * pass it through unchanged.
 */
const PROFILE_NOTE =
  "profile is {avatarId, frameId, badges} (IDs from the cosmetics catalog; null or [] when not set, set with horizon_set_profile). ";

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
      description:
        "Lists the leaderboard boards configured for this API key. Call it first when a game has several boards, " +
        "then pass a board's key as leaderboardKey to the submit, top, rank and around tools; without a key they use the default board. " +
        "Returns {boards: [{key, name, sortOrder, isActive, scoreCount, validatedOnly}], totalElements}. " +
        "A board with validatedOnly: true only accepts scores from horizon_start_run plus horizon_submit_validated; horizon_submit_score answers 403 VALIDATED_SUBMIT_REQUIRED there. " +
        API_ERRORS,
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const result = await client.get("/api/v1/app/leaderboards");
        return jsonResponse(result);
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
      description:
        "Submits a player's score to a leaderboard. Needs the player's session: sign in with horizon_signin_email or horizon_signin_anonymous first and pass its accessToken. " +
        "The board keeps each player's best score (higher wins on DESC boards, lower on ASC boards), so a score that does not beat it changes nothing " +
        "and sending the same score twice has no further effect. Omit leaderboardKey for the default board or use a key from horizon_list_leaderboards. " +
        "Returns {success: true}; an expired session gives 401, a session of another user 403. " +
        "A board marked validatedOnly (see horizon_list_leaderboards) rejects this call with 403 VALIDATED_SUBMIT_REQUIRED and writes nothing: " +
        "use horizon_start_run and horizon_submit_validated for such boards, do not retry. A player banned from the board by a moderator gets 403 PLAYER_BANNED (final, do not retry). " +
        "To show the result, call horizon_get_user_rank. " +
        API_ERRORS,
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
        score: z
          .number()
          .int()
          .min(0)
          .describe("Score to submit (non-negative integer)"),
        leaderboardKey: leaderboardKeySchema,
        sessionToken: z.string().min(1).max(256).describe("accessToken returned by horizon_signin_email or horizon_signin_anonymous for this user; sent as a Bearer session"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
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
      description:
        "Returns the best entries of a leaderboard as {entries: [{position, username, score, profile}]}, in the board's sort order starting at position 1. " +
        PROFILE_NOTE +
        "If the player given by userId is not in that list, their own entry with the real position is added at the end. An unknown leaderboardKey gives 404. " +
        "Use it for a global top list; use horizon_get_user_rank for one player's position and horizon_get_leaderboard_around for the players near them. " +
        "Omit leaderboardKey for the default board. " +
        API_ERRORS,
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Number of top entries to return (1-100, default 10)"),
        leaderboardKey: leaderboardKeySchema,
      },
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
        return jsonResponse(result);
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
      description:
        "Returns one player's own position on a leaderboard as {position, username, score, profile}, for example after horizon_submit_score. " +
        PROFILE_NOTE +
        "A player without a score on that board gives 404. " +
        "Use horizon_get_leaderboard_top for the top list and horizon_get_leaderboard_around to include the neighbouring players. " +
        "Omit leaderboardKey for the default board. " +
        API_ERRORS,
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
        leaderboardKey: leaderboardKeySchema,
      },
      annotations: READ_ONLY,
    },
    async ({ userId, leaderboardKey }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const result = await client.get(rankPath(leaderboardKey), { userId });
        return jsonResponse(result);
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
      description:
        "Returns the entries around a player's own position as {entries: [{position, username, score, profile}]}, for views like 'you and your rivals'. " +
        PROFILE_NOTE +
        "range sets how many entries around the player are returned. Use horizon_get_leaderboard_top for the top list and horizon_get_user_rank for the position alone. " +
        "Omit leaderboardKey for the default board. " +
        API_ERRORS,
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
        range: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Number of entries around the user (1-50, default 10)"),
        leaderboardKey: leaderboardKeySchema,
      },
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
        return jsonResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}
