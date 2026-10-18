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
const errors = "409 STATE_CONFLICT: reconcile and retry the same key. ACHIEVEMENT_NOT_MANUAL: report the configured statistic instead. MIGRATION_REQUIRED preserves legacy reward originals for the verified cold operator; it never authorizes a replacement reward or Inbox delivery. " + SESSION_ERRORS;

export function registerAchievementsTools(server: McpServer): void {
  server.registerTool("horizon_get_achievements", {
    title: "Get Player Achievements",
    description: describeTool({
      summary: "Reads visible achievement definitions and permanent completion bits.",
      use: "loading progress or refreshing after newlyUnlocked statistics or realtime invalidation.",
      avoid: "changing balances or revealing locked hidden achievements.", requires: SESSION_REQUIRED,
      effects: "None (read only). Does not grant anything.",
      returns: "{userId,revision,definitionVersion,definitions,progress,limits,serverTime}. definitions=null retains matching cached definitions; [] clears them. Scope caches to host/project/player/session. Compact progress has rewardState=complete, nullable unknown unlockedAt and no pendingReward/inboxEntryId copy. Legacy unsettled originals remain visible until verified cold settlement.", errors,
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
      effects: "Commits the permanent completion bit and configured Player Values rewards in one transaction, immediately. No new Inbox or reward-history copy. Repeating the same key never grants twice, including after archival. This tool does not retry automatically.",
      returns: "{achievements,newlyUnlocked,replayed,deliveryResults:[]}. On success explicitly refresh Player Values to replace the balance cache; do not claim or add a reward locally.", errors,
    }), inputSchema: { ...session, key: achievementKey }, annotations: IDEMPOTENT_WRITE,
  }, async ({ userId, sessionToken, key }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(path + "/unlock", { userId, key }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_deliver_achievement_rewards", {
    title: "Inspect Legacy Achievement Reward Status",
    description: describeTool({
      summary: "Reads compatibility reward status for up to eight original achievement keys.",
      use: "diagnosing an older unsettled reward without changing its original identity.",
      avoid: "delivering or claiming new achievement rewards; new unlocks credit immediately.", requires: SESSION_REQUIRED,
      effects: "Read-only compatibility POST; creates no reward, delivery or grant. Legacy pending status returns MIGRATION_REQUIRED for verified cold settlement.",
      returns: "{achievements,results:[{key,state,inboxEntryId,code}]}. New compact achievements are complete with no Inbox ID; never invent a new action from a legacy pending result.", errors,
    }), inputSchema: { ...session, keys: z.array(achievementKey).min(1).max(8).refine(keys => new Set(keys).size === keys.length, "Duplicate achievement key").describe("One to eight distinct original keys; fixed compatibility request bound") }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, keys }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(path + "/rewards/deliver", { userId, keys }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
}
