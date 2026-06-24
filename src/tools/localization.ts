import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

const SUPPORTED_LANGUAGES_HINT =
  "One of: en, de, es, fr, it, pt, nl, pl, ru, ja, zh, ar, ko, tr, id.";

export function registerLocalizationTools(server: McpServer): void {
  // --- Get single localization ---
  server.registerTool("horizon_get_localization", {
    title: "Get Localization",
    description:
      "Gets a single localized string value by key from horizOn, optionally for a specific language.",
    inputSchema: {
      key: z.string().max(100).describe("Localization key (max 100 characters)"),
      lang: z
        .string()
        .length(2)
        .optional()
        .describe(`ISO 639-1 language code (2 characters). ${SUPPORTED_LANGUAGES_HINT}`),
    },
  }, async ({ key, lang }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const encodedKey = encodeURIComponent(key);
      const params = lang ? { lang } : undefined;
      const result = await client.get(`/api/v1/app/localization/${encodedKey}`, params);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get all localizations ---
  server.registerTool("horizon_get_all_localizations", {
    title: "Get All Localizations",
    description:
      "Gets all localized strings from horizOn, optionally for a specific language.",
    inputSchema: {
      lang: z
        .string()
        .length(2)
        .optional()
        .describe(`ISO 639-1 language code (2 characters). ${SUPPORTED_LANGUAGES_HINT}`),
    },
  }, async ({ lang }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const params = lang ? { lang } : undefined;
      const result = await client.get("/api/v1/app/localization/all", params);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get available languages ---
  server.registerTool("horizon_get_localization_languages", {
    title: "Get Localization Languages",
    description:
      "Gets the list of languages that have localizations available for the app.",
  }, async () => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/localization/languages");
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
