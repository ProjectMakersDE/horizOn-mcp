import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { marketId as giftId, marketTime as giftTime, marketRevision as giftRevision } from "./marketplace-schemas.js";
const session = { userId: giftId.describe("Active player matching the current session and project"), sessionToken: z.string().min(1).max(256).describe("Current accessToken sent only as Bearer") };
const base = "/api/v1/app/item-gifts";
export const giftErrors = "409 REVISION_CONFLICT, OPERATION_CONFLICT, OPERATION_EXPIRED, STATE_CONFLICT and GIFT_EXPIRED, GIFT_DECLINED, GIFT_ALREADY_CLAIMED, GIFT_UNAVAILABLE need explicit reconciliation, never fresh revisions or operation IDs on an unknown outcome. Missing OPERATION_NOT_FOUND does not prove nonexecution. RECIPIENT_INBOX_FULL and 422 SELF_GIFT, ITEM_EQUIPPED, OPEN_GIFT_LIMIT_REACHED, GIFT_LIMIT_REACHED, INSUFFICIENT_BALANCE withdraw and charge nothing. 403 ITEM_GIFTS_DISABLED. 404 RECIPIENT_NOT_FOUND hides blocks. 429 ITEM_GIFTS_RATE_LIMITED schedules no retry. " + SESSION_ERRORS;
const doc = (summary: string, effects: string, returns: string) => describeTool({ summary, effects, returns,
  use: "explicit private item gift actions after reading horizon://docs/item-gifts. Claim offers and returns with horizon_claim_inbox.", avoid: "automatic gifting, polling or generated replacement operations. Use horizon_get_item_gift_operation to reconcile the original intent.",
  requires: SESSION_REQUIRED, errors: giftErrors });
export function registerItemGiftTools(server: McpServer): void {
  for (const [name, path, title, summary, result] of [
    ["get_item_gift_config", "/config", "Get Item Gift Configuration", "Reads whether gifting is enabled, the fixed sender fee with its currency and the configured limits.", "{config:{revision,enabled,currencyKey,fee},limits,serverTime}; currencyKey null means a free gift"],
    ["get_item_gifts", "", "Get Own Item Gifts", "Reads the own bounded lists of sent gifts, received open offers and recent history.", "{state:{userId,revision,sent,history,received,operationWindow,limits},serverTime}"],
  ] as const)
    server.registerTool("horizon_" + name, { title, description: doc(summary, "Read only. No automatic refresh or polling.", result), inputSchema: session, annotations: READ_ONLY }, async ({ userId, sessionToken }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.get(base + path, { userId }, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
    });
  for (const [name, field, path, title, result] of [
    ["get_item_gift", "giftId", "/", "Get Item Gift", "{gift,serverTime} for sender, recipient or return owner"],
    ["get_item_gift_operation", "operationId", "/operations/", "Get Original Item Gift Receipt", "{receipt,serverTime}; the receipt is the fee proof"],
  ] as const)
    server.registerTool("horizon_" + name, { title,
      description: doc("Reads one authorized gift or the original own send receipt.", "Read only. Missing receipts never authorize replacement IDs; retained receipts never withdraw or charge again.", result),
      inputSchema: { ...session, [field]: giftId }, annotations: READ_ONLY }, async (args) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.get(base + path + (args as Record<string, string>)[field], { userId: args.userId }, sessionHeaders(args.sessionToken))); } catch (e) { return errorResponse(e); }
    });
  server.registerTool("horizon_send_item_gift", { title: "Send Original Item as Gift", description: doc("Sends one original unequipped item privately to another player under the confirmed fee configuration.",
    "One HTTP attempt. Persist all seven original fields before sending under project/player/feature. Atomically moves the exact inventory instance into escrow, charges the fixed sender fee (never refunded) and delivers an Inbox offer that expires after seven days. Resolve a friend code with horizon_find_player first. Never recalculate revisions after a lost response.",
    "{receipt,gift,replayed,serverTime}; 201 new, 200 identical replay"),
    inputSchema: { ...session, operationId: giftId.describe("Persisted original operation UUID, never replaced after uncertainty"), issuedAt: giftTime,
      recipientId: giftId.describe("Recipient player ID, resolved from a friend code with horizon_find_player"), instanceId: giftId.describe("Exact original unequipped item instance ID"),
      expectedInventoryRevision: giftRevision, expectedConfigRevision: giftRevision.describe("Original gift config revision whose fee and currency the player confirmed") }, annotations: DESTRUCTIVE_WRITE }, async ({ sessionToken, ...body }) => {
    if (body.recipientId === body.userId) return errorResponse(new Error("SELF_GIFT: recipientId equals userId"));
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base, body, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_decline_item_gift", { title: "Decline Received Item Gift", description: doc("Declines one received offer under its original gift revision so the item returns to the sender.",
    "One HTTP attempt. Removes the Inbox offer and prepares a protected return entry for the sender, who claims it with horizon_claim_inbox. The sender fee stays charged. Replay of the same decline never returns twice.",
    "{gift,replayed,returnDelivery,serverTime}"),
    inputSchema: { ...session, giftId: giftId.describe("Gift ID from the Inbox attachment itemGift or the gift state"), expectedGiftRevision: giftRevision }, annotations: DESTRUCTIVE_WRITE }, async ({ sessionToken, giftId: id, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/" + id + "/decline", body, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
}
