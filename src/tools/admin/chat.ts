import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE } from "./_utils.js";
import { chatId, chatTime, chatText, chatRevision, chatPage, chatCursor, chatQuery } from "../chat-schemas.js";
import { chatErrors } from "../chat.js";
const project = { projectApiKeyId: chatId.describe("Owned project UUID carried in the admin path") };
const base = (id: string) => "/api/v1/admin/features/chat/" + id;
const doc = (summary: string, effects: string, returns: string) => describeTool({ summary, effects, returns,
  use: "explicit support and moderation after horizon://docs/chat.", avoid: "Account Keys in clients, automatic moderation/deletion or unbounded paging. Read original revisions with horizon_admin_chat_config_get or horizon_admin_chat_reports_list before deliberate writes.",
  requires: "CHAT Account Key scope and the matching owned project, or full-account credentials. Hosted only.", errors: chatErrors }, ADMIN_AUTH);
export function registerAdminChatTools(server: McpServer): void {
  for (const name of ["config", "limits"] as const) server.registerTool("horizon_admin_chat_" + name + "_get", {
    title: "Read Chat " + name, description: doc("Reads the owned project chat " + name + " and current server time.", "Read only.", "{" + name + ",serverTime}"),
    inputSchema: project, annotations: READ_ONLY }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/" + name)); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_config_set", { title: "Set Chat Word Filter", description: doc("Replaces the bounded project wordlist at the exact original revision.",
    "One CAS write, literal NFKC/lowercase substring filter, no regex or text rewrite. Empty array clears it.", "{config,serverTime}"),
    inputSchema: { ...project, expectedRevision: chatRevision, blockedTerms: z.array(chatText(64, 256)).max(100).refine(terms => new Set(terms.map(t => t.normalize("NFKC").toLowerCase())).size === terms.length, "Unique normalized terms").describe("At most 100 literal normalized terms; empty array explicitly clears the filter") },
    annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, expectedRevision, blockedTerms }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(base(projectApiKeyId) + "/config", { blockedTerms }, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_channels_list", { title: "List Chat Channels", description: doc("Reads one bounded owned-project channel metadata page.",
    "Read only, explicit UUID keyset continuation, no count scan.", "{channels,nextCursor,serverTime}"),
    inputSchema: { ...project, ...chatPage, after: chatId.optional().describe("Original last channel UUID from the preceding bounded page") }, annotations: READ_ONLY }, async ({ projectApiKeyId, ...query }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/channels", chatQuery(query))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_channel_get", { title: "Inspect Chat Channel", description: doc("Reads up to 100 currently retained messages for authorized moderation.",
    "Read only, plain text including messages hidden by player-to-player blocks. Does not extend retention.", "{channel,messages,serverTime}"),
    inputSchema: { ...project, channelId: chatId }, annotations: READ_ONLY }, async ({ projectApiKeyId, channelId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/channels/" + channelId)); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_message_delete", { title: "Delete Chat Message", description: doc("Deletes one immutable message at its channel's original revision.",
    "Destructive CAS, one HTTP attempt. Removes channel/author references, preserves original send receipts and report snapshots.", "{channel,deleted:true,serverTime}"),
    inputSchema: { ...project, channelId: chatId, messageId: chatId, expectedRevision: chatRevision }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, channelId, messageId, expectedRevision }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.delete(base(projectApiKeyId) + "/channels/" + channelId + "/messages/" + messageId, undefined, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_reports_list", { title: "List Chat Reports", description: doc("Reads one bounded moderation report page with optional exact status.",
    "Read only. Expired text stays hidden. At most limit+1 candidates; an empty page may carry nextCursor from the last examined row. Never automatically traverse pages.", "{reports,nextCursor,serverTime}"),
    inputSchema: { ...project, ...chatPage, cursor: chatCursor, status: z.enum(["open", "dismissed", "actioned"]).optional().describe("Optional exact moderation status, unchanged across cursor pages") }, annotations: READ_ONLY }, async ({ projectApiKeyId, ...query }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/reports", chatQuery(query))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_report_resolve", { title: "Resolve Chat Report", description: doc("Sets the explicitly reviewed report to dismissed or actioned under original revision.",
    "One CAS write. Resolving alone does not delete text, mute a player or free the retained report slot.", "{report,serverTime}"),
    inputSchema: { ...project, reportId: chatId, expectedRevision: chatRevision, status: z.enum(["dismissed", "actioned"]).describe("Explicit reviewed outcome; does not itself delete text or ban anyone") }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, reportId, expectedRevision, status }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(base(projectApiKeyId) + "/reports/" + reportId + "/resolve", { status }, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_report_delete", { title: "Delete Resolved Chat Report", description: doc("Deletes an explicitly resolved report at the original revision.",
    "Destructive CAS, one attempt. Frees the retained slot but keeps the reporter's replay protection. Open reports cannot be deleted by this route.", "{deleted:true,serverTime}"),
    inputSchema: { ...project, reportId: chatId, expectedRevision: chatRevision }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, reportId, expectedRevision }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.delete(base(projectApiKeyId) + "/reports/" + reportId, undefined, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_moderation_get", { title: "Get Chat Player Moderation", description: doc("Reads exact player moderation revision, deadlines and private reason.",
    "Read only. Admin credentials and reason remain outside game clients.", "{userId,revision,muteUntil,banUntil,reason,serverTime}"),
    inputSchema: { ...project, userId: chatId }, annotations: READ_ONLY }, async ({ projectApiKeyId, userId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/players/" + userId + "/moderation")); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_moderation_set", { title: "Set Chat Player Moderation", description: doc("Sets or clears explicit mute/ban deadlines under the original moderation revision.",
    "One CAS write. Null clears; nonnull must be within 30 days of serverTime. Mute blocks send, ban blocks current chat access. Existing text needs explicit deletion. Invalidates active subscriptions.", "{userId,revision,muteUntil,banUntil,reason,serverTime}"),
    inputSchema: { ...project, userId: chatId, expectedRevision: chatRevision, muteUntil: chatTime.nullable().describe("Original UTC deadline to block sends, or null to clear the mute"), banUntil: chatTime.nullable().describe("Original UTC deadline to block chat access, or null to clear the ban"), reason: chatText(240, 960, false) },
    annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, userId, expectedRevision, ...body }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(base(projectApiKeyId) + "/players/" + userId + "/moderation", body, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_chat_cleanup", { title: "Clean One Chat Batch", description: doc("Processes one explicit bounded batch of due channels and reports.",
    "At most 20 rows with fair 10+10 reservation, persistent continuation and unused-budget lending. Deletes expired references/text and releases quota transactionally. Another call processes another batch.", "{examined,channelsRemoved,reportsRemoved,deferred,serverTime}"),
    inputSchema: project, annotations: { ...DESTRUCTIVE_WRITE, idempotentHint: false } }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(base(projectApiKeyId) + "/cleanup", {})); } catch (error) { return errorResponse(error); }
  });
}
