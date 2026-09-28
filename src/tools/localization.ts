import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

const SUPPORTED_LANGUAGES_HINT =
  "One of: en, de, es, fr, it, pt, nl, pl, ru, ja, zh, ar, ko, tr, id.";

export function registerLocalizationTools(server: McpServer): void {
  // --- Get single localization ---
  server.registerTool("horizon_get_localization", {
    title: "Get Localization",
    description:
      "Reads one translated string by key. Without lang, the app's default language is used. " +
      "Returns {localizationKey, value, language, found}; a missing key is not an error: found is false and value is null. " +
      "To load a whole language, use horizon_get_all_localizations; to see which languages exist, use horizon_get_localization_languages. " +
      API_ERRORS,
    inputSchema: {
      key: z.string().max(100).describe("Localization key as defined in the dashboard, e.g. 'ui.play_button' (max 100 characters)"),
      lang: z
        .string()
        .length(2)
        .optional()
        .describe(`ISO 639-1 language code (2 characters). ${SUPPORTED_LANGUAGES_HINT}`),
    },
    annotations: READ_ONLY,
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
      "Reads all translated strings of one language as a key-value map, for example to load the UI texts at game start. " +
      "Without lang, the app's default language is used. Returns {translations, language, total}. " +
      "For a single key, use horizon_get_localization. " +
      API_ERRORS,
    inputSchema: {
      lang: z
        .string()
        .length(2)
        .optional()
        .describe(`ISO 639-1 language code (2 characters). ${SUPPORTED_LANGUAGES_HINT}`),
    },
    annotations: READ_ONLY,
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
      "Lists the languages that have at least one translation for the app. " +
      "Returns {languages, total}, where languages holds ISO 639-1 codes such as 'en' or 'de'. " +
      "Call it before horizon_get_localization or horizon_get_all_localizations to pick a valid lang. " +
      API_ERRORS,
    annotations: READ_ONLY,
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
