/**
 * Admin tool for reading user logs.
 *
 * User logs are runtime log entries emitted by end users of your
 * application via the app API. This tool wraps the
 * /api/v1/admin/user-logs list endpoint and is read-only.
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
} from "./_utils.js";

export function registerAdminUserLogsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_userlogs_list",
    {
      title: "List User Logs",
      description: describeTool(
        {
          summary:
            "Lists the log entries games wrote for their players, newest first, filterable by Project API key and level (INFO, WARN, ERROR), with paging.",
          use: "investigating what happened for players, for example all ERROR entries of one game.",
          avoid: "writing a log entry (use horizon_create_log) or crash data (use horizon_admin_crashes_listGroups).",
          requires:
            "an Account Key with full-account access or the USER_LOGS feature group; a project-scoped key must pass its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            "{content, page: {size, number, totalElements, totalPages}}; each item has id, apiKeyId, userId, message, errorCode (null when none), type (INFO, WARN, ERROR), createdAt. " +
            "An empty content array means no entry matches the filters.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Entries per page, 1 to 100 (default 20)"),
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "UUID of the Project API key to filter by (from horizon_admin_projects_list; sent as apiKeyId). Omit for all keys; required for a project-scoped Account Key",
          ),
        level: z
          .enum(["INFO", "WARN", "ERROR"])
          .optional()
          .describe(
            "Level filter: INFO, WARN or ERROR (sent as type). Omit for all levels",
          ),
      },
      annotations: READ_ONLY,
    },
    async ({ page, size, projectApiKeyId, level }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const query: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined) query.apiKeyId = projectApiKeyId;
        if (level !== undefined) query.type = level;
        const result = await client.get("/api/v1/admin/user-logs", query);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
