import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, describeTool, READ_ONLY } from "./tool-helpers.js";

export function registerNewsTools(server: McpServer): void {
  server.registerTool("horizon_get_news", {
    title: "Get News",
    description: describeTool({
      summary: "Lists the published in-game news of the app (announcements, patch notes) created in the horizOn dashboard, newest first.",
      use: "a game shows a news feed or a message of the day, optionally filtered to the player's language.",
      avoid: "configuration values (use horizon_get_remote_config) or UI translations (use horizon_get_localization).",
      effects: "None (read only).",
      returns: "an array of {id, title, message, releaseDate, languageCode} with only published entries whose release date has passed; an empty array means there is no news. Without languageCode, entries of all languages are returned.",
    }),
    inputSchema: {
      limit: z.number().int().min(0).max(100).default(20).describe("Maximum number of entries to return, 0 to 100 (default 20)"),
      languageCode: z.string().length(2).optional().describe("ISO 639-1 code (2 lowercase letters, for example 'en' or 'de') to return only entries in that language. Omit for all languages"),
    },
    annotations: READ_ONLY,
  }, async ({ limit, languageCode }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const params: Record<string, string> = { limit: String(limit) };
      if (languageCode) {
        params.languageCode = languageCode;
      }
      const result = await client.get("/api/v1/app/news", params);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
