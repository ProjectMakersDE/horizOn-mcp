import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, structuredResponse, describeTool, READ_ONLY } from "./tool-helpers.js";
import { LOCALIZATION_OUTPUT, ALL_LOCALIZATIONS_OUTPUT, LOCALIZATION_LANGUAGES_OUTPUT } from "./output-schemas.js";

const SUPPORTED_LANGUAGES_HINT =
  "One of: en, de, es, fr, it, pt, nl, pl, ru, ja, zh, ar, ko, tr, id. Omit for the app's default language.";

export function registerLocalizationTools(server: McpServer): void {
  // --- Get single localization ---
  server.registerTool("horizon_get_localization", {
    title: "Get Localization",
    description: describeTool({
      summary: "Reads one translated string by key in one language (default: the app's default language).",
      use: "the game needs a single text, for example a dynamic message.",
      avoid: "loading the UI texts at start (use horizon_get_all_localizations) or finding out which languages exist (use horizon_get_localization_languages).",
      effects: "None (read only).",
      returns: "{localizationKey, value, language, found}. A missing key or translation is not an error: found is false and value null, so show a fallback text.",
    }),
    inputSchema: {
      key: z.string().min(1).max(100).describe("Localization key exactly as defined in the dashboard, for example 'ui.play_button' (max 100 characters)"),
      lang: z
        .string()
        .length(2)
        .optional()
        .describe(`ISO 639-1 language code (2 lowercase letters). ${SUPPORTED_LANGUAGES_HINT}`),
    },
    outputSchema: LOCALIZATION_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ key, lang }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const encodedKey = encodeURIComponent(key);
      const params = lang ? { lang } : undefined;
      const result = await client.get(`/api/v1/app/localization/${encodedKey}`, params);
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get all localizations ---
  server.registerTool("horizon_get_all_localizations", {
    title: "Get All Localizations",
    description: describeTool({
      summary: "Reads all translated strings of one language as a key to text map (default: the app's default language).",
      use: "at game start or on a language switch, to load every UI text at once.",
      avoid: "a single key (use horizon_get_localization).",
      effects: "None (read only).",
      returns: "{translations, language, total}; translations is empty (total 0) when the language has no strings.",
    }),
    inputSchema: {
      lang: z
        .string()
        .length(2)
        .optional()
        .describe(`ISO 639-1 language code (2 lowercase letters). ${SUPPORTED_LANGUAGES_HINT}`),
    },
    outputSchema: ALL_LOCALIZATIONS_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ lang }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const params = lang ? { lang } : undefined;
      const result = await client.get("/api/v1/app/localization/all", params);
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get available languages ---
  server.registerTool("horizon_get_localization_languages", {
    title: "Get Localization Languages",
    description: describeTool({
      summary: "Lists the languages that have at least one translation for the app.",
      use: "before horizon_get_localization or horizon_get_all_localizations, to pick a valid lang or build a language menu.",
      avoid: "the texts themselves (use horizon_get_all_localizations).",
      effects: "None (read only).",
      returns: "{languages, total}, where languages holds ISO 639-1 codes such as 'en' or 'de'; empty when the app has no translations.",
    }),
    outputSchema: LOCALIZATION_LANGUAGES_OUTPUT,
    annotations: READ_ONLY,
  }, async () => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/localization/languages");
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
