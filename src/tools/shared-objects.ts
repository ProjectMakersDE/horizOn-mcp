import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, IDEMPOTENT_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { sharedKey, sharedRevision, sharedData, sharedQuery, sharedPage, sharedPageQuery } from "./shared-object-schemas.js";

const session = { userId: z.string().uuid().describe("Active player UUID matching the authenticated session and project"), sessionToken: z.string().min(1).max(256).describe("Player accessToken, sent only as Bearer") };
const base = "/api/v1/app/shared-objects";
const objectPath = (collection: string, id?: string) => base + "/" + encodeURIComponent(collection) + "/objects" + (id ? "/" + encodeURIComponent(id) : "");
export const sharedErrors = "409 revision/state/permission conflict or lost response: explicitly reread owned objects/usage and reconcile original intent, never automatically retry with newer revisions or a replacement ID. 404 does not distinguish missing/private/expired data. 422 retains existing data on quota/archive failure. " + SESSION_ERRORS;
const description = (summary: string, effects: string, returns: string) => describeTool({ summary,
  use: "explicit world-map/async-PvP object access after reading horizon://docs/shared-objects.",
  avoid: "background polling, automatic page traversal, interpreting opaque bytes or using this as a combat validator.",
  requires: SESSION_REQUIRED, effects, returns, errors: sharedErrors });
export function registerSharedObjectsTools(server: McpServer): void {
  server.registerTool("horizon_get_shared_collections", {
    title: "Get Shared Object Collections", description: description("Reads one permanent collection catalog page.", "Read only; retain catalogRevision across pages.", "{revision,definitions,nextAfterKey,limits,serverTime}"),
    inputSchema: { ...session, ...sharedPage }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, ...page }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/collections", { userId, ...sharedPageQuery(page) }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_get_shared_usage", {
    title: "Get Shared Object Owner Usage", description: description("Reads the current player's count and creation precondition for one collection.", "Read only; absent revision/count are zero without writing.", "{userId,collection,revision,count,limits,pollAfterSeconds,serverTime}"),
    inputSchema: { ...session, collection: sharedKey }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, collection }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/" + collection + "/usage", { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_get_shared_object", {
    title: "Get Shared Object", description: description("Reads one object under current permissions.", "Read only; respect pollAfterSeconds for refresh.", "{object,pollAfterSeconds,serverTime}; object contains opaque dataBase64 and original identity/revision."),
    inputSchema: { ...session, collection: sharedKey, objectId: z.string().uuid().describe("Original server-generated object UUID from the reviewed snapshot") }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, collection, objectId }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(objectPath(collection, objectId), { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_query_shared_objects", {
    title: "Query Shared Objects", description: description("Reads one bounded metadata-selected object page.", "Read only POST. At most 256 candidates, 50 objects and 1 MiB decoded bytes. Empty page with cursor is valid. Random is nonuniform, at most two indexed ranges.", "{objects,nextCursor,pollAfterSeconds,serverTime}; explicit next-cursor may proceed immediately, refresh honors interval."),
    inputSchema: { ...session, collection: sharedKey, query: sharedQuery }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, collection, query }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/" + collection + "/query", { userId, ...query }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_create_shared_object", {
    title: "Create Shared Object", description: description("Creates one server-ID object using the original owner-usage revision.", "Commits object, usage and quota atomically. Retain original If-Match after a lost response. One HTTP attempt.", "{object,usage,pollAfterSeconds,serverTime}"),
    inputSchema: { ...session, collection: sharedKey, expectedRevision: sharedRevision, ...sharedData, groupId: z.string().uuid().optional().describe("Current immutable group UUID when either collection policy requires a group") }, annotations: IDEMPOTENT_WRITE,
  }, async ({ userId, sessionToken, collection, expectedRevision, ...data }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(objectPath(collection), { userId, ...data }, { ...sessionHeaders(sessionToken), "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_update_shared_object", {
    title: "Update Shared Object", description: description("Replaces one object's opaque bytes and configured search data under its exact revision.", "Current owner/group permission required; owner/group/expiry stay immutable. One HTTP attempt.", "{object,usage,pollAfterSeconds,serverTime}"),
    inputSchema: { ...session, collection: sharedKey, objectId: z.string().uuid().describe("Original server-generated object UUID from the reviewed snapshot"), expectedRevision: sharedRevision, ...sharedData }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ userId, sessionToken, collection, objectId, expectedRevision, ...data }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.put(objectPath(collection, objectId), { userId, ...data }, { ...sessionHeaders(sessionToken), "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_delete_shared_object", {
    title: "Delete Shared Object", description: description("Deletes one exact-revision object and refunds its stored charge.", "Destructive; owner cleanup remains possible after group leave/archive. Owner usage revision remains to prevent creation ABA. One HTTP attempt.", "{objectId,deleted,usage,pollAfterSeconds,serverTime}; repeated completed delete is OBJECT_NOT_FOUND."),
    inputSchema: { ...session, collection: sharedKey, objectId: z.string().uuid().describe("Original server-generated object UUID from the reviewed snapshot"), expectedRevision: sharedRevision }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ userId, sessionToken, collection, objectId, expectedRevision }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.delete(objectPath(collection, objectId) + "?userId=" + encodeURIComponent(userId), undefined, { ...sessionHeaders(sessionToken), "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
}
