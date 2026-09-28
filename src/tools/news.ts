import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

export function registerNewsTools(server: McpServer): void {
  server.registerTool("horizon_get_news", {
    title: "Get News",
    description:
      "Reads the in-game news created in the horizOn dashboard, such as announcements and patch notes, to show them in the game. " +
      "Returns an array of {id, title, message, releaseDate, languageCode}, newest first, with only published entries whose release date has passed; " +
      "the array is empty when there is no news. " +
      "Without languageCode, entries in all languages are returned. " +
      API_ERRORS,
    inputSchema: {
      limit: z.number().int().min(0).max(100).default(20).describe("Number of news items to return (0-100, default 20)"),
      languageCode: z.string().length(2).optional().describe("ISO 639-1 language code (2 characters, e.g. 'en')"),
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
