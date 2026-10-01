/**
 * Admin tools for managing end-users (the customers of a horizOn account's
 * application, not horizOn accounts themselves).
 *
 * These tools wrap the /api/v1/admin/user-management endpoints. All
 * per-user operations (list, get, activate, deactivate, delete) require
 * a projectApiKeyId because the backend scopes every user to a single
 * project API key and refuses the request otherwise. The statistics
 * endpoint is account-wide and takes no parameters.
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
  IDEMPOTENT_WRITE,
  DESTRUCTIVE_WRITE,
} from "./_utils.js";

const SCOPE_BY_ID =
  "an Account Key with full-account access or the USERS feature group; project-scoped keys are denied (403) for this call.";

const KEY_ERRORS =
  "403 with No API key found, API key does not belong to the current account or API key is not valid (revoked, expired, or inactive): pass an active projectApiKeyId from horizon_admin_projects_list.";

const USER_NOT_FOUND =
  "404 when the user id is unknown or belongs to another account: list the ids with horizon_admin_users_list.";

const USER_FIELDS =
  "{id, accountId, apiKeyId, name, email, isAnonymous, anonymousToken, isVerified, isActive, role, googleId, appleUserId, isPrivateRelayEmail, createdAt, updatedAt}";

const userIdSchema = (purpose: string) =>
  z
    .string()
    .uuid()
    .describe(`UUID of the end-user ${purpose} (id from horizon_admin_users_list, or the userId a player sign-in returns)`);

const projectKeySchema = z
  .string()
  .uuid()
  .describe(
    "UUID of an active Project API key of this account that the user signed up under (from horizon_admin_projects_list; sent as api-key)",
  );

export function registerAdminUsersTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_users_list",
    {
      title: "List End-Users",
      description: describeTool(
        {
          summary:
            "Lists the non-deleted end-users (players of your game, not horizOn accounts) of one Project API key, newest first, with paging.",
          use: "finding a user id, or reviewing sign-up, verification and activation state of players.",
          avoid: "one known user (use horizon_admin_users_get) or counts only (use horizon_admin_users_getStats).",
          requires:
            "projectApiKeyId from horizon_admin_projects_list; an Account Key with full-account access or the USERS feature group (a project-scoped key may list its own project).",
          effects: "None (read only).",
          returns:
            `{users, total, page, size}; each user has ${USER_FIELDS}. role is the numeric player role. ` +
            "An empty users array means the key has no users or the page is past the end.",
          errors: KEY_ERRORS,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe(
            "UUID of the Project API key whose users to list (from horizon_admin_projects_list; sent as api-key). The key must be active",
          ),
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
    async ({ projectApiKeyId, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/user-management/users",
          {
            page: String(page),
            size: String(size),
            "api-key": projectApiKeyId,
          },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_get",
    {
      title: "Get End-User",
      description: describeTool(
        {
          summary: "Fetches one end-user (player) by UUID with profile, login provider and activation state.",
          use: "checking whether a player is verified, active or anonymous before activating, deactivating or deleting them.",
          avoid: "searching or browsing players (use horizon_admin_users_list).",
          requires: `user id from horizon_admin_users_list; projectApiKeyId from horizon_admin_projects_list; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns: `${USER_FIELDS}; apiKeyId is null here (it is only filled in list results).`,
          errors: `${USER_NOT_FOUND} ${KEY_ERRORS}`,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: userIdSchema("to fetch"),
        projectApiKeyId: projectKeySchema,
      },
      annotations: READ_ONLY,
    },
    async ({ id, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/user-management/users/${id}`,
          { "api-key": projectApiKeyId },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_activate",
    {
      title: "Activate End-User",
      description: describeTool(
        {
          summary:
            "Reactivates a deactivated end-user so the player can sign in again; the counterpart of horizon_admin_users_deactivate.",
          use: "lifting a block set with horizon_admin_users_deactivate.",
          avoid: "restoring a deleted user (not possible) or blocking a player (use horizon_admin_users_deactivate).",
          requires: `user id from horizon_admin_users_list; projectApiKeyId from horizon_admin_projects_list; ${SCOPE_BY_ID}`,
          effects:
            "Sets isActive to true and clears the deactivation time and reason. Sessions revoked by the deactivation stay revoked: the player signs in again. Repeating the call changes nothing more.",
          returns: `The updated user: ${USER_FIELDS}.`,
          errors: `${USER_NOT_FOUND} ${KEY_ERRORS}`,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: userIdSchema("to activate"),
        projectApiKeyId: projectKeySchema,
      },
      annotations: IDEMPOTENT_WRITE,
    },
    async ({ id, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const path = `/api/v1/admin/user-management/users/${id}/activate?api-key=${encodeURIComponent(projectApiKeyId)}`;
        const result = await client.patch(path);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_deactivate",
    {
      title: "Deactivate End-User",
      description: describeTool(
        {
          summary:
            "Deactivates an end-user: signs the player out everywhere and blocks every sign-in until horizon_admin_users_activate; the user's data is kept.",
          use: "temporarily blocking a player, for example during an abuse review.",
          avoid: "removing the player and their data for good (use horizon_admin_users_delete).",
          requires: `user id from horizon_admin_users_list; projectApiKeyId from horizon_admin_projects_list; ${SCOPE_BY_ID}`,
          effects:
            "Sets isActive to false, stores the time and reason and revokes all sessions of the user immediately. Reversible with horizon_admin_users_activate; a repeat call only overwrites the time and reason.",
          returns: `The updated user: ${USER_FIELDS}.`,
          errors: `${USER_NOT_FOUND} ${KEY_ERRORS}`,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: userIdSchema("to deactivate"),
        projectApiKeyId: projectKeySchema,
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Internal deactivation reason, max 500 characters (sent in the request body). Optional"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id, projectApiKeyId, reason }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const path = `/api/v1/admin/user-management/users/${id}/deactivate?api-key=${encodeURIComponent(projectApiKeyId)}`;
        const body: Record<string, unknown> = {};
        if (reason !== undefined) body.reason = reason;
        const result = await client.patch(path, body);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_delete",
    {
      title: "Delete End-User",
      description: describeTool(
        {
          summary:
            "Deletes an end-user of one Project API key: the account is soft deleted, all sessions are revoked and the player's cloud saves and Validated Actions state are erased.",
          use: "removing a player for good, for example on a data deletion request.",
          avoid: "a temporary block (use horizon_admin_users_deactivate, which keeps all data).",
          requires:
            "user id from horizon_admin_users_list; projectApiKeyId of the key the user signed up under (from horizon_admin_projects_list); an Account Key with full-account access or the USERS feature group (a project-scoped key may delete users of its own project).",
          effects:
            "Irreversible: no tool restores the user. The user disappears from lists and statistics and cannot sign in; cloud saves and Validated Actions player state are deleted permanently.",
          returns: "null (HTTP 204 with an empty body) on success.",
          errors:
            "404 User not found when the id is unknown, belongs to another account or to another Project API key: check the user's key with horizon_admin_users_list. " +
            KEY_ERRORS,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: userIdSchema("to delete"),
        projectApiKeyId: z
          .string()
          .uuid()
          .describe(
            "UUID of the Project API key the user signed up under (from horizon_admin_projects_list; sent as api-key). It must match the user's key and be active",
          ),
        reason: z
          .string()
          .max(500)
          .optional()
          .describe("Internal deletion reason, max 500 characters (sent as a query parameter). Optional"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id, projectApiKeyId, reason }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params = new URLSearchParams({ "api-key": projectApiKeyId });
        if (reason !== undefined) params.set("reason", reason);
        const result = await client.delete(
          `/api/v1/admin/user-management/users/${id}?${params.toString()}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_users_getStats",
    {
      title: "Get End-User Statistics",
      description: describeTool(
        {
          summary:
            "Returns account-wide end-user counters over all Project API keys: total, active, deactivated, new in the last 30 days, and users per key.",
          use: "a quick overview of player numbers without loading user records.",
          avoid: "individual players (use horizon_admin_users_list).",
          requires: `no parameters; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns:
            "{totalUsers, activeUsers, deactivatedUsers, newUsersLast30Days, usersByApiKey}; deleted users are not counted. " +
            "usersByApiKey maps the Project API key value (the key string, not its UUID) to its user count.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/user-management/statistics",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
