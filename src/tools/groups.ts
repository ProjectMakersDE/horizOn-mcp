import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, IDEMPOTENT_WRITE, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";

const session = {
  userId: z.string().uuid().describe("Signed-in player matching the Bearer session"),
  sessionToken: z.string().min(1).max(256).describe("Player accessToken, sent only in Authorization"),
};
const groupId = z.string().uuid().describe("Exact group UUID in the current project; never an authorization credential");
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).describe("Exact reviewed revision; never replace automatically after an uncertain response");
const page = { afterUserId: z.string().uuid().optional().describe("Last user UUID from the preceding member page"), limit: z.number().int().min(1).max(50).default(50).describe("Explicit member page size from 1 to 50") };
const utf8 = (max: number) => z.string().refine(value => Buffer.byteLength(value, "utf8") <= max, `At most ${max} UTF-8 bytes`);
const metadata = {
  name: utf8(120).refine(value => value.trim().length > 0, "A nonblank name is required").describe("Group display name, at most 120 UTF-8 bytes"),
  description: utf8(1024).describe("Public description, at most 1024 UTF-8 bytes"), joinMode: z.enum(["open", "request", "invite"]).describe("Whether players join directly, request admission or need an invitation"),
  data: z.record(z.string(), z.json()).superRefine((value, ctx) => {
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 2048) ctx.addIssue({ code: "custom", message: "Group data exceeds 2048 UTF-8 bytes" });
    const depth = (item: unknown, level: number): boolean => level <= 16 &&
      (item === null || typeof item !== "object" || Object.values(item).every(child => depth(child, level + 1)));
    if (!depth(value, 0)) ctx.addIssue({ code: "custom", message: "Group data exceeds depth 16" });
  }).describe("Required JSON object; up to 2048 serialized UTF-8 bytes, depth 16. Only members/admins can read it."),
};
const path = "/api/v1/app/groups";
const errors = "Use horizon_get_groups and horizon_get_group_pending to reconcile state. 409 REVISION_CONFLICT or uncertain response: read and reconcile intent, never refresh the revision and repeat automatically. Pending decisions require the original requestId; REQUEST_NOT_FOUND means it was removed/replaced. INBOX_FULL rolls back the entire action. 403 rejects group role, session or bilateral block violations. 429 is reported without automatic retry. " + SESSION_ERRORS;
const returns = "{groups:MyGroupsView,group:GroupView|null}. groups is the actor's complete snapshot, never the target's private state. group is null after leave/delete; nonmembers never receive private data. Replace only the matching host/project/player cache.";

export function registerGroupsTools(server: McpServer): void {
  for (const [name, suffix, title] of [
    ["get_groups", "", "Get My Groups"], ["get_group", "detail", "Get Group"],
    ["get_group_members", "members", "Get Group Members"], ["get_group_pending", "pending", "Get Group Pending Requests"],
  ] as const) {
    server.registerTool("horizon_" + name, {
      title, description: describeTool({ summary: "Reads " + title.replace(/^Get /, "").toLowerCase() + " using a matching player session.",
        use: "opening a group screen or reconciling an uncertain action.", avoid: "unbounded group search, automatic pagination or using stale snapshots after a session change.",
        requires: SESSION_REQUIRED + (suffix === "pending" ? " Leader/officer membership." : suffix === "members" ? " Group membership." : ""),
        effects: "None (read only).", returns: suffix === "" ? "MyGroupsView with memberships, pending invitations/requests, revision, limits and serverTime."
          : suffix === "detail" ? "GroupView: public metadata for nonmembers, with data/myRole only for members."
          : suffix === "members" ? "{groupId,revision,members,nextAfterUserId,serverTime}; at most 50 public member profiles. A changed revision between pages requires explicit reconciliation."
          : "{groupId,revision,invitations,joinRequests,serverTime}; at most 20 entries per direction.", errors }),
      inputSchema: { ...session, ...(suffix ? { groupId } : {}), ...(suffix === "members" ? page : {}) }, annotations: READ_ONLY,
    }, async ({ userId, sessionToken, ...rest }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      const params: Record<string, string> = { userId };
      if (suffix === "members") { params.limit = String(rest.limit); if (rest.afterUserId) params.afterUserId = rest.afterUserId; }
      const route = suffix ? "/" + encodeURIComponent(rest.groupId as string) + (suffix === "detail" ? "" : "/" + suffix) : "";
      try { return jsonResponse(await client.get(path + route, params, sessionHeaders(sessionToken))); } catch (error) { return errorResponse(error); }
    });
  }
  for (const create of [true, false]) {
    server.registerTool(create ? "horizon_create_group" : "horizon_update_group", {
      title: create ? "Create Group" : "Update Group", description: describeTool({
        summary: create ? "Creates a fresh server-identified group and its leader atomically." : "Replaces the complete group metadata and private JSON object.",
        use: "the player explicitly confirms the group settings.", avoid: "choosing/reusing a group ID or resending uncertain writes with a new revision.",
        requires: SESSION_REQUIRED + (create ? " The current MyGroupsView revision." : " Leader/officer and the current group revision."),
        effects: create ? "Creates one group and membership within both limits. The retained player revision prevents duplicate creation on replay." : "Changes metadata, private data and join mode. Existing pending requests remain.", returns, errors }),
      inputSchema: { ...session, ...metadata, ...(create ? { expectedPlayerRevision: revision } : { groupId, expectedRevision: revision }) },
      annotations: create ? IDEMPOTENT_WRITE : DESTRUCTIVE_WRITE,
    }, async ({ sessionToken, ...args }: { sessionToken: string; userId: string; groupId?: string; [key: string]: unknown }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      const { groupId: id, ...body } = args;
      try { return jsonResponse(create ? await client.post(path, body, sessionHeaders(sessionToken))
        : await client.put(path + "/" + encodeURIComponent(id as string), body, sessionHeaders(sessionToken))); }
      catch (error) { return errorResponse(error); }
    });
  }
  const actions = [
    ["join_group", "join", false, false, "Joins an open group; checks member and player limits."],
    ["request_group_join", "request", false, false, "Creates a join request and ordinary leader Inbox notice atomically."],
    ["invite_group_player", "invite", true, false, "Leader/officer creates an invitation and ordinary recipient Inbox notice atomically."],
    ["accept_group_invite", "accept-invite", false, true, "Consumes your exact invitation, rechecks limits/blocks and notifies the active issuer."],
    ["decline_group_invite", "decline-invite", false, true, "Removes your exact pending invitation on both sides."],
    ["cancel_group_invite", "cancel-invite", true, true, "Leader/officer cancels this exact invitation."],
    ["accept_group_request", "accept-request", true, true, "Leader/officer admits this exact requester and sends their ordinary confirmation atomically."],
    ["decline_group_request", "decline-request", true, true, "Leader/officer declines this exact request."],
    ["cancel_group_request", "cancel-request", false, true, "Cancels your exact join request."],
    ["leave_group", "leave", false, false, "Leaves membership. A leader must transfer first, unless sole member with no pending entries."],
    ["remove_group_member", "remove", true, false, "Leader removes an officer/member; an officer can remove only a member."],
    ["set_group_member_role", "role", true, false, "Leader sets another member's role to officer/member."],
    ["transfer_group_leadership", "transfer", true, false, "Leader transfers leadership to an existing member, becoming an ordinary member."],
    ["delete_group", "delete", false, false, "Sole leader deletes the group only when no invitations/requests remain."],
  ] as const;
  for (const [name, action, targeted, pending, effects] of actions) {
    server.registerTool("horizon_" + name, {
      title: name.replaceAll("_", " "), description: describeTool({ summary: "Applies the explicit " + name.replaceAll("_", " ") + " action using the reviewed group revision.",
        use: "the player explicitly confirms this group action.", avoid: "replacing reviewed revisions/request IDs, bypassing a leader's block, or retrying automatically after uncertainty.",
        requires: SESSION_REQUIRED + " Current group revision and the exact pending requestId where applicable.", effects: effects + " No automatic retry. Same-revision replay cannot create a second effect.", returns, errors }),
      inputSchema: { ...session, groupId, expectedRevision: revision,
        ...(targeted ? { targetUserId: z.string().uuid().describe("Other player in this project") } : {}),
        ...(pending ? { requestId: z.string().uuid().describe("Exact pending identity from the reviewed snapshot") } : {}),
        ...(action === "role" ? { role: z.enum(["officer", "member"]).describe("New nonleader role for the target member") } : {}) },
      annotations: ["join", "request", "invite"].includes(action) ? IDEMPOTENT_WRITE : DESTRUCTIVE_WRITE,
    }, async ({ sessionToken, groupId: id, ...body }) => {
      if (body.targetUserId === body.userId) return errorResponse(new Error("INVALID_GROUP_ACTION: target must be another player"));
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.post(path + "/" + encodeURIComponent(id) + "/" + action, body, sessionHeaders(sessionToken))); }
      catch (error) { return errorResponse(error); }
    });
  }
}
