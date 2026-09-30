/**
 * Admin tools for the configuration side of Validated Actions (TASK-881/887).
 *
 * Wrap /api/v1/admin/validated-actions/{rules,usage,runs,state}: the rule set
 * of a Project API key, the account's run capacity, recent runs and the
 * server-owned player state (read and support correction). The server maps
 * the whole prefix to the account-key feature group LEADERBOARD:
 * full-account and LEADERBOARD keys reach every endpoint, project-scoped
 * keys only the rule read and the run list with their own Project API key.
 * A state correction made with an Account Key is stored with the caller
 * `account-key:<id>`.
 *
 * The evidence review lives in ./validated-actions.ts.
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
  DESTRUCTIVE_WRITE,
} from "./_utils.js";

export const VALIDATED_ADMIN_PATH = "/api/v1/admin/validated-actions";

/** Largest safe integer the server accepts for balances (2^53 - 1). */
const MAX_BALANCE = 9_007_199_254_740_991;

const RUN_STATUSES = ["OPEN", "EXPIRED", "ACCEPTED", "REJECTED", "FAILED"] as const;

const ERROR_NOTE = "Error results name the server code, for example (HTTP 404, code API_KEY_NOT_FOUND).";

const FULL_SCOPE = "an Account Key with full-account access or the LEADERBOARD feature group; project-scoped keys are denied (403).";

const projectApiKeyIdSchema = z
  .string()
  .uuid()
  .describe("UUID of the Project API key whose rules apply (from horizon_admin_projects_list; sent as apiKeyId)");

const userIdSchema = z
  .string()
  .uuid()
  .describe("UUID of the player (end-user), from horizon_admin_users_list or a leaderboard entry");

const optionalProjectFilter = z
  .string()
  .uuid()
  .optional()
  .describe("UUID of the player's Project API key (sent as apiKeyId). Optional; when given it must match the player, else 404");

function statePath(userId: string): string {
  return `${VALIDATED_ADMIN_PATH}/state/${encodeURIComponent(userId)}`;
}

export function registerAdminValidatedActionsConfigTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_validated_rules_get",
    {
      title: "Get Validated Actions Rules",
      description: describeTool(
        {
          summary:
            "Returns the Validated Actions rule set of one Project API key (the defaults when none is saved), with its size and the plan limits for rules.",
          use: "before changing the rules with horizon_admin_validated_rules_set (edit the returned rules object and send it back), or to explain why runs were rejected.",
          avoid: "recent runs and their rejection codes (use horizon_admin_validated_runs_list) or a player's balances (use horizon_admin_validated_state_get).",
          requires:
            "an Account Key with full-account access or the LEADERBOARD feature group; a project-scoped key only for its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            "{apiKeyId, configured, rules, sizeBytes, updatedAt, limits}. rules has formatVersion, ticketLifetimeSeconds, maxRunsPerPlayerPerHour, defaults, leaderboards (per board key) and values (server-owned value rules); null rule fields are omitted. " +
            "configured false means the defaults are shown and updatedAt is null. limits lists runsPerHour, stateKeys, maxRuleSetBytes, the ticket lifetime range, maxRunsPerPlayerPerHour, maxStagesPerBlock, maxStagesTotal and maxLeaderboardOverrides.",
          errors: "404 API_KEY_NOT_FOUND for an unknown or foreign projectApiKeyId: list the keys with horizon_admin_projects_list. " + ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: { projectApiKeyId: projectApiKeyIdSchema },
      annotations: READ_ONLY,
    },
    async ({ projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(`${VALIDATED_ADMIN_PATH}/rules`, { apiKeyId: projectApiKeyId });
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_rules_set",
    {
      title: "Replace Validated Actions Rules",
      description: describeTool(
        {
          summary:
            "Replaces the whole Validated Actions rule set of one Project API key (score limits, durations, stage rules, soft thresholds and server-owned values).",
          use: "changing the rules: read them with horizon_admin_validated_rules_get, change the rules object, send the complete object here.",
          avoid: "going back to the defaults (use horizon_admin_validated_rules_delete) or small reads (use horizon_admin_validated_rules_get).",
          requires: FULL_SCOPE,
          effects:
            "Overwrites the stored rule set; fields left out fall back to their defaults and the old values are gone. New runs use the new rules at once, running tickets are checked against them at submit. Sending the same object again changes nothing.",
          returns: "The same body as horizon_admin_validated_rules_get: {apiKeyId, configured: true, rules, sizeBytes, updatedAt, limits}.",
          errors:
            "400 INVALID_RULES names the field path in the message (a range, pattern or unknown field, formatVersion not 1, minScore above maxScore): fix that field. " +
            "400 RULES_TOO_LARGE above 65,536 bytes of normalized JSON. 403 STATE_KEY_LIMIT_REACHED when values has more keys than the plan allows. " +
            "404 API_KEY_NOT_FOUND for an unknown projectApiKeyId. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: projectApiKeyIdSchema,
        rules: z
          .record(z.string(), z.unknown())
          .describe(
            "Complete rule set object, formatVersion 1, for example {\"formatVersion\": 1, \"defaults\": {\"maxScore\": 1000000, \"minDurationSeconds\": 30}}. Parsed strictly: integers only, unknown fields rejected",
          ),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ projectApiKeyId, rules }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.put(`${VALIDATED_ADMIN_PATH}/rules`, { apiKeyId: projectApiKeyId, rules });
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_rules_delete",
    {
      title: "Delete Validated Actions Rules",
      description: describeTool(
        {
          summary: "Deletes the saved Validated Actions rule set of one Project API key, so its runs are checked against the default rules again.",
          use: "a rule set should be reset completely; horizon_admin_validated_rules_get then shows configured false.",
          avoid: "changing single rules (use horizon_admin_validated_rules_set with the edited object).",
          requires: FULL_SCOPE,
          effects:
            "Removes the stored rules, including the server-owned value definitions; balances stay stored but values without a definition are no longer listed or credited. Repeating the call changes nothing.",
          returns: "{projectApiKeyId, deleted: true}.",
          errors: "404 API_KEY_NOT_FOUND for an unknown projectApiKeyId. " + ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: { projectApiKeyId: projectApiKeyIdSchema },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        await client.delete(`${VALIDATED_ADMIN_PATH}/rules?apiKeyId=${encodeURIComponent(projectApiKeyId)}`);
        return jsonResponse({ projectApiKeyId, deleted: true });
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_usage_get",
    {
      title: "Get Validated Run Usage",
      description: describeTool(
        {
          summary: "Returns the account's Validated Actions run capacity for the current UTC hour: runs started so far and the plan limit.",
          use: "players get RUN_CAPACITY_REACHED, or to check the headroom before a launch or an event.",
          avoid: "the runs themselves (use horizon_admin_validated_runs_list) or the per player limit (maxRunsPerPlayerPerHour in horizon_admin_validated_rules_get).",
          requires: FULL_SCOPE,
          effects: "None (read only).",
          returns: "{runsThisHour, runsPerHourLimit, windowStartsAt, windowEndsAt}; the counter is shared by all Project API keys of the account and restarts every full UTC hour.",
          errors: ERROR_NOTE,
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
        const result = await client.get(`${VALIDATED_ADMIN_PATH}/usage`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_runs_list",
    {
      title: "List Validated Runs",
      description: describeTool(
        {
          summary: "Lists the recent Validated Actions runs of one Project API key, newest first, with status, rejection reason, score, stage and measured duration.",
          use: "finding out why runs were rejected (reason is the rule code) or checking that a game integration starts and submits runs.",
          avoid: "the stored input logs (use horizon_admin_validated_evidence_list) or the rule values (use horizon_admin_validated_rules_get).",
          requires:
            "an Account Key with full-account access or the LEADERBOARD feature group; a project-scoped key only for its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            "{runs: [{runId, userId, leaderboardKey, status, reason, score, stage, durationSeconds, issuedAt, expiresAt, consumedAt}]}. " +
            "status is OPEN, EXPIRED, ACCEPTED, REJECTED or FAILED; reason is the rule or ticket code of a rejected run. Runs are kept only for hours; an empty list means none in that window.",
          errors:
            "400 INVALID_STATUS or INVALID_LIMIT for a bad filter. 404 API_KEY_NOT_FOUND for an unknown projectApiKeyId: list the keys with horizon_admin_projects_list. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: projectApiKeyIdSchema,
        status: z
          .enum(RUN_STATUSES)
          .optional()
          .describe("Status filter (OPEN, EXPIRED, ACCEPTED, REJECTED or FAILED), applied to the newest 1,000 runs. Omit for all"),
        limit: z.number().int().min(1).max(100).default(50).describe("Maximum number of runs, 1 to 100 (default 50)"),
      },
      annotations: READ_ONLY,
    },
    async ({ projectApiKeyId, status, limit }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = { apiKeyId: projectApiKeyId, limit: String(limit) };
        if (status !== undefined) params.status = status;
        const result = await client.get(`${VALIDATED_ADMIN_PATH}/runs`, params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_state_get",
    {
      title: "Get Player Server-Owned Values",
      description: describeTool(
        {
          summary: "Returns a player's server-owned Validated Actions values (balances such as currency or loot counters), with today's credit, the daily caps and the last correction.",
          use: "support cases about a player's currency, before correcting a balance with horizon_admin_validated_state_correct.",
          avoid: "the value definitions (use horizon_admin_validated_rules_get) or the player's account data (use horizon_admin_users_get).",
          requires: FULL_SCOPE,
          effects: "None (read only).",
          returns:
            "{userId, apiKeyId, day, values: [{key, balance, earnedToday, dailyCap}], updatedAt, lastCorrection}. Every key defined in the rules is listed, sorted by key (balance 0 when never earned); dailyCap null means no cap. " +
            "updatedAt is null when nothing was stored yet, lastCorrection ({at, by, note}) is null until the first correction.",
          errors: "404 PLAYER_NOT_FOUND for a missing or deleted player, a player of another account, or a projectApiKeyId that does not match the player. " + ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: { userId: userIdSchema, projectApiKeyId: optionalProjectFilter },
      annotations: READ_ONLY,
    },
    async ({ userId, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = {};
        if (projectApiKeyId !== undefined) params.apiKeyId = projectApiKeyId;
        const result = await client.get(statePath(userId), params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_state_correct",
    {
      title: "Correct Player Server-Owned Values",
      description: describeTool(
        {
          summary: "Sets new balances for some of a player's server-owned Validated Actions values (support correction), with an optional note stored as the last correction.",
          use: "refunds or fixes after a support case; read the current balances with horizon_admin_validated_state_get first.",
          avoid: "crediting players through gameplay (only accepted validated runs do that, see horizon_submit_validated) or changing the value rules (use horizon_admin_validated_rules_set).",
          requires: FULL_SCOPE,
          effects:
            "Overwrites the balance of each listed key; other keys and today's credit stay. The time, the caller (account-key:<id>) and the note replace the previous last correction; the server log keeps every old and new balance. Sending the same values again changes nothing.",
          returns: "The same body as horizon_admin_validated_state_get, after the correction.",
          errors:
            "400 UNKNOWN_VALUE_KEY (key not defined in the rules, message names values[i].key), 400 DUPLICATE_VALUE_KEY, 400 INVALID_REQUEST (balance below 0 or above the value's maxBalance, note above 200 bytes): fix the input. " +
            "404 PLAYER_NOT_FOUND as for horizon_admin_validated_state_get. 409 STATE_CONFLICT when concurrent runs kept changing the state: retry. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        userId: userIdSchema,
        projectApiKeyId: optionalProjectFilter,
        values: z
          .array(
            z.object({
              key: z.string().min(1).max(24).describe("Value key defined in the rules, for example gold or chest.gold"),
              balance: z
                .number()
                .int()
                .min(0)
                .max(MAX_BALANCE)
                .describe("New balance, 0 to 9,007,199,254,740,991 and at most the value's maxBalance"),
            }),
          )
          .min(1)
          .max(64)
          .describe("Balances to set: 1 to 64 entries of {key, balance}, each key once"),
        note: z
          .string()
          .max(200)
          .optional()
          .describe("Why the balance changed, for example a support ticket number (at most 200 bytes UTF-8)"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ userId, projectApiKeyId, values, note }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const query = projectApiKeyId !== undefined ? `?apiKeyId=${encodeURIComponent(projectApiKeyId)}` : "";
        const body: Record<string, unknown> = { values };
        if (note !== undefined && note.trim() !== "") body.note = note;
        const result = await client.put(`${statePath(userId)}${query}`, body);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
