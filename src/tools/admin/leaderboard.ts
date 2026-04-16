/**
 * Admin tools for managing leaderboard entries.
 *
 * Leaderboard entries are per-project score records submitted by
 * end-users via the runtime app API. These tools wrap the
 * /api/v1/admin/leaderboard endpoints so callers can list, fetch,
 * delete (single and bulk) entries and inspect statistics/limits from
 * the MCP surface.
 *
 * All tools require HORIZON_ACCOUNT_API_KEY.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  getAdminClient,
  noAdminClientResponse,
  jsonResponse,
  errorResponse,
} from "./_utils.js";

export function registerAdminLeaderboardTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_leaderboard_list",
    {
      title: "List Leaderboard Entries",
      description:
        "Lists leaderboard entries for the authenticated account, optionally filtered by project API key. Entries are paginated; default sort is score DESC.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key to filter entries by",
          ),
        page: z.number().int().min(0).default(0).describe("0-based page index"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("items per page (1-100)"),
      },
    },
    async ({ projectApiKeyId, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined)
          params.apiKeyId = projectApiKeyId;
        const result = await client.get(
          "/api/v1/admin/leaderboard",
          params,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_leaderboard_get",
    {
      title: "Get Leaderboard Entry",
      description:
        "Fetches a single leaderboard entry by its UUID.",
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the leaderboard entry to fetch"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/leaderboard/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_leaderboard_delete",
    {
      title: "Delete Leaderboard Entry",
      description:
        "Soft-deletes a leaderboard entry. Deleted entries disappear from list results but are kept for audit.",
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the leaderboard entry to delete"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/leaderboard/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_leaderboard_bulkDelete",
    {
      title: "Bulk Delete Leaderboard Entries",
      description:
        "Deletes multiple leaderboard entries in a single request. The backend processes each ID independently and returns per-entry success/failure.",
      inputSchema: {
        ids: z
          .array(z.string().uuid())
          .min(1)
          .describe("List of entry UUIDs to delete"),
      },
    },
    async ({ ids }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        // Backend uses DELETE /api/v1/admin/leaderboard/bulk with the id list
        // in the request body.
        const result = await client.delete(
          "/api/v1/admin/leaderboard/bulk",
          { ids },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_leaderboard_getStats",
    {
      title: "Get Leaderboard Statistics",
      description:
        "Returns aggregated leaderboard statistics (total entries, average/top/bottom score, per-project breakdown). Optionally scoped to a single project API key.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe("Optional UUID of the project API key to filter by"),
      },
    },
    async ({ projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = {};
        if (projectApiKeyId !== undefined)
          params.apiKeyId = projectApiKeyId;
        const result = await client.get(
          "/api/v1/admin/leaderboard/statistics",
          params,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_leaderboard_getLimits",
    {
      title: "Get Leaderboard Limits",
      description:
        "Returns the leaderboard limits and current usage for the authenticated account (role, max entries, current count, remaining slots, canCreateMore). Account-scoped — the projectApiKeyId parameter is kept for forward-compat but currently ignored.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key. Currently ignored by the backend; kept for forward-compat.",
          ),
      },
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/leaderboard/limits",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
