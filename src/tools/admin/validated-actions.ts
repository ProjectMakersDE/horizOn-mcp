/**
 * Admin tools for the evidence review of Validated Actions (Part 3, TASK-888).
 *
 * Wrap /api/v1/admin/validated-actions/evidence: review list, slot quota,
 * metadata, log download and delete. The server maps the whole prefix to the
 * account-key feature group LEADERBOARD: full-account and LEADERBOARD keys
 * reach every endpoint, project-scoped keys only the list with their own
 * Project API key (projectApiKeyId); ID-based calls are denied for them.
 *
 * Moderation (bans, shadow bans, reset, archives) is not wrapped here: the
 * Validated Actions spec lists no mcp tools for it, it stays in the Dashboard.
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
import { computeInputLogHash } from "../validated-actions.js";

export const EVIDENCE_ADMIN_PATH = "/api/v1/admin/validated-actions/evidence";

/** Header of the log download that carries the SHA-256 of the stored log (hex). */
export const LOG_HASH_HEADER = "X-Input-Log-Hash";

const SCOPE_BY_ID =
  "an Account Key with full-account access or the LEADERBOARD feature group; project-scoped keys are denied (403) for ID-based calls.";

const ERROR_NOTE = "Error results name the server code, for example (HTTP 404, code EVIDENCE_NOT_FOUND).";

const runIdSchema = z
  .string()
  .uuid()
  .describe("runId (UUID) of the evidence record, from horizon_admin_validated_evidence_list or a horizon_submit_validated result");

function evidenceRunPath(runId: string): string {
  return `${EVIDENCE_ADMIN_PATH}/${encodeURIComponent(runId)}`;
}

/**
 * Builds the download result: byte count, the server's hash header, a
 * locally computed SHA-256 and whether both match. The log itself is
 * included as base64 only when asked for.
 */
export function describeDownloadedLog(
  runId: string,
  bytes: Uint8Array,
  serverHash: string | null,
  format: "base64" | "hash",
): Record<string, unknown> {
  const computedHash = computeInputLogHash(bytes);
  const logHash = serverHash ? serverHash.trim().toLowerCase() : null;
  const result: Record<string, unknown> = {
    runId,
    bytes: bytes.length,
    logHash,
    computedHash,
    hashMatches: logHash === null ? null : logHash === computedHash,
  };
  if (format === "base64") {
    result.logBase64 = Buffer.from(bytes).toString("base64");
  }
  return result;
}

export function registerAdminValidatedActionsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_validated_evidence_list",
    {
      title: "List Validated Run Evidence",
      description: describeTool(
        {
          summary:
            "Lists the Validated Actions evidence records (input logs the server requested from top N or flagged runs), newest request first, with filters and paging.",
          use: "reviewing suspicious or top runs: find records, see which logs were uploaded, then fetch one with horizon_admin_validated_evidence_get or _download.",
          avoid: "the slot usage of the account (use horizon_admin_validated_evidence_quota) or one known run (use horizon_admin_validated_evidence_get).",
          requires:
            "an Account Key with full-account access or the LEADERBOARD feature group; a project-scoped key must pass its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            "{items, page, size, totalElements}; each item has runId, apiKeyId, leaderboardId, leaderboardKey, userId, username, score, " +
            "flag (FlagReason name or null), status (REQUESTED or UPLOADED), bytes (null while requested), requestedAt, uploadBefore (only while requested), uploadedAt. " +
            "An empty items array means no evidence matches the filters.",
          errors:
            "400 INVALID_STATUS or INVALID_LIMIT for a bad filter or page size: fix the parameter. 404 API_KEY_NOT_FOUND for an unknown projectApiKeyId: list the keys with horizon_admin_projects_list. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe("UUID of the Project API key to filter by (from horizon_admin_projects_list; sent as apiKeyId). Optional, but required for a project-scoped Account Key"),
        leaderboardKey: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9_-]+$/, "Lowercase alphanumeric with - or _")
          .optional()
          .describe("Board key (1 to 64 characters: a-z, 0-9, _ and -). Optional; combine it with projectApiKeyId, otherwise boards with this key under every API key match"),
        status: z
          .enum(["REQUESTED", "UPLOADED"])
          .optional()
          .describe("Status filter: REQUESTED (log not uploaded yet) or UPLOADED (ready to download). Omit for both"),
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z.number().int().min(1).max(100).default(20).describe("Items per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
    },
    async ({ projectApiKeyId, leaderboardKey, status, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = { page: String(page), size: String(size) };
        if (projectApiKeyId !== undefined) params.apiKeyId = projectApiKeyId;
        if (leaderboardKey !== undefined) params.leaderboardKey = leaderboardKey;
        if (status !== undefined) params.status = status;
        const result = await client.get(EVIDENCE_ADMIN_PATH, params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_evidence_quota",
    {
      title: "Get Evidence Quota",
      description: describeTool(
        {
          summary: "Returns the account's evidence slot usage for Validated Actions: used and total slots, whether the quota is full, the top N allocation and the largest log size.",
          use: "no new logs are requested, before raising a board's evidenceTopN in the dashboard, or to decide whether reviewed evidence should be deleted.",
          avoid: "listing the records themselves (use horizon_admin_validated_evidence_list).",
          requires: "an Account Key with full-account access or the LEADERBOARD feature group.",
          effects: "None for the data; the call recounts the stored slot counter so it matches the records.",
          returns:
            "{used, limit, full, topNAllocated, maxBytes}. limit is the tier's evidenceSlots (shared by all API keys and boards), topNAllocated the sum of evidenceTopN over all boards, maxBytes the largest accepted log. " +
            "While full is true no new log is requested: free slots with horizon_admin_validated_evidence_delete.",
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
        const result = await client.get(`${EVIDENCE_ADMIN_PATH}/quota`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_evidence_get",
    {
      title: "Get Validated Run Evidence",
      description: describeTool(
        {
          summary: "Returns the metadata of one evidence record by runId, including the run's server seed and the committed input log hash needed for a local replay.",
          use: "replaying a run: combine seed and logHash from here with the log from horizon_admin_validated_evidence_download.",
          avoid: "browsing many records (use horizon_admin_validated_evidence_list) or the log bytes (use horizon_admin_validated_evidence_download).",
          requires: SCOPE_BY_ID,
          effects: "None (read only).",
          returns: "The list item fields (runId, leaderboardKey, userId, username, score, flag, status, bytes, requestedAt, uploadBefore, uploadedAt) plus seed (the ticket's server seed) and logHash (SHA-256 hex committed at submit).",
          errors: "404 EVIDENCE_NOT_FOUND for an unknown or deleted runId: look it up with horizon_admin_validated_evidence_list. " + ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: { runId: runIdSchema },
      annotations: READ_ONLY,
    },
    async ({ runId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(evidenceRunPath(runId));
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_evidence_download",
    {
      title: "Download Validated Run Evidence Log",
      description: describeTool(
        {
          summary: "Downloads the uploaded input log of one validated run and checks it against the server's hash; returns the bytes as base64 or only their size and hashes.",
          use: "a record has status UPLOADED and the log is needed for a replay, or to verify integrity (format hash keeps the log out of the conversation).",
          avoid: "records still REQUESTED (nothing to download yet) or metadata only (use horizon_admin_validated_evidence_get).",
          requires: SCOPE_BY_ID,
          effects: "None (read only).",
          returns:
            "format base64 (default): {runId, bytes, logHash, computedHash, hashMatches, logBase64}; format hash: the same without logBase64. " +
            "logHash comes from the server's X-Input-Log-Hash header, computedHash is the SHA-256 of the downloaded bytes, hashMatches false means the stored log is corrupt.",
          errors:
            "404 EVIDENCE_NOT_UPLOADED while the record is still REQUESTED: wait for the game to upload it (window 24 hours). 404 EVIDENCE_NOT_FOUND for an unknown or deleted runId. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        runId: runIdSchema,
        format: z
          .enum(["base64", "hash"])
          .default("base64")
          .describe("base64 (default): include the log bytes as base64; hash: return only size and hashes"),
      },
      annotations: READ_ONLY,
    },
    async ({ runId, format }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const { bytes, headers } = await client.getBytes(`${evidenceRunPath(runId)}/log`);
        return jsonResponse(describeDownloadedLog(runId, bytes, headers.get(LOG_HASH_HEADER), format));
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_evidence_delete",
    {
      title: "Delete Validated Run Evidence",
      description: describeTool(
        {
          summary: "Deletes one evidence record for good (requested or uploaded, including its stored log) and frees its slot in the account quota; the leaderboard row stays.",
          use: "after a review is finished, or to free slots when horizon_admin_validated_evidence_quota reports full.",
          avoid: "removing the score itself: leaderboard moderation (remove entry, ban) is done in the dashboard.",
          requires: SCOPE_BY_ID,
          effects: "Deletes the record and its log; this cannot be undone. A second call for the same runId changes nothing and answers 404.",
          returns: "{runId, deleted: true}.",
          errors: "404 EVIDENCE_NOT_FOUND for an unknown or already deleted runId (nothing to do). " + ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: { runId: runIdSchema },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ runId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        await client.delete(evidenceRunPath(runId));
        return jsonResponse({ runId, deleted: true });
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
