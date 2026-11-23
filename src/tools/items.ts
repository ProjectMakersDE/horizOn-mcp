import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { itemKey, itemRevision, itemChanges, itemPage, itemPageQuery } from "./item-schemas.js";

const session = { userId: z.string().uuid().describe("Signed-in player UUID matching the session"), sessionToken: z.string().min(1).max(256).describe("Player accessToken sent only as Authorization Bearer") };
const path = "/api/v1/app/items";
const returns = "Complete {userId,revision,instances,stacks,limits,serverTime} inventory. Replace only the matching host/project/player cache. Instances carry server-generated UUIDs, properties, equipped and createdAt; stacks are [{itemKey,count,equipped}] (absent means empty) with values from the catalog template.";
const errors = "409 REVISION_CONFLICT or an uncertain response: use horizon_get_items and reconcile intent, never silently substitute a new revision and repeat. 404 ITEM_NOT_FOUND means this instance no longer exists. 422 ITEM_PROPERTY_NOT_ALLOWED/ITEM_PROPERTY_LIMIT_REACHED rejects the entire adjustment. " + SESSION_ERRORS;
export function registerItemsTools(server: McpServer): void {
  server.registerTool("horizon_get_items", {
    title: "Get Player Inventory", description: describeTool({ summary: "Reads the player's bounded inventory of unique items and stacks.", use: "opening inventory or reconciling an uncertain edit.", avoid: "polling or minting items; use horizon_get_item_catalog for templates.", requires: SESSION_REQUIRED, effects: "None (read only); an absent inventory is returned empty without writing.", returns, errors }),
    inputSchema: session, annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path, { userId }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_get_item_catalog", {
    title: "Get Item Catalog Page", description: describeTool({ summary: "Reads one bounded item template page, including archived templates.", use: "showing item details or reviewing a catalog with explicit keyset pagination.", avoid: "automatically scanning the whole catalog or combining pages from different revisions.", requires: SESSION_REQUIRED, effects: "None (read only).", returns: "{revision,definitions,nextAfterKey,total,limits,serverTime}; definitions carry mode (unique|stack) and maxStack for stacks. Retain the first revision for later pages; null cursor ends the list.", errors }),
    inputSchema: { ...session, ...itemPage }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, ...page }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path + "/catalog", { userId, ...itemPageQuery(page) }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
  });
  const instance = z.string().uuid().describe("Exact owned unique item instance UUID from the reviewed inventory");
  const stackKey = itemKey.describe("Stack template key from the reviewed inventory stacks; send instead of instanceId");
  const actions = [
    ["adjust_item", "adjust", "Adjust Item Properties", "Applies all configured deltas atomically to a unique instance. Archived templates and properties without a rule cannot be adjusted."],
    ["equip_item", "equip", "Set Item Equipped State", "Sets the equipped boolean of one unique instance (instanceId) or one stack (itemKey); it does not enforce game-specific slot rules."],
    ["discard_item", "discard", "Discard Item", "Permanently removes one unique instance (instanceId) or count items of a stack (itemKey, count default 1; an emptied stack is removed). The original source guards consumption; replay cannot recreate a discarded item and no recipient receipt is added."],
  ] as const;
  for (const [name, action, title, effects] of actions) {
    const unique = action === "adjust";
    server.registerTool("horizon_" + name, {
      title, description: describeTool({ summary: title.replace(/^([A-Za-z]+)/, "$1s") + " using the reviewed inventory revision.", use: "the player explicitly requests this inventory action.", avoid: "automatic retries, client grants, changing instance IDs or revisions to force an uncertain action through.", requires: SESSION_REQUIRED + (unique ? " An exact reviewed inventory revision and instance UUID." : " An exact reviewed inventory revision and exactly one of instanceId or itemKey."), effects: effects + " One HTTP attempt only.", returns, errors: unique ? errors : errors + " 422 ITEM_STACK_TOO_SMALL: discard count exceeds the stack." }),
      inputSchema: { ...session, instanceId: unique ? instance : instance.optional().describe(instance.description!), ...(unique ? {} : { itemKey: stackKey.optional().describe(stackKey.description!) }), expectedRevision: itemRevision,
        ...(action === "adjust" ? { changes: itemChanges } : {}), ...(action === "equip" ? { equipped: z.boolean().describe("Explicit desired equipped state") } : {}),
        ...(action === "discard" ? { count: z.number().int().min(1).max(999999).optional().describe("Stack items to remove, default 1; only with itemKey") } : {}) }, annotations: DESTRUCTIVE_WRITE,
    }, async ({ userId, sessionToken, instanceId, itemKey: key, expectedRevision, ...fields }: { userId: string; sessionToken: string; instanceId?: string; itemKey?: string; expectedRevision: number; count?: number }) => {
      if ((instanceId === undefined) === (key === undefined)) return errorResponse(new Error("INVALID_REQUEST: Send exactly one of instanceId or itemKey"));
      if (fields.count !== undefined && key === undefined) return errorResponse(new Error("INVALID_REQUEST: count is only allowed with itemKey"));
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.post(path + "/" + action, { userId, ...(key === undefined ? { instanceId } : { itemKey: key }), expectedRevision, ...fields }, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
    });
  }
}
