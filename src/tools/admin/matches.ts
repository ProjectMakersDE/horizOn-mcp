import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE } from "./_utils.js";
import { matchId, matchRevision, matchPage, matchConfig, matchQuery } from "../match-schemas.js";
import { matchErrors } from "../matches.js";
const project = { projectApiKeyId: z.string().uuid().describe("Owned project UUID, sent as apiKeyId") };
const base = "/api/v1/admin/matches";
const path = (suffix: string, id: string) => base + suffix + "?apiKeyId=" + encodeURIComponent(id);
const doc = (summary: string, effects: string, returns: string) => describeTool({ summary, effects, returns,
  use: "reviewed explicit support/configuration after horizon://docs/matches.", avoid: "forging reports, choosing winners or putting Account Keys into game builds. Use horizon_admin_match_get for original state and horizon_admin_matches_list for bounded summaries.",
  requires: "MATCHES Account Key scope and matching owned project, or full-account access. Hosted admin only; simpleServer has trusted local CLI.", errors: matchErrors }, ADMIN_AUTH);
export function registerAdminMatchesTools(server: McpServer): void {
  for (const [name, suffix] of [["config_get", "/config"], ["limits", "/limits"]] as const) {
    server.registerTool("horizon_admin_match_" + name, { title: "Read Match " + name, description: doc("Reads match " + name + " for an owned project.", "Read only.",
      suffix === "/config" ? "{config,serverTime}" : "{limits,config,capabilities,pollAfterSeconds,serverTime}"), inputSchema: project, annotations: READ_ONLY }, async ({ projectApiKeyId }) => {
      const client = getAdminClient(); if (!client) return noAdminClientResponse();
      try { return jsonResponse(await client.get(base + suffix, { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
    });
  }
  server.registerTool("horizon_admin_match_config_set", { title: "Set Ranked Match Configuration", description: doc("Sets the optional existing ranked leaderboard for future matches.",
    "One CAS write under original config revision, no player fanout. Existing matches retain their original board UUID.", "{config,serverTime}"),
    inputSchema: { ...project, expectedRevision: matchRevision, rankedLeaderboardKey: matchConfig }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, expectedRevision, rankedLeaderboardKey }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(path("/config", projectApiKeyId), { rankedLeaderboardKey }, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_matches_list", { title: "List Owned Matches", description: doc("Reads one metadata-only project page, optionally filtered by exact status.",
    "Read only, up to50 summaries. Explicit keyset continuation; no count or automatic paging.", "{matches,nextCursor,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, status: z.enum(["lobby", "active", "reporting", "confirmed", "disputed", "unconfirmed", "cancelled"]).optional().describe("Exact lifecycle state filter; omission lists all states"), ...matchPage }, annotations: READ_ONLY }, async ({ projectApiKeyId, ...query }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base, { apiKeyId: projectApiKeyId, ...matchQuery(query) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_match_get", { title: "Inspect Owned Match", description: doc("Reads an owned project's match payload and submitted reports.", "Read only.", "{match,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, matchId }, annotations: READ_ONLY }, async ({ projectApiKeyId, matchId: id }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base + "/" + id, { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_match_cancel", { title: "Cancel Owned Match", description: doc("Closes an exact-revision lobby as cancelled or active/reporting match as unconfirmed.",
    "Destructive CAS, one HTTP attempt. Releases active slots and applies configured completed-detail retention (FREE defaults to zero). Required settlement/source references remain independently protected. No chosen winner or reward.", "{match,pollAfterSeconds,serverTime}"),
    inputSchema: { ...project, matchId, expectedRevision: matchRevision }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, matchId: id, expectedRevision }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(path("/" + id + "/cancel", projectApiKeyId), undefined, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_matches_cleanup", { title: "Process One Due Match Batch", description: doc("Processes up to twenty indexed due matches in the owned project.",
    "One explicit bounded maintenance call advances deadlines, attempts current source notices, settles protected sources and applies configured completed-detail retention. Durable continuations advance past failures. No automatic loop or replacement run.",
    "{examined,advanced,notified,removed,deferred,serverTime}"), inputSchema: project, annotations: { ...DESTRUCTIVE_WRITE, idempotentHint: false } }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(path("/cleanup", projectApiKeyId))); } catch (error) { return errorResponse(error); }
  });
}
