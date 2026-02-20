import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerRemoteConfigTools(server: McpServer): void {
  // --- Get single remote config ---
  server.registerTool("horizon_get_remote_config", {
    title: "Get Remote Config",
    description:
      "Gets a single remote configuration value by key from horizOn.",
    inputSchema: {
      key: z.string().max(256).describe("Configuration key (max 256 characters)"),
    },
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
      "Gets all remote configuration values from horizOn.",
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
