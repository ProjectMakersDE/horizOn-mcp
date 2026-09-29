/**
 * Admin tools for managing gift codes.
 *
 * Gift codes are per-project codes users can redeem in the runtime app
 * to claim structured reward data. These tools wrap the
 * /api/v1/admin/gift-codes endpoints so callers can list, fetch,
 * create, update, delete, revoke and inspect statistics/limits from
 * the MCP surface.
 *
 * All tools require HORIZON_ACCOUNT_API_KEY.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  getAdminClient,
  noAdminClientResponse,
  jsonResponse,
  errorResponse,
  describeTool,
  ADMIN_AUTH,
  READ_ONLY,
  ADDITIVE_WRITE,
  DESTRUCTIVE_WRITE,
} from "./_utils.js";

const SCOPE_ACCOUNT =
  "an Account Key with full-account access or the GIFT_CODES feature group; project-scoped keys are denied (403) because this call is account-wide or ID-based.";

const NOT_FOUND =
  "404 Gift code not found for an unknown id or one of another account: list the ids with horizon_admin_giftcodes_list.";

const giftCodeIdSchema = (purpose: string) =>
  z
    .string()
    .uuid()
    .describe(`UUID of the gift code ${purpose} (id from horizon_admin_giftcodes_list or _create, not the redemption code)`);

const IGNORED_PROJECT_FILTER =
  "Ignored: the endpoint is account-wide and has no project filter. Accepted only for compatibility; omit it";

export function registerAdminGiftCodesTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_giftcodes_list",
    {
      title: "List Gift Codes",
      description: describeTool(
        {
          summary:
            "Lists the non-deleted gift codes of the whole account (every Project API key, revoked and expired ones included), newest first, with paging.",
          use: "finding a gift code id, or reviewing codes, rewards, redemption counts and revocation state.",
          avoid:
            "one known code (use horizon_admin_giftcodes_get), totals (use horizon_admin_giftcodes_getStats) or free slots (use horizon_admin_giftcodes_getLimits). There is no server filter by project: filter the items by apiKeyId yourself.",
          requires: SCOPE_ACCOUNT,
          effects: "None (read only).",
          returns:
            "{giftCodes, total, page, size, totalPages}; each item has id, code, title, apiKeyId, apiKeyName, description, giftData (JSON string), currentTotalRedemptions, " +
            "maxTotalRedemptions, maxRedemptionsPerUser, expiresAt, isRevoked, revokedReason, isActive, createdAt, updatedAt, isExpired, remainingRedemptions. " +
            "An empty giftCodes array means no codes exist or the page is past the end.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(IGNORED_PROJECT_FILTER),
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Items per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
    },
    async ({ page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get("/api/v1/admin/gift-codes", {
          page: String(page),
          size: String(size),
        });
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_giftcodes_get",
    {
      title: "Get Gift Code",
      description: describeTool(
        {
          summary:
            "Fetches one gift code by its UUID with reward data, redemption counters, limits, expiration and revocation state.",
          use: "checking how often a code was redeemed or whether it is still redeemable.",
          avoid: "browsing codes (use horizon_admin_giftcodes_list) or testing a code as a player (use horizon_validate_gift_code).",
          requires: `gift code id from horizon_admin_giftcodes_list; ${SCOPE_ACCOUNT}`,
          effects: "None (read only).",
          returns:
            "{id, code, title, apiKeyId, apiKeyName, description, giftData, currentTotalRedemptions, maxTotalRedemptions, maxRedemptionsPerUser, expiresAt, " +
            "isRevoked, revokedReason, isActive, createdAt, updatedAt, isExpired, remainingRedemptions}; remainingRedemptions is null without a total cap.",
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: giftCodeIdSchema("to fetch"),
      },
      annotations: READ_ONLY,
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(`/api/v1/admin/gift-codes/${id}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_giftcodes_create",
    {
      title: "Create Gift Code",
      description: describeTool(
        {
          summary:
            "Creates a new gift code for one Project API key: a fixed redemption code that players of that key redeem once for the giftData rewards, with optional caps and expiry.",
          use: "launching a promo or reward code; players redeem it with horizon_redeem_gift_code.",
          avoid:
            "changing an existing code's title, rewards, caps or expiry (use horizon_admin_giftcodes_update). The code value itself can never be changed later.",
          requires:
            "projectApiKeyId from horizon_admin_projects_list; an Account Key with full-account access or the GIFT_CODES feature group (a project-scoped key may create for its own project); a free slot (check horizon_admin_giftcodes_getLimits).",
          effects:
            "Stores a new active code that is redeemable immediately and uses one gift code slot of the account plan until it is deleted.",
          returns:
            "{id, code, title, apiKeyId, apiKeyName, giftData, maxTotalRedemptions, maxRedemptionsPerUser, expiresAt, isActive, createdAt}.",
          errors:
            "409 when the code already exists: choose another code or update the existing one. " +
            "403 when the plan's gift code limit is reached: delete unused codes with horizon_admin_giftcodes_delete (revoked codes still use a slot) or upgrade the plan. " +
            "400 for invalid giftData grants (not an array, empty, more than 10, duplicate or unknown cosmetic IDs, COSMETIC_NOT_FOUND): fix giftData. " +
            "400 for an unknown projectApiKeyId or one of another account: check horizon_admin_projects_list.",
        },
        ADMIN_AUTH,
      ),
      annotations: ADDITIVE_WRITE,
      inputSchema: {
        title: z
          .string()
          .min(1)
          .max(100)
          .describe("Display title, 1 to 100 characters, e.g. Halloween bonus"),
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the Project API key whose players may redeem the code (from horizon_admin_projects_list; sent as apiKeyId)"),
        code: z
          .string()
          .min(3)
          .max(50)
          .regex(/^[A-Z0-9]+$/)
          .describe(
            "Redemption code players type in: 3 to 50 characters, uppercase letters A to Z and digits only, e.g. HALLOWEEN2025. Cannot be changed after creation",
          ),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("Internal description, max 500 characters. Optional"),
        giftData: z
          .string()
          .describe(
            'Reward payload as a JSON string (not an object), returned to the player on redeem, e.g. {"gold":100,"crystals":50}. An optional "grants" array (1 to 10 distinct cosmetic IDs from the catalog of the code\'s API key) unlocks player profile cosmetics on redeem; the server rejects unknown IDs with 400.',
          ),
        maxTotalRedemptions: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum number of redemptions across all players (positive integer). Omit for unlimited"),
        maxRedemptionsPerUser: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Maximum number of redemptions per player (positive integer). Omit for no per-player cap"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe(
            "ISO-8601 datetime after which the code can no longer be redeemed, e.g. 2025-11-01T00:00:00Z. Omit for no expiration",
          ),
      },
    },
    async ({
      title,
      projectApiKeyId,
      code,
      description,
      giftData,
      maxTotalRedemptions,
      maxRedemptionsPerUser,
      expiresAt,
    }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = {
          title,
          apiKeyId: projectApiKeyId,
          code,
          giftData,
        };
        if (description !== undefined) body.description = description;
        if (maxTotalRedemptions !== undefined)
          body.maxTotalRedemptions = maxTotalRedemptions;
        if (maxRedemptionsPerUser !== undefined)
          body.maxRedemptionsPerUser = maxRedemptionsPerUser;
        if (expiresAt !== undefined) body.expiresAt = expiresAt;
        const result = await client.post("/api/v1/admin/gift-codes", body);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_giftcodes_update",
    {
      title: "Update Gift Code",
      description: describeTool(
        {
          summary:
            "Updates an existing gift code's title, description, rewards, redemption caps or expiry; each passed field replaces the stored value, omitted fields stay unchanged.",
          use: "extending an expiry, raising a cap or correcting rewards of a live code.",
          avoid:
            "changing the code value (not possible: create a new code with horizon_admin_giftcodes_create) or stopping redemptions (use horizon_admin_giftcodes_revoke).",
          requires: `gift code id from horizon_admin_giftcodes_list; ${SCOPE_ACCOUNT}`,
          effects:
            "Overwrites the passed fields; later redemptions use the new values, past redemptions are not changed. Fields cannot be cleared back to empty or unlimited.",
          returns:
            "The updated gift code with the same fields as horizon_admin_giftcodes_get.",
          errors:
            NOT_FOUND +
            " 400 for invalid giftData grants (not an array, empty, more than 10, duplicate or unknown cosmetic IDs): fix giftData.",
        },
        ADMIN_AUTH,
      ),
      annotations: DESTRUCTIVE_WRITE,
      inputSchema: {
        id: giftCodeIdSchema("to update"),
        title: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe("New display title, 1 to 100 characters. Omit to keep"),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("New internal description, max 500 characters. Omit to keep"),
        giftData: z
          .string()
          .optional()
          .describe("New reward payload as a JSON string; replaces the whole payload. An optional \"grants\" array (1 to 10 distinct cosmetic IDs) is validated like on create. Omit to keep"),
        maxTotalRedemptions: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("New maximum number of redemptions across all players (positive integer). Omit to keep"),
        maxRedemptionsPerUser: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("New maximum number of redemptions per player (positive integer). Omit to keep"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe("New ISO-8601 expiry datetime, e.g. 2025-12-31T23:59:59Z. Omit to keep"),
      },
    },
    async ({
      id,
      title,
      description,
      giftData,
      maxTotalRedemptions,
      maxRedemptionsPerUser,
      expiresAt,
    }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = {};
        if (title !== undefined) body.title = title;
        if (description !== undefined) body.description = description;
        if (giftData !== undefined) body.giftData = giftData;
        if (maxTotalRedemptions !== undefined)
          body.maxTotalRedemptions = maxTotalRedemptions;
        if (maxRedemptionsPerUser !== undefined)
          body.maxRedemptionsPerUser = maxRedemptionsPerUser;
        if (expiresAt !== undefined) body.expiresAt = expiresAt;
        const result = await client.put(
          `/api/v1/admin/gift-codes/${id}`,
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_giftcodes_delete",
    {
      title: "Delete Gift Code",
      description: describeTool(
        {
          summary:
            "Deletes a gift code by UUID (soft delete): it can no longer be redeemed, disappears from lists and statistics, and frees its plan slot.",
          use: "removing a code for good or freeing a slot when horizon_admin_giftcodes_getLimits shows none left.",
          avoid:
            "only stopping redemptions while keeping the record and its history (use horizon_admin_giftcodes_revoke).",
          requires: `gift code id from horizon_admin_giftcodes_list; ${SCOPE_ACCOUNT}`,
          effects:
            "Irreversible through the API: the code is marked deleted and inactive and its code value gets a _DELETED_ suffix, so the same code value can be created again.",
          returns: "null (HTTP 204 with an empty body) on success.",
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: giftCodeIdSchema("to delete"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/gift-codes/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_giftcodes_revoke",
    {
      title: "Revoke Gift Code",
      description: describeTool(
        {
          summary:
            "Revokes a gift code so every further redeem attempt is rejected, while the code, its redemption history and the revocation reason stay visible.",
          use: "stopping a leaked or mistaken code immediately while keeping its record.",
          avoid:
            "removing the code and freeing its slot (use horizon_admin_giftcodes_delete) or only shortening its lifetime (set expiresAt with horizon_admin_giftcodes_update).",
          requires: `gift code id from horizon_admin_giftcodes_list; ${SCOPE_ACCOUNT}`,
          effects:
            "Sets isRevoked, the revocation time and revokedReason. There is no tool to undo a revocation. A revoked code still uses a plan slot until it is deleted. A repeat call only overwrites the time and reason.",
          returns: "null (HTTP 204 with an empty body) on success.",
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: giftCodeIdSchema("to revoke"),
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Revocation reason shown as revokedReason, max 500 characters (sent as a query parameter). Optional"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id, reason }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const qs =
          reason !== undefined
            ? `?reason=${encodeURIComponent(reason)}`
            : "";
        const result = await client.post(
          `/api/v1/admin/gift-codes/${id}/revoke${qs}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_giftcodes_getStats",
    {
      title: "Get Gift Code Statistics",
      description: describeTool(
        {
          summary:
            "Returns account-wide gift code counters: total, active, revoked and expired codes plus the total number of redemptions, over all Project API keys.",
          use: "a quick overview of gift code usage.",
          avoid:
            "per-code numbers (use horizon_admin_giftcodes_list or _get) or the remaining plan slots (use horizon_admin_giftcodes_getLimits).",
          requires: SCOPE_ACCOUNT,
          effects: "None (read only).",
          returns:
            "{totalCodes, activeCodes, revokedCodes, expiredCodes, totalRedemptions} over non-deleted codes; activeCodes counts only codes that are still redeemable (not revoked, not expired). All zero when the account has no codes.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(IGNORED_PROJECT_FILTER),
      },
      annotations: READ_ONLY,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/gift-codes/statistics",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_giftcodes_getLimits",
    {
      title: "Get Gift Code Limits",
      description: describeTool(
        {
          summary:
            "Returns how many more gift codes the account may create under its plan: plan role, remaining slots and whether creating is possible.",
          use: "before horizon_admin_giftcodes_create, or after a 403 limit error from it.",
          avoid: "usage counters (use horizon_admin_giftcodes_getStats).",
          requires: SCOPE_ACCOUNT,
          effects: "None (read only).",
          returns:
            "{role, remainingSlots, canCreateMore}; slots are counted per account over all non-deleted active codes (revoked and expired codes included), so delete codes to free slots.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(IGNORED_PROJECT_FILTER),
      },
      annotations: READ_ONLY,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/gift-codes/limits",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
