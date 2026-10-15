import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, IDEMPOTENT_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";

export const achievementKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,23}$(?![\s\S])/)
  .describe("Stable configured achievement key; never replace it to retry an unlock");
const session = {
  userId: z.string().uuid().describe("Signed-in player UUID matching the session"),
  sessionToken: z.string().min(1).max(256).describe("Player accessToken, sent only as Authorization Bearer"),
};
const path = "/api/v1/app/achievements";
const errors = "409 STATE_CONFLICT: retry the same key or pending keys. ACHIEVEMENT_NOT_MANUAL: report the configured statistic instead. INBOX_FULL in a delivery result leaves the accepted reward pending. Claim and remove eligible Inbox entries before retrying delivery. " + SESSION_ERRORS;

export function registerAchievementsTools(server: McpServer): void {
  server.registerTool("horizon_get_achievements", {
    title: "Get Player Achievements",
    description: describeTool({
      summary: "Reads visible achievement definitions, unlock progress and pending reward delivery.",
      use: "loading progress or refreshing after newlyUnlocked statistics or realtime invalidation.",
      avoid: "changing balances or revealing locked hidden achievements.", requires: SESSION_REQUIRED,
      effects: "None (read only). Does not deliver or claim pending rewards.",
      returns: "{userId,revision,definitionVersion,definitions,progress,limits,serverTime}. definitions=null retains the matching cached definitions; [] clears them. Cache versions are scoped to the same host/project/player/session. Progress includes the original pendingReward values, independent of later catalog edits.", errors,
    }),
    inputSchema: { ...session, definitionVersion: z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/).optional().describe("Opaque version from the matching cached snapshot; omit for full definitions") },
    annotations: READ_ONLY,
  }, async ({ userId, sessionToken, definitionVersion }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path, { userId, ...(definitionVersion === undefined ? {} : { definitionVersion }) }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_unlock_achievement", {
    title: "Unlock Manual Achievement",
    description: describeTool({
      summary: "Unlocks one configured manual achievement once for the authenticated player.",
      use: "an explicit game event meets this manual achievement's rule.",
      avoid: "statistic achievements or client-chosen reward amounts.", requires: SESSION_REQUIRED,
      effects: "Creates a permanent per-key unlock guard and a frozen reward intent, then attempts Inbox delivery. Repeating the same key never grants twice, including after archival. This tool does not retry automatically.",
      returns: "{achievements,newlyUnlocked,replayed,deliveryResults}. An unlock may succeed while its reward remains pending. Delivered means placed in Inbox, not credited to the balance; use horizon_claim_inbox to claim.", errors,
    }), inputSchema: { ...session, key: achievementKey }, annotations: IDEMPOTENT_WRITE,
  }, async ({ userId, sessionToken, key }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(path + "/unlock", { userId, key }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_deliver_achievement_rewards", {
    title: "Deliver Pending Achievement Rewards",
    description: describeTool({
      summary: "Retries Inbox handoff of up to eight distinct, already accepted achievement rewards.",
      use: "Inbox space is available again or a prior delivery response was uncertain.",
      avoid: "creating rewards, changing their values or crediting balances locally.", requires: SESSION_REQUIRED,
      effects: "Each pending key transfers atomically to Inbox with its original server-owned identity and values. Other keys may remain pending; no automatic retries.",
      returns: "{achievements,results:[{key,state,inboxEntryId,code}]}. Inspect each result independently. State is none, pending or delivered. Keep pending rewards and retry the same keys.", errors,
    }), inputSchema: { ...session, keys: z.array(achievementKey).min(1).max(8).refine(keys => new Set(keys).size === keys.length, "Duplicate achievement key").describe("One to eight distinct pending keys from the current player snapshot") }, annotations: IDEMPOTENT_WRITE,
  }, async ({ userId, sessionToken, keys }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(path + "/rewards/deliver", { userId, keys }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
}
