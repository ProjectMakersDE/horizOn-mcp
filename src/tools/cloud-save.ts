import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, HorizonApiError, sessionHeaders } from "./api-client.js";
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

/** Load response header with the save's revision (0 = empty slot, 1 = first save). */
const REVISION_HEADER = "X-Cloud-Save-Revision";

/**
 * Revision from the load header, or null when it is missing or not a number.
 * Null means unknown (for example a self-hosted simpleServer), not an empty slot.
 */
export function parseRevision(value: string | null): number | null {
  if (value === null || !/^\s*\d+\s*$/.test(value)) return null;
  return Number(value.trim());
}

/** Tool result for HTTP 409: another device saved since expectedRevision. */
function conflictResponse(expectedRevision: number, body: string) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          `Cloud save conflict (HTTP 409): the save is no longer at revision ${expectedRevision} because another device saved first. ` +
          "Nothing was written. Call horizon_load_cloud_data for the current save and revision, decide or merge, " +
          `then save again with that revision as expectedRevision. Server response: ${body}`,
      },
    ],
    isError: true,
  };
}

export function registerCloudSaveTools(server: McpServer): void {
  // --- Save cloud data ---
  server.registerTool("horizon_save_cloud_data", {
    title: "Save Cloud Data",
    description: describeTool({
      summary: "Stores a player's save game as one string (usually JSON) on the server, replacing the player's previous save.",
      use: "the game saves progress so it survives reinstalls and can be loaded on another device. Pass expectedRevision (the revision from horizon_load_cloud_data or the last save) so a save from another device is never overwritten silently.",
      avoid: "reading the save (use horizon_load_cloud_data) or server-owned currency that players must not edit (use Validated Actions: horizon_submit_validated and horizon_get_state).",
      requires: SESSION_REQUIRED,
      effects: "overwrites the player's single save slot; the old save is gone. With expectedRevision it only writes while the save is still at that revision. Saving the same data again changes nothing.",
      returns: "{success: true, dataSizeBytes, revision}. revision is the new revision: pass it as expectedRevision to the next save.",
      errors:
        "409 (only with expectedRevision) when another device saved first: nothing was written, load the current save and revision, decide, then save again. " +
        "403 when the data exceeds the tier limit (defaults FREE 1 KB, BASIC 5 KB, PRO 20 KB, ENTERPRISE 250 KB): shrink the save or upgrade. " +
        SESSION_ERRORS,
    }),
    inputSchema: {
      userId: userIdSchema,
      data: z.string().max(300000).describe("The complete save as a string, usually serialized JSON (max 300,000 characters; the tier limit is usually lower)"),
      sessionToken: sessionTokenSchema,
      expectedRevision: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Optional. Revision the save must still have, sent as If-Match: 0 for an empty slot, else the revision from horizon_load_cloud_data or the last save. Omit for an unconditional overwrite."),
    },
    annotations: DESTRUCTIVE_WRITE,
  }, async ({ userId, data, sessionToken, expectedRevision }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    const headers = sessionHeaders(sessionToken);
    if (expectedRevision !== undefined) headers["If-Match"] = String(expectedRevision);

    try {
      const result = await client.post("/api/v1/app/cloud-save/save", {
        userId,
        saveData: data,
      }, headers);
      return jsonResponse(result);
    } catch (error) {
      if (expectedRevision !== undefined && error instanceof HorizonApiError && error.status === 409) {
        return conflictResponse(expectedRevision, error.body);
      }
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
      returns:
        "{found, saveData, revision}. found false with saveData null means the player never saved: this is normal on first start, so initialize default data. " +
        "revision is the save's server revision (0 = empty slot, 1 after the first save): pass it as expectedRevision to horizon_save_cloud_data. " +
        "revision null means the server sent none (unknown state, for example a self-hosted simpleServer), not an empty slot.",
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
      const { data, headers } = await client.postWithHeaders<Record<string, unknown>>("/api/v1/app/cloud-save/load", {
        userId,
      }, sessionHeaders(sessionToken));
      return structuredResponse({ ...data, revision: parseRevision(headers.get(REVISION_HEADER)) });
    } catch (error) {
      return errorResponse(error);
    }
  });
}
