import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerCloudSaveTools(server: McpServer): void {
  // --- Save cloud data ---
  server.registerTool("horizon_save_cloud_data", {
    title: "Save Cloud Data",
    description:
      "Saves cloud data for a user on horizOn. Data is a string (max 300,000 characters).",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
      data: z.string().max(300000).describe("Save data string (max 300,000 characters)"),
    },
  }, async ({ userId, data }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/cloud-save/save", {
        userId,
        saveData: data,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Load cloud data ---
  server.registerTool("horizon_load_cloud_data", {
    title: "Load Cloud Data",
    description:
      "Loads cloud save data for a user from horizOn.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
    },
  }, async ({ userId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/cloud-save/load", {
        userId,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
