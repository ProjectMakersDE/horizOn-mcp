import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY } from "./_utils.js";

export function registerAdminFriendsTools(server: McpServer): void {
  for (const [name, title, player] of [["player_get", "Inspect Player Friends", true], ["limits", "Get Friends Limits", false]] as const) {
    server.registerTool("horizon_admin_friends_" + name, {
      title, description: describeTool({ summary: player ? "Reads one owned player's friends snapshot for support." : "Reads the owned project's current friend capacity limits.",
        use: player ? "diagnosing pending requests and blocks alongside horizon_admin_friends_limits." : "checking capacity before horizon_admin_friends_player_get inspects owned state.", avoid: "sending social actions on behalf of another player's session.",
        requires: "Account Key with FRIENDS and matching project scope or full-account access. Hosted admin API only; simpleServer operators use its local CLI.",
        effects: "None (read only).", returns: player ? "Complete friends snapshot, including the inspected player's blocks. lastActiveAt is retained login time, not presence."
          : "{maxFriends,maxIncomingRequests,maxOutgoingRequests,maxBlocked}. Default maxFriends is 20/50/75/100/200 for FREE/BASIC/PLUS/PRO/ENTERPRISE; pending limits are 20 per direction and blocks 100.",
        errors: "403 rejects missing feature/project scope. 404 rejects missing, inactive or foreign players." }, ADMIN_AUTH),
      inputSchema: { projectApiKeyId: z.string().uuid().describe("Owned project UUID sent as apiKeyId"), ...(player ? { userId: z.string().uuid().describe("Owned project player UUID to inspect") } : {}) }, annotations: READ_ONLY,
    }, async ({ projectApiKeyId, ...rest }) => {
      const client = getAdminClient(); if (!client) return noAdminClientResponse();
      try { return jsonResponse(await client.get("/api/v1/admin/friends/" + (player ? "players/" + encodeURIComponent(rest.userId as string) : "limits"), { apiKeyId: projectApiKeyId })); }
      catch (error) { return errorResponse(error); }
    });
  }
}
