import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY } from "./_utils.js";
import { GROUP_PAGE_MAX } from "../feature-bounds.js";

export function registerAdminGroupsTools(server: McpServer): void {
  for (const kind of ["list", "get", "members", "pending", "player_get", "limits"] as const) {
    const byGroup = ["get", "members", "pending"].includes(kind);
    const paginated = kind === "list" || kind === "members";
    server.registerTool("horizon_admin_groups_" + kind, {
      title: "Inspect Groups " + kind.replaceAll("_", " "), description: describeTool({
        summary: "Reads owned project group " + kind.replaceAll("_", " ") + " state for support inspection.",
        use: "support inspection alongside horizon_admin_groups_get and horizon_admin_groups_limits.", avoid: "impersonating players or assuming one page is the entire group list.",
        requires: "Account Key with GROUPS and matching project scope or full-account access. Hosted admin API only; simpleServer operators use the local CLI.",
        effects: "None (read only).", returns: kind === "limits" ? "Eleven current System Config policies: maxMembers,maxGroupsPerPlayer,maxInvitations,maxJoinRequests,maxPlayerInvitations,maxPlayerRequests,maxNameBytes,maxDescriptionBytes,maxDataBytes,maxDataDepth,memberPageSize. Defaults are not upper bounds."
          : "Owned group state including private data where applicable. Lists are explicit UUID keyset pages under current memberPageSize; retained data is complete after policy reductions. Player snapshots never imply online presence.",
        errors: "403 rejects missing feature/project scope. 404 rejects missing or foreign groups/players. Invalid page sizes are refused." }, ADMIN_AUTH),
      inputSchema: { projectApiKeyId: z.string().uuid().describe("Owned project UUID sent as apiKeyId"), ...(byGroup ? { groupId: z.string().uuid().describe("Exact owned-project group UUID to inspect") } : {}),
        ...(kind === "player_get" ? { userId: z.string().uuid().describe("Owned project player UUID to inspect") } : {}),
        ...(paginated ? { limit: z.number().int().min(1).max(GROUP_PAGE_MAX).default(1).describe("Explicit page size no larger than current memberPageSize; default1 remains valid after reductions") } : {}),
        ...(kind === "list" ? { afterGroupId: z.string().uuid().optional().describe("Last group UUID from the previous page") } : {}),
        ...(kind === "members" ? { afterUserId: z.string().uuid().optional().describe("Last member UUID from the previous page") } : {}) }, annotations: READ_ONLY,
    }, async ({ projectApiKeyId, ...rest }) => {
      const client = getAdminClient(); if (!client) return noAdminClientResponse();
      const params: Record<string, string> = { apiKeyId: projectApiKeyId };
      if (paginated) params.limit = String(rest.limit);
      if (rest.afterGroupId) params.afterGroupId = rest.afterGroupId;
      if (rest.afterUserId) params.afterUserId = rest.afterUserId;
      const suffix = byGroup ? "/" + encodeURIComponent(rest.groupId as string) + (kind === "get" ? "" : "/" + kind)
        : kind === "player_get" ? "/players/" + encodeURIComponent(rest.userId as string) : kind === "limits" ? "/limits" : "";
      try { return jsonResponse(await client.get("/api/v1/admin/groups" + suffix, params)); }
      catch (error) { return errorResponse(error); }
    });
  }
}
