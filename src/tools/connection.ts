import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, structuredResponse, describeTool, READ_ONLY } from "./tool-helpers.js";
import { TEST_CONNECTION_OUTPUT } from "./output-schemas.js";

export function registerConnectionTools(server: McpServer): void {
  server.registerTool("horizon_test_connection", {
    title: "Test Connection",
    description: describeTool({
      summary: "Checks that HORIZON_API_KEY and HORIZON_BASE_URL reach the horizOn API by fetching the app's remote configs; takes no input.",
      use: "first during setup, and whenever other tools fail, to tell a configuration problem from a problem of the call itself.",
      avoid: "checking a player's session (use horizon_check_auth) or reading config values for the game (use horizon_get_all_remote_configs).",
      effects: "None (read only).",
      returns: "{success: true, data} where data holds the app's remote configs; success means key and URL work.",
      errors: "A network error means HORIZON_BASE_URL is wrong or unreachable: check the URL (default https://horizon.pm).",
    }),
    outputSchema: TEST_CONNECTION_OUTPUT,
    annotations: READ_ONLY,
  }, async () => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/remote-config/all");
      return structuredResponse({ success: true, data: result });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
