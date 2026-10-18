import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const targetUserId = "650e8400-e29b-41d4-a716-446655440001";
const projectApiKeyId = "750e8400-e29b-41d4-a716-446655440002";
const groupId = "850e8400-e29b-41d4-a716-446655440003";
const requestId = "950e8400-e29b-41d4-a716-446655440004";
const session = { userId, sessionToken: "fixture-player-session" };
const metadata = { name: "Crew", description: "Players", joinMode: "request", data: { "a.b": 1, "a_b": 2, "$key": { "": "ü" } } };
const snapshot = { userId, revision: 7, groups: [], incomingInvites: [], outgoingRequests: [],
  limits: { maxMembers: 20, maxGroupsPerPlayer: 1, maxInvitations: 20, maxJoinRequests: 20, maxDataBytes: 2048, memberPageSize: 50 }, serverTime: "2026-10-16T00:00:00Z" };
const mutation = { groups: snapshot, group: null };
const actions = [
  ["join_group", "join", false, false], ["request_group_join", "request", false, false],
  ["invite_group_player", "invite", true, false], ["accept_group_invite", "accept-invite", false, true],
  ["decline_group_invite", "decline-invite", false, true], ["cancel_group_invite", "cancel-invite", true, true],
  ["accept_group_request", "accept-request", true, true], ["decline_group_request", "decline-request", true, true],
  ["cancel_group_request", "cancel-request", false, true], ["leave_group", "leave", false, false],
  ["remove_group_member", "remove", true, false], ["set_group_member_role", "role", true, false],
  ["transfer_group_leadership", "transfer", true, false], ["delete_group", "delete", false, false],
] as const;
let client: Client;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify(mutation), { status: 200 }));
  vi.stubGlobal("fetch", request);
  client = new Client({ name: "groups-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name: "horizon_" + name, arguments: args });
const calls = () => request.mock.calls as unknown as [string, RequestInit][];
const body = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text);

describe("groups through actual MCP transport", () => {
  it("reads all snapshots and explicit member pages with player-only headers", async () => {
    for (const [name, route, args] of [["get_groups", "", {}], ["get_group", "/" + groupId, { groupId }],
      ["get_group_members", "/" + groupId + "/members", { groupId, afterUserId: targetUserId, limit: 9 }],
      ["get_group_pending", "/" + groupId + "/pending", { groupId }]] as const) {
      request.mockImplementationOnce(async () => new Response(JSON.stringify(snapshot)));
      expect(body(await call(name, { ...session, ...args }))).toEqual(snapshot);
      const [url, options] = calls().at(-1)!;
      const parsed = new URL(url);
      expect(parsed.pathname).toBe("/api/v1/app/groups" + route);
      expect(parsed.searchParams.get("userId")).toBe(userId);
      expect(parsed.searchParams.has("sessionToken")).toBe(false);
      if (name === "get_group_members") {
        expect(parsed.searchParams.get("limit")).toBe("9");
        expect(parsed.searchParams.get("afterUserId")).toBe(targetUserId);
      }
      expect(options.method).toBe("GET");
      expect(options.headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer fixture-player-session" });
      expect(options.headers).not.toHaveProperty("X-Account-API-Key");
      expect(options.body).toBeUndefined();
    }
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("preserves explicit create and update revisions and arbitrary legal JSON keys", async () => {
    expect(body(await call("create_group", { ...session, ...metadata, expectedPlayerRevision: 7 }))).toEqual(mutation);
    expect(body(await call("update_group", { ...session, ...metadata, groupId, expectedRevision: 9 }))).toEqual(mutation);
    const first = calls()[0]; const second = calls()[1];
    expect(first[0]).toBe("http://fixture.invalid/api/v1/app/groups");
    expect(first[1].method).toBe("POST");
    expect(JSON.parse(first[1].body as string)).toEqual({ userId, ...metadata, expectedPlayerRevision: 7 });
    expect(second[0]).toBe("http://fixture.invalid/api/v1/app/groups/" + groupId);
    expect(second[1].method).toBe("PUT");
    expect(JSON.parse(second[1].body as string)).toEqual({ userId, ...metadata, expectedRevision: 9 });
  });
  it("sends all fourteen actions once with unchanged decision identities", async () => {
    for (const [name, action, targeted, pending] of actions) {
      const fields = { expectedRevision: 7, ...(targeted ? { targetUserId } : {}), ...(pending ? { requestId } : {}), ...(action === "role" ? { role: "officer" } : {}) };
      expect(body(await call(name, { ...session, groupId, ...fields }))).toEqual(mutation);
      const [url, options] = calls().at(-1)!;
      expect(url).toBe(`http://fixture.invalid/api/v1/app/groups/${groupId}/${action}`);
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({ userId, ...fields });
      expect(options.headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer fixture-player-session" });
      expect(options.headers).not.toHaveProperty("X-Account-API-Key");
    }
    expect(request).toHaveBeenCalledTimes(14);
  });
  it("never retries or fetches new revisions after lost response conflict full Inbox or rate limit", async () => {
    request.mockImplementationOnce(async () => { throw new Error("response lost"); });
    expect((await call("create_group", { ...session, ...metadata, expectedPlayerRevision: 7 })).isError).toBe(true);
    for (const [status, code] of [[409,"REVISION_CONFLICT"],[404,"REQUEST_NOT_FOUND"],[409,"INBOX_FULL"],[403,"GROUP_RELATION_BLOCKED"],[429,"RATE_LIMIT_EXCEEDED"]] as const) {
      request.mockImplementationOnce(async () => new Response(JSON.stringify({ code }), { status }));
      const result = await call("accept_group_invite", { ...session, groupId, expectedRevision: 7, requestId });
      expect(result.isError).toBe(true);
      expect((result.content as { text: string }[])[0].text).toContain(code);
    }
    expect(request).toHaveBeenCalledTimes(6);
    expect(calls().every(([, options]) => options.method === "POST")).toBe(true);
  });
  it("requires safe reviewed revisions, session, targets and exact pending IDs before HTTP", async () => {
    for (const expectedRevision of [undefined, null, -1, 0.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      expect((await call("join_group", { ...session, groupId, expectedRevision })).isError).toBe(true);
      expect((await call("create_group", { ...session, ...metadata, expectedPlayerRevision: expectedRevision })).isError).toBe(true);
    }
    for (const [name, , targeted, pending] of actions) {
      if (pending) expect((await call(name, { ...session, groupId, expectedRevision: 7, ...(targeted ? { targetUserId } : {}) })).isError).toBe(true);
      if (targeted) expect((await call(name, { ...session, groupId, expectedRevision: 7, targetUserId: userId, ...(pending ? { requestId } : {}), ...(name === "set_group_member_role" ? { role: "member" } : {}) })).isError).toBe(true);
    }
    expect((await call("set_group_member_role", { ...session, groupId, expectedRevision: 7, targetUserId, role: "leader" })).isError).toBe(true);
    expect((await call("get_groups", { userId })).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects non-JSON metadata and nonrepresentable pages locally without default policy clamps", async () => {
    for (const change of [{ name: "  " }, { joinMode: "public" },
      { data: null }, { data: [] }, { data: "text" }, { data: { x: Infinity } }, { data: { x: undefined } }]) {
      expect((await call("create_group", { ...session, ...metadata, expectedPlayerRevision: 7, ...change })).isError).toBe(true);
    }
    for (const limit of [0, 2147483647, 1.5, "50"]) {
      expect((await call("get_group_members", { ...session, groupId, limit })).isError).toBe(true);
      expect((await call("admin_groups_list", { projectApiKeyId, limit })).isError).toBe(true);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("admin inspections use only account auth, explicit scope and bounded cursor parameters", async () => {
    for (const [kind, suffix, fields] of [["list", "", { afterGroupId: groupId, limit: 2 }], ["get", "/" + groupId, { groupId }],
      ["members", "/" + groupId + "/members", { groupId, afterUserId: targetUserId, limit: 4 }],
      ["pending", "/" + groupId + "/pending", { groupId }], ["player_get", "/players/" + userId, { userId }], ["limits", "/limits", {}]] as const) {
      await call("admin_groups_" + kind, { projectApiKeyId, ...fields });
      const [url, options] = calls().at(-1)!; const parsed = new URL(url);
      expect(parsed.pathname).toBe("/api/v1/admin/groups" + suffix);
      expect(parsed.searchParams.get("apiKeyId")).toBe(projectApiKeyId);
      if (kind === "list") { expect(parsed.searchParams.get("afterGroupId")).toBe(groupId); expect(parsed.searchParams.get("limit")).toBe("2"); }
      if (kind === "members") { expect(parsed.searchParams.get("afterUserId")).toBe(targetUserId); expect(parsed.searchParams.get("limit")).toBe("4"); }
      expect(options.method).toBe("GET"); expect(options.body).toBeUndefined();
      expect(options.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key" });
      expect(options.headers).not.toHaveProperty("Authorization"); expect(options.headers).not.toHaveProperty("X-API-Key");
    }
    expect(request).toHaveBeenCalledTimes(6);
  });
  it("discovers all twenty player and six admin tools, destructive actions, docs and engine prompts", async () => {
    const { tools } = await client.listTools();
    for (const [name, action] of actions) {
      expect(tools.find(tool => tool.name === "horizon_" + name)?.annotations)
        .toMatchObject({ readOnlyHint: false, destructiveHint: !["join", "request", "invite"].includes(action), idempotentHint: true });
    }
    for (const name of ["get_groups", "get_group", "get_group_members", "get_group_pending", "admin_groups_list", "admin_groups_get", "admin_groups_members", "admin_groups_pending", "admin_groups_player_get", "admin_groups_limits"]) {
      expect(tools.find(tool => tool.name === "horizon_" + name)?.annotations).toMatchObject({ readOnlyHint: true });
    }
    expect(tools.find(tool => tool.name === "horizon_create_group")?.annotations).toMatchObject({ idempotentHint: true, destructiveHint: false });
    expect(tools.find(tool => tool.name === "horizon_update_group")?.annotations).toMatchObject({ destructiveHint: true });
    expect((await client.readResource({ uri: "horizon://docs/groups" })).contents[0]).toMatchObject({ text: expect.stringContaining("expectedPlayerRevision") });
    for (const engine of ["unity", "godot", "unreal"]) {
      expect((await client.getPrompt({ name: "integrate-feature", arguments: { feature: "groups", engine } })).messages[0].content)
        .toMatchObject({ text: expect.stringContaining("horizon://docs/groups") });
    }
    expect((await client.getPrompt({ name: "explain-feature", arguments: { feature: "groups" } })).messages[0].content)
      .toMatchObject({ text: expect.stringContaining("horizon://docs/groups") });
    expect(request).not.toHaveBeenCalled();
  });
});
