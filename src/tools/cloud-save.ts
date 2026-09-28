import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

export function registerCloudSaveTools(server: McpServer): void {
  // --- Save cloud data ---
  server.registerTool("horizon_save_cloud_data", {
    title: "Save Cloud Data",
    description:
      "Stores a player's save game as a string, usually JSON, and replaces any earlier save of that player. " +
      "Needs the player's session: pass the accessToken from horizon_signin_email or horizon_signin_anonymous. " +
      "Read it back with horizon_load_cloud_data. The allowed size depends on the account tier, by default " +
      "FREE 1 KB, BASIC 5 KB, PRO 20 KB and ENTERPRISE 250 KB; a larger save fails with HTTP 403. " +
      "Returns {success: true, dataSizeBytes}. " +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      data: z.string().max(300000).describe("Save data string, usually serialized JSON (max 300,000 characters; the tier limit is usually lower)"),
      sessionToken: z.string().min(1).max(256).describe("accessToken returned by horizon_signin_email or horizon_signin_anonymous for this user; sent as a Bearer session"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ userId, data, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/cloud-save/save", {
        userId,
        saveData: data,
      }, sessionHeaders(sessionToken));
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Load cloud data ---
  server.registerTool("horizon_load_cloud_data", {
    title: "Load Cloud Data",
    description:
      "Reads a player's save game that was stored with horizon_save_cloud_data. " +
      "Needs the player's session: pass the accessToken from horizon_signin_email or horizon_signin_anonymous. " +
      "Returns {found, saveData}. A player who never saved gets found false and saveData null, which is normal on first start: initialize default data then. " +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      sessionToken: z.string().min(1).max(256).describe("accessToken returned by horizon_signin_email or horizon_signin_anonymous for this user; sent as a Bearer session"),
    },
    annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/cloud-save/load", {
        userId,
      }, sessionHeaders(sessionToken));
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
