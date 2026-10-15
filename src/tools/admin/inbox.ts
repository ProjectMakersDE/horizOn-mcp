import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE } from "./_utils.js";
import { safeValue, valueKey, valueOperationId, valueUserId } from "../player-values.js";

const project = { projectApiKeyId: z.string().uuid().describe("Owned project API key UUID, sent as apiKeyId") };
const revision = safeValue.describe("Catalogue revision from the last read, sent unchanged as If-Match, including lost-response retry");
const broadcastId = z.string().regex(/^broadcast:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/).describe("Exact broadcast-prefixed ID from the reviewed catalogue");
const path = "/api/v1/admin/inbox";
const requires = "Account Key with INBOX and matching project access, or full-account access. Read horizon_admin_inbox_broadcasts_get first for revision and serverTime. Hosted horizOn only; simpleServer uses its local operator CLI.";
const errors = "403: wrong feature/project scope. 404: unknown or foreign entity. 409 REVISION_CONFLICT: reread and reconcile. OPERATION_CONFLICT/OPERATION_EXPIRED: reconcile the original publication; never invent a replacement ID after an uncertain response. UNCLAIMED_REWARD: reward broadcasts cannot be removed. BROADCAST_LIMIT_REACHED: retained rewards still consume capacity.";

export function registerAdminInboxTools(server: McpServer): void {
  server.registerTool("horizon_admin_inbox_broadcasts_get", {
    title: "Get Inbox Broadcasts", description: describeTool({ summary: "Reads the retained project broadcast catalogue, revision and tier limits.", use: "before publication or removal.", avoid: "reading one player's messages; use horizon_admin_inbox_player_get.", requires, effects: "None (read only).", returns: "{apiKeyId,revision,serverTime,entries,limits}. Reward broadcasts remain retained even after expiry.", errors }, ADMIN_AUTH),
    inputSchema: project, annotations: READ_ONLY,
  }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(path + "/broadcasts", { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_inbox_publish", {
    title: "Publish Immutable Inbox Broadcast", description: describeTool({ summary: "Publishes one immutable broadcast for currently active players registered no later than publication, including later-reactivated players.", use: "the operator has reviewed text, audience, expiry and permanent reward retention.", avoid: "editing a published reward or clearing capacity by deleting rewards.", requires: requires + " Persist operationId and the exact body before sending. Anchor new timestamps to catalogue serverTime plus elapsed time.",
      effects: "One catalogue write, no player fanout. Rewards remain claimable after expiry and permanently consume catalogue capacity. Same ID/body replays before stale If-Match validation; the tool never retries automatically.", returns: "Catalogue with fresh serverTime and operation:{operationId,entryId,replayed}.", errors: "400 INVALID_REQUEST for unknown value keys, amounts above configured maximum, expiry outside the next 30 days or a message above 1024 UTF-8 bytes including server fields. " + errors }, ADMIN_AUTH),
    inputSchema: { ...project, expectedRevision: revision, operationId: valueOperationId,
      type: z.string().regex(/^[A-Za-z0-9._-]{1,32}$/).describe("Application notification category, at most 32 characters"), reference: z.string().max(128).default("").describe("Optional application reference, retained unchanged on retry"),
      textKey: z.string().min(1).max(128).refine(v => v.trim().length > 0).describe("Nonblank localization key for the displayed message"),
      parameters: z.record(z.string().regex(/^[A-Za-z0-9_-]{1,32}$/), z.string().refine(v => Buffer.byteLength(v, "utf8") <= 120)).refine(v => Object.keys(v).length <= 8).default({}).describe("Up to eight localization parameters, at most 120 UTF-8 bytes each"),
      expiresAt: z.string().datetime({ offset: true }).describe("Explicit ISO UTC/offset expiry within the next 30 days; reward retention survives it"),
      attachment: z.object({ values: z.array(z.object({ key: valueKey, amount: safeValue.min(1) }).strict()).max(8).refine(v => new Set(v.map(x => x.key)).size === v.length) }).strict().optional().describe("Up to eight distinct configured value rewards; unknown attachment kinds are rejected"),
    }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, expectedRevision, ...body }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(path + "/broadcasts?apiKeyId=" + encodeURIComponent(projectApiKeyId), body, { "If-Match": `"${expectedRevision}"` })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_inbox_broadcast_remove", {
    title: "Remove Ordinary Inbox Broadcast", description: describeTool({ summary: "Removes an ordinary project broadcast using its expected catalogue revision.", use: "removing a reviewed notification without rewards.", avoid: "reward broadcasts, which remain retained to protect eligible players.", requires, effects: "Removes only this broadcast. Existing player balances remain unchanged.", returns: "Updated catalogue with revision and limits.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, broadcastId, expectedRevision: revision }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, broadcastId, expectedRevision }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.delete(path + "/broadcasts/" + encodeURIComponent(broadcastId) + "?apiKeyId=" + encodeURIComponent(projectApiKeyId), undefined, { "If-Match": `"${expectedRevision}"` })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_inbox_player_get", {
    title: "Inspect Player Inbox", description: describeTool({ summary: "Reads an owned player's inbox for support, including overdue protected rewards.", use: "diagnosing an inbox capacity or reward problem.", avoid: "claiming rewards on behalf of another player's session.", requires, effects: "None (read only).", returns: "Complete current inbox snapshot, counters and limits.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, userId: valueUserId }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, userId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(path + "/players/" + encodeURIComponent(userId), { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
}
