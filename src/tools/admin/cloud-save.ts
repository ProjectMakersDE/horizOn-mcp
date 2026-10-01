/**
 * Admin tools for managing cloud saves.
 *
 * Cloud saves are per-user, per-project blobs produced by the runtime
 * app's save API. These tools wrap the /api/v1/admin/cloud-save
 * endpoints so callers can list, fetch, update, delete and inspect
 * statistics/limits from the MCP surface.
 *
 * All tools require HORIZON_ACCOUNT_API_KEY.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  getAdminClient,
  noAdminClientResponse,
  jsonResponse,
  errorResponse,
  describeTool,
  ADMIN_AUTH,
  READ_ONLY,
  DESTRUCTIVE_WRITE,
} from "./_utils.js";

const SCOPE_BY_ID =
  "an Account Key with full-account access or the CLOUD_SAVE feature group; project-scoped keys are denied (403) for this call.";

const SAVE_FIELDS =
  "id, accountId, apiKeyId, apiKeyName, userId, saveData (the decrypted content as a string), dataSizeBytes, createdAt, updatedAt, isActive";

const NOT_FOUND = "404 for an unknown or deleted id: find the save with horizon_admin_cloudsave_list.";

const IGNORED_PROJECT_KEY = z
  .string()
  .uuid()
  .optional()
  .describe("Accepted for compatibility but not sent: the result always covers the whole account");

const idSchema = (action: string) =>
  z.string().uuid().describe(`UUID of the cloud save to ${action} (the id field of a horizon_admin_cloudsave_list entry)`);

export function registerAdminCloudSaveTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_cloudsave_list",
    {
      title: "List Cloud Saves",
      description: describeTool(
        {
          summary:
            "Lists the players' cloud saves of the account, newest first, optionally only those of one Project API key, with paging; every entry includes its full saveData.",
          use: "finding a player's save to inspect, repair or delete (match on userId), or getting the id for the other cloud save tools.",
          avoid:
            "totals and storage use (use horizon_admin_cloudsave_getStats) or loading a save as the player (use horizon_load_cloud_data). Keep size small: large saves make big results.",
          requires:
            "an Account Key with full-account access or the CLOUD_SAVE feature group; a project-scoped key must pass its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            `{entries, total, page, size, totalPages}; each entry has ${SAVE_FIELDS}. An empty entries array means no saves match (or the page is past the end).`,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "UUID of the Project API key whose saves to list (from horizon_admin_projects_list; sent as apiKeyId). Omit for all keys; required for a project-scoped Account Key",
          ),
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Saves per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
    },
    async ({ projectApiKeyId, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined)
          params.apiKeyId = projectApiKeyId;
        const result = await client.get("/api/v1/admin/cloud-save", params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_get",
    {
      title: "Get Cloud Save",
      description: describeTool(
        {
          summary: "Returns one cloud save by id, including its full decrypted saveData and size.",
          use: "reading a save before changing it with horizon_admin_cloudsave_update, or checking what a player has stored.",
          avoid: "searching saves (use horizon_admin_cloudsave_list).",
          requires: `id from horizon_admin_cloudsave_list; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns: `One save: ${SAVE_FIELDS}.`,
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: idSchema("fetch"),
      },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(`/api/v1/admin/cloud-save/${id}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_update",
    {
      title: "Update Cloud Save",
      description: describeTool(
        {
          summary:
            "Replaces the whole saveData of an existing cloud save with a new JSON document (no merge); the player loads the new content next time.",
          use: "repairing a corrupt save or granting a player progress by editing the JSON read with horizon_admin_cloudsave_get.",
          avoid: "writing a save as the player (use horizon_save_cloud_data); removing a save (use horizon_admin_cloudsave_delete).",
          requires: `id from horizon_admin_cloudsave_list; ${SCOPE_BY_ID}`,
          effects:
            "Overwrites the stored save (encrypted at rest); the previous content is not returned or kept by this call. Repeating the same data changes nothing more.",
          returns: `The updated save: ${SAVE_FIELDS}.`,
          errors:
            "400 when data is not valid JSON or is blank: send a JSON document. " +
            "403 when the data is larger than the tier's maxBytesPerSave (the message names both sizes): check horizon_admin_cloudsave_getLimits and shrink the data. " +
            NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: idSchema("update"),
        data: z
          .string()
          .min(1)
          .max(300000)
          .describe(
            "New save content, a JSON document as a string (the server rejects anything that is not valid JSON), 1 to 300000 characters. " +
              "Its UTF-8 size must also fit the tier's maxBytesPerSave from horizon_admin_cloudsave_getLimits. Sent as saveData and replaces the whole save",
          ),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id, data }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.put(
          `/api/v1/admin/cloud-save/${id}`,
          { saveData: data },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_delete",
    {
      title: "Delete Cloud Save",
      description: describeTool(
        {
          summary:
            "Deletes one cloud save by id (soft delete): the player can no longer load it and it disappears from lists and statistics.",
          use: "resetting a player's progress or removing a broken or test save.",
          avoid: "changing the content while keeping the save (use horizon_admin_cloudsave_update).",
          requires: `id from horizon_admin_cloudsave_list; ${SCOPE_BY_ID}`,
          effects:
            "Marks the save as deleted; it cannot be restored through the API. A second call for the same id fails with 404.",
          returns: "null (the server answers 204 No Content).",
          errors: "404 for an unknown or already deleted id (nothing left to do).",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: idSchema("delete"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/cloud-save/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_getStats",
    {
      title: "Get Cloud Save Statistics",
      description: describeTool(
        {
          summary:
            "Returns account-wide cloud save statistics: save count, storage used, size spread, players with data and saves per Project API key.",
          use: "getting an overview of storage use without paging through saves.",
          avoid: "the tier's per-save size limit (use horizon_admin_cloudsave_getLimits) or individual saves (use horizon_admin_cloudsave_list).",
          requires: SCOPE_BY_ID,
          effects: "None (read only).",
          returns:
            "{totalSaves, totalStorageBytes, totalStorageKB, totalStorageMB (string with 2 decimals), averageSaveSize, minSaveBytes, maxSaveBytes, usersWithData, totalUsers, savesPerApiKey}.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: IGNORED_PROJECT_KEY,
      },
      annotations: READ_ONLY,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/cloud-save/statistics",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_cloudsave_getLimits",
    {
      title: "Get Cloud Save Limits",
      description: describeTool(
        {
          summary: "Returns the tier's maximum size of one cloud save and the account's current save count and total storage.",
          use: "before horizon_admin_cloudsave_update, or when players report that saves are rejected as too large.",
          avoid: "detailed storage statistics (use horizon_admin_cloudsave_getStats).",
          requires: SCOPE_BY_ID,
          effects: "None (read only).",
          returns: "{role, maxBytesPerSave, maxKBPerSave, currentTotalSaves, currentTotalStorageBytes}.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: IGNORED_PROJECT_KEY,
      },
      annotations: READ_ONLY,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get("/api/v1/admin/cloud-save/limits");
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
