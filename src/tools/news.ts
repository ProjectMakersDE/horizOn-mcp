import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerNewsTools(server: McpServer): void {
  server.registerTool("horizon_get_news", {
    title: "Get News",
    description:
      "Gets news articles from horizOn with optional language filtering.",
    inputSchema: {
      limit: z.number().int().min(0).max(100).default(20).describe("Number of news items to return (0-100, default 20)"),
      languageCode: z.string().length(2).optional().describe("ISO 639-1 language code (2 characters, e.g. 'en')"),
    },
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
