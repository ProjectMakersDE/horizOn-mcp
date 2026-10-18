import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE } from "./_utils.js";
import { achievementKey } from "../achievements.js";
import { INT32_MAX } from "../feature-bounds.js";

const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const utf8 = (max: number) => z.string().max(max).refine(value => Buffer.byteLength(value, "utf8") <= max, `At most ${max} UTF-8 bytes`);
const common = {
  key: achievementKey,
  name: utf8(120).refine(value => value.trim().length > 0, "Name must not be blank"),
  description: utf8(512).default(""),
  imageUrl: z.string().max(2048).refine(value => {
    try { const url = new URL(value); return /^https?:/.test(value) && !!url.hostname && !url.username && !url.password; }
    catch { return false; }
  }, "Image URL must be HTTP(S) without credentials").nullable().optional(),
  hidden: z.boolean().default(false), active: z.boolean().default(true),
  rewards: z.object({ values: z.array(z.object({ key: achievementKey, amount: safeInteger.min(1) }).strict()).max(8)
    .refine(values => new Set(values.map(value => value.key)).size === values.length, "Duplicate reward value") }).strict().default({ values: [] }),
};
const definition = z.discriminatedUnion("mode", [
  z.object({ ...common, mode: z.literal("manual"), condition: z.null().optional() }).strict(),
  z.object({ ...common, mode: z.literal("statistic"), condition: z.object({ statisticKey: achievementKey, threshold: safeInteger }).strict() }).strict(),
]);
const project = { projectApiKeyId: z.string().uuid().describe("Owned project API key UUID, sent as apiKeyId") };
const path = "/api/v1/admin/achievements";
const requires = "Account Key with ACHIEVEMENTS and matching project scope, or full-account access. Hosted admin API only; simpleServer operators use its local CLI.";
const errors = "403 ACHIEVEMENT_LIMIT_REACHED: reduce active definitions to the tier limit. 409 REVISION_CONFLICT: reread and reconcile; never overwrite another edit blindly. ACHIEVEMENT_LIFETIME_LIMIT_REACHED: restore reserved keys instead of creating new identities. 422 UNKNOWN_STATISTIC/UNKNOWN_VALUE: configure the referenced statistic/value and its maximum first. 404 rejects foreign or missing project/player identities.";

export function registerAdminAchievementsTools(server: McpServer): void {
  for (const [name, title, suffix, returns] of [
    ["horizon_admin_achievements_definitions_get", "Get Achievement Catalog", "/definitions", "{apiKeyId,revision,definitions,archivedKeys,limits,serverTime}, including hidden definitions."],
    ["horizon_admin_achievements_limits", "Get Achievement Limits", "/limits", "{maxDefinitions,maxLifetimeKeys}: current System Config policies, which may exceed tier/lifetime defaults. Existing progress remains readable after reductions."],
  ] as const) {
    server.registerTool(name, {
      title, description: describeTool({ summary: suffix === "/definitions" ? "Reads the owned project's complete achievement catalog." : "Reads active and retained lifetime achievement limits.",
        use: "reviewing configuration and capacity before editing.", avoid: "reading player progress; use horizon_admin_achievements_player_get.", requires, effects: "None (read only).", returns, errors }, ADMIN_AUTH),
      inputSchema: project, annotations: READ_ONLY,
    }, async ({ projectApiKeyId }) => {
      const client = getAdminClient(); if (!client) return noAdminClientResponse();
      try { return jsonResponse(await client.get(path + suffix, { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
    });
  }
  server.registerTool("horizon_admin_achievements_definitions_set", {
    title: "Replace Achievement Catalog",
    description: describeTool({ summary: "Replaces the owned project's achievement definitions using the reviewed revision.",
      use: "after reading horizon_admin_achievements_definitions_get and preserving every definition that should remain.", avoid: "resetting player unlocks or changing already accepted rewards.", requires,
      effects: "Omitted keys are archived and remain permanently reserved. Restoring the same key preserves unlock bits. New unlock rewards are immediate and atomic; legacy pending originals require verified cold settlement. No player fanout or automatic retries.",
      returns: "The updated catalog, archived keys, incremented revision, limits and serverTime.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, expectedRevision: safeInteger.describe("Revision from the reviewed catalog, sent unchanged as If-Match"),
      definitions: z.array(definition).max(INT32_MAX).refine(rows => new Set(rows.map(row => row.key)).size === rows.length, "Duplicate achievement key")
        .describe("Complete replacement catalog, including inactive definitions to retain; current System Config active/lifetime policies and1 MiB catalog frame apply") }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, expectedRevision, definitions }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(path + "/definitions?apiKeyId=" + encodeURIComponent(projectApiKeyId), { definitions }, { "If-Match": String(expectedRevision) })); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_achievements_player_get", {
    title: "Inspect Player Achievements",
    description: describeTool({ summary: "Reads one owned player's achievement progress for support.", use: "diagnosing unlock bits or legacy unsettled rewards.",
      avoid: "editing the catalog; read horizon_admin_achievements_definitions_get first. This tool cannot unlock or claim for another session.", requires, effects: "None (read only).",
      returns: "Current completion snapshot with nullable unknown chronology. Compact progress has no pending reward/Inbox copy; legacy pending originals stay visible until verified settlement.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, userId: z.string().uuid().describe("Player UUID belonging to this project") }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, userId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(path + "/players/" + encodeURIComponent(userId), { apiKeyId: projectApiKeyId })); }
    catch (error) { return errorResponse(error); }
  });
}
