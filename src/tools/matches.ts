import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, IDEMPOTENT_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { matchId, matchRevision, matchInteger, matchBytes, matchIds, matchPage, matchCreate, matchQuery } from "./match-schemas.js";
import { MATCH_STATE_BYTES } from "./feature-bounds.js";

const session = { userId: z.string().uuid().describe("Active player matching the session and project"), sessionToken: z.string().min(1).max(256).describe("Player accessToken sent only as Bearer") };
const base = "/api/v1/app/matches";
export const matchErrors = "404 hides private/missing/expired matches. 409 REVISION_CONFLICT or STATE_CONFLICT: explicitly reread and reconcile the original intent, never replace the revision or automatically resubmit. RESULT_CONFLICT preserves the original report. RUN_EXPIRED/RUN_ALREADY_USED never allow replacement ranked runs. 501 FEATURE_NOT_SUPPORTED is explicit for simpleServer ranked mode. " + SESSION_ERRORS;
const doc = (summary: string, effects: string, returns: string) => describeTool({ summary, effects, returns,
  use: "explicit asynchronous multiplayer actions after reading horizon://docs/matches.",
  avoid: "automatic polling, page traversal, timeout progression, invented winners or automatic rewards. Reconcile with horizon_get_matches and horizon_get_match. Consent and game consensus do not validate honest gameplay.",
  requires: SESSION_REQUIRED, errors: matchErrors });
export function registerMatchesTools(server: McpServer): void {
  for (const [name, suffix, title] of [["get_matches", "", "Get My Matches"], ["get_match_limits", "/limits", "Get Match Limits"]] as const) {
    server.registerTool("horizon_" + name, { title, description: doc("Reads the player's " + (suffix ? "five-tier limits and project capabilities." : "bounded active, invited and recent match summaries."),
      "Read only. Respect pollAfterSeconds on refresh. Retained state is not truncated after System Config reductions.", suffix ? "{limits,config,capabilities,pollAfterSeconds,serverTime}; limits include activeMatches,stateBytes,retainedMatches,pendingInvites,settlementMatches,historyRetentionSeconds,rankedSettlementSeconds. Zero completed history is valid." : "{userId,revision,active,invites,recent,pendingResults,limits,pollAfterSeconds,serverTime}; minimal pendingResults retain matchId,finalStateRevision,ownRankedRunId and expiresAt independently of completed detail history."),
      inputSchema: session, annotations: READ_ONLY }, async ({ userId, sessionToken }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.get(base + suffix, { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
    });
  }
  server.registerTool("horizon_find_open_matches", { title: "Find Open Matches", description: doc("Reads one strength-filtered open-lobby page under current blocks and active-owner checks.",
    "Read only, at most256 metadata candidates and50 results. Empty cursor pages are valid. No game state is returned.", "{matches,nextCursor,pollAfterSeconds,serverTime}"),
    inputSchema: { ...session, minStrength: matchInteger, maxStrength: matchInteger, ...matchPage }, annotations: READ_ONLY }, async ({ userId, sessionToken, ...query }) => {
    if (query.minStrength > query.maxStrength) return errorResponse(new Error("INVALID_REQUEST: Minimum strength exceeds maximum"));
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/open", { userId, ...matchQuery(query) }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_get_match", { title: "Get Match", description: doc("Reads one currently authorized match snapshot.",
    "Read only. Invited players receive lobby metadata with dataBase64=null, participants receive original bytes and reports.", "{match,pollAfterSeconds,serverTime}"),
    inputSchema: { ...session, matchId }, annotations: READ_ONLY }, async ({ userId, sessionToken, matchId: id }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/" + id, { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_create_match", { title: "Create Match", description: doc("Creates one server-ID lobby under the original player-ledger revision.",
    "One HTTP attempt. Reserves active and settlement capacity plus bounded invite slots atomically. Completed detail history is separate; FREE defaults to zero. Lost response: reconcile horizon_get_matches with the original intent.", "{match,playerRevision,pollAfterSeconds,serverTime}"),
    inputSchema: { ...session, expectedRevision: matchRevision, settings: matchCreate }, annotations: IDEMPOTENT_WRITE }, async ({ userId, sessionToken, expectedRevision, settings }) => {
    if (settings.inviteeIds.includes(userId)) return errorResponse(new Error("INVALID_REQUEST: Creator cannot invite themself"));
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base, { userId, ...settings }, { ...sessionHeaders(sessionToken), "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  for (const [name, action, title] of [["join_match", "join", "Join Match"], ["decline_match_invite", "decline", "Decline Match Invitation"],
    ["start_match", "start", "Start Match"], ["submit_match_turn", "turn", "Submit Match Turn"], ["advance_match_timeout", "timeout", "Advance Match Timeout"],
    ["leave_match", "leave", "Leave Match"], ["cancel_match", "cancel", "Cancel Match Lobby"]] as const) {
    server.registerTool("horizon_" + name, { title, description: doc("Executes " + title.toLowerCase() + " under the exact original revision.",
      "One HTTP attempt. Start requires the creator and every joined UUID exactly once. Turn requires the current unexpired actor. Timeout advances only one turn. Active leave forfeits without selecting a winner. Lobby cancel is creator-only. Full Inbox retains a durable notice without undoing a committed move.",
      "{match,pollAfterSeconds,serverTime}; departing lobby actors receive metadata only and lose point-read access."),
      inputSchema: { ...session, matchId, expectedRevision: matchRevision,
        ...(action === "start" ? { turnOrder: matchIds(8).min(2).describe("Every joined participant in the explicit turn order") } : {}),
        ...(action === "turn" ? { dataBase64: matchBytes(MATCH_STATE_BYTES), finish: z.boolean().describe("True freezes final bytes and opens reporting without choosing a winner") } : {}) },
      annotations: action === "join" ? IDEMPOTENT_WRITE : DESTRUCTIVE_WRITE }, async ({ sessionToken, matchId: id, expectedRevision, ...body }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.post(base + "/" + id + "/" + action, body, { ...sessionHeaders(sessionToken), "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
    });
  }
  server.registerTool("horizon_report_match_result", { title: "Report Match Result", description: doc("Records this participant's immutable report for the frozen final state.",
    "One HTTP attempt, original finalStateRevision/result/winnerIds on explicit retry. All accepted players must agree for confirmed. Missing reports become unconfirmed, disagreements disputed. No automatic reward.", "{match,replayed,pollAfterSeconds,serverTime}"),
    inputSchema: { ...session, matchId, finalStateRevision: matchRevision, resultBase64: matchBytes(256), winnerIds: matchIds(8).refine(ids => ids.every((id,i) => i === 0 || ids[i-1] < id), "UUIDs sorted in ascending canonical order").describe("Sorted accepted winners; empty means draw") }, annotations: IDEMPOTENT_WRITE },
  async ({ sessionToken, matchId: id, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/" + id + "/result", body, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_start_match_ranked_run", { title: "Start or Recover Match Ranked Run", description: doc("Creates or recovers one original match-bound validated run after complete consensus.",
    "One HTTP attempt. Server rechecks the original configured board and binds match/final revision. Recovery preserves runId, seed and expiry; never replaces consumed/expired tickets. This short post-match validation is not retrospective game simulation.", "Existing StartRunResponse with original ticket, runId, seed, expiry and context status; submit through the existing validated-actions endpoint."),
    inputSchema: { ...session, matchId, finalStateRevision: matchRevision }, annotations: IDEMPOTENT_WRITE }, async ({ sessionToken, matchId: id, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/" + id + "/ranked-run", body, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
}
