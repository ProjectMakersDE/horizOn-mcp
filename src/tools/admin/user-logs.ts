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
} from "./_utils.js";

export function registerAdminUserLogsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_userlogs_list",
    {
      title: "List User Logs",
      description:
        "Lists user log entries for the authenticated account. Results are paginated and sorted by createdAt DESC. Optionally filter by project API key UUID (maps to apiKeyId) and log level (maps to the backend's type enum: INFO, WARN, ERROR).",
      inputSchema: {
        page: z.number().int().min(0).default(0).describe("0-based page index"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("items per page (1-100)"),
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key to filter logs by. Maps to the backend's apiKeyId filter.",
          ),
        level: z
          .enum(["INFO", "WARN", "ERROR"])
          .optional()
          .describe(
            "Optional log level filter. Maps to the backend's type enum (LogType).",
          ),
      },
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
