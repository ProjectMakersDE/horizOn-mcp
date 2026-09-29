/**
 * Admin tools for crash reporting.
 *
 * Crash reports are grouped by a deduplication hash on the backend so
 * "crash groups" represent unique crash signatures with many
 * occurrences. These tools wrap the /api/v1/admin/crash-reports
 * endpoints and cover:
 *   - listing and fetching crash groups
 *   - updating group status and notes
 *   - listing occurrences per group
 *   - fetching a specific report
 *   - account-level stats
 *   - deleting a group (soft delete)
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

const GROUP_STATUSES = ["OPEN", "RESOLVED", "REGRESSED"] as const;
const CRASH_TYPES = ["CRASH", "NON_FATAL", "ANR"] as const;

const SCOPE_BY_ID =
  "an Account Key with full-account access or the CRASH_REPORTING feature group; project-scoped keys are denied (403) for this call.";

const GROUP_FIELDS =
  "id, apiKeyId, fingerprint, title, status (OPEN, RESOLVED, REGRESSED), type (CRASH, NON_FATAL, ANR), firstSeenAt, lastSeenAt, occurrenceCount, affectedUserCount, " +
  "affectedVersions, latestStackTrace, platform, notes, resolvedAt, resolvedInVersion, createdAt";

const REPORT_FIELDS =
  "id, apiKeyId, userId (null for anonymous reports), sessionId, type, message, stackTrace, fingerprint, appVersion, sdkVersion, platform, os, deviceModel, deviceMemoryMb, " +
  "breadcrumbs ({timestamp, type, message}), customKeys, createdAt";

const PAGE_SHAPE = "{content, page: {size, number, totalElements, totalPages}}";

const GROUP_NOT_FOUND =
  "400 (not 404) with a \"Crash group not found\" message for an unknown or deleted groupId: list the groups with horizon_admin_crashes_listGroups.";

const groupIdSchema = (action: string) =>
  z.string().uuid().describe(`UUID of the crash group to ${action} (the id field of a horizon_admin_crashes_listGroups item)`);

export function registerAdminCrashesTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_crashes_listGroups",
    {
      title: "List Crash Groups",
      description: describeTool(
        {
          summary:
            "Lists crash groups (one per unique crash signature, with occurrence and user counts), most recently seen first, filterable by Project API key, status, platform and type.",
          use: "triaging crashes: find open or regressed groups, then drill in with horizon_admin_crashes_getGroup or horizon_admin_crashes_listOccurrences.",
          avoid: "single crash reports (use horizon_admin_crashes_listOccurrences) or account totals and quota (use horizon_admin_crashes_getStats).",
          requires:
            "an Account Key with full-account access or the CRASH_REPORTING feature group; a project-scoped key must pass its own projectApiKeyId.",
          effects: "None (read only).",
          returns:
            `${PAGE_SHAPE}; each item has ${GROUP_FIELDS}. An empty content array means no group matches the filters.`,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Groups per page, 1 to 100 (default 20)"),
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "UUID of the Project API key to filter by (from horizon_admin_projects_list; sent as apiKeyId). Omit for all keys; required for a project-scoped Account Key",
          ),
        status: z
          .enum(GROUP_STATUSES)
          .optional()
          .describe("Status filter: OPEN, RESOLVED or REGRESSED (a resolved group that crashed again in a newer version). Omit for all"),
        platform: z
          .string()
          .optional()
          .describe("Platform filter, exact and case-sensitive match on the platform string the SDK reported (see the platform field of listed groups). Omit for all"),
        type: z
          .enum(CRASH_TYPES)
          .optional()
          .describe("Type filter: CRASH (fatal), NON_FATAL (caught exception) or ANR (app not responding). Omit for all"),
      },
      annotations: READ_ONLY,
    },
    async ({ page, size, projectApiKeyId, status, platform, type }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const query: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined) query.apiKeyId = projectApiKeyId;
        if (status !== undefined) query.status = status;
        if (platform !== undefined) query.platform = platform;
        if (type !== undefined) query.type = type;
        const result = await client.get(
          "/api/v1/admin/crash-reports/groups",
          query,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_crashes_getGroup",
    {
      title: "Get Crash Group",
      description: describeTool(
        {
          summary: "Returns one crash group by id with its status, counts, affected versions, latest stack trace and triage notes.",
          use: "looking at one crash signature in detail before changing its status or notes.",
          avoid: "the individual reports of the group (use horizon_admin_crashes_listOccurrences).",
          requires: `groupId from horizon_admin_crashes_listGroups; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns: `One group: ${GROUP_FIELDS}.`,
          errors: GROUP_NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        groupId: groupIdSchema("fetch"),
      },
      annotations: READ_ONLY,
    },
    async ({ groupId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/crash-reports/groups/${groupId}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_crashes_updateStatus",
    {
      title: "Update Crash Group Status",
      description: describeTool(
        {
          summary:
            "Sets the status of a crash group to OPEN, RESOLVED or REGRESSED; RESOLVED records the fix version so the server can flag a regression automatically.",
          use: "a fix shipped (RESOLVED with resolvedInVersion) or a group has to be reopened (OPEN).",
          avoid: "triage comments (use horizon_admin_crashes_updateNotes) or hiding a group entirely (use horizon_admin_crashes_deleteGroup).",
          requires: `groupId from horizon_admin_crashes_listGroups; ${SCOPE_BY_ID}`,
          effects:
            "RESOLVED sets resolvedAt to now and stores resolvedInVersion; OPEN and REGRESSED clear both. " +
            "A later crash of a RESOLVED group in an app version that compares greater (as a string) than resolvedInVersion, or any crash when it is empty, sets the group to REGRESSED.",
          returns: "null (the server answers 204 No Content); read the result with horizon_admin_crashes_getGroup.",
          errors: GROUP_NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        groupId: groupIdSchema("update"),
        status: z
          .enum(GROUP_STATUSES)
          .describe("New status: OPEN (reopen), RESOLVED (fixed) or REGRESSED"),
        resolvedInVersion: z
          .string()
          .optional()
          .describe(
            "App version that contains the fix, for example 1.4.2; only stored with status RESOLVED. Omit it and any new crash of the group counts as a regression",
          ),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ groupId, status, resolvedInVersion }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = { status };
        if (resolvedInVersion !== undefined)
          body.resolvedInVersion = resolvedInVersion;
        const result = await client.put(
          `/api/v1/admin/crash-reports/groups/${groupId}/status`,
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_crashes_updateNotes",
    {
      title: "Update Crash Group Notes",
      description: describeTool(
        {
          summary: "Replaces the free-text triage notes of a crash group (no append); an empty string clears them.",
          use: "recording the cause, owner or hand-off state of a crash signature.",
          avoid: "changing the group status (use horizon_admin_crashes_updateStatus).",
          requires: `groupId from horizon_admin_crashes_listGroups; ${SCOPE_BY_ID}`,
          effects:
            "Overwrites the stored notes; the previous text is lost, so read it first with horizon_admin_crashes_getGroup to append.",
          returns: "null (the server answers 204 No Content).",
          errors: "400 for notes longer than 5000 characters: shorten them. " + GROUP_NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        groupId: groupIdSchema("update"),
        notes: z
          .string()
          .describe("Complete new notes as plain text, at most 5000 characters (the server rejects longer text with 400); an empty string clears the notes"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ groupId, notes }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.put(
          `/api/v1/admin/crash-reports/groups/${groupId}/notes`,
          { notes },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_crashes_listOccurrences",
    {
      title: "List Crash Group Occurrences",
      description: describeTool(
        {
          summary:
            "Lists the individual crash reports of one crash group (same fingerprint), newest first, each with stack trace, device data and breadcrumbs.",
          use: "comparing occurrences of one crash across devices, versions or players.",
          avoid: "the group summary (use horizon_admin_crashes_getGroup) or one known report (use horizon_admin_crashes_getReport).",
          requires: `groupId from horizon_admin_crashes_listGroups; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns:
            `${PAGE_SHAPE}; each item has ${REPORT_FIELDS}. Reports older than the tier's retention period are removed, so the list can be shorter than occurrenceCount.`,
          errors: GROUP_NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        groupId: groupIdSchema("list the reports of"),
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Reports per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
    },
    async ({ groupId, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/crash-reports/groups/${groupId}/occurrences`,
          {
            page: String(page),
            size: String(size),
          },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_crashes_getReport",
    {
      title: "Get Crash Report",
      description: describeTool(
        {
          summary: "Returns one crash report by id with its full stack trace, breadcrumbs, custom keys, device data and session id.",
          use: "inspecting one specific occurrence in full.",
          avoid: "browsing the reports of a group (use horizon_admin_crashes_listOccurrences).",
          requires: `reportId from horizon_admin_crashes_listOccurrences; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns: `One report: ${REPORT_FIELDS}.`,
          errors:
            "400 (not 404) with a \"Crash report not found\" message for an unknown or expired reportId: list the reports with horizon_admin_crashes_listOccurrences.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        reportId: z
          .string()
          .uuid()
          .describe("UUID of the crash report (the id field of a horizon_admin_crashes_listOccurrences item)"),
      },
      annotations: READ_ONLY,
    },
    async ({ reportId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/crash-reports/${reportId}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_crashes_getStats",
    {
      title: "Get Crash Reporting Stats",
      description: describeTool(
        {
          summary:
            "Returns account-wide crash statistics: report counts per type, crash-free session rate, session counts and the stored reports against the tier's crash report quota.",
          use: "checking overall stability or how close the account is to its crash report quota.",
          avoid: "per-signature data (use horizon_admin_crashes_listGroups).",
          requires: SCOPE_BY_ID,
          effects: "None (read only).",
          returns:
            "{totalCrashes, totalNonFatal, totalAnr, crashFreeRate (percent of sessions without a crash, 100 when there are no sessions), affectedUsers (approximation: count of OPEN plus REGRESSED groups), " +
            "totalSessions, sessionsWithCrash, limit (tier quota of stored reports), remaining, percentUsed}.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Accepted for compatibility but not sent: the statistics always cover the whole account",
          ),
      },
      annotations: READ_ONLY,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get("/api/v1/admin/crash-reports/stats");
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_crashes_deleteGroup",
    {
      title: "Delete Crash Group",
      description: describeTool(
        {
          summary:
            "Deletes one crash group by id (soft delete): it disappears from the group list and can no longer be read; its individual reports are not deleted.",
          use: "removing noise such as test crashes or a signature that will not be fixed.",
          avoid: "marking a crash as fixed (use horizon_admin_crashes_updateStatus with RESOLVED, which keeps regression detection).",
          requires: `groupId from horizon_admin_crashes_listGroups; ${SCOPE_BY_ID}`,
          effects:
            "Marks the group as deleted; it cannot be restored through the API. The reports stay stored and still count in horizon_admin_crashes_getStats. A second call for the same groupId fails with 400.",
          returns: "null (the server answers 204 No Content).",
          errors: GROUP_NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        groupId: groupIdSchema("delete"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ groupId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/crash-reports/groups/${groupId}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
