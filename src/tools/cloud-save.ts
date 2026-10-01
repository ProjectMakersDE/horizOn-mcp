import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import {
  noApiKeyResponse,
  errorResponse,
  jsonResponse,
  structuredResponse,
  describeTool,
  READ_ONLY,
  DESTRUCTIVE_WRITE,
  SESSION_REQUIRED,
  SESSION_ERRORS,
} from "./tool-helpers.js";
import { LOAD_CLOUD_DATA_OUTPUT } from "./output-schemas.js";

const userIdSchema = z.string().uuid().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*");

const sessionTokenSchema = z
  .string()
  .min(1)
  .max(256)
  .describe("accessToken from horizon_signin_email or horizon_signin_anonymous for this userId; sent as a Bearer session");

export function registerCloudSaveTools(server: McpServer): void {
  // --- Save cloud data ---
  server.registerTool("horizon_save_cloud_data", {
    title: "Save Cloud Data",
    description: describeTool({
      summary: "Stores a player's save game as one string (usually JSON) on the server, replacing the player's previous save.",
      use: "the game saves progress so it survives reinstalls and can be loaded on another device.",
      avoid: "reading the save (use horizon_load_cloud_data) or server-owned currency that players must not edit (use Validated Actions: horizon_submit_validated and horizon_get_state).",
      requires: SESSION_REQUIRED,
      effects: "overwrites the player's single save slot; the old save is gone. Saving the same data again changes nothing.",
      returns: "{success: true, dataSizeBytes}.",
      errors:
        "403 when the data exceeds the tier limit (defaults FREE 1 KB, BASIC 5 KB, PRO 20 KB, ENTERPRISE 250 KB): shrink the save or upgrade. " +
        SESSION_ERRORS,
    }),
    inputSchema: {
      userId: userIdSchema,
      data: z.string().max(300000).describe("The complete save as a string, usually serialized JSON (max 300,000 characters; the tier limit is usually lower)"),
      sessionToken: sessionTokenSchema,
    },
    annotations: DESTRUCTIVE_WRITE,
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
    description: describeTool({
      summary: "Reads a player's save game that was stored with horizon_save_cloud_data.",
      use: "the game starts or the player switches devices and needs the saved progress.",
      avoid: "writing (use horizon_save_cloud_data) or balances of server-owned values (use horizon_get_state).",
      requires: SESSION_REQUIRED,
      effects: "None (read only).",
      returns: "{found, saveData}. found false with saveData null means the player never saved: this is normal on first start, so initialize default data.",
      errors: SESSION_ERRORS,
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
    },
    outputSchema: LOAD_CLOUD_DATA_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/cloud-save/load", {
        userId,
      }, sessionHeaders(sessionToken));
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
