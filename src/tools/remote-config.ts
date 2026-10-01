import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, structuredResponse, describeTool, READ_ONLY } from "./tool-helpers.js";
import { REMOTE_CONFIG_OUTPUT, ALL_REMOTE_CONFIGS_OUTPUT } from "./output-schemas.js";

export function registerRemoteConfigTools(server: McpServer): void {
  // --- Get single remote config ---
  server.registerTool("horizon_get_remote_config", {
    title: "Get Remote Config",
    description: describeTool({
      summary: "Reads one remote config value by key (a feature flag or balance value set in the horizOn dashboard) as a string.",
      use: "the game needs a single value, for example to check one feature flag.",
      avoid: "loading many values at start (use horizon_get_all_remote_configs, one request instead of many).",
      effects: "None (read only).",
      returns: "{configKey, configValue, found}. Values are always strings: parse numbers and booleans yourself. An unknown key is not an error: found is false and configValue null, so fall back to a default.",
    }),
    inputSchema: {
      key: z.string().min(1).max(256).describe("Config key exactly as defined in the dashboard, case-sensitive, for example 'max_lives' (max 256 characters)"),
    },
    outputSchema: REMOTE_CONFIG_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ key }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const encodedKey = encodeURIComponent(key);
      const result = await client.get(`/api/v1/app/remote-config/${encodedKey}`);
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get all remote configs ---
  server.registerTool("horizon_get_all_remote_configs", {
    title: "Get All Remote Configs",
    description: describeTool({
      summary: "Reads every remote config value of the app in one call as a key to string map.",
      use: "at game start, to cache all flags and balance values at once.",
      avoid: "a single value (use horizon_get_remote_config) or checking the API key only (use horizon_test_connection).",
      effects: "None (read only).",
      returns: "{configs, total}, where configs maps each key to its string value; an app without configs returns an empty map and total 0.",
    }),
    outputSchema: ALL_REMOTE_CONFIGS_OUTPUT,
    annotations: READ_ONLY,
  }, async () => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/remote-config/all");
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
