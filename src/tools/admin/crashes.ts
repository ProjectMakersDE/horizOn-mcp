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
} from "./_utils.js";

const GROUP_STATUSES = ["OPEN", "RESOLVED", "REGRESSED"] as const;
const CRASH_TYPES = ["CRASH", "NON_FATAL", "ANR"] as const;

export function registerAdminCrashesTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_crashes_listGroups",
    {
      title: "List Crash Groups",
      description:
        "Lists crash groups for the authenticated account. Groups represent unique crash signatures; each group has many occurrences. Results are paginated and sorted by lastSeenAt DESC.",
      inputSchema: {
        page: z.number().int().min(0).default(0).describe("0-based page index"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("items per page (1-100)"),
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Optional UUID of the project API key to filter by. Maps to the apiKeyId backend filter.",
          ),
        status: z
          .enum(GROUP_STATUSES)
          .optional()
          .describe("Optional group status filter (OPEN, RESOLVED, REGRESSED)"),
        platform: z
          .string()
          .optional()
          .describe("Optional platform filter (e.g. android, ios, windows)"),
        type: z
          .enum(CRASH_TYPES)
          .optional()
          .describe("Optional crash type filter (CRASH, NON_FATAL, ANR)"),
      },
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
      description:
        "Fetches a single crash group by its UUID, including title, status, counts, and affected version range.",
      inputSchema: {
        groupId: z
          .string()
          .uuid()
          .describe("UUID of the crash group to fetch"),
      },
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
      description:
        "Updates the status of a crash group (OPEN, RESOLVED, REGRESSED). Optionally record the version in which the crash was resolved — useful for regression detection.",
      inputSchema: {
        groupId: z
          .string()
          .uuid()
          .describe("UUID of the crash group to update"),
        status: z
          .enum(GROUP_STATUSES)
          .describe("New status (OPEN, RESOLVED, REGRESSED)"),
        resolvedInVersion: z
          .string()
          .optional()
          .describe(
            "Optional app version string in which the crash was resolved (e.g. '1.4.2').",
          ),
      },
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
      description:
        "Updates the free-form notes stored on a crash group. Used for triage and hand-off comments between engineers.",
      inputSchema: {
        groupId: z
          .string()
          .uuid()
          .describe("UUID of the crash group to update"),
        notes: z
          .string()
          .describe("New notes content. Plain text; no length limit enforced here."),
      },
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
      description:
        "Lists individual crash report occurrences for a specific crash group. Results are paginated and sorted by createdAt DESC.",
      inputSchema: {
        groupId: z
          .string()
          .uuid()
          .describe("UUID of the crash group to fetch occurrences for"),
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
      description:
        "Fetches a single crash report occurrence by its UUID, including stack trace, breadcrumbs, device metadata, and session reference.",
      inputSchema: {
        reportId: z
          .string()
          .uuid()
          .describe("UUID of the crash report occurrence to fetch"),
      },
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
      description:
        "Fetches account-level crash reporting statistics (totalCrashes, crashFreeRate, affectedUsers, session counts, quota usage). The projectApiKeyId argument is accepted for forward-compat, but the current backend stats endpoint is account-wide and ignores it.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe(
            "Reserved for future per-project stats. The current backend endpoint is account-wide; this argument is accepted but not forwarded.",
          ),
      },
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
      description:
        "Soft-deletes a crash group by its UUID. The group and its occurrences are excluded from lists and stats afterwards.",
      inputSchema: {
        groupId: z
          .string()
          .uuid()
          .describe("UUID of the crash group to soft-delete"),
      },
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
