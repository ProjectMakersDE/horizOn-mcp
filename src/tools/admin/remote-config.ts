/**
 * Admin tools for managing remote configuration entries.
 *
 * Remote config is a per-API-key key/value store the backend exposes to
 * the runtime app. These tools wrap the /api/v1/admin/remote-config
 * endpoints so callers can list, create/update, delete (single, by key,
 * and bulk) and inspect the limits from the MCP surface.
 *
 * The server maps the prefix to the account-key feature group REMOTE_CONFIG.
 * Project-scoped Account Keys reach the calls that name their Project API key
 * (list with projectApiKeyId, create, delete by key, limits); ID-only calls
 * (delete by id, bulk delete) are denied for them.
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

const SCOPE_WITH_PROJECT =
  "an Account Key with full-account access or the REMOTE_CONFIG feature group; a project-scoped Account Key only for its own projectApiKeyId.";

const SCOPE_BY_ID =
  "an Account Key with full-account access or the REMOTE_CONFIG feature group; project-scoped Account Keys are denied (403) for ID-based calls.";

const ENTRY_FIELDS =
  "id, accountId, apiKeyId, apiKeyName, configKey, configValue, totalLength (key plus value characters), isActive, createdAt, updatedAt";

const projectApiKeyIdSchema = (purpose: string) =>
  z
    .string()
    .uuid()
    .describe(`id (UUID) of the Project API key ${purpose}, from horizon_admin_projects_list`);

export function registerAdminRemoteConfigTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_remoteconfig_list",
    {
      title: "List Remote Config Entries",
      description: describeTool(
        {
          summary:
            "Lists the account's remote config entries (key and value per Project API key), newest first, optionally filtered by project and a text search.",
          use: "reviewing the values a game receives, or finding an entry id for horizon_admin_remoteconfig_delete or horizon_admin_remoteconfig_bulkDelete.",
          avoid: "reading config as the game sees it (use the player tool horizon_get_all_remote_configs) or checking the entry quota (use horizon_admin_remoteconfig_getLimits).",
          requires: SCOPE_WITH_PROJECT,
          effects: "None (read only).",
          returns:
            `{entries, total, page, size, totalPages}; each entry has ${ENTRY_FIELDS}. ` +
            "An empty entries array means nothing matches the filters.",
          errors: "403 for a project-scoped Account Key without its own projectApiKeyId: pass it.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "id (UUID) of the Project API key to filter by, from horizon_admin_projects_list (sent as apiKeyId). Omit to list all projects; required for a project-scoped Account Key",
          ),
        search: z
          .string()
          .optional()
          .describe("Case-insensitive text matched against configKey and configValue. Optional"),
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
      description: describeTool(
        {
          summary:
            "Sets one remote config value for a Project API key: creates the entry, or overwrites the value when configKey already exists for that key (upsert).",
          use: "adding or changing a value that games read with horizon_get_remote_config.",
          avoid: "removing a value (use horizon_admin_remoteconfig_deleteByKey or horizon_admin_remoteconfig_delete).",
          requires: "projectApiKeyId from horizon_admin_projects_list; " + SCOPE_WITH_PROJECT,
          effects:
            "Creates the entry or replaces its previous value (the old value is not kept). Games get the new value on their next fetch. Repeating the same call changes nothing more.",
          returns: `The saved entry: {${ENTRY_FIELDS}}.`,
          errors:
            "400 when configKey plus configValue exceed the tier's character limit, or when the Project API key does not exist or belongs to another account (check the id with horizon_admin_projects_list). " +
            "403 when a new key would exceed the tier's entry limit, which counts entries across the whole account: check with horizon_admin_remoteconfig_getLimits and delete unused entries.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: projectApiKeyIdSchema("this entry belongs to"),
        configKey: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_.-]+$/)
          .describe(
            "Config key, 1 to 100 characters of a-z, A-Z, 0-9, _ . and -; dot notation recommended, e.g. game.max_level. An existing key is overwritten",
          ),
        configValue: z
          .string()
          .max(1024)
          .describe("Value as a string, 1 to 1024 characters (the server rejects an empty value); the tier also caps key plus value length"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary: "Deletes one remote config entry by its entry id (soft delete); games no longer receive the key.",
          use: "the entry id is known from horizon_admin_remoteconfig_list.",
          avoid: "deleting by key name (use horizon_admin_remoteconfig_deleteByKey) or many entries (use horizon_admin_remoteconfig_bulkDelete).",
          requires: "id from horizon_admin_remoteconfig_list; " + SCOPE_BY_ID,
          effects: "Removes the entry from the game API and frees its slot. No MCP tool restores it; set the key again with horizon_admin_remoteconfig_create.",
          returns: "null (the server answers HTTP 204 without a body).",
          errors: "404 for an unknown entry id: look it up with horizon_admin_remoteconfig_list.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("Entry id (UUID) of the remote config entry, from horizon_admin_remoteconfig_list (not the Project API key id)"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary: "Deletes one remote config entry by Project API key and configKey (soft delete), without needing the entry id.",
          use: "the key name is known, e.g. from the game code or horizon_get_all_remote_configs.",
          avoid: "deleting by entry id (use horizon_admin_remoteconfig_delete) or many entries (use horizon_admin_remoteconfig_bulkDelete).",
          requires: "projectApiKeyId from horizon_admin_projects_list; " + SCOPE_WITH_PROJECT,
          effects: "Removes the entry from the game API and frees its slot. No MCP tool restores it; set the key again with horizon_admin_remoteconfig_create.",
          returns: "null (the server answers HTTP 204 without a body).",
          errors:
            "404 when no active entry has this key for the Project API key (already deleted or a typo): check with horizon_admin_remoteconfig_list. 400 when the entry belongs to another account.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: projectApiKeyIdSchema("the entry belongs to"),
        configKey: z
          .string()
          .min(1)
          .max(100)
          .describe("Exact configKey to delete, 1 to 100 characters (case-sensitive)"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary: "Deletes up to 10000 remote config entries by entry id in one request (soft delete) and reports the result per id.",
          use: "cleaning up many entries at once, e.g. all ids of a project from horizon_admin_remoteconfig_list.",
          avoid: "a single entry (use horizon_admin_remoteconfig_delete or horizon_admin_remoteconfig_deleteByKey).",
          requires: "entry ids from horizon_admin_remoteconfig_list; " + SCOPE_BY_ID,
          effects: "Removes every found entry from the game API and frees its slots. Ids that are unknown or already deleted are reported as failed, not fatal.",
          returns:
            "{successful, failed, results}; each result has id, success and message (\"Deleted\" or \"Config entry not found\").",
          errors: "400 for an empty list or more than 10000 ids.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        ids: z
          .array(z.string().uuid())
          .min(1)
          .max(10000)
          .describe("Entry ids (UUIDs) from horizon_admin_remoteconfig_list, 1 to 10000 per call"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary: "Returns the remote config quota of the account: tier role, remaining entry slots and whether a new entry can be created.",
          use: "before creating many entries, or after a 403 from horizon_admin_remoteconfig_create.",
          avoid: "listing the entries (use horizon_admin_remoteconfig_list).",
          requires: "projectApiKeyId from horizon_admin_projects_list (needed for the path and the key scope); " + SCOPE_WITH_PROJECT,
          effects: "None (read only).",
          returns:
            "{role, remainingSlots, canCreateMore}. The entry limit counts entries across the whole account, so the values are the same for every projectApiKeyId.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: projectApiKeyIdSchema("to check"),
      },
      annotations: READ_ONLY,
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
