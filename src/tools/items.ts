import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { itemRevision, itemChanges, itemPage, itemPageQuery } from "./item-schemas.js";

const session = { userId: z.string().uuid().describe("Signed-in player UUID matching the session"), sessionToken: z.string().min(1).max(256).describe("Player accessToken sent only as Authorization Bearer") };
const path = "/api/v1/app/items";
const returns = "Complete {userId,revision,instances,limits,serverTime} inventory. Replace only the matching host/project/player cache. Instances carry server-generated UUIDs, properties, equipped and createdAt.";
const errors = "409 REVISION_CONFLICT or an uncertain response: use horizon_get_items and reconcile intent, never silently substitute a new revision and repeat. 404 ITEM_NOT_FOUND means this instance no longer exists. 422 ITEM_PROPERTY_NOT_ALLOWED/ITEM_PROPERTY_LIMIT_REACHED rejects the entire adjustment. " + SESSION_ERRORS;
export function registerItemsTools(server: McpServer): void {
  server.registerTool("horizon_get_items", {
    title: "Get Player Inventory", description: describeTool({ summary: "Reads the player's bounded unique item inventory.", use: "opening inventory or reconciling an uncertain edit.", avoid: "polling or minting items; use horizon_get_item_catalog for templates.", requires: SESSION_REQUIRED, effects: "None (read only); an absent inventory is returned empty without writing.", returns, errors }),
    inputSchema: session, annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path, { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_get_item_catalog", {
    title: "Get Item Catalog Page", description: describeTool({ summary: "Reads one bounded item template page, including archived templates.", use: "showing item details or reviewing a catalog with explicit keyset pagination.", avoid: "automatically scanning the whole catalog or combining pages from different revisions.", requires: SESSION_REQUIRED, effects: "None (read only).", returns: "{revision,definitions,nextAfterKey,total,limits,serverTime}. Retain the first revision for later pages; null cursor ends the list.", errors }),
    inputSchema: { ...session, ...itemPage }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, ...page }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path + "/catalog", { userId, ...itemPageQuery(page) }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  const common = { ...session, instanceId: z.string().uuid().describe("Exact owned item instance UUID from the reviewed inventory"), expectedRevision: itemRevision };
  const actions = [
    ["adjust_item", "adjust", "Adjust Item Properties", "Applies all configured deltas atomically. Archived templates and properties without a rule cannot be adjusted."],
    ["equip_item", "equip", "Set Item Equipped State", "Sets this instance's equipped boolean; it does not enforce game-specific slot rules."],
    ["discard_item", "discard", "Discard Item", "Permanently removes this instance. Original grant receipts remain and replay cannot recreate a discarded item."],
  ] as const;
  for (const [name, action, title, effects] of actions) {
    server.registerTool("horizon_" + name, {
      title, description: describeTool({ summary: title.replace(/^([A-Za-z]+)/, "$1s") + " using the reviewed inventory revision.", use: "the player explicitly requests this inventory action.", avoid: "automatic retries, client grants, changing instance IDs or revisions to force an uncertain action through.", requires: SESSION_REQUIRED + " An exact reviewed inventory revision and instance UUID.", effects: effects + " One HTTP attempt only.", returns, errors }),
      inputSchema: { ...common, ...(action === "adjust" ? { changes: itemChanges } : {}), ...(action === "equip" ? { equipped: z.boolean().describe("Explicit desired equipped state") } : {}) }, annotations: DESTRUCTIVE_WRITE,
    }, async ({ userId, sessionToken, instanceId, expectedRevision, ...fields }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.post(path + "/" + action, { userId, instanceId, expectedRevision, ...fields }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
    });
  }
}
