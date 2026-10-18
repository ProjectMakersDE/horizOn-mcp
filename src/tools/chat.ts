import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, IDEMPOTENT_WRITE, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { chatId, chatTime, chatText, chatIds } from "./chat-schemas.js";
const session = { userId: chatId.describe("Active player matching the current session and project"), sessionToken: z.string().min(1).max(256).describe("Player accessToken sent only as Bearer") };
const base = "/api/v1/app/chat";
export const chatErrors = "404 hides private/missing/expired channels or source messages. 409 OPERATION_CONFLICT/OPERATION_EXPIRED or STATE_CONFLICT requires explicit original-intent reconciliation. Never replace an unknown send UUID/time/text. 429 does not schedule a retry. CHAT_MUTED/CHAT_BANNED restrict current chat access. 501 NOT_SUPPORTED means simpleServer has no chat or polling fallback. " + SESSION_ERRORS;
const doc = (summary: string, effects: string, returns: string) => describeTool({ summary, effects, returns,
  use: "explicit hosted chat actions after reading horizon://docs/chat.", avoid: "automatic sends, repeated polling, rich-text rendering or exposing moderation credentials. Use horizon_get_chat_operation to reconcile original sends, then horizon_send_chat_message only for the explicit identical replay.",
  requires: SESSION_REQUIRED, errors: chatErrors });
export function registerChatTools(server: McpServer): void {
  server.registerTool("horizon_get_chat_limits", { title: "Get Chat Limits", description: doc("Reads five-tier bounds, current moderation and hosted capabilities.",
    "Read only, including during FREE/mute/ban. No polling timer.", "{limits,capabilities,moderation,serverTime}"), inputSchema: session, annotations: READ_ONLY }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/limits", { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_open_chat_channel", { title: "Open Chat Channel", description: doc("Opens deterministic direct, group or project chat under current permissions.",
    "One HTTP attempt. Existing live open is a no-op. A new/expired channel allocates a fresh epoch under quota/rate gates. Subscribe before first sync/send.", "{channel,serverTime}"),
    inputSchema: { ...session, kind: z.enum(["direct", "group", "project"]).describe("Chat audience under current friend or group permissions"), peerId: chatId.optional().describe("Required only for a direct channel with this other player"), groupId: chatId.optional().describe("Required only for a channel of this current group") }, annotations: IDEMPOTENT_WRITE }, async ({ sessionToken, ...body }) => {
    const valid = body.kind === "direct" ? body.peerId !== undefined && body.peerId !== body.userId && body.groupId === undefined
      : body.kind === "group" ? body.groupId !== undefined && body.peerId === undefined : body.peerId === undefined && body.groupId === undefined;
    if (!valid) return errorResponse(new Error("INVALID_REQUEST: Only direct requires peerId, only group requires groupId"));
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/channels/open", body, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_sync_chat_channel", { title: "Sync Chat Channel", description: doc("Reads an authorized incremental snapshot after subscription resync/event or explicit user action.",
    "Read-only POST, one HTTP attempt. Complete visible ID order plus unknown immutable text. Known IDs are valid only for the exact cached epoch and complete authorized cache. No periodic polling.",
    "{channel,visibleMessageIds,messages,moderation,serverTime}; hide cache on disconnect/permission change and apply only a complete matching snapshot."),
    inputSchema: { ...session, channelId: chatId, epoch: chatId.nullable().describe("Exact cached channel epoch, or null for an initial complete sync"), knownMessageIds: chatIds }, annotations: READ_ONLY }, async ({ sessionToken, channelId, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/channels/" + channelId + "/sync", body, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_send_chat_message", { title: "Send Original Chat Message", description: doc("Sends plain text once or explicitly replays the exact original operation.",
    "One HTTP attempt. Persist project+player operationId/issuedAt/channel/full text before sending. The original live message provides its receipt; replay never recreates expired/deleted text. Direct/group windows are15 messages/30seconds, project windows20/seven days. A monotone player time fence rejects unknown older sends; no per-player message/receipt copy.", "{receipt,replayed,serverTime}"),
    inputSchema: { ...session, channelId: chatId, operationId: chatId, issuedAt: chatTime, text: chatText(500, 2000).describe("Exact original plain text, never silently rewritten") }, annotations: DESTRUCTIVE_WRITE }, async ({ sessionToken, channelId, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/channels/" + channelId + "/messages", body, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_get_chat_operation", { title: "Get Original Chat Receipt", description: doc("Reads the current player's retained original send receipt.",
    "Read only, with current identity while the original message remains. A missing/expired receipt does not prove a send never committed and cannot authorize a new ID. No historical per-player copy is retained.", "{receipt,serverTime}, metadata only"),
    inputSchema: { ...session, operationId: chatId }, annotations: READ_ONLY }, async ({ userId, sessionToken, operationId }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/operations/" + operationId, { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_report_chat_message", { title: "Report Chat Message", description: doc("Reports one currently visible message with the original reason.",
    "One HTTP attempt. Retains one immutable shared report snapshot under current project capacity. Same-original replay uses that retained report; after removal, a still-visible original message may be reported only by another explicit action under current permission/rate checks (one new report/player/minute). Missing original messages cannot reopen reports. No per-player receipt history or implicit retry.", "{reportId,status,replayed,serverTime}"),
    inputSchema: { ...session, channelId: chatId, messageId: chatId, reason: chatText(240, 960) }, annotations: IDEMPOTENT_WRITE }, async ({ sessionToken, channelId, messageId, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/channels/" + channelId + "/messages/" + messageId + "/report", body, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
}
