import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerLeaderboardTools(server: McpServer): void {
  // --- Submit score ---
  server.registerTool("horizon_submit_score", {
    title: "Submit Score",
    description:
      "Submits a score to the horizOn leaderboard for a given user.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
      score: z.number().int().min(0).describe("Score to submit (non-negative integer)"),
    },
  }, async ({ userId, score }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/leaderboard/submit", {
        userId,
        score,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get leaderboard top ---
  server.registerTool("horizon_get_leaderboard_top", {
    title: "Get Leaderboard Top",
    description:
      "Gets the top entries from the horizOn leaderboard.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
      limit: z.number().int().min(1).max(100).default(10).describe("Number of top entries to return (1-100, default 10)"),
    },
  }, async ({ userId, limit }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/leaderboard/top", {
        userId,
        limit: String(limit),
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get user rank ---
  server.registerTool("horizon_get_user_rank", {
    title: "Get User Rank",
    description:
      "Gets the rank of a specific user on the horizOn leaderboard.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
    },
  }, async ({ userId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/leaderboard/rank", {
        userId,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get leaderboard around user ---
  server.registerTool("horizon_get_leaderboard_around", {
    title: "Get Leaderboard Around User",
    description:
      "Gets leaderboard entries around a specific user's position on horizOn.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
      range: z.number().int().min(1).max(50).default(10).describe("Number of entries around the user (1-50, default 10)"),
    },
  }, async ({ userId, range }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/leaderboard/around", {
        userId,
        range: String(range),
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
