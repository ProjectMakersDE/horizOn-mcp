/**
 * Admin tools for managing cloud saves.
 *
 * Cloud saves are per-user, per-project blobs produced by the runtime
 * app's save API. These tools wrap the /api/v1/admin/cloud-save
 * endpoints so callers can list, fetch, update, delete and inspect
 * statistics/limits from the MCP surface.
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

export function registerAdminCloudSaveTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_cloudsave_list",
    {
      title: "List Cloud Saves",
      description:
        "Lists cloud saves for the authenticated account, optionally filtered by project API key. Default sort is createdAt DESC.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key to filter saves by",
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
        const result = await client.get("/api/v1/admin/cloud-save", params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_get",
    {
      title: "Get Cloud Save",
      description:
        "Fetches a single cloud save by its UUID, including the full saveData payload.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the cloud save to fetch"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(`/api/v1/admin/cloud-save/${id}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_update",
    {
      title: "Update Cloud Save",
      description:
        "Replaces the saveData of an existing cloud save. The backend enforces both a hard 300KB request limit and a soft per-tier byte limit.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the cloud save to update"),
        data: z
          .string()
          .min(1)
          .max(300000)
          .describe(
            "New save data (plain string or Base64, <= 300000 chars / ~300KB)",
          ),
      },
    },
    async ({ id, data }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.put(
          `/api/v1/admin/cloud-save/${id}`,
          { saveData: data },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_delete",
    {
      title: "Delete Cloud Save",
      description:
        "Soft-deletes a cloud save. Deleted saves are no longer accessible to end-users and disappear from list results.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the cloud save to delete"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/cloud-save/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_getStats",
    {
      title: "Get Cloud Save Statistics",
      description:
        "Returns aggregated cloud save statistics for the authenticated account (totals, storage used in bytes/KB/MB, average size, per-project breakdown). Note: the current backend endpoint is account-scoped; projectApiKeyId is reserved for forward-compat.",
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
          "/api/v1/admin/cloud-save/statistics",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_getLimits",
    {
      title: "Get Cloud Save Limits",
      description:
        "Returns the cloud save limits and current usage for the authenticated account (role, max bytes per save, current count, current storage used). Note: the current backend endpoint is account-scoped; projectApiKeyId is reserved for forward-compat.",
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
        const result = await client.get("/api/v1/admin/cloud-save/limits");
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
