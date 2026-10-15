import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE } from "./_utils.js";
import { valueKey, safeValue, valueOperationId, valueUserId } from "../player-values.js";

const projectApiKeyId = z.string().uuid().describe("Project API key UUID from horizon_admin_projects_list; must belong to this account");
const name = z.string().min(1).refine(v => v.trim().length > 0 && Buffer.byteLength(v, "utf8") <= 120);
const amount = z.object({ key: valueKey, amount: safeValue.min(1) });
const definitions = z.array(z.object({
  key: valueKey, name, initialBalance: safeValue.optional(), maxBalance: safeValue.optional(), dailyCap: safeValue.nullable().optional(),
  adjustment: z.object({ enabled: z.boolean().optional(), maxPerCall: safeValue.optional(), dailyLimit: safeValue.nullable().optional(), minimumBalance: safeValue.optional() }).optional(),
})).max(64).describe("Complete definitions, at most the plan limit; omitted definitions are archived without deleting balances");
const offers = z.array(z.object({
  key: valueKey, name, active: z.boolean().optional(), costs: z.array(amount).min(1).max(8), rewards: z.array(amount).min(1).max(8),
  purchasesPerDay: z.number().int().min(1).max(1000000).nullable().optional(),
})).max(1000).describe("Complete offer catalogue, at most the plan limit; each has server-owned positive costs and rewards");
const path = "/api/v1/admin/player-values";
const access = "Account Key with PLAYER_VALUES scope and access to the selected project, or full-account access. Hosted horizOn only; simpleServer uses its local operator CLI.";
const errors = "403 for an unavailable scope, 404 for an unknown or foreign project/player. 409 REVISION_CONFLICT: read configuration again and reconcile, never blindly overwrite. OPERATION_CONFLICT/OPERATION_EXPIRED: reconcile the original correction, never silently create a fresh ID.";

export function registerAdminPlayerValuesTools(server: McpServer): void {
  server.registerTool("horizon_admin_player_values_config_get", {
    title: "Get Player Values Configuration",
    description: describeTool({ summary: "Returns the complete value definitions, offer catalogue, revision and plan limits of one project.",
      use: "before horizon_admin_player_values_config_set.", avoid: "player balances (use horizon_admin_player_values_player_get).", requires: access, effects: "None (read only).",
      returns: "{apiKeyId, revision, definitions, offers, limits: {definitions, offers, receipts}}; revision is the next write precondition.", errors }, ADMIN_AUTH),
    inputSchema: { projectApiKeyId }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(path + "/config", { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_player_values_config_set", {
    title: "Replace Player Values Configuration",
    description: describeTool({ summary: "Replaces a project's value definitions and offers only when the expected revision still matches.",
      use: "saving the complete edited configuration from horizon_admin_player_values_config_get.", avoid: "correcting an individual balance (use horizon_admin_player_values_player_correct).", requires: access,
      effects: "Replaces the catalogue and increments revision. Preserves stored balances, initialization history and receipts. A repeated stale revision fails safely.",
      returns: "The configuration with its new revision and limits.", errors: "400 INVALID_REQUEST for unsafe numbers, invalid definitions or configuration above 1 MiB. " + errors }, ADMIN_AUTH),
    inputSchema: { projectApiKeyId, expectedRevision: safeValue.describe("Revision returned by the last configuration read, sent in the If-Match header"), definitions, offers }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, expectedRevision, definitions, offers }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(path + "/config?apiKeyId=" + encodeURIComponent(projectApiKeyId), { definitions, offers }, { "If-Match": `"${expectedRevision}"` })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_player_values_player_get", {
    title: "Get Player Values and History",
    description: describeTool({ summary: "Returns one player's current value state and bounded audited operation history for support.",
      use: "before horizon_admin_player_values_player_correct or to reconcile a timed-out correction.", avoid: "project definitions (use horizon_admin_player_values_config_get).", requires: access,
      effects: "May initialize missing configured values once; existing balances are preserved.", returns: "{state, receipts}; state includes the server time and oldest accepted operation time.", errors }, ADMIN_AUTH),
    inputSchema: { projectApiKeyId, userId: valueUserId }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, userId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(path + "/players/" + encodeURIComponent(userId), { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_player_values_player_correct", {
    title: "Correct Player Values with Audit Note",
    description: describeTool({ summary: "Sets selected player balances once under a stable operation ID and records the required support reason.",
      use: "a verified support case requires correction after horizon_admin_player_values_player_get.", avoid: "routine gameplay rewards or catalogue edits (use horizon_admin_player_values_config_set).", requires: access,
      effects: "Overwrites the listed balances atomically and records actor and note. Same operation ID and payload replay without another correction. Today's earned counters remain.",
      returns: "Updated player-value state with replay status and original delta.", errors: "409 STATE_CONFLICT: retry the SAME ID and payload. " + errors }, ADMIN_AUTH),
    inputSchema: { projectApiKeyId, userId: valueUserId, values: z.array(z.object({ key: valueKey, balance: safeValue })).min(1).max(64).describe("Explicit new balances for 1 to 64 distinct configured keys; unchanged keys stay untouched"),
      note: z.string().min(1).refine(v => v.trim().length > 0 && Buffer.byteLength(v, "utf8") <= 200).describe("Required nonblank support reason, at most 200 UTF-8 bytes"), operationId: valueOperationId }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, userId, values, note, operationId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(path + "/players/" + encodeURIComponent(userId) + "?apiKeyId=" + encodeURIComponent(projectApiKeyId), { values, note, operationId })); } catch (error) { return errorResponse(error); }
  });
}
