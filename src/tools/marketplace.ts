import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, IDEMPOTENT_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { marketId, marketTime, marketRevision, marketCurrency, marketKey, marketPrice, marketPage, marketCursor, marketQuery } from "./marketplace-schemas.js";
const session = { userId: marketId.describe("Active player matching the current session and project"), sessionToken: z.string().min(1).max(256).describe("Current accessToken sent only as Bearer") };
const intent = { operationId: marketId.describe("Persisted original operation UUID, never replaced after uncertainty"), issuedAt: marketTime };
const base = "/api/v1/app/marketplace";
export const marketErrors = "409 conflicts require explicit reconciliation, never fresh revisions or operation IDs on an unknown outcome. Missing OPERATION_NOT_FOUND does not prove nonexecution. 422 capacity/balance/daily-limit errors preserve atomicity. 429 schedules no retry. Full Inbox returns pending without losing the original item. " + SESSION_ERRORS;
const doc = (summary: string, effects: string, returns: string) => describeTool({ summary, effects, returns,
  use: "explicit marketplace actions after reading horizon://docs/marketplace.", avoid: "automatic trading, price polling or generated replacement operations. Use horizon_get_marketplace_operation to reconcile the original intent.",
  requires: SESSION_REQUIRED, errors: marketErrors });
export function registerMarketplaceTools(server: McpServer): void {
  for (const [name, path, result] of [["get_marketplace_limits", "/limits", "{limits,capabilities,config,serverTime}"], ["get_marketplace", "", "{state,serverTime}"]] as const)
    server.registerTool("horizon_" + name, { title: name === "get_marketplace" ? "Get Own Marketplace" : "Get Marketplace Limits",
      description: doc("Reads current own marketplace state or configured limits.", "Read only. No automatic refresh or polling.", result), inputSchema: session, annotations: READ_ONLY }, async ({ userId, sessionToken }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.get(base + path, { userId }, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
    });
  server.registerTool("horizon_get_marketplace_rules", { title: "Get Marketplace Price Rules", description: doc("Reads one revision-consistent bounded rule page.",
    "Read only. Preserve catalogRevision and after for explicit subsequent pages.", "{revision,rules,nextCursor,serverTime}"),
    inputSchema: { ...session, ...marketPage, after: marketKey.optional().describe("Original last item key from the preceding rule page"), catalogRevision: marketRevision.optional().describe("Original rule catalog revision across pages") }, annotations: READ_ONLY }, async ({ sessionToken, ...query }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/rules", marketQuery(query), sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_query_marketplace_listings", { title: "Query Marketplace Listings", description: doc("Reads one bounded active-listing page by item and price.",
    "Read only, up to 256 candidates and 50 returned listings. An empty page can carry a continuation cursor.", "{listings,nextCursor,serverTime}"),
    inputSchema: { ...session, ...marketPage, itemKey: marketKey.optional().describe("Optional exact template key"), minPrice: marketRevision.optional().describe("Inclusive safe-integer minimum price, default zero"), maxPrice: marketRevision.optional().describe("Inclusive safe-integer maximum price"), cursor: marketCursor }, annotations: READ_ONLY }, async ({ sessionToken, ...query }) => {
    if ((query.minPrice ?? 0) > (query.maxPrice ?? Number.MAX_SAFE_INTEGER)) return errorResponse(new Error("INVALID_REQUEST: minPrice exceeds maxPrice"));
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(base + "/listings", marketQuery(query), sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
  for (const [name, field, path, result] of [["get_marketplace_listing", "listingId", "/listings/", "{listing,serverTime}"], ["get_marketplace_operation", "operationId", "/operations/", "{receipt,serverTime}"]] as const)
    server.registerTool("horizon_" + name, { title: name === "get_marketplace_listing" ? "Get Marketplace Listing" : "Get Original Marketplace Receipt",
      description: doc("Reads one authorized listing or original own operation receipt.", "Read only. Missing receipts never authorize replacement IDs; retained receipts do not regrant items or currency.", result),
      inputSchema: { ...session, [field]: marketId }, annotations: READ_ONLY }, async (args) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.get(base + path + (args as Record<string, string>)[field], { userId: args.userId }, sessionHeaders(args.sessionToken))); } catch (e) { return errorResponse(e); }
    });
  server.registerTool("horizon_create_marketplace_listing", { title: "Escrow Original Item for Sale", description: doc("Lists one original unequipped item at the explicitly approved price and fee configuration.",
    "One HTTP attempt. Persist all original fields before sending under project/player/feature. Atomically removes the exact inventory instance into escrow. Never recalculate revisions after a lost response.", "{receipt,listing,replayed,serverTime}; listing can be null on retained replay after terminal audit purge"),
    inputSchema: { ...session, ...intent, instanceId: marketId, expectedInventoryRevision: marketRevision, expectedConfigRevision: marketRevision, price: marketPrice, durationSeconds: z.number().int().min(300).max(604800).describe("Original sale lifetime in seconds, from five minutes to seven days") }, annotations: DESTRUCTIVE_WRITE }, async ({ sessionToken, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/listings", body, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_buy_marketplace_listing", { title: "Buy Original Marketplace Item", description: doc("Purchases the exact listing under its original revision, currency and price.",
    "One HTTP attempt. Atomic buyer debit, seller net credit, fee and original item transfer. Persist the original intent before sending. Competing buyers cannot both settle.", "{receipt,listing,replayed,serverTime}"),
    inputSchema: { ...session, ...intent, listingId: marketId, expectedListingRevision: marketRevision, expectedPrice: marketPrice, expectedCurrencyKey: marketCurrency }, annotations: DESTRUCTIVE_WRITE }, async ({ sessionToken, listingId, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/listings/" + listingId + "/buy", body, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_cancel_marketplace_listing", { title: "Cancel Own Marketplace Listing", description: doc("Cancels the original listing revision into a protected pending item return.",
    "One HTTP attempt with the persisted original UUID/time/revision. Cancel and receipt replay remain available while trading is disabled. Claim through Inbox, never mint a replacement item.", "{receipt,listing,replayed,serverTime}"),
    inputSchema: { ...session, ...intent, listingId: marketId, expectedListingRevision: marketRevision }, annotations: DESTRUCTIVE_WRITE }, async ({ sessionToken, listingId, ...body }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/listings/" + listingId + "/cancel", body, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_retry_marketplace_return", { title: "Attempt Original Item Return Delivery", description: doc("Attempts one explicitly requested pending return delivery for the current return owner.",
    "One HTTP attempt. Full Inbox leaves durable pending escrow; successful delivery still needs Inbox claim with inventory space. Does not recreate or claim the original item.", "{listing,delivery:pending|delivered|returned,serverTime}"),
    inputSchema: { ...session, listingId: marketId }, annotations: IDEMPOTENT_WRITE }, async ({ userId, sessionToken, listingId }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post(base + "/listings/" + listingId + "/retry-return", { userId }, sessionHeaders(sessionToken))); } catch (e) { return errorResponse(e); }
  });
}
