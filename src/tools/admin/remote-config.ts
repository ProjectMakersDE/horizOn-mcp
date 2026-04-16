/**
 * Admin tools for managing remote configuration entries.
 *
 * Remote config is a per-API-key key/value store the backend exposes to
 * the runtime app. These tools wrap the /api/v1/admin/remote-config
 * endpoints so callers can list, create/update, delete (single, by key,
 * and bulk) and inspect the per-key limits from the MCP surface.
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

export function registerAdminRemoteConfigTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_remoteconfig_list",
    {
      title: "List Remote Config Entries",
      description:
        "Lists remote config entries for the authenticated account. Filter by projectApiKeyId to scope the result to a single project and by search to match against keys/values.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key to filter entries by. Omit to list across all projects.",
          ),
        search: z
          .string()
          .optional()
          .describe("Optional case-insensitive search on key and value"),
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
    async ({ projectApiKeyId, search, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined) params.apiKeyId = projectApiKeyId;
        if (search !== undefined) params.search = search;
        const result = await client.get("/api/v1/admin/remote-config", params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_remoteconfig_create",
    {
      title: "Create or Update Remote Config Entry",
      description:
        "Creates a new remote config entry or updates the value if the key already exists for the given project API key. Keys must match /^[a-zA-Z0-9_.-]+$/ (1-100 chars).",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key this entry belongs to"),
        configKey: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_.-]+$/)
          .describe(
            "Config key (1-100 chars, alphanumeric + _ . -). Dot-notation recommended.",
          ),
        configValue: z
          .string()
          .max(1024)
          .describe("Config value (<= 1024 chars)"),
      },
    },
    async ({ projectApiKeyId, configKey, configValue }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body = {
          apiKeyId: projectApiKeyId,
          configKey,
          configValue,
        };
        const result = await client.post(
          "/api/v1/admin/remote-config",
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_remoteconfig_delete",
    {
      title: "Delete Remote Config Entry",
      description:
        "Soft-deletes a remote config entry by its UUID. After deletion the entry is no longer returned by the runtime app API.",
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the remote config entry to delete"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/remote-config/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_remoteconfig_deleteByKey",
    {
      title: "Delete Remote Config Entry by Key",
      description:
        "Soft-deletes a remote config entry by its configKey for a specific project API key. Useful when the entry UUID is not known.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key the entry belongs to"),
        configKey: z
          .string()
          .min(1)
          .max(100)
          .describe("Config key to delete"),
      },
    },
    async ({ projectApiKeyId, configKey }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const path = `/api/v1/admin/remote-config/api-key/${projectApiKeyId}/key/${encodeURIComponent(configKey)}`;
        const result = await client.delete(path);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_remoteconfig_bulkDelete",
    {
      title: "Bulk Delete Remote Config Entries",
      description:
        "Deletes up to 10000 remote config entries in a single request. Each entry is processed independently; the response reports per-entry success/failure.",
      inputSchema: {
        ids: z
          .array(z.string().uuid())
          .min(1)
          .max(10000)
          .describe("List of entry UUIDs to delete (1-10000)"),
      },
    },
    async ({ ids }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.post(
          "/api/v1/admin/remote-config/bulk-delete",
          { ids },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_remoteconfig_getLimits",
    {
      title: "Get Remote Config Limits",
      description:
        "Returns the remote config limits and current usage for a specific project API key (role, remaining slots, canCreateMore).",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key to inspect"),
      },
    },
    async ({ projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/remote-config/api-key/${projectApiKeyId}/limits`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
