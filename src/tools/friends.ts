import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, IDEMPOTENT_WRITE, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";

const session = {
  userId: z.string().uuid().describe("Signed-in player UUID matching the session"),
  sessionToken: z.string().min(1).max(256).describe("Player accessToken sent only as Authorization Bearer"),
};
const path = "/api/v1/app/friends";
const returns = "Complete {userId,revision,friendCode,friends,incoming,outgoing,blocked,limits,serverTime} snapshot. Replace the matching host/project/player cache. lastActiveAt is the latest retained login, null when unknown; it is not online presence.";
const errors = "409 REVISION_CONFLICT or an uncertain response: get a new snapshot and reconcile intent, never silently replace expectedRevision and repeat. 404 FRIEND_REQUEST_NOT_FOUND means this request was removed or replaced; do not act on a newer ID. INBOX_FULL rejects the entire send/accept. Friend/request/block capacity limits reject additions while existing data remains removable. " + SESSION_ERRORS;
const query = z.string().max(36).refine(value => {
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$(?![\s\S])/.test(value)) return true;
  return /^H-[A-Za-z0-9_-]{22}$(?![\s\S])/.test(value) && Buffer.from(value.slice(2), "base64url").toString("base64url") === value.slice(2);
}, "Exact player UUID or canonical H- friend code required");

export function registerFriendsTools(server: McpServer): void {
  server.registerTool("horizon_get_friends", {
    title: "Get Friends",
    description: describeTool({ summary: "Reads friends, incoming/outgoing requests, blocks and current limits.",
      use: "opening a social screen or reconciling an uncertain mutation.", avoid: "polling for online presence or applying old snapshots to a new session.",
      requires: SESSION_REQUIRED, effects: "None (read only).", returns, errors }),
    inputSchema: session, annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path, { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_find_player", {
    title: "Find Player by Friend Code",
    description: describeTool({ summary: "Finds one public player by exact UUID or canonical H- friend code in this project.",
      use: "a player intentionally shares their ID or friend code.", avoid: "email/name search, enumerating players or testing online presence.",
      requires: SESSION_REQUIRED, effects: "None (read only).", returns: "{userId,friendCode,display:{name,profile}}. Unknown, inactive, deleted, foreign and blocked players share PLAYER_NOT_FOUND.", errors }),
    inputSchema: { ...session, query: query.describe("Public UUID or H-code; not a credential and never an email/name prefix") }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, query }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path + "/find", { userId, query }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  const actions = [
    ["send_friend_request", "request", "Send Friend Request", false, "Creates both pending request records and an ordinary recipient Inbox notice atomically. A crossed request still needs explicit acceptance."],
    ["accept_friend_request", "accept", "Accept Friend Request", true, "Consumes the exact incoming request and any crossed request, creates the friendship on both sides and sends an ordinary confirmation atomically."],
    ["decline_friend_request", "decline", "Decline Friend Request", true, "Removes only this exact incoming request and the matching sender outgoing record."],
    ["cancel_friend_request", "cancel", "Cancel Friend Request", true, "Removes only this exact outgoing request and the matching recipient incoming record."],
    ["remove_friend", "remove", "Remove Friend", false, "Removes the friendship on both sides. Pending requests and blocks remain unchanged."],
    ["block_player", "block", "Block Player", false, "Adds your block and removes friendship and both request directions atomically. Does not notify the blocked party."],
    ["unblock_player", "unblock", "Unblock Player", false, "Removes only your block. Does not restore a friendship or request, and does not remove the other player's block."],
  ] as const;
  for (const [name, action, title, needsRequestId, effects] of actions) {
    server.registerTool("horizon_" + name, {
      title, description: describeTool({ summary: title.replace(/^([A-Za-z]+)/, "$1s") + " using the reviewed player revision.", use: "the player explicitly requests this social action.",
        avoid: "automatic retries after timeout, automatic acceptance of crossed requests or changing expectedRevision without reconciling intent.",
        requires: SESSION_REQUIRED + " A current snapshot revision" + (needsRequestId ? " and its exact requestId." : "."),
        effects: effects + " No automatic retry. Repeating the same revision cannot create a second effect.", returns, errors }),
      inputSchema: { ...session, targetUserId: z.string().uuid().describe("The other player UUID in the same project"), expectedRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).describe("Exact revision from the reviewed actor snapshot; never refresh and substitute automatically"),
        ...(needsRequestId ? { requestId: z.string().uuid().describe("Exact request ID from the reviewed incoming/outgoing snapshot") } : {}) },
      annotations: action === "request" ? IDEMPOTENT_WRITE : DESTRUCTIVE_WRITE,
    }, async ({ userId, sessionToken, targetUserId, expectedRevision, ...rest }) => {
      if (userId === targetUserId) return errorResponse(new Error("INVALID_REQUEST: Cannot perform a social action on yourself"));
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.post(path + "/" + action,
        { userId, targetUserId, expectedRevision, ...(needsRequestId ? { requestId: rest.requestId } : {}) }, sessionHeaders(sessionToken))); }
      catch (error) { return errorResponse(error); }
    });
  }
}
