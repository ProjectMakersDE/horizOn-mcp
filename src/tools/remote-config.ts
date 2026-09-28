import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

export function registerRemoteConfigTools(server: McpServer): void {
  // --- Get single remote config ---
  server.registerTool("horizon_get_remote_config", {
    title: "Get Remote Config",
    description:
      "Reads one remote config value by key, for example a feature flag or a balance value set in the horizOn dashboard. " +
      "Returns {configKey, configValue, found}. An unknown key is not an error: found is false and configValue is null. " +
      "Values are strings, so parse numbers and booleans yourself. To load every value at once, use horizon_get_all_remote_configs. " +
      API_ERRORS,
    inputSchema: {
      key: z.string().max(256).describe("Configuration key as defined in the dashboard, case-sensitive (max 256 characters)"),
    },
    annotations: READ_ONLY,
  }, async ({ key }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const encodedKey = encodeURIComponent(key);
      const result = await client.get(`/api/v1/app/remote-config/${encodedKey}`);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Get all remote configs ---
  server.registerTool("horizon_get_all_remote_configs", {
    title: "Get All Remote Configs",
    description:
      "Reads all remote config values of the app in one call, for example at game start. " +
      "Returns {configs, total}, where configs maps each key to its string value; an app without configs returns an empty map. " +
      "For a single value, use horizon_get_remote_config. " +
      API_ERRORS,
    annotations: READ_ONLY,
  }, async () => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get("/api/v1/app/remote-config/all");
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
