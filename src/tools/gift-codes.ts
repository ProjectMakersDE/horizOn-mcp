import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, structuredResponse, describeTool,
  READ_ONLY, IDEMPOTENT_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { VALIDATE_GIFT_CODE_OUTPUT, lenientObject } from "./output-schemas.js";
import { giftIntent, giftProjectScope, preparedGift, checkedGift } from "./gift-v2.js";

const userIdSchema = z.string().uuid().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*");
const codeSchema = z.string().min(1).max(50).describe("Original visible gift code, retained with the prepared campaign identity");
const sessionSchema = z.string().min(1).max(256).describe("Current accessToken of the intent's original user, sent only as a Bearer header");
const domainErrors = "409 UPGRADE_REQUIRED closes V1; MIGRATION_REQUIRED needs operator migration; COUNT_AHEAD, CAMPAIGN_CHANGED, COUNTER_EXHAUSTED and STATE_CONFLICT require explicit reconciliation. Keep the original intent on every uncertain outcome, never prepare or advance automatically. ";

export function registerGiftCodeTools(server: McpServer): void {
  server.registerTool("horizon_validate_gift_code", {
    title: "Validate Gift Code",
    description: describeTool({ summary: "Checks whether a gift code is currently valid for a player without consuming or preparing it.",
      use: "showing an early validity message; horizon_prepare_gift_code prepares a consumable V2 identity.",
      avoid: "claiming rewards (use horizon_redeem_gift_code with an already persisted intent).",
      requires: "userId from horizon_signup_* or horizon_signin_*; no session token.", effects: "None (read only).",
      returns: "{valid}; a validity check reserves nothing and cannot recover an uncertain redemption." }),
    inputSchema: { code: codeSchema, userId: userIdSchema }, outputSchema: VALIDATE_GIFT_CODE_OUTPUT, annotations: READ_ONLY,
  }, async ({ code, userId }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return structuredResponse(await client.post("/api/v1/app/gift-codes/validate", { code, userId })); }
    catch (error) { return errorResponse(error); }
  });

  server.registerTool("horizon_prepare_gift_code", {
    title: "Prepare Gift Code Intent",
    description: describeTool({ summary: "Reads a compact V2 campaign identity and exact current sequence without reserving or consuming a redemption.",
      use: "starting an explicit new action after prior outcomes are resolved; persist the returned intent before horizon_redeem_gift_code.",
      avoid: "recovering an uncertain action; retry its saved original intent with horizon_redeem_gift_code instead.",
      requires: SESSION_REQUIRED, effects: "None (read only); no server intent or reservation is stored.",
      returns: "{valid,intent}; intent is null when invalid, otherwise exactly protocolVersion,projectScope,userId,code,campaignId,expectedCount,configRevision. Counts/revisions are exact Int64 decimal strings; projectScope binds the local host/project without exposing credentials. Persist all seven fields, never the session token.",
      errors: domainErrors + SESSION_ERRORS }),
    inputSchema: { code: codeSchema, userId: userIdSchema, sessionToken: sessionSchema },
    outputSchema: lenientObject({ valid: z.boolean(), intent: giftIntent }), annotations: READ_ONLY,
  }, async ({ code, userId, sessionToken }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return structuredResponse(preparedGift(await client.post("/api/v1/app/gift-codes/validate", { code, userId, includeIntent: true }, sessionHeaders(sessionToken)), code, userId)); }
    catch (error) { return errorResponse(error); }
  });

  server.registerTool("horizon_redeem_gift_code", {
    title: "Redeem Prepared Gift Code",
    description: describeTool({ summary: "Consumes the original persisted V2 campaign/player sequence once and returns current authoritative state on replay.",
      use: "an explicit consume or retry of the exact seven-field intent previously returned by horizon_prepare_gift_code and durably saved.",
      avoid: "preparing or advancing a counter after uncertainty; horizon_validate_gift_code alone does not produce an intent.",
      requires: SESSION_REQUIRED, effects: "Fresh redemption and rewards commit atomically. Identical intent retries share one logical sequence slot. No automatic retry or preparation occurs.",
      returns: "{success,campaignId,count,configRevision,alreadyApplied,replayed,giftData,grantedValues,grantedUnlocks,playerValues}. Fresh count is expectedCount+1 at the original revision. Replay has current count/state, null giftData and empty grants. Replace balances from playerValues; never add rewards locally. Remove only this exact confirmed intent; malformed replies leave it unresolved.",
      errors: domainErrors + "V1 arguments return local UPGRADE_REQUIRED without HTTP; mixed forms return INVALID_REQUEST. A changed local host/project returns PROJECT_SCOPE_CHANGED. " + SESSION_ERRORS }),
    inputSchema: {
      intent: giftIntent.optional().describe("Required V2 recovery object: the exact seven fields durably saved from horizon_prepare_gift_code; never retarget or advance it"),
      sessionToken: sessionSchema,
      code: codeSchema.optional().describe("Obsolete V1 argument, rejected with UPGRADE_REQUIRED; use the original saved intent"),
      userId: userIdSchema.optional().describe("Obsolete V1 argument, rejected with UPGRADE_REQUIRED; the original owner is inside intent"),
      idempotencyId: z.string().optional().describe("Obsolete arbitrary V1 ID, never translated to a V2 sequence; rejected without HTTP"),
    }, annotations: IDEMPOTENT_WRITE,
  }, async ({ intent, sessionToken, code, userId, idempotencyId }) => {
    if (!intent) return errorResponse(new Error("UPGRADE_REQUIRED: V1 is closed; explicitly prepare and persist a new V2 intent only after resolving old outcomes"));
    if (code !== undefined || userId !== undefined || idempotencyId !== undefined) return errorResponse(new Error("INVALID_REQUEST: do not mix V1 arguments with the original V2 intent"));
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    if (intent.projectScope !== giftProjectScope()) return errorResponse(new Error("PROJECT_SCOPE_CHANGED: keep the original intent for its host/project"));
    const { projectScope: _scope, ...body } = intent;
    try { return jsonResponse(checkedGift(await client.post("/api/v1/app/gift-codes/redeem", body, sessionHeaders(sessionToken)), intent)); }
    catch (error) { return errorResponse(error); }
  });
}
