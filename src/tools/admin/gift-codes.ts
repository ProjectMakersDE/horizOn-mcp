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
} from "./_utils.js";

export function registerAdminGiftCodesTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_giftcodes_list",
    {
      title: "List Gift Codes",
      description:
        "Lists gift codes for the authenticated account. The backend paginates and returns non-deleted codes; the projectApiKeyId filter is applied client-side by the caller if needed (the list endpoint itself is account-scoped).",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key. Currently the backend list endpoint does not filter by project — this parameter is reserved for forward-compat.",
          ),
        page: z.number().int().min(0).default(0).describe("0-based page index"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("items per page (1-100)"),
      },
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
      description:
        "Fetches a single gift code by its UUID, including gift data, redemption counters, revocation status and expiration.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the gift code to fetch"),
      },
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
      description:
        "Creates a new gift code linked to a specific project API key. The code value is immutable once created; use update to change title/description/rewards/limits/expiration.",
      inputSchema: {
        title: z
          .string()
          .min(1)
          .max(100)
          .describe("Display title (1-100 chars)"),
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key this code belongs to"),
        code: z
          .string()
          .min(3)
          .max(50)
          .regex(/^[A-Z0-9]+$/)
          .describe(
            "Redemption code (3-50 chars, uppercase letters and digits only, e.g. HALLOWEEN2025)",
          ),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("Optional description (<= 500 chars)"),
        giftData: z
          .string()
          .describe(
            'JSON string with the reward payload, e.g. {"gold":100,"crystals":50}',
          ),
        maxTotalRedemptions: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional overall redemption cap"),
        maxRedemptionsPerUser: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Optional per-user redemption cap"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe(
            "Optional ISO-8601 datetime when the code expires (omit for no expiration)",
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
      description:
        "Updates mutable properties of an existing gift code. Only the provided fields are changed. The code value itself cannot be changed — create a new gift code instead.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the gift code to update"),
        title: z
          .string()
          .min(1)
          .max(100)
          .optional()
          .describe("New title (1-100 chars)"),
        description: z
          .string()
          .max(500)
          .optional()
          .describe("New description (<= 500 chars)"),
        giftData: z
          .string()
          .optional()
          .describe("New gift data JSON string"),
        maxTotalRedemptions: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("New overall redemption cap"),
        maxRedemptionsPerUser: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("New per-user redemption cap"),
        expiresAt: z
          .string()
          .datetime()
          .optional()
          .describe("New ISO-8601 expiration datetime"),
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
      description:
        "Soft-deletes a gift code. Deleted codes are no longer redeemable and disappear from list results.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the gift code to delete"),
      },
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
      description:
        "Revokes a gift code so no further redemptions are accepted. The code is kept (unlike delete) but rejects new redeem attempts. The optional reason is forwarded to the backend as a query parameter.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the gift code to revoke"),
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Optional revocation reason"),
      },
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
      description:
        "Returns aggregated gift code statistics for the authenticated account (total, active, revoked, expired, redemptions). Note: the current backend endpoint is account-scoped and does not accept a project filter; projectApiKeyId is reserved for forward-compat.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key. Currently ignored by the backend; kept for forward-compat.",
          ),
      },
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
      description:
        "Returns the gift code limits and current usage for the authenticated account (role, remainingSlots, canCreateMore). Note: the current backend endpoint is account-scoped and does not accept a project filter; projectApiKeyId is reserved for forward-compat.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key. Currently ignored by the backend; kept for forward-compat.",
          ),
      },
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
