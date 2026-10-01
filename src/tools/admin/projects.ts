/**
 * Admin tools for managing project-level API keys.
 *
 * A "project" in horizOn corresponds to one PROJECT-scope API key that
 * identifies the application/game. These tools wrap the
 * /api/v1/admin/api-keys endpoints with keyType=PROJECT so callers can
 * list, create, update, regenerate, revoke, and delete those keys from
 * the MCP surface.
 *
 * The server maps the prefix to the account-key feature group PROJECTS.
 * Project-scoped Account Keys may only read their own Project API key and
 * can never mutate keys.
 *
 * All tools require HORIZON_ACCOUNT_API_KEY: the backend routes these
 * requests through AccountApiKeyAuthenticationFilter, which sets the
 * same account context as a dashboard session.
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
  ADDITIVE_WRITE,
  DESTRUCTIVE_WRITE,
  DESTRUCTIVE_NON_IDEMPOTENT,
} from "./_utils.js";

const SCOPE_MUTATE =
  "an Account Key with full-account access or the PROJECTS feature group; project-scoped Account Keys are denied (403) for every change to Project API keys.";

const KEY_FIELDS =
  "id, entityName, description, maskedKey, keyType (PROJECT), isActive, isRevoked, revokedAt, revokedReason, expiresAt, lastUsedAt, createdAt, updatedAt";

const NOT_FOUND =
  "404 for an unknown keyId: list the ids with horizon_admin_projects_list. 403 when the id belongs to another account or is not a PROJECT key.";

function keyIdSchema(purpose: string) {
  return z
    .string()
    .uuid()
    .describe(`id (UUID) of the Project API key ${purpose}, from horizon_admin_projects_list`);
}

export function registerAdminProjectsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_projects_list",
    {
      title: "List Project API Keys",
      description: describeTool(
        {
          summary:
            "Lists the account's Project API keys (one per game or app, key values masked), paged; revoked keys are included, deleted keys are not.",
          use: "finding the keyId or projectApiKeyId that the other admin tools need, or checking which keys are revoked or expiring.",
          avoid: "one known key (use horizon_admin_projects_get).",
          requires:
            "an Account Key with full-account access or the PROJECTS feature group; project-scoped Account Keys are denied (403) here, they can only read their own key with horizon_admin_projects_get.",
          effects: "None (read only).",
          returns:
            `{apiKeys, total, page, size, totalPages}; each key has ${KEY_FIELDS}. ` +
            "The full key value is never returned. An empty apiKeys array means the account has no Project API keys (create one with horizon_admin_projects_create).",
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
          .describe("Items per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary: "Returns one Project API key by id with its metadata and revocation state (the key value stays masked).",
          use: "checking whether a key is active, revoked or expired, or reading its name and description before horizon_admin_projects_update.",
          avoid: "browsing all keys (use horizon_admin_projects_list).",
          requires:
            "keyId from horizon_admin_projects_list; an Account Key with full-account access or the PROJECTS feature group, or a project-scoped Account Key for its own Project API key only.",
          effects: "None (read only).",
          returns: `{${KEY_FIELDS}}.`,
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        keyId: keyIdSchema("to fetch"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary:
            "Creates a new Project API key (a new project) and returns its full key value, which is shown only in this response.",
          use: "setting up a new game or app that needs its own HORIZON_API_KEY and its own remote config, localization and news.",
          avoid: "renaming or changing the expiry of an existing key (use horizon_admin_projects_update) or replacing a leaked value (use horizon_admin_projects_regenerate).",
          requires: SCOPE_MUTATE + " The account's tier limits the number of active keys.",
          effects: "Creates a new active key; every call creates another one. Store keyValue right away, it cannot be read again.",
          returns: "{id, entityName, keyValue, maskedKey, description, expiresAt, createdAt, isActive, securityNotice}. id is the keyId and projectApiKeyId for the other admin tools.",
          errors:
            "409 when a non revoked key with this entityName exists: pick another name. " +
            "429 (API Key Limit Exceeded) when the tier's key limit is reached; this is not a rate limit: delete an unused key with horizon_admin_projects_delete. " +
            "400 when expiresAt is not in the future.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        entityName: z
          .string()
          .min(1)
          .max(100)
          .describe("Display name of the project, 1 to 100 characters; must be unique among the account's non revoked keys"),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("Free text description, up to 500 characters. Optional"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe(
            "Expiry as ISO 8601 UTC datetime, e.g. 2027-01-01T00:00:00Z; must be in the future. Omit for a key that never expires",
          ),
      },
      annotations: ADDITIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Overwrites the metadata of a Project API key (entityName, and description or expiresAt when given); the key value itself does not change.",
          use: "renaming a project, editing its description or moving its expiry date.",
          avoid: "a new key value (use horizon_admin_projects_regenerate) or disabling the key (use horizon_admin_projects_revoke).",
          requires: "keyId from horizon_admin_projects_list; " + SCOPE_MUTATE,
          effects:
            "Replaces entityName; description and expiresAt only when passed (omitted fields keep their value, an expiry cannot be removed here). Players using the key are not affected.",
          returns: `The updated key: {${KEY_FIELDS}}.`,
          errors:
            NOT_FOUND +
            " 405 (Operation Not Allowed) for a revoked, inactive or deleted key. 409 when another non revoked key already uses entityName. 400 when expiresAt is not in the future.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        keyId: keyIdSchema("to update"),
        entityName: z
          .string()
          .min(3)
          .max(100)
          .describe(
            "Display name, 3 to 100 characters. Required on every update: pass the current name (from horizon_admin_projects_get) to keep it",
          ),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("New description, up to 500 characters. Omit to keep the current one"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe("New expiry as ISO 8601 UTC datetime, e.g. 2027-01-01T00:00:00Z; must be in the future. Omit to keep the current expiry"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Replaces a Project API key: revokes the current key immediately and creates a new key with a new id and value, keeping name, description and expiry.",
          use: "a key value leaked or must be rotated.",
          avoid: "only disabling a key (use horizon_admin_projects_revoke) or changing its name (use horizon_admin_projects_update).",
          requires: "keyId from horizon_admin_projects_list; " + SCOPE_MUTATE,
          effects:
            "Irreversible: the old value stops working at once, so every game build still using it fails until it ships the new value. The new key has a new id: use it for later calls; the old id stays revoked.",
          returns: "The new key: {id, entityName, keyValue, maskedKey, description, expiresAt, createdAt, isActive, securityNotice}. keyValue is shown only in this response.",
          errors:
            NOT_FOUND +
            " 405 (Operation Not Allowed) for a revoked, inactive or deleted key. 409 when repeated on an already regenerated id: use the new id.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        keyId: keyIdSchema("to replace"),
      },
      annotations: DESTRUCTIVE_NON_IDEMPOTENT,
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
      description: describeTool(
        {
          summary:
            "Revokes a Project API key so every request with it is rejected; the key and its data stay and it can be restored in the horizOn dashboard.",
          use: "blocking a project's key temporarily or before retiring it.",
          avoid: "rotating a leaked value (use horizon_admin_projects_regenerate) or removing the key for good (use horizon_admin_projects_delete).",
          requires: "keyId from horizon_admin_projects_list; " + SCOPE_MUTATE,
          effects:
            "Sets isRevoked and deactivates the key; games using it stop working at once. No data is deleted; no MCP tool restores the key, use the dashboard for that. Repeating the call changes nothing more. The server stores the reason \"Revoked by account\".",
          returns: "{message} confirming the revocation.",
          errors: "404 for an unknown or deleted keyId: list the ids with horizon_admin_projects_list.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        keyId: keyIdSchema("to revoke"),
        reason: z
          .string()
          .max(255)
          .optional()
          .describe(
            "Revocation reason, up to 255 characters. Optional and currently ignored by the server (kept for a future API version)",
          ),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Deletes a Project API key (soft delete): it disappears from horizon_admin_projects_list, stops working and cannot be restored.",
          use: "retiring a project for good or freeing a key slot of the tier limit.",
          avoid: "a temporary block (use horizon_admin_projects_revoke, which the dashboard can undo).",
          requires: "keyId from horizon_admin_projects_list; " + SCOPE_MUTATE,
          effects: "Marks the key deleted and inactive; games using it stop working at once. Cannot be undone.",
          returns: "{message} confirming the deletion.",
          errors: "404 for an unknown or already deleted keyId (nothing left to do).",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        keyId: keyIdSchema("to delete"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
