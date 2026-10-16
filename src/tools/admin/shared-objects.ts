import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE, IDEMPOTENT_WRITE } from "./_utils.js";
import { sharedKey, sharedRevision, sharedData, sharedDefinition, sharedQuery, sharedPage, sharedPageQuery, sharedText } from "../shared-object-schemas.js";
import { sharedErrors } from "../shared-objects.js";

const project = { projectApiKeyId: z.string().uuid().describe("Owned project UUID sent as apiKeyId") };
const base = "/api/v1/admin/shared-objects";
const path = (suffix: string, project: string) => base + suffix + "?apiKeyId=" + encodeURIComponent(project);
const description = (summary: string, effects: string, returns: string) => describeTool({ summary,
  use: "explicit reviewed support/configuration changes in horizon://docs/shared-objects.", avoid: "automatic retries or Account Keys in game builds; use horizon_admin_shared_collections_get for definitions and horizon_admin_shared_limits for account usage.",
  requires: "SHARED_OBJECTS Account Key scope and matching owned project, or full-account access. Hosted admin only; simpleServer uses a local trusted CLI.",
  effects, returns, errors: sharedErrors }, ADMIN_AUTH);
export function registerAdminSharedObjectsTools(server: McpServer): void {
  server.registerTool("horizon_admin_shared_collections_get", {
    title: "Get Shared Collection Catalog", description: description("Reads one bounded collection catalog page for the selected owned project.", "Read only; retain catalogRevision across explicit pages.", "{revision,definitions,nextAfterKey,limits,serverTime}"),
    inputSchema: { ...project, ...sharedPage }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, ...page }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base + "/collections", { apiKeyId: projectApiKeyId, ...sharedPageQuery(page) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_collection_set", {
    title: "Set Shared Collection", description: description("Creates or updates one permanent collection under the original catalog revision.", "First use locks policy/schema/TTL. Archival blocks new writes and retains reads/deletes. No player fanout.", "{revision,definition,limits,serverTime}"),
    inputSchema: { ...project, collection: sharedKey, expectedRevision: sharedRevision, definition: sharedDefinition }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, collection, expectedRevision, definition }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(path("/collections/" + collection, projectApiKeyId), definition, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_limits", {
    title: "Get Shared Object Limits", description: description("Reads tier limits and account-wide charged storage.", "Read only.", "{limits,chargedBytes,revision}; storage is account-wide, catalog cap per project."),
    inputSchema: project, annotations: READ_ONLY,
  }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base + "/limits", { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_usage", {
    title: "Get Shared Owner Usage", description: description("Reads one owner's collection count and creation revision.", "Read only, including empty retained usage anchors.", "{userId,collection,revision,count,limits,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, collection: sharedKey, userId: z.string().uuid().describe("Target player UUID belonging to the selected project") }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, collection, userId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base + "/" + collection + "/usage", { apiKeyId: projectApiKeyId, userId })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_object_get", {
    title: "Inspect Shared Object", description: description("Reads one owned-project object, including dashboard-only data.", "Read only.", "{object,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, collection: sharedKey, objectId: z.string().uuid().describe("Original server-generated object UUID from the reviewed snapshot") }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, collection, objectId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base + "/" + collection + "/objects/" + objectId, { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_objects_query", {
    title: "Query Owned Shared Objects", description: description("Reads one bounded explicit permission partition.", "Read-only POST, no hidden whole-project scan. At most 256 metadata candidates, 50 objects and 1 MiB decoded payload.", "{objects,nextCursor,pollAfterSeconds,serverTime}; empty cursor pages are valid."),
    inputSchema: { ...project, collection: sharedKey, query: sharedQuery }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, collection, query }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(path("/" + collection + "/query", projectApiKeyId), query)); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_object_create", {
    title: "Create Owned Shared Object", description: description("Creates an object for an explicit active owner using their original usage revision.", "One atomic create, stored charges and owner count. Server generates UUID. One HTTP attempt.", "{object,usage,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, collection: sharedKey, ownerId: z.string().uuid().describe("Explicit active owner UUID; its original usage revision is the creation precondition"), expectedRevision: sharedRevision, ...sharedData, groupId: z.string().uuid().optional().describe("Immutable group UUID with current owner membership when required") }, annotations: IDEMPOTENT_WRITE,
  }, async ({ projectApiKeyId, collection, ownerId, expectedRevision, ...data }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(path("/" + collection + "/objects", projectApiKeyId), { ownerId, ...data }, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_object_update", {
    title: "Update Owned Shared Object", description: description("Replaces opaque bytes and search data using the original object revision.", "One atomic update. Owner/group/original expiry remain unchanged. One HTTP attempt.", "{object,usage,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, collection: sharedKey, objectId: z.string().uuid().describe("Original server-generated object UUID from the reviewed snapshot"), expectedRevision: sharedRevision, ...sharedData }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, collection, objectId, expectedRevision, ...data }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(path("/" + collection + "/objects/" + objectId, projectApiKeyId), data, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_object_delete", {
    title: "Delete Owned Shared Object", description: description("Deletes one exact-revision object and refunds its stored charge.", "Destructive cleanup remains available after group/owner deletion or archive. Owner usage stays until player cleanup. One HTTP attempt.", "{objectId,deleted,usage,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, collection: sharedKey, objectId: z.string().uuid().describe("Original server-generated object UUID from the reviewed snapshot"), expectedRevision: sharedRevision }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, collection, objectId, expectedRevision }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.delete(path("/" + collection + "/objects/" + objectId, projectApiKeyId), undefined, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_shared_cleanup", {
    title: "Clean One Expired Object Batch", description: description("Deletes up to twenty expired objects for one project.", "Deletes expired bytes and atomically refunds stored charges. One explicit batch, no automatic continuation.", "{removed,refundedBytes}"),
    inputSchema: project, annotations: { ...DESTRUCTIVE_WRITE, idempotentHint: false },
  }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(path("/cleanup", projectApiKeyId))); } catch (error) { return errorResponse(error); }
  });
  const instant = z.iso.datetime({ offset: true }).refine(value => !/\.\d{4,}/.test(value), "At most millisecond precision");
  server.registerTool("horizon_admin_inbox_send_ordinary", {
    title: "Deliver Trusted Ordinary Notice", description: describeTool({ summary: "Delivers a replay-safe ordinary notice for a trusted game backend's durable original intent.",
      use: "after authoritative outcome verification and persisting operationId/issuedAt/expiry/content together.", avoid: "rewards; use horizon_admin_shared_object_get for original defense data. Avoid asserting victory without authoritative evidence, new IDs after a lost response, or client Account Keys.",
      requires: "INBOX Account Key scope plus matching project. This endpoint does not itself verify game outcomes.",
      effects: "One atomic delivery under active-user fence. Full/unavailable inbox retains original pending intent until fixed expiry. Receipt-floor errors become unconfirmed, never a replacement ID. No attachments or automatic retries.",
      returns: "{entryId,replayed}", errors: "INBOX_FULL stays pending, expired intent is terminal, OPERATION_CONFLICT rejects changed content, STATE_CONFLICT retains original intent. Scope/ownership rules apply." }, ADMIN_AUTH),
    inputSchema: { ...project, userId: z.string().uuid().describe("Target player UUID belonging to the selected project"), operationId: z.string().uuid().describe("Original durable intent UUID, never replaced after uncertainty"), issuedAt: instant.describe("Original intent issuance time, fixed before first delivery"), expiresAt: instant.describe("Original fixed expiry within seven days; never extend on retry"),
      textKey: sharedText(512).min(1).max(128).refine(value => value.trim().length > 0).describe("Nonblank localization key for the ordinary message, maximum 128 characters"), reference: sharedText(512).max(128).describe("Immutable game reference bound to the original verified outcome"),
      parameters: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,32}$(?![\s\S])/), sharedText(120)).refine(value => Object.keys(value).length <= 8).describe("Original localization parameters, up to eight bounded string values") }, annotations: IDEMPOTENT_WRITE,
  }, async ({ projectApiKeyId, ...intent }) => {
    const issued = Date.parse(intent.issuedAt), expires = Date.parse(intent.expiresAt);
    if (!Number.isFinite(issued) || !Number.isFinite(expires) || issued < 0 || expires <= issued || expires - issued > 604800000) return errorResponse(new Error("INVALID_REQUEST: Fixed ordinary expiry must be within seven days of issuance"));
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post("/api/v1/admin/inbox/messages", { apiKeyId: projectApiKeyId, ...intent })); } catch (error) { return errorResponse(error); }
  });
}
