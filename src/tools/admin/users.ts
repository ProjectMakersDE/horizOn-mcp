/**
 * Admin tools for managing end-users (the customers of a horizOn account's
 * application, not horizOn accounts themselves).
 *
 * These tools wrap the /api/v1/admin/user-management endpoints. All
 * per-user operations (list, get, activate, deactivate, delete) require
 * a projectApiKeyId because the backend scopes every user to a single
 * project API key and refuses the request otherwise. The statistics
 * endpoint is account-wide and takes no parameters.
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

export function registerAdminUsersTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_users_list",
    {
      title: "List End-Users",
      description:
        "Lists end-users for a specific project API key. The projectApiKeyId is required by the backend — users are scoped per project.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe(
            "UUID of the project API key whose users should be returned",
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
        const result = await client.get(
          "/api/v1/admin/user-management/users",
          {
            page: String(page),
            size: String(size),
            "api-key": projectApiKeyId,
          },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_get",
    {
      title: "Get End-User",
      description:
        "Fetches a single end-user by UUID. The projectApiKeyId is required because the backend looks the user up inside the project's user collection.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the end-user to fetch"),
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key the user belongs to"),
      },
    },
    async ({ id, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/user-management/users/${id}`,
          { "api-key": projectApiKeyId },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_activate",
    {
      title: "Activate End-User",
      description:
        "Re-activates a previously deactivated end-user so they can sign in again.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the end-user to activate"),
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key the user belongs to"),
      },
    },
    async ({ id, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const path = `/api/v1/admin/user-management/users/${id}/activate?api-key=${encodeURIComponent(projectApiKeyId)}`;
        const result = await client.patch(path);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_deactivate",
    {
      title: "Deactivate End-User",
      description:
        "Deactivates an end-user. Deactivated users cannot sign in until re-activated. An optional reason is forwarded in the request body.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the end-user to deactivate"),
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key the user belongs to"),
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Optional deactivation reason"),
      },
    },
    async ({ id, projectApiKeyId, reason }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const path = `/api/v1/admin/user-management/users/${id}/deactivate?api-key=${encodeURIComponent(projectApiKeyId)}`;
        const body: Record<string, unknown> = {};
        if (reason !== undefined) body.reason = reason;
        const result = await client.patch(path, body);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_delete",
    {
      title: "Delete End-User",
      description:
        "Soft-deletes an end-user. The user is marked deleted and can no longer sign in or appear in list results.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the end-user to delete"),
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key the user belongs to"),
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Optional deletion reason (query parameter)"),
      },
    },
    async ({ id, projectApiKeyId, reason }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params = new URLSearchParams({ "api-key": projectApiKeyId });
        if (reason !== undefined) params.set("reason", reason);
        const result = await client.delete(
          `/api/v1/admin/user-management/users/${id}?${params.toString()}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_getStats",
    {
      title: "Get End-User Statistics",
      description:
        "Returns aggregated end-user statistics for the authenticated account (totals, active/deactivated counts, recent signups, distribution per API key). Account-scoped — no parameters required.",
      inputSchema: {},
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/user-management/statistics",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
