import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";

export const valueKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,23}$/).describe("Configured value or offer key, 1 to 24 lowercase letters, digits, '.', '_' or '-'");
export const safeValue = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const valueOperationId = z.string().regex(/^[0-9]+:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
  .describe("Stable operation ID: server-aligned Unix milliseconds + ':' + UUID. Persist before sending; reuse unchanged on timeout or retry");
export const valueUserId = z.string().uuid().describe("Player UUID belonging to the selected project and player session");
const sessionToken = z.string().min(1).max(256).describe("Player accessToken from sign-in, sent only in the Authorization Bearer header");
const session = { userId: valueUserId, sessionToken };
const path = "/api/v1/app/player-values";
const recovery = "409 STATE_CONFLICT: refresh state and retry the SAME operation ID and payload. OPERATION_CONFLICT: do not reuse an ID for a different action. OPERATION_EXPIRED: reconcile state/history; never silently generate another ID. INSUFFICIENT_BALANCE, MAX_BALANCE_REACHED or DAILY_LIMIT_REACHED leaves the whole operation unapplied. " + SESSION_ERRORS;

export function registerPlayerValuesTools(server: McpServer): void {
  for (const [name, suffix, offers] of [["horizon_get_player_values", "", false], ["horizon_get_player_value_offers", "/offers", true]] as const) {
    server.registerTool(name, {
      title: offers ? "Get Player Value Offers" : "Get Player Values",
      description: describeTool({
        summary: offers ? "Returns configured purchase offers and the player's value definitions for the current project." : "Returns the player's server-owned balances, UTC daily counters and operation replay window.",
        use: offers ? "preparing a purchase with horizon_purchase_player_value_offer." : "displaying balances or recovering a timed-out horizon_adjust_player_value operation.",
        avoid: offers ? "buying an offer (use horizon_purchase_player_value_offer)." : "changing balances (use horizon_adjust_player_value or horizon_purchase_player_value_offer).",
        requires: SESSION_REQUIRED,
        effects: "May lazily initialize missing configured values once; does not change existing balances.",
        returns: offers ? "{definitionVersion, serverTime, definitions, offers: [{key, name, active, costs, rewards, purchasesPerDay}]}" : "{userId, definitionVersion, revision, day, values, operationWindow: {serverTime, oldestAcceptedAt}}",
        errors: recovery,
      }),
      inputSchema: session,
      annotations: READ_ONLY,
    }, async ({ userId, sessionToken }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.get(path + suffix, { userId }, sessionHeaders(sessionToken))); }
      catch (error) { return errorResponse(error); }
    });
  }
  server.registerTool("horizon_purchase_player_value_offer", {
    title: "Purchase Player Value Offer",
    description: describeTool({
      summary: "Purchases one configured offer with atomic costs and rewards, retaining a bounded duplicate receipt.",
      use: "a player confirms an offer returned by horizon_get_player_value_offers.",
      avoid: "choosing arbitrary costs or rewards; only the server's configured offer is accepted.",
      requires: SESSION_REQUIRED + " Persist operationId before the first request.",
      effects: "Debits and credits together once. Same ID and body replay without another debit; no automatic retries or new IDs.",
      returns: "Updated player-value state with operation: {operationId, replayed, applied: [{key, amount}]}. Replayed state is current, applied is the original delta.",
      errors: recovery,
    }),
    inputSchema: { ...session, offerKey: valueKey, operationId: valueOperationId },
    annotations: DESTRUCTIVE_WRITE,
  }, async ({ userId, sessionToken, offerKey, operationId }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(path + "/purchase", { userId, offerKey, operationId }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_adjust_player_value", {
    title: "Adjust Player Value",
    description: describeTool({
      summary: "Adjusts one player value within explicitly enabled project rules and per-call and daily limits.",
      use: "the configured game permits a direct value adjustment; use horizon_get_player_values to inspect the result.",
      avoid: "trusted rewards or arbitrary grants; client adjustment is disabled by default. Purchases use horizon_purchase_player_value_offer.",
      requires: SESSION_REQUIRED + " This definition must enable adjustment.",
      effects: "Applies the signed amount once per operationId. Persists reason in the operation receipt. Never creates an ID or retries automatically.",
      returns: "Updated player-value state including the original applied delta and replayed flag.",
      errors: "ADJUST_NOT_ALLOWED or ADJUST_ABOVE_LIMIT: change the game flow or project rules. " + recovery,
    }),
    inputSchema: { ...session, key: valueKey, amount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).refine(v => v !== 0).describe("Nonzero signed safe integer delta; limited by the project rules"),
      reason: z.string().min(1).refine(v => v.trim().length > 0 && Buffer.byteLength(v, "utf8") <= 200).describe("Nonblank audit reason, at most 200 UTF-8 bytes"), operationId: valueOperationId },
    annotations: DESTRUCTIVE_WRITE,
  }, async ({ userId, sessionToken, key, amount, reason, operationId }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(path + "/adjust", { userId, key, amount, reason, operationId }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
}
