import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const targetUserId = "650e8400-e29b-41d4-a716-446655440001";
const projectApiKeyId = "750e8400-e29b-41d4-a716-446655440002";
const requestId = "850e8400-e29b-41d4-a716-446655440003";
const code = "H-" + Buffer.from(targetUserId.replaceAll("-", ""), "hex").toString("base64url");
const session = { userId, sessionToken: "fixture-player-session" };
const snapshot = { userId, revision: 7, friendCode: code, friends: [{ userId: targetUserId, lastActiveAt: null,
  display: { name: "Public Name", profile: { avatarId: null, frameId: null, badges: [] } } }],
  incoming: [{ userId: targetUserId, requestId, createdAt: "2026-10-16T00:00:00Z" }], outgoing: [], blocked: [],
  limits: { maxFriends: 20, maxIncomingRequests: 20, maxOutgoingRequests: 20, maxBlocked: 100 }, serverTime: "2026-10-16T00:00:00Z" };
const actions = [
  ["send_friend_request", "request", false], ["accept_friend_request", "accept", true],
  ["decline_friend_request", "decline", true], ["cancel_friend_request", "cancel", true],
  ["remove_friend", "remove", false], ["block_player", "block", false], ["unblock_player", "unblock", false],
] as const;
let client: Client;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 }));
  vi.stubGlobal("fetch", request);
  client = new Client({ name: "friends-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const calls = () => request.mock.calls as unknown as [string, RequestInit][];
const body = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text);

describe("friends over actual MCP transport", () => {
  it("preserves complete snapshots and null activity without leaking player credentials into query", async () => {
    expect(body(await call("horizon_get_friends", session))).toEqual(snapshot);
    const [url, options] = calls()[0];
    expect(url).toBe(`http://fixture.invalid/api/v1/app/friends?userId=${userId}`);
    expect(options.headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer fixture-player-session" });
    expect(options.headers).not.toHaveProperty("X-Account-API-Key");
    expect(options.body).toBeUndefined();
  });
  it("finds only exact UUID or canonical public friend code", async () => {
    const result = { userId: targetUserId, friendCode: code, display: snapshot.friends[0].display };
    request.mockImplementation(async () => new Response(JSON.stringify(result)));
    for (const query of [targetUserId, code]) {
      expect(body(await call("horizon_find_player", { ...session, query }))).toEqual(result);
      expect(new URL(calls().at(-1)![0]).searchParams.get("query")).toBe(query);
    }
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("sends each reviewed revision and exact pending ID unchanged with player-only auth", async () => {
    for (const [name, action, needsRequestId] of actions) {
      const args = { ...session, targetUserId, expectedRevision: 7, ...(needsRequestId ? { requestId } : {}) };
      expect(body(await call("horizon_" + name, args))).toEqual(snapshot);
      const [url, options] = calls().at(-1)!;
      expect(url).toBe("http://fixture.invalid/api/v1/app/friends/" + action);
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({ userId, targetUserId, expectedRevision: 7, ...(needsRequestId ? { requestId } : {}) });
      expect(options.headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer fixture-player-session" });
      expect(options.headers).not.toHaveProperty("X-Account-API-Key");
    }
    expect(request).toHaveBeenCalledTimes(7);
  });
  it("reports lost response and stale identity without fetching a fresh revision or retrying", async () => {
    request.mockImplementationOnce(async () => { throw new Error("response lost"); });
    expect((await call("horizon_send_friend_request", { ...session, targetUserId, expectedRevision: 7 })).isError).toBe(true);
    expect(request).toHaveBeenCalledOnce();
    for (const [status, code] of [[409,"REVISION_CONFLICT"],[404,"FRIEND_REQUEST_NOT_FOUND"],[409,"INBOX_FULL"],[403,"RELATIONSHIP_NOT_ALLOWED"],[429,"RATE_LIMIT_EXCEEDED"]] as const) {
      request.mockImplementationOnce(async () => new Response(JSON.stringify({ code }), { status, headers: { "Retry-After": "4" } }));
      const response = await call("horizon_accept_friend_request", { ...session, targetUserId, expectedRevision: 7, requestId });
      expect(response.isError).toBe(true);
      expect((response.content as { text: string }[])[0].text).toContain(code);
    }
    expect(request).toHaveBeenCalledTimes(6);
    expect(calls().every(([, options]) => JSON.parse(options.body as string).expectedRevision === 7)).toBe(true);
  });
  it("requires exact safe revisions and request IDs before HTTP", async () => {
    for (const value of [undefined, null, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      expect((await call("horizon_send_friend_request", { ...session, targetUserId, expectedRevision: value })).isError).toBe(true);
    }
    for (const [name, , needsRequestId] of actions.filter(([, , required]) => required)) {
      expect(needsRequestId).toBe(true);
      expect((await call("horizon_" + name, { ...session, targetUserId, expectedRevision: 7 })).isError).toBe(true);
    }
    expect((await call("horizon_send_friend_request", { ...session, targetUserId: userId, expectedRevision: 7 })).isError).toBe(true);
    expect((await call("horizon_get_friends", { userId })).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("rejects name search, noncanonical codes and trailing data locally", async () => {
    for (const query of ["name", "player@example.invalid", "H-AAAAAAAAAAAAAAAAAAAAAB", code + "=", code + "\n", targetUserId + "\n", "1-1-1-1-1"]) {
      expect((await call("horizon_find_player", { ...session, query })).isError).toBe(true);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("admin tools are read-only account-authenticated project-scoped inspections", async () => {
    for (const [name, suffix, args] of [["limits", "/limits", {}], ["player_get", "/players/" + userId, { userId }]] as const) {
      await call("horizon_admin_friends_" + name, { projectApiKeyId, ...args });
      const [url, options] = calls().at(-1)!;
      expect(url).toBe(`http://fixture.invalid/api/v1/admin/friends${suffix}?apiKeyId=${projectApiKeyId}`);
      expect(options.method).toBe("GET");
      expect(options.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key" });
      expect(options.headers).not.toHaveProperty("Authorization");
      expect(options.headers).not.toHaveProperty("X-API-Key");
    }
    expect((await call("horizon_admin_friends_player_get", { projectApiKeyId })).isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("discovers all tools, truthful annotations and resources for three engines", async () => {
    const { tools } = await client.listTools();
    for (const [name, action] of actions) {
      const tool = tools.find(tool => tool.name === "horizon_" + name)!;
      expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: action !== "request", idempotentHint: true });
      expect(tool.description).toContain("never silently replace expectedRevision");
    }
    for (const name of ["horizon_get_friends","horizon_find_player","horizon_admin_friends_player_get","horizon_admin_friends_limits"]) {
      expect(tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: true });
    }
    expect((await client.readResource({ uri: "horizon://docs/friends" })).contents[0]).toMatchObject({ text: expect.stringContaining("requestId") });
    for (const engine of ["unity","godot","unreal"]) {
      expect((await client.getPrompt({ name: "integrate-feature", arguments: { feature: "friends", engine } })).messages[0].content)
        .toMatchObject({ text: expect.stringContaining("horizon://docs/friends") });
    }
    expect((await client.getPrompt({ name: "explain-feature", arguments: { feature: "friends" } })).messages[0].content)
      .toMatchObject({ text: expect.stringContaining("horizon://docs/friends") });
    expect(request).not.toHaveBeenCalled();
  });
});
