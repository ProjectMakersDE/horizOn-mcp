import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerConnectionTools(server: McpServer): void {
  server.registerTool("horizon_test_connection", {
    title: "Test Connection",
    description:
      "Tests the connection to the horizOn API by fetching all remote configs as a health check. Returns success or failure.",
  }, async () => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/remote-config/all");
      return jsonResponse({ success: true, data: result });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
