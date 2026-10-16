import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE, IDEMPOTENT_WRITE, DESTRUCTIVE_NON_IDEMPOTENT } from "./_utils.js";
import { marketId, marketTime, marketText, marketRevision, marketCurrency, marketKey, marketPrice, marketPage, marketCursor, marketQuery, marketStatus } from "../marketplace-schemas.js";
import { marketErrors } from "../marketplace.js";
const project = { projectApiKeyId: marketId.describe("Owned project UUID bound to the account key scope") };
const base = (id: string) => "/api/v1/admin/features/marketplace/" + id;
const doc = (summary: string, effects: string, returns: string) => describeTool({ summary, effects, returns,
  use: "explicit marketplace configuration and support after horizon://docs/marketplace.", avoid: "automatic moderation, replacement currency/items, or refreshed CAS retries. Use horizon_admin_marketplace_config_get or horizon_admin_marketplace_listing_get to read original revisions first, and preserve unknown outcomes for reconciliation.",
  requires: "MARKETPLACE scoped Account Key with the matching project and permission. Never expose it in a game.", errors: marketErrors }, ADMIN_AUTH);
export function registerAdminMarketplaceTools(server: McpServer): void {
  for (const name of ["config", "limits"] as const) server.registerTool("horizon_admin_marketplace_" + name + "_get", {
    title: "Get Marketplace " + name, description: doc("Reads the owned project marketplace " + name + " and current server time.", "Read only.", "{" + name + ",serverTime}"), inputSchema: project, annotations: READ_ONLY }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/" + name)); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_config_set", { title: "Configure Marketplace Currency and Fees", description: doc("Sets explicit trading enablement, saved Player Values currency and fee at the original config revision.",
    "One CAS write. Requires explicit currency, fee and an active item rule to enable. Currency changes require zero escrow. Disabling keeps protected returns available.", "{config,serverTime}"),
    inputSchema: { ...project, expectedRevision: marketRevision, enabled: z.boolean().describe("Explicitly enable or disable new trading"), currencyKey: marketCurrency.nullable().describe("Saved Player Values currency, or null only while disabled with zero escrow"), feeBps: z.number().int().min(0).max(10000).nullable().describe("Explicit fee in basis points, 0 through 10000; null only while disabled with zero escrow") }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, expectedRevision, ...body }) => {
    if (body.enabled && (body.currencyKey === null || body.feeBps === null)) return errorResponse(new Error("INVALID_REQUEST: Enabled trading requires currency and fee"));
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(base(projectApiKeyId) + "/config", body, { "If-Match": String(expectedRevision) })); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_rules_list", { title: "List Marketplace Rules", description: doc("Reads one bounded price-rule page for the owned project.", "Read only, explicit item-key continuation.", "{revision,rules,nextCursor,serverTime}"),
    inputSchema: { ...project, ...marketPage, after: marketKey.optional().describe("Last original item key for explicit continuation") }, annotations: READ_ONLY }, async ({ projectApiKeyId, ...query }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/rules", marketQuery(query))); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_rule_set", { title: "Set Marketplace Item Price Rule", description: doc("Sets the active flag and explicit price bounds for one existing Items template.", "One CAS write against the original global config revision, not a per-item revision.", "{revision,rule,serverTime}"),
    inputSchema: { ...project, expectedRevision: marketRevision, itemKey: marketKey, active: z.boolean().describe("Whether this original item template may be traded"), minPrice: marketPrice.describe("Positive inclusive minimum price"), maxPrice: marketPrice.describe("Positive inclusive maximum price") }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, expectedRevision, itemKey, ...body }) => {
    if (body.minPrice > body.maxPrice) return errorResponse(new Error("INVALID_REQUEST: minPrice exceeds maxPrice"));
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(base(projectApiKeyId) + "/rules/" + itemKey, body, { "If-Match": String(expectedRevision) })); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_listings_list", { title: "List Marketplace Audit", description: doc("Reads one indexed project audit page with optional exact lifecycle status.", "Read only, explicit cursor continuation with unchanged status. No automatic page traversal.", "{listings,nextCursor,serverTime}"),
    inputSchema: { ...project, ...marketPage, status: marketStatus.optional().describe("Optional exact listing status"), cursor: marketCursor }, annotations: READ_ONLY }, async ({ projectApiKeyId, ...query }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/listings", marketQuery(query))); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_listing_get", { title: "Inspect Marketplace Listing", description: doc("Reads one listing and its bounded immutable support audit.", "Read only, including protected orphan escrow.", "{listing,audit,serverTime}"),
    inputSchema: { ...project, listingId: marketId }, annotations: READ_ONLY }, async ({ projectApiKeyId, listingId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(base(projectApiKeyId) + "/listings/" + listingId)); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_listing_cancel", { title: "Force Cancel Marketplace Listing", description: doc("Cancels an explicitly reviewed listing at its original revision.", "One destructive CAS write, records the support note and preserves original item escrow for Inbox return.", "{listing,serverTime}"),
    inputSchema: { ...project, listingId: marketId, expectedRevision: marketRevision, note: marketText(240,960) }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, listingId, expectedRevision, note }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(base(projectApiKeyId) + "/listings/" + listingId + "/cancel", { note }, { "If-Match": String(expectedRevision) })); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_return_retry", { title: "Attempt Pending Marketplace Return", description: doc("Attempts one protected original item return delivery.", "One HTTP attempt. Full Inbox remains pending; delivery does not claim or mint an item.", "{listing,delivery,serverTime}"),
    inputSchema: { ...project, listingId: marketId }, annotations: IDEMPOTENT_WRITE }, async ({ projectApiKeyId, listingId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(base(projectApiKeyId) + "/listings/" + listingId + "/retry-return", {})); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_listing_recover", { title: "Recover Deleted Owner Escrow", description: doc("Transfers protected orphan return ownership to an explicitly selected active player in the same project.",
    "One destructive CAS write, only after original owner deletion. Records a bounded audit, invalidates the old Inbox binding and keeps delivery through Inbox. Recipient needs an open-listing slot.", "{listing,serverTime}"),
    inputSchema: { ...project, listingId: marketId, expectedRevision: marketRevision, recipientId: marketId, note: marketText(240,960) }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, listingId, expectedRevision, ...body }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(base(projectApiKeyId) + "/listings/" + listingId + "/recover", body, { "If-Match": String(expectedRevision) })); } catch (e) { return errorResponse(e); }
  });
  for (const [name, suffix, result] of [["player_get", "", "{state,serverTime}"], ["moderation_get", "/moderation", "{userId,revision,banUntil,reason,serverTime}"]] as const)
    server.registerTool("horizon_admin_marketplace_" + name, { title: "Get Marketplace Player " + name, description: doc("Reads own-project player marketplace support state.", "Read only. Private support reason stays outside game credentials.", result),
      inputSchema: { ...project, userId: marketId }, annotations: READ_ONLY }, async ({ projectApiKeyId, userId }) => {
      const client = getAdminClient(); if (!client) return noAdminClientResponse();
      try { return jsonResponse(await client.get(base(projectApiKeyId) + "/players/" + userId + suffix)); } catch (e) { return errorResponse(e); }
    });
  server.registerTool("horizon_admin_marketplace_moderation_set", { title: "Set Marketplace Player Ban", description: doc("Sets or clears the explicitly reviewed player's marketplace ban at the original player revision.",
    "One CAS write. Deadline at most 30 days ahead; null clears. Existing escrow returns remain protected.", "{userId,revision,banUntil,reason,serverTime}"),
    inputSchema: { ...project, userId: marketId, expectedRevision: marketRevision, banUntil: marketTime.nullable().describe("Explicit UTC ban deadline or null to clear"), reason: marketText(240,960,false) }, annotations: DESTRUCTIVE_WRITE }, async ({ projectApiKeyId, userId, expectedRevision, ...body }) => {
    if (body.banUntil !== null && !body.reason.trim()) return errorResponse(new Error("INVALID_REQUEST: A ban requires a reason"));
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(base(projectApiKeyId) + "/players/" + userId + "/moderation", body, { "If-Match": String(expectedRevision) })); } catch (e) { return errorResponse(e); }
  });
  server.registerTool("horizon_admin_marketplace_cleanup", { title: "Process One Marketplace Maintenance Batch", description: doc("Processes one bounded batch of pending returns and expired terminal audit rows.",
    "At most 20 candidates with persistent fair continuation. Nonterminal escrow never expires. A subsequent call processes another batch; no automatic loop.", "{examined,returnsPrepared,returnsDelivered,terminalRemoved,deferred,serverTime}"),
    inputSchema: project, annotations: DESTRUCTIVE_NON_IDEMPOTENT }, async ({ projectApiKeyId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.post(base(projectApiKeyId) + "/cleanup", {})); } catch (e) { return errorResponse(e); }
  });
}
