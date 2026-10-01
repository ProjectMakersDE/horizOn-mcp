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
  describeTool,
  ADMIN_AUTH,
  READ_ONLY,
} from "./_utils.js";

const FEEDBACK_FIELDS =
  "id, accountId, apiKeyId, userId, title, message, email (null when not given), category, deviceInfo, createdAt, isActive";

export function registerAdminFeedbackTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_feedback_list",
    {
      title: "List User Feedback",
      description: describeTool(
        {
          summary:
            "Lists the feedback players sent from the games of the account (bug reports, requests, comments), newest first, optionally only one Project API key, with paging.",
          use: "reading the feedback inbox or finding an entry id for horizon_admin_feedback_get.",
          avoid: "sending feedback as a player (use horizon_submit_feedback).",
          requires:
            "an Account Key with full-account access or the FEEDBACK feature group; a project-scoped key must pass its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            `{feedbacks, total, page, size, totalPages}; each item has ${FEEDBACK_FIELDS}. An empty feedbacks array means no feedback matches (or the page is past the end).`,
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
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary: "Returns one feedback entry by id with its full message, category, contact email, device info and the player's userId.",
          use: "reading one entry in full after finding it with horizon_admin_feedback_list.",
          avoid: "browsing the inbox (use horizon_admin_feedback_list).",
          requires:
            "id from horizon_admin_feedback_list; an Account Key with full-account access or the FEEDBACK feature group; project-scoped keys are denied (403) for this call.",
          effects: "None (read only).",
          returns: `One entry: ${FEEDBACK_FIELDS}.`,
          errors: "404 FEEDBACK_NOT_FOUND for an unknown id: look it up with horizon_admin_feedback_list.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the feedback entry (the id field of a horizon_admin_feedback_list item)"),
      },
      annotations: READ_ONLY,
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
