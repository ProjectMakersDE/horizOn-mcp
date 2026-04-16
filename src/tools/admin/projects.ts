/**
 * Admin tools for managing project-level API keys.
 *
 * A "project" in horizOn corresponds to one PROJECT-scope API key that
 * identifies the application/game. These tools wrap the
 * /api/v1/admin/api-keys endpoints with keyType=PROJECT so callers can
 * list, create, update, regenerate, revoke, and delete those keys from
 * the MCP surface.
 *
 * All tools require HORIZON_ACCOUNT_API_KEY — the backend routes these
 * requests through AccountApiKeyAuthenticationFilter which sets the
 * same account context as a dashboard session.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  getAdminClient,
  noAdminClientResponse,
  jsonResponse,
  errorResponse,
} from "./_utils.js";

export function registerAdminProjectsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_projects_list",
    {
      title: "List Project API Keys",
      description:
        "Lists all project-level API keys for the authenticated account. Each project corresponds to one API key that identifies it.",
      inputSchema: {
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
    async ({ page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get("/api/v1/admin/api-keys", {
          page: String(page),
          size: String(size),
          keyType: "PROJECT",
        });
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_projects_get",
    {
      title: "Get Project API Key",
      description:
        "Fetches a single project-level API key by its UUID, including metadata and revocation status.",
      inputSchema: {
        keyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key to fetch"),
      },
    },
    async ({ keyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(`/api/v1/admin/api-keys/${keyId}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_projects_create",
    {
      title: "Create Project API Key",
      description:
        "Creates a new project-level API key. The response contains the keyValue field, which is only returned once — copy it immediately.",
      inputSchema: {
        entityName: z
          .string()
          .min(1)
          .max(100)
          .describe("Project/entity display name (1-100 chars)"),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("Optional description (<= 500 chars)"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe(
            "Optional ISO-8601 datetime when the key should expire (omit for no expiration)",
          ),
      },
    },
    async ({ entityName, description, expiresAt }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = { entityName };
        if (description !== undefined) body.description = description;
        if (expiresAt !== undefined) body.expiresAt = expiresAt;
        const result = await client.post("/api/v1/admin/api-keys", body);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_projects_update",
    {
      title: "Update Project API Key",
      description:
        "Updates metadata of an existing project API key (entityName, description, expiresAt). The keyValue itself is not changed — use regenerate for that.",
      inputSchema: {
        keyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key to update"),
        entityName: z
          .string()
          .min(3)
          .max(100)
          .describe(
            "New entity name (3-100 chars; backend requires this field on update)",
          ),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("Optional new description (<= 500 chars)"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe("Optional new ISO-8601 expiration datetime"),
      },
    },
    async ({ keyId, entityName, description, expiresAt }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = { entityName };
        if (description !== undefined) body.description = description;
        if (expiresAt !== undefined) body.expiresAt = expiresAt;
        const result = await client.put(
          `/api/v1/admin/api-keys/${keyId}`,
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_projects_regenerate",
    {
      title: "Regenerate Project API Key",
      description:
        "Regenerates the keyValue for an existing project API key. The old value is invalidated immediately. The response contains the new keyValue — copy it right away.",
      inputSchema: {
        keyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key to regenerate"),
      },
    },
    async ({ keyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.post(
          `/api/v1/admin/api-keys/${keyId}/regenerate`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_projects_revoke",
    {
      title: "Revoke Project API Key",
      description:
        "Revokes a project API key. Revoked keys are rejected at the auth filter until restored. Note: the current backend endpoint does not accept a reason body — the reason argument is reserved for a future API extension.",
      inputSchema: {
        keyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key to revoke"),
        reason: z
          .string()
          .max(255)
          .optional()
          .describe(
            "Optional revocation reason (<= 255 chars). Currently ignored by the backend; kept for forward-compat.",
          ),
      },
    },
    async ({ keyId, reason }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = {};
        if (reason !== undefined) body.reason = reason;
        const result = await client.patch(
          `/api/v1/admin/api-keys/${keyId}/revoke`,
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_projects_delete",
    {
      title: "Delete Project API Key",
      description:
        "Soft-deletes a project API key. This is irreversible from the admin surface — the key cannot be restored afterwards.",
      inputSchema: {
        keyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key to delete"),
      },
    },
    async ({ keyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(`/api/v1/admin/api-keys/${keyId}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
