import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

export function registerConnectionTools(server: McpServer): void {
  server.registerTool("horizon_test_connection", {
    title: "Test Connection",
    description:
      "Checks that HORIZON_API_KEY and HORIZON_BASE_URL work by fetching all remote configs of the app. " +
      "Call it first during setup or when other tools fail. To check a player's session, use horizon_check_auth instead. " +
      "Returns {success: true, data} with the remote configs; a 401 error means the API key is wrong. " +
      API_ERRORS,
    annotations: READ_ONLY,
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
