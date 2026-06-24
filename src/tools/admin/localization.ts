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

export function registerAdminLocalizationTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_localization_list",
    {
      title: "List Localization Entries",
      description:
        "Lists localization entries for the authenticated account. Filter by projectApiKeyId to scope the result to a single project, by search to match against keys/values, and by language to scope to a single language code.",
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
        language: z
          .string()
          .length(2)
          .optional()
          .describe(
            `Optional ISO 639-1 language code (2 characters) to filter by. One of: ${SUPPORTED_LANGUAGES_HINT}.`,
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
      description:
        "Creates a new localization entry or updates the translations if the key already exists for the given project API key. Keys must match /^[a-zA-Z0-9_.-]+$/ (1-100 chars). Provide translations as a map of language code to value.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key this entry belongs to"),
        localizationKey: z
          .string()
          .min(1)
          .max(100)
          .regex(/^[a-zA-Z0-9_.-]+$/)
          .describe(
            "Localization key (1-100 chars, alphanumeric + _ . -). Dot-notation recommended.",
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
            `Map of language code to translated value (max chars per value is tier-enforced server-side; ADMIN allows up to 2000). Supported keys: ${SUPPORTED_LANGUAGES_HINT}.`,
          ),
      },
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
      description:
        "Soft-deletes a localization entry by its UUID. After deletion the entry is no longer returned by the runtime app API.",
      inputSchema: {
        id: z
          .string()
          .uuid()
          .describe("UUID of the localization entry to delete"),
      },
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
      description:
        "Soft-deletes a localization entry by its localizationKey for a specific project API key. Useful when the entry UUID is not known.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key the entry belongs to"),
        localizationKey: z
          .string()
          .min(1)
          .max(100)
          .describe("Localization key to delete"),
      },
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
      description:
        "Deletes up to 10000 localization entries in a single request. Each entry is processed independently; the response reports per-entry success/failure.",
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
      description:
        "Returns the localization key usage and limits for a specific project API key: used (current key count), maxKeys, maxCharsPerValue, and role.",
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
          `/api/v1/admin/localization/api-key/${projectApiKeyId}/limits`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
