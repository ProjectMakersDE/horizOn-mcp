/**
 * Admin tools for the evidence review of Validated Actions (Part 3, TASK-888,
 * sus packages and package export TASK-911).
 *
 * Wrap /api/v1/admin/validated-actions/evidence: review list (top N records or
 * sus packages), slot quota, metadata, log download, package export and
 * delete. The server maps the whole prefix to the account-key feature group
 * LEADERBOARD: full-account and LEADERBOARD keys reach every endpoint,
 * project-scoped keys the list, get, log download and package export with
 * their own Project API key (projectApiKeyId); delete stays denied for them.
 *
 * Board keys are only unique within one Project API key, so the list sends a
 * leaderboardKey only together with projectApiKeyId (the server answers
 * 400 API_KEY_REQUIRED otherwise), and the record tools accept an optional
 * projectApiKeyId that must own the record's board.
 *
 * Moderation (bans, shadow bans, reset, archives) is not wrapped here: the
 * Validated Actions spec lists no mcp tools for it, it stays in the Dashboard.
 *
 * All tools require HORIZON_ACCOUNT_API_KEY.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
import { computeInputLogHash } from "../validated-actions.js";

export const EVIDENCE_ADMIN_PATH = "/api/v1/admin/validated-actions/evidence";

/** Header of the log download that carries the SHA-256 of the stored log (hex). */
export const LOG_HASH_HEADER = "X-Input-Log-Hash";

/** Package export headers (E911): `ok` or `mismatch`, and the SHA-256 of manifest.json (hex). */
export const PACKAGE_INTEGRITY_HEADER = "X-Package-Integrity";
export const PACKAGE_MANIFEST_HEADER = "X-Package-Manifest-Sha256";

/** File name the server gives a package (Content-Disposition), used as the default output file. */
export function packageFileName(runId: string): string {
  return `${runId}.hzn-va-package.zip`;
}

const SCOPE_BY_ID =
  "an Account Key with full-account access or the LEADERBOARD feature group; project-scoped keys are denied (403) for ID-based calls.";

const SCOPE_READ_BY_ID =
  "an Account Key with full-account access or the LEADERBOARD feature group; a project-scoped key must pass its own projectApiKeyId (the run must belong to it, else 404).";

const ERROR_NOTE = "Error results name the server code, for example (HTTP 404, code EVIDENCE_NOT_FOUND).";

const runIdSchema = z
  .string()
  .uuid()
  .describe("runId (UUID) of the evidence record, from horizon_admin_validated_evidence_list or a horizon_submit_validated result");

const recordApiKeySchema = z
  .string()
  .uuid()
  .optional()
  .describe(
    "UUID of the Project API key the record's board belongs to (from horizon_admin_projects_list or the apiKeyId of a list item; sent as apiKeyId). Optional; when set, a record of another API key answers 404 EVIDENCE_NOT_FOUND",
  );

function evidenceRunPath(runId: string): string {
  return `${EVIDENCE_ADMIN_PATH}/${encodeURIComponent(runId)}`;
}

/** Query parameters that scope a record call to one Project API key. */
export function apiKeyParams(projectApiKeyId: string | undefined): Record<string, string> | undefined {
  return projectApiKeyId === undefined ? undefined : { apiKeyId: projectApiKeyId };
}

/** Error text when a board key comes without its Project API key (no request is sent). */
export const API_KEY_REQUIRED_MESSAGE =
  "API_KEY_REQUIRED: leaderboardKey needs projectApiKeyId, because the same board key can exist under several Project API keys of the account; " +
  "pass the key from horizon_admin_projects_list (no request sent)";

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

/**
 * Builds the package export result: where the ZIP was written, its size and
 * SHA-256, and the server's integrity headers. integrityOk is null when the
 * server sent no integrity header.
 */
export function describeExportedPackage(
  runId: string,
  path: string,
  bytes: Uint8Array,
  integrityHeader: string | null,
  manifestHeader: string | null,
): Record<string, unknown> {
  const integrity = integrityHeader ? integrityHeader.trim().toLowerCase() : null;
  return {
    runId,
    path,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    integrity,
    integrityOk: integrity === null ? null : integrity === "ok",
    manifestSha256: manifestHeader ? manifestHeader.trim().toLowerCase() : null,
  };
}

export function registerAdminValidatedActionsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_validated_evidence_list",
    {
      title: "List Validated Run Evidence",
      description: describeTool(
        {
          summary:
            "Lists the Validated Actions evidence records (top N or flagged runs, or with sus true the sus packages), newest request first, with filters and paging.",
          use: "reviewing suspicious or top runs: find records, see which logs were uploaded, then fetch one with horizon_admin_validated_evidence_get, _download or _export.",
          avoid: "the slot usage of the account (use horizon_admin_validated_evidence_quota) or one known run (use horizon_admin_validated_evidence_get).",
          requires:
            "an Account Key with full-account access or the LEADERBOARD feature group; a project-scoped key must pass its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            "{items, page, size, totalElements}; each item has runId, apiKeyId, leaderboardId, leaderboardKey, userId, username, score, " +
            "flag (FlagReason name or null), status (REQUESTED or UPLOADED), bytes (null while requested), requestedAt, uploadBefore (only while requested), uploadedAt, " +
            "and sus (true when the run also has a sus package). With sus true the items are sus packages: kind \"SUS\", sus true, status REQUESTED, UPLOADED or EXPIRED (state of the input log), " +
            "retainedUntil (deleted after that), packageBytes, missing (parts that were not captured, for example cloudSave:OMITTED_SIZE_LIMIT, startContext:SKIPPED_CAPACITY, inputLog:EXPIRED); " +
            "leaderboardId and leaderboardKey are null for a run without board. An empty items array means no evidence matches the filters.",
          errors:
            "400 API_KEY_REQUIRED when leaderboardKey comes without projectApiKeyId (checked before any request): add the key. " +
            "400 INVALID_STATUS or INVALID_LIMIT for a bad filter or page size (EXPIRED without sus true is refused before any request): fix the parameter. 404 API_KEY_NOT_FOUND for an unknown projectApiKeyId: list the keys with horizon_admin_projects_list. " +
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
          .describe("Board key (1 to 64 characters: a-z, 0-9, _ and -). Optional; requires projectApiKeyId, because board keys are only unique within one Project API key"),
        status: z
          .enum(["REQUESTED", "UPLOADED", "EXPIRED"])
          .optional()
          .describe("Status filter: REQUESTED (log not uploaded yet), UPLOADED (ready to download) or, with sus true only, EXPIRED (log never uploaded). Omit for all"),
        sus: z
          .boolean()
          .optional()
          .describe("true lists the sus packages (accepted runs that crossed a soft threshold) instead of the top N records. Omit or false for the top N list"),
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z.number().int().min(1).max(100).default(20).describe("Items per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
    },
    async ({ projectApiKeyId, leaderboardKey, status, sus, page, size }) => {
      if (leaderboardKey !== undefined && projectApiKeyId === undefined) {
        return { content: [{ type: "text" as const, text: API_KEY_REQUIRED_MESSAGE }], isError: true };
      }
      if (status === "EXPIRED" && sus !== true) {
        return {
          content: [{ type: "text" as const, text: "INVALID_STATUS: status EXPIRED exists only for sus packages; pass sus: true (no request sent)" }],
          isError: true,
        };
      }
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = { page: String(page), size: String(size) };
        if (projectApiKeyId !== undefined) params.apiKeyId = projectApiKeyId;
        if (leaderboardKey !== undefined) params.leaderboardKey = leaderboardKey;
        if (status !== undefined) params.status = status;
        if (sus === true) params.sus = "true";
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
            "{used, limit, full, topNAllocated, maxBytes, sus}. limit is the tier's evidenceSlots (shared by all API keys and boards), topNAllocated the sum of evidenceTopN over all boards, maxBytes the largest accepted log. " +
            "sus is {used, limit, full, maxPackageBytes, retentionDays, dropped, droppedSince, contextBufferUsed, contextBufferLimit}: the sus package slots, their largest size and retention, " +
            "how many sus packages were dropped since droppedSince because the slots were full, and the run start context buffer. " +
            "While full is true no new log is requested (no new sus package is kept while sus.full is true): free slots with horizon_admin_validated_evidence_delete.",
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
          summary: "Returns the metadata of one evidence record by runId, including the run's server seed, the committed input log hash and, for a sus run, the sus package details.",
          use: "replaying a run: combine seed and logHash from here with the log from horizon_admin_validated_evidence_download, or check a sus package before exporting it with horizon_admin_validated_evidence_export.",
          avoid: "browsing many records (use horizon_admin_validated_evidence_list), the log bytes (use horizon_admin_validated_evidence_download) or the whole package (use horizon_admin_validated_evidence_export).",
          requires: SCOPE_READ_BY_ID,
          effects: "None (read only).",
          returns:
            "The list item fields (runId, leaderboardKey, userId, username, score, flag, status, bytes, requestedAt, uploadBefore, uploadedAt, sus) plus seed (the ticket's server seed), logHash (SHA-256 hex committed at submit), " +
            "kind (TOP_N or SUS) and susPackage (null without package): {evidenceStatus, uploadBefore, uploadedAt, createdAt, retainedUntil, bytes, flags, stage, durationMs, serverStartedAt, submittedAt, earned, " +
            "startContext, startContextSha256, rules {sha256, source, status}, client {gameVersion, contentVersion, simulationVersion, replayFormatVersion, contentDigest}, " +
            "parts [{name, status, bytes, sha256, revision}] for cloudSave, initialState, rules and inputLog}. Rule contents are only in the exported package.",
          errors:
            "404 EVIDENCE_NOT_FOUND for an unknown or deleted runId, or a record outside projectApiKeyId: look it up with horizon_admin_validated_evidence_list. " +
            "404 API_KEY_NOT_FOUND for a projectApiKeyId outside the account. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: { runId: runIdSchema, projectApiKeyId: recordApiKeySchema },
      annotations: READ_ONLY,
    },
    async ({ runId, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(evidenceRunPath(runId), apiKeyParams(projectApiKeyId));
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
          avoid: "records still REQUESTED (nothing to download yet), metadata only (use horizon_admin_validated_evidence_get) or the whole sus package (use horizon_admin_validated_evidence_export).",
          requires: SCOPE_READ_BY_ID + " Also serves the input log of a sus package.",
          effects: "None (read only).",
          returns:
            "format base64 (default): {runId, bytes, logHash, computedHash, hashMatches, logBase64}; format hash: the same without logBase64. " +
            "logHash comes from the server's X-Input-Log-Hash header, computedHash is the SHA-256 of the downloaded bytes, hashMatches false means the stored log is corrupt.",
          errors:
            "404 EVIDENCE_NOT_UPLOADED while the record is still REQUESTED: wait for the game to upload it (window 24 hours). 404 EVIDENCE_NOT_FOUND for an unknown or deleted runId, or a record outside projectApiKeyId. " +
            "404 API_KEY_NOT_FOUND for a projectApiKeyId outside the account. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        runId: runIdSchema,
        projectApiKeyId: recordApiKeySchema,
        format: z
          .enum(["base64", "hash"])
          .default("base64")
          .describe("base64 (default): include the log bytes as base64; hash: return only size and hashes"),
      },
      annotations: READ_ONLY,
    },
    async ({ runId, projectApiKeyId, format }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const { bytes, headers } = await client.getBytes(`${evidenceRunPath(runId)}/log`, apiKeyParams(projectApiKeyId));
        return jsonResponse(describeDownloadedLog(runId, bytes, headers.get(LOG_HASH_HEADER), format));
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_validated_evidence_export",
    {
      title: "Export Validated Run Evidence Package",
      description: describeTool(
        {
          summary:
            "Exports the review package of one validated run as a ZIP file (manifest, start context, rules, captured bytes, SHA256SUMS) and writes it to a local file.",
          use: "a sus run (or a top N record) needs an offline review or replay: the ZIP holds everything the server captured, with integrity checks done at export.",
          avoid: "only the metadata (use horizon_admin_validated_evidence_get) or only the input log (use horizon_admin_validated_evidence_download).",
          requires: SCOPE_READ_BY_ID + " The MCP process must be allowed to write to outputPath.",
          effects:
            "Nothing changes on the server. Writes the ZIP to outputPath (default <working directory>/<runId>.hzn-va-package.zip), creating missing folders; an existing file is only replaced with overwrite true.",
          returns:
            "{runId, path, bytes, sha256, integrity, integrityOk, manifestSha256}. path is the absolute file path, sha256 the SHA-256 of the written ZIP, " +
            "integrity the server's X-Package-Integrity header (ok, or mismatch when a part no longer matches the digest bound at run start or submit; the reasons are in manifest.json integrity.checks), " +
            "manifestSha256 the X-Package-Manifest-Sha256 header (SHA-256 of manifest.json). A top N record without package exports with kind TOP_N and the missing parts as NOT_CAPTURED.",
          errors:
            "FILE_EXISTS when outputPath exists and overwrite is not true (checked before any request): pass overwrite true or another path. WRITE_FAILED when the file cannot be written. " +
            "404 EVIDENCE_NOT_FOUND for an unknown or deleted runId, or a run outside projectApiKeyId: look it up with horizon_admin_validated_evidence_list. " +
            "404 API_KEY_NOT_FOUND for a projectApiKeyId outside the account. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        runId: runIdSchema,
        projectApiKeyId: recordApiKeySchema,
        outputPath: z
          .string()
          .min(1)
          .max(4096)
          .optional()
          .describe(
            "File path for the ZIP, absolute or relative to the working directory of the MCP server. Default: <working directory>/<runId>.hzn-va-package.zip",
          ),
        overwrite: z
          .boolean()
          .default(false)
          .describe("true replaces an existing file at outputPath; false (default) refuses with FILE_EXISTS before any request"),
      },
      annotations: ADDITIVE_WRITE,
    },
    async ({ runId, projectApiKeyId, outputPath, overwrite }) => {
      const path = resolve(outputPath ?? packageFileName(runId));
      if (!overwrite && existsSync(path)) {
        return {
          content: [{ type: "text" as const, text: `FILE_EXISTS: ${path} already exists; pass overwrite: true or another outputPath (no request sent)` }],
          isError: true,
        };
      }
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      let download: { bytes: Uint8Array; headers: Headers };
      try {
        download = await client.getBytes(`${evidenceRunPath(runId)}/package`, apiKeyParams(projectApiKeyId));
      } catch (e) {
        return errorResponse(e);
      }
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, download.bytes);
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e);
        return { content: [{ type: "text" as const, text: `WRITE_FAILED: could not write ${path}: ${reason}` }], isError: true };
      }
      return jsonResponse(
        describeExportedPackage(
          runId,
          path,
          download.bytes,
          download.headers.get(PACKAGE_INTEGRITY_HEADER),
          download.headers.get(PACKAGE_MANIFEST_HEADER),
        ),
      );
    },
  );

  server.registerTool(
    "horizon_admin_validated_evidence_delete",
    {
      title: "Delete Validated Run Evidence",
      description: describeTool(
        {
          summary: "Deletes one evidence record for good (top N record and sus package of the run, including the stored log) and frees their slots in the account quota; the leaderboard row stays.",
          use: "after a review is finished, or to free slots when horizon_admin_validated_evidence_quota reports full.",
          avoid: "removing the score itself: leaderboard moderation (remove entry, ban) is done in the dashboard.",
          requires: SCOPE_BY_ID,
          effects: "Deletes the record and its log; this cannot be undone. A second call for the same runId changes nothing and answers 404.",
          returns: "{runId, deleted: true}.",
          errors:
            "404 EVIDENCE_NOT_FOUND for an unknown or already deleted runId (nothing to do), or a record outside projectApiKeyId (nothing deleted). " +
            "404 API_KEY_NOT_FOUND for a projectApiKeyId outside the account. " +
            ERROR_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: { runId: runIdSchema, projectApiKeyId: recordApiKeySchema },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ runId, projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const query = projectApiKeyId === undefined ? "" : `?${new URLSearchParams({ apiKeyId: projectApiKeyId })}`;
        await client.delete(`${evidenceRunPath(runId)}${query}`);
        return jsonResponse({ runId, deleted: true });
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
