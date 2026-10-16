import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE } from "./_utils.js";
import { itemKey, itemRevision, itemTemplate, itemPage, itemPageQuery, canonicalItemJson } from "../item-schemas.js";

const project = { projectApiKeyId: z.string().uuid().describe("Owned project API key UUID sent as apiKeyId") };
const path = "/api/v1/admin/items";
const requires = "Account Key with ITEMS and matching project scope, or full-account access. Hosted admin API only; simpleServer operators use its local CLI.";
const errors = "403 rejects missing scope; 404 rejects foreign project/player. 409 REVISION_CONFLICT/STATE_CONFLICT: reread and reconcile, never automatically overwrite. 422 ITEM_CATALOG_LIMIT_REACHED prohibits new keys at capacity; existing keys remain editable. 400 INVALID_REQUEST rejects unsafe integers, invalid rules or oversized canonical JSON.";
export function registerAdminItemsTools(server: McpServer): void {
  server.registerTool("horizon_admin_items_catalog_get", {
    title: "Get Owned Item Catalog Page", description: describeTool({ summary: "Reads one owned project catalog page including inactive templates.", use: "reviewing definitions and revision before editing or following the next cursor explicitly.", avoid: "automatically fetching all pages; use horizon_admin_items_player_get for inventory.", requires, effects: "None (read only).", returns: "{revision,definitions,nextAfterKey,total,limits,serverTime}; retain the first page revision across further pages.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, ...itemPage }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, ...page }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(path + "/catalog", { apiKeyId: projectApiKeyId, ...itemPageQuery(page) })); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_items_catalog_set", {
    title: "Set One Item Template", description: describeTool({ summary: "Creates or replaces one permanent item template under the reviewed catalog revision.", use: "after horizon_admin_items_catalog_get and reviewing the complete definition for this key.", avoid: "changing existing instance properties, deleting identities, minting player items or overwriting another catalog edit.", requires, effects: "Updates one definition and catalog revision. active=false archives the key and blocks grants/adjustments; retained instances can still be equipped/discarded. Existing instance properties and receipts remain unchanged. No player fanout or automatic retry.", returns: "{revision,definition,limits,serverTime}; the complete updated template and catalog revision.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, key: itemKey, expectedRevision: itemRevision, definition: itemTemplate.describe("Complete template without its path key; at most 2048 canonical UTF-8 bytes including key") }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, key, expectedRevision, definition }) => {
    if (Buffer.byteLength(canonicalItemJson({ key, ...definition }), "utf8") > 2048) return errorResponse(new Error("INVALID_REQUEST: Template exceeds 2048 canonical UTF-8 bytes"));
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(path + "/catalog/" + encodeURIComponent(key) + "?apiKeyId=" + encodeURIComponent(projectApiKeyId), definition, { "If-Match": String(expectedRevision) })); } catch (error) { return errorResponse(error); }
  });
  for (const [name, title, player, returns] of [
    ["player_get", "Inspect Player Inventory", true, "{inventory,receipts} with original bounded grant references; no grant or correction action."],
    ["limits", "Get Item Limits", false, "{catalog,inventory,receipts} for the current tier."],
  ] as const) {
    server.registerTool("horizon_admin_items_" + name, {
      title, description: describeTool({ summary: player ? "Reads one owned player inventory and its bounded grant history." : "Reads current item catalog, inventory and receipt limits for one project.", use: "support diagnosis or capacity checks.", avoid: "granting player items; use horizon_admin_items_catalog_get for templates.", requires, effects: "None (read only).", returns, errors }, ADMIN_AUTH),
      inputSchema: { ...project, ...(player ? { userId: z.string().uuid().describe("Player UUID belonging to the selected project") } : {}) }, annotations: READ_ONLY,
    }, async ({ projectApiKeyId, ...fields }) => {
      const client = getAdminClient(); if (!client) return noAdminClientResponse();
      try { return jsonResponse(await client.get(path + (player ? "/players/" + encodeURIComponent(fields.userId as string) : "/limits"), { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
    });
  }
}
