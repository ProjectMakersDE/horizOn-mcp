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
  describeTool,
  ADMIN_AUTH,
  READ_ONLY,
  DESTRUCTIVE_WRITE,
} from "./_utils.js";

const SCOPE_LIST =
  "an Account Key with full-account access or the LEADERBOARD feature group; a project-scoped key must pass its own projectApiKeyId.";

const SCOPE_BY_ID =
  "an Account Key with full-account access or the LEADERBOARD feature group; project-scoped keys are denied (403) for this call.";

const ENTRY_FIELDS =
  "id, leaderboardId, leaderboardKey, leaderboardName, apiKeyId, userId, username, score, submittedAt (same as updatedAt), createdAt, updatedAt, " +
  "profile (avatar, frame, badges), flag (Validated Actions FlagReason name or null), flaggedAt, hidden (shadow or board ban), bannedAt";

export function registerAdminLeaderboardTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_leaderboard_list",
    {
      title: "List Leaderboard Entries",
      description: describeTool(
        {
          summary:
            "Lists the score rows of every leaderboard in the account, highest score first, optionally only those of one Project API key, with paging.",
          use: "finding entries to inspect or moderate across boards, for example to get the id for horizon_admin_leaderboard_get or _delete.",
          avoid:
            "the ranked view players see for one board (use horizon_get_leaderboard_top) or totals (use horizon_admin_leaderboard_getStats).",
          requires: SCOPE_LIST,
          effects: "None (read only).",
          returns:
            `{entries, totalElements, totalPages, currentPage, pageSize}; each entry has ${ENTRY_FIELDS}. ` +
            "An empty entries array means no scores match (or the page is past the end).",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "UUID of the Project API key whose scores to list (from horizon_admin_projects_list; sent as apiKeyId). Omit for all keys; required for a project-scoped Account Key",
          ),
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Entries per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary: "Returns one leaderboard score row by its id, with board, player, profile and moderation fields.",
          use: "checking a single entry before deleting it or when a row looked suspicious in the list.",
          avoid: "browsing many entries (use horizon_admin_leaderboard_list).",
          requires: `id from horizon_admin_leaderboard_list; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns: `One entry: ${ENTRY_FIELDS}.`,
          errors: "404 for an unknown or deleted id: look the entry up with horizon_admin_leaderboard_list.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the score row (the id field of a horizon_admin_leaderboard_list entry)"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary:
            "Deletes one leaderboard score row by id for good, together with any Validated Actions evidence for it; the player can submit a new score afterwards.",
          use: "removing a single cheated, test or unwanted score.",
          avoid: "several rows at once (use horizon_admin_leaderboard_bulkDelete). Bans and shadow bans are done in the dashboard, not here.",
          requires: `id from horizon_admin_leaderboard_list; ${SCOPE_BY_ID}`,
          effects:
            "Deletes the row and any evidence record for it; this cannot be undone. The row no longer counts against the API key's score limit. A second call for the same id fails with 404.",
          returns: "null (the server answers 204 No Content).",
          errors: "404 for an unknown or already deleted id (nothing left to do).",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the score row to delete (the id field of a horizon_admin_leaderboard_list entry)"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Deletes several leaderboard score rows for good in one request; each id is handled independently and ids that are not found are reported, not fatal.",
          use: "cleaning up many rows at once, for example all test scores found with horizon_admin_leaderboard_list.",
          avoid: "a single row (use horizon_admin_leaderboard_delete).",
          requires: `ids from horizon_admin_leaderboard_list; ${SCOPE_BY_ID}`,
          effects:
            "Deletes every found row and any Validated Actions evidence for it; this cannot be undone. Deleted rows no longer count against the score limit. Repeating the call deletes nothing more.",
          returns: "{deletedCount, failedIds}; failedIds lists the ids that were not found (unknown or already deleted).",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        ids: z
          .array(z.string().uuid())
          .min(1)
          .describe("UUIDs of the score rows to delete, at least one (id fields of horizon_admin_leaderboard_list entries)"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Returns aggregate leaderboard numbers (row count, rows per Project API key, average, top and bottom score) for the account or one Project API key.",
          use: "getting an overview of score volume and range without paging through entries.",
          avoid: "the score limit and remaining capacity (use horizon_admin_leaderboard_getLimits) or individual rows (use horizon_admin_leaderboard_list).",
          requires: SCOPE_LIST,
          effects: "None (read only).",
          returns: "{totalEntries, entriesByApiKey (map of Project API key id to row count), averageScore, topScore, bottomScore}.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "UUID of the Project API key to limit the numbers to (from horizon_admin_projects_list; sent as apiKeyId). Omit for the whole account; required for a project-scoped Account Key",
          ),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary:
            "Returns the tier's score row limit (it applies per Project API key, summed over all its boards) and the usage of every key that holds scores.",
          use: "scores stop being accepted, or before a launch to check how much room each Project API key has left.",
          avoid: "score totals and ranges (use horizon_admin_leaderboard_getStats).",
          requires: SCOPE_BY_ID,
          effects: "None (read only).",
          returns:
            "{role, limit, currentCount, remaining, canCreateMore, scope (always API_KEY), apiKeyId, apiKeys}. The top-level numbers describe the Project API key with the most rows " +
            "(apiKeyId null and currentCount 0 when the account has no scores); apiKeys lists {apiKeyId, currentCount, remaining, canCreateMore} per key, highest usage first.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Accepted for compatibility but not sent: the result always covers every Project API key (read the matching item in apiKeys)",
          ),
      },
      annotations: READ_ONLY,
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
