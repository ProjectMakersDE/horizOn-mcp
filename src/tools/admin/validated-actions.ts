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
import { getAdminClient, noAdminClientResponse, jsonResponse } from "./_utils.js";
import { errorResponse } from "../tool-helpers.js";
import { computeInputLogHash } from "../validated-actions.js";

export const EVIDENCE_ADMIN_PATH = "/api/v1/admin/validated-actions/evidence";

/** Header of the log download that carries the SHA-256 of the stored log (hex). */
export const LOG_HASH_HEADER = "X-Input-Log-Hash";

const READ = { readOnlyHint: true, openWorldHint: true } as const;

const SCOPE_NOTE =
  "Needs an account key with full-account access or the LEADERBOARD feature group; a project-scoped key may only call the review list with its own projectApiKeyId. ";

const ERROR_NOTE =
  "Error results name the server code, for example 404 EVIDENCE_NOT_FOUND. ";

const runIdSchema = z
  .string()
  .uuid()
  .describe("runId of the evidence record (from horizon_admin_validated_evidence_list or a submit result)");

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
      description:
        "Lists the evidence review of Validated Actions (input logs the server requested from top N or flagged runs), newest request first. " +
        "Returns {items, page, size, totalElements}; each item has runId, apiKeyId, leaderboardId, leaderboardKey, userId, username, score, " +
        "flag (FlagReason name or null), status (REQUESTED or UPLOADED), bytes (null while requested), requestedAt, uploadBefore (only while requested), uploadedAt. " +
        "Download an uploaded log with horizon_admin_validated_evidence_download. " +
        SCOPE_NOTE +
        "Errors: 400 INVALID_STATUS or INVALID_LIMIT, 404 API_KEY_NOT_FOUND. " +
        ERROR_NOTE,
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe("Optional UUID of the Project API key to filter by (sent as apiKeyId); required for a project-scoped account key"),
        leaderboardKey: z
          .string()
          .min(1)
          .max(64)
          .regex(/^[a-z0-9_-]+$/, "Lowercase alphanumeric with - or _")
          .optional()
          .describe("Optional board key; combine it with projectApiKeyId, otherwise boards with this key of every API key match"),
        status: z
          .enum(["REQUESTED", "UPLOADED"])
          .optional()
          .describe("Optional status filter: REQUESTED (log not uploaded yet) or UPLOADED"),
        page: z.number().int().min(0).default(0).describe("0-based page index"),
        size: z.number().int().min(1).max(100).default(20).describe("items per page (1-100)"),
      },
      annotations: READ,
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
      description:
        "Returns the evidence slots of the account: {used, limit, full, topNAllocated, maxBytes}. " +
        "limit is evidenceSlots of the tier (shared by all API keys and boards), topNAllocated the sum of evidenceTopN over all boards, maxBytes the largest log. " +
        "When full is true no new log is requested until slots are freed (delete reviewed evidence). The call recounts the slot counter. " +
        "Needs an account key with full-account access or the LEADERBOARD feature group. " +
        ERROR_NOTE,
      inputSchema: {},
      annotations: READ,
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
      description:
        "Returns one evidence record: the list item fields plus seed (the run ticket's server seed) and logHash (SHA-256 hex of the input log committed at submit), " +
        "everything needed to replay the run locally. " +
        "Needs an account key with full-account access or the LEADERBOARD feature group (not project-scoped). " +
        "Errors: 404 EVIDENCE_NOT_FOUND. " +
        ERROR_NOTE,
      inputSchema: { runId: runIdSchema },
      annotations: READ,
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
      description:
        "Downloads the uploaded input log of a run. format base64 (default) returns {runId, bytes, logHash, computedHash, hashMatches, logBase64}; " +
        "format hash returns the same without logBase64 (to check integrity without pulling the log into the conversation). " +
        "logHash comes from the server's X-Input-Log-Hash header, computedHash is the SHA-256 of the downloaded bytes. " +
        "Needs an account key with full-account access or the LEADERBOARD feature group (not project-scoped). " +
        "Errors: 404 EVIDENCE_NOT_UPLOADED (still REQUESTED), 404 EVIDENCE_NOT_FOUND. " +
        ERROR_NOTE,
      inputSchema: {
        runId: runIdSchema,
        format: z
          .enum(["base64", "hash"])
          .default("base64")
          .describe("base64: include the log bytes as base64; hash: only size and hashes"),
      },
      annotations: READ,
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
      description:
        "Deletes an evidence record (requested or uploaded) and frees its slot in the account quota. The leaderboard row stays; " +
        "use it after a review or to make room when the quota is full. Cannot be undone. " +
        "Needs an account key with full-account access or the LEADERBOARD feature group (not project-scoped). " +
        "Errors: 404 EVIDENCE_NOT_FOUND (unknown or already deleted). " +
        ERROR_NOTE,
      inputSchema: { runId: runIdSchema },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
      },
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
