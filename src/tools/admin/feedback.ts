/**
 * Admin tools for reading user feedback.
 *
 * Feedback is submitted by end users of your application via the app API.
 * These tools wrap the /api/v1/admin/user-feedback endpoints and are
 * read-only — list and get a specific feedback by UUID. Deletion and
 * statistics are intentionally omitted from this module; they can be
 * added later if needed.
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

export function registerAdminFeedbackTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_feedback_list",
    {
      title: "List User Feedback",
      description:
        "Lists user feedback entries for the authenticated account. Results are paginated and sorted by createdAt DESC. Optionally filter by a specific project API key UUID (maps to the backend's apiKeyId query parameter).",
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
            "Optional UUID of the project API key to filter feedback by. Maps to the apiKeyId backend filter.",
          ),
      },
    },
    async ({ page, size, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const query: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined) query.apiKeyId = projectApiKeyId;
        const result = await client.get("/api/v1/admin/user-feedback", query);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_feedback_get",
    {
      title: "Get User Feedback",
      description:
        "Fetches a single user feedback entry by its UUID, including the full message, associated user, and API key metadata.",
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the feedback entry to fetch"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(`/api/v1/admin/user-feedback/${id}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
