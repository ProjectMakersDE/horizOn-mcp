/**
 * Admin tools for managing localization entries.
 *
 * Localization is a per-API-key key/translations store the backend exposes
 * to the runtime app. Each entry maps a localization key to one value per
 * language (15 supported languages). These tools wrap the
 * /api/v1/admin/localization endpoints so callers can list, create/update,
 * delete (single, by key, and bulk) and inspect the per-key limits from the
 * MCP surface.
 *
 * The server's account-key scope filter maps no feature group to this
 * prefix, so only full-account Account Keys reach it: keys with a feature
 * or project scope are denied (403).
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

const SUPPORTED_LANGUAGES = [
  "en",
  "de",
  "es",
  "fr",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "ja",
  "zh",
  "ar",
  "ko",
  "tr",
  "id",
] as const;

const SUPPORTED_LANGUAGES_HINT = SUPPORTED_LANGUAGES.join(", ");

const SCOPE =
  "an Account Key with full-account access; Account Keys limited to feature groups or one project are denied (403) for every localization admin call.";

const ENTRY_FIELDS =
  "id, accountId, apiKeyId, apiKeyName, localizationKey, translations ({language: value}), languageCount, totalLength, isActive, createdAt, updatedAt";

const projectApiKeyIdSchema = (purpose: string) =>
  z
    .string()
    .uuid()
    .describe(`id (UUID) of the Project API key ${purpose}, from horizon_admin_projects_list`);

export function registerAdminLocalizationTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_localization_list",
    {
      title: "List Localization Entries",
      description: describeTool(
        {
          summary:
            "Lists the account's localization entries (one key with its translations per entry), newest first, optionally filtered by project, key text and language.",
          use: "reviewing translations, finding missing languages, or finding an entry id for horizon_admin_localization_delete or horizon_admin_localization_bulkDelete.",
          avoid: "reading strings as the game sees them (use the player tool horizon_get_all_localizations) or checking the key quota (use horizon_admin_localization_getLimits).",
          requires: SCOPE,
          effects: "None (read only).",
          returns:
            `{entries, total, page, size, totalPages}; each entry has ${ENTRY_FIELDS}. ` +
            "An empty entries array means nothing matches the filters.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "id (UUID) of the Project API key to filter by, from horizon_admin_projects_list (sent as apiKeyId). Omit to list all projects",
          ),
        search: z
          .string()
          .optional()
          .describe("Case-insensitive text matched against localizationKey only (not the translated values). Optional"),
        language: z
          .string()
          .length(2)
          .optional()
          .describe(
            `Language code (2 characters) to keep only entries that have a value in that language. One of: ${SUPPORTED_LANGUAGES_HINT}. Optional`,
          ),
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
    async ({ projectApiKeyId, search, language, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined) params.apiKeyId = projectApiKeyId;
        if (search !== undefined) params.search = search;
        if (language !== undefined) params.language = language;
        const result = await client.get("/api/v1/admin/localization", params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_localization_create",
    {
      title: "Create or Update Localization Entry",
      description: describeTool(
        {
          summary:
            "Sets one localization key for a Project API key: creates the entry, or replaces its whole translations map when the key already exists (upsert).",
          use: "adding a string or changing its translations; games read it with horizon_get_localization.",
          avoid: "removing a key (use horizon_admin_localization_deleteByKey or horizon_admin_localization_delete).",
          requires: "projectApiKeyId from horizon_admin_projects_list; " + SCOPE,
          effects:
            "Creates the entry or overwrites all its translations: languages missing from the new map are removed, so pass every language to keep (read them first with horizon_admin_localization_list). Repeating the same call changes nothing more.",
          returns: `The saved entry: {${ENTRY_FIELDS}}.`,
          errors:
            "400 for an unknown language code, a value longer than the tier's per value limit (see horizon_admin_localization_getLimits), or a Project API key that does not exist or belongs to another account (check with horizon_admin_projects_list). " +
            "403 when a new key would exceed the tier's key limit for this Project API key: check with horizon_admin_localization_getLimits and delete unused keys.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: projectApiKeyIdSchema("this entry belongs to"),
        localizationKey: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_.-]+$/)
          .describe(
            "Localization key, 1 to 100 characters of a-z, A-Z, 0-9, _ . and -; dot notation recommended, e.g. menu.start. An existing key is overwritten",
          ),
        translations: z
          // Backend enforces the real per-tier cap (ADMIN allows up to 2000 chars);
          // keep a generous client-side guard so valid ADMIN writes are not blocked.
          .record(z.string(), z.string().max(2000))
          .refine(
            (obj) => {
              const keys = Object.keys(obj);
              return (
                keys.length > 0 &&
                keys.every((k) =>
                  (SUPPORTED_LANGUAGES as readonly string[]).includes(k),
                )
              );
            },
            {
              message: `translations must contain at least one entry, and every key must be a supported language code (${SUPPORTED_LANGUAGES_HINT})`,
            },
          )
          .describe(
            `Complete map of language code to translated text, e.g. {"en":"Start","de":"Starten"}; at least one entry. Keys: ${SUPPORTED_LANGUAGES_HINT}. The tier caps each value's length (maxCharsPerValue from horizon_admin_localization_getLimits); this tool accepts up to 2000 characters`,
          ),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ projectApiKeyId, localizationKey, translations }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body = {
          apiKeyId: projectApiKeyId,
          localizationKey,
          translations,
        };
        const result = await client.post(
          "/api/v1/admin/localization",
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_localization_delete",
    {
      title: "Delete Localization Entry",
      description: describeTool(
        {
          summary: "Deletes one localization entry (all its languages) by entry id (soft delete); games no longer receive the key.",
          use: "the entry id is known from horizon_admin_localization_list.",
          avoid: "deleting by key name (use horizon_admin_localization_deleteByKey), many entries (use horizon_admin_localization_bulkDelete) or a single language (resend the map without it via horizon_admin_localization_create).",
          requires: "id from horizon_admin_localization_list; " + SCOPE,
          effects: "Removes the entry from the game API and frees its key slot. No MCP tool restores it; set the key again with horizon_admin_localization_create.",
          returns: "null (the server answers HTTP 204 without a body).",
          errors: "404 for an unknown entry id: look it up with horizon_admin_localization_list.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("Entry id (UUID) of the localization entry, from horizon_admin_localization_list (not the Project API key id)"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/localization/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_localization_deleteByKey",
    {
      title: "Delete Localization Entry by Key",
      description: describeTool(
        {
          summary: "Deletes one localization entry (all its languages) by Project API key and localizationKey (soft delete), without needing the entry id.",
          use: "the key name is known, e.g. from the game code or horizon_get_all_localizations.",
          avoid: "deleting by entry id (use horizon_admin_localization_delete) or many entries (use horizon_admin_localization_bulkDelete).",
          requires: "projectApiKeyId from horizon_admin_projects_list; " + SCOPE,
          effects: "Removes the entry from the game API and frees its key slot. No MCP tool restores it; set the key again with horizon_admin_localization_create.",
          returns: "null (the server answers HTTP 204 without a body).",
          errors:
            "404 when no active entry has this key for the Project API key (already deleted or a typo): check with horizon_admin_localization_list. 400 when the entry belongs to another account.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: projectApiKeyIdSchema("the entry belongs to"),
        localizationKey: z
          .string()
          .min(1)
          .max(100)
          .describe("Exact localizationKey to delete, 1 to 100 characters (case-sensitive)"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ projectApiKeyId, localizationKey }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const path = `/api/v1/admin/localization/api-key/${projectApiKeyId}/key/${encodeURIComponent(localizationKey)}`;
        const result = await client.delete(path);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_localization_bulkDelete",
    {
      title: "Bulk Delete Localization Entries",
      description: describeTool(
        {
          summary: "Deletes up to 10000 localization entries by entry id in one request (soft delete) and reports the result per id.",
          use: "cleaning up many keys at once, e.g. all ids of a project from horizon_admin_localization_list.",
          avoid: "a single entry (use horizon_admin_localization_delete or horizon_admin_localization_deleteByKey).",
          requires: "entry ids from horizon_admin_localization_list; " + SCOPE,
          effects: "Removes every found entry from the game API and frees its key slots. Ids that are unknown or already deleted are reported as failed, not fatal.",
          returns: "{successful, failed, results}; each result has id, success and message (\"Deleted\" or \"Localization entry not found\").",
          errors: "400 for an empty list or more than 10000 ids.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        ids: z
          .array(z.string().uuid())
          .min(1)
          .max(10000)
          .describe("Entry ids (UUIDs) from horizon_admin_localization_list, 1 to 10000 per call"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ ids }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.post(
          "/api/v1/admin/localization/bulk-delete",
          { ids },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_localization_getLimits",
    {
      title: "Get Localization Limits",
      description: describeTool(
        {
          summary: "Returns the localization quota of one Project API key: keys used, the tier's key limit and the maximum characters per translated value.",
          use: "before adding many keys or long texts, or after a 400 or 403 from horizon_admin_localization_create.",
          avoid: "listing the entries (use horizon_admin_localization_list).",
          requires: "projectApiKeyId from horizon_admin_projects_list; " + SCOPE,
          effects: "None (read only).",
          returns: "{used, maxKeys, maxCharsPerValue, role}. used counts the active keys of this Project API key; maxKeys applies per Project API key.",
          errors: "400 when the Project API key does not exist or belongs to another account: check the id with horizon_admin_projects_list.",
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
          `/api/v1/admin/localization/api-key/${projectApiKeyId}/limits`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
