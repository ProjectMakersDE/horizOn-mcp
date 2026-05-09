import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

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
  // --- Submit score ---
  server.registerTool(
    "horizon_submit_score",
    {
      title: "Submit Score",
      description:
        "Submits a score to a horizOn leaderboard for a given user. Pass leaderboardKey to target a specific board; omit it for the default board.",
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID)"),
        score: z
          .number()
          .int()
          .min(0)
          .describe("Score to submit (non-negative integer)"),
        leaderboardKey: leaderboardKeySchema,
      },
    },
    async ({ userId, score, leaderboardKey }) => {
      const client = createApiClientFromEnv();
      if (!client) return noApiKeyResponse();

      try {
        const path = leaderboardKey
          ? `/api/v1/app/leaderboards/${encodeURIComponent(leaderboardKey)}/submit`
          : "/api/v1/app/leaderboard/submit";
        const result = await client.post(path, { userId, score });
        return jsonResponse(result);
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
        "Gets the top entries from a horizOn leaderboard. Pass leaderboardKey to target a specific board.",
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID)"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(10)
          .describe("Number of top entries to return (1-100, default 10)"),
        leaderboardKey: leaderboardKeySchema,
      },
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
        "Gets the rank of a specific user on a horizOn leaderboard. Pass leaderboardKey to target a specific board.",
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID)"),
        leaderboardKey: leaderboardKeySchema,
      },
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
        "Gets leaderboard entries around a specific user's position on a horizOn leaderboard. Pass leaderboardKey to target a specific board.",
      inputSchema: {
        userId: z.string().uuid().describe("User ID (UUID)"),
        range: z
          .number()
          .int()
          .min(1)
          .max(50)
          .default(10)
          .describe("Number of entries around the user (1-50, default 10)"),
        leaderboardKey: leaderboardKeySchema,
      },
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
