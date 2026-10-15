import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const projectApiKeyId = "650e8400-e29b-41d4-a716-446655440001";
const entryId = "broadcast:750e8400-e29b-41d4-a716-446655440002";
const operationId = "1792100000000:850e8400-e29b-41d4-a716-446655440003";
const publish = { projectApiKeyId, expectedRevision: 7, operationId, type: "reward", textKey: "reward.new", expiresAt: "2026-10-16T12:00:00Z", attachment: { values: [{ key: "gold", amount: 5000000000 }] } };
const snapshot = { userId, cursor: "a".repeat(64), revision: 8, broadcastRevision: 7, serverTime: "2026-10-15T12:00:00Z", unchanged: true, entries: [], pollAfterSeconds: 120 };
let client: Client;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 }));
  vi.stubGlobal("fetch", request);
  client = new Client({ name: "inbox-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const calls = () => request.mock.calls as unknown as [string, RequestInit][];

describe("inbox over actual MCP transport", () => {
  it("preserves cursor and unchanged snapshot, with player-only authentication", async () => {
    const result = await call("horizon_get_inbox", { userId, sessionToken: "player-session", since: snapshot.cursor });
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(snapshot);
    expect(calls()[0][0]).toBe(`http://fixture.invalid/api/v1/app/inbox?userId=${userId}&since=${snapshot.cursor}`);
    expect(calls()[0][1].headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer player-session" });
    expect(calls()[0][1].headers).not.toHaveProperty("X-Account-API-Key");
  });
  it("sends exact entry identity to all three action routes without a token in the body", async () => {
    for (const [name, path] of [["mark_inbox_read", "read"], ["claim_inbox", "claim"], ["remove_inbox", "remove"]]) {
      await call("horizon_" + name, { userId, sessionToken: "s", entryId });
      const [url, options] = calls().at(-1)!;
      expect(url).toBe("http://fixture.invalid/api/v1/app/inbox/" + path);
      expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({ userId, entryId });
    }
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("preserves replay and large balances without regranting or retrying", async () => {
    const replay = { entryId, replayed: true, inbox: snapshot, playerValues: { values: [{ key: "gold", balance: 5000000000 }] } };
    request.mockImplementationOnce(async () => new Response(JSON.stringify(replay)));
    const result = await call("horizon_claim_inbox", { userId, sessionToken: "s", entryId });
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(replay);
    expect(request).toHaveBeenCalledOnce();
  });
  it("surfaces protected rewards and uncertain claims without automatic retry", async () => {
    for (const code of ["UNCLAIMED_REWARD", "STATE_CONFLICT", "MAX_BALANCE_REACHED", "ENTRY_NOT_FOUND"]) {
      request.mockImplementationOnce(async () => new Response(JSON.stringify({ code }), { status: 409 }));
      const result = await call("horizon_claim_inbox", { userId, sessionToken: "s", entryId });
      expect(result.isError).toBe(true);
      expect((result.content as { text: string }[])[0].text).toContain(code);
    }
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("publishes and removes using account-only auth and an unchanged If-Match", async () => {
    await call("horizon_admin_inbox_publish", publish);
    await call("horizon_admin_inbox_broadcast_remove", { projectApiKeyId, broadcastId: entryId, expectedRevision: 7 });
    const [url, options] = calls()[0];
    expect(url).toBe(`http://fixture.invalid/api/v1/admin/inbox/broadcasts?apiKeyId=${projectApiKeyId}`);
    expect(JSON.parse(options.body as string)).toEqual({ operationId, type: "reward", reference: "", textKey: "reward.new", parameters: {}, expiresAt: publish.expiresAt, attachment: publish.attachment });
    expect(calls()[1][0]).toBe(`http://fixture.invalid/api/v1/admin/inbox/broadcasts/${encodeURIComponent(entryId)}?apiKeyId=${projectApiKeyId}`);
    expect(calls()[1][1].method).toBe("DELETE");
    expect(calls()[1][1].body).toBeUndefined();
    for (const [, opts] of calls()) {
      expect(opts.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key", "If-Match": '"7"' });
      expect(opts.headers).not.toHaveProperty("Authorization");
      expect(opts.headers).not.toHaveProperty("X-API-Key");
    }
  });
  it("reads only the selected project catalogue and player support snapshot", async () => {
    await call("horizon_admin_inbox_broadcasts_get", { projectApiKeyId });
    await call("horizon_admin_inbox_player_get", { projectApiKeyId, userId });
    expect(calls()[0][0]).toBe(`http://fixture.invalid/api/v1/admin/inbox/broadcasts?apiKeyId=${projectApiKeyId}`);
    expect(calls()[1][0]).toBe(`http://fixture.invalid/api/v1/admin/inbox/players/${userId}?apiKeyId=${projectApiKeyId}`);
    expect(calls().every(([, opts]) => opts.method === "GET")).toBe(true);
  });
  it("rejects unsupported attachments, unsafe amounts, missing sessions and invalid IDs before HTTP", async () => {
    for (const amount of [0, -1, 1.5, "1", null, 9007199254740992]) {
      expect((await call("horizon_admin_inbox_publish", { ...publish, attachment: { values: [{ key: "gold", amount }] } })).isError).toBe(true);
    }
    for (const attachment of [{ items: [] }, { values: [{ key: "gold", amount: 1 }, { key: "gold", amount: 2 }] }]) {
      expect((await call("horizon_admin_inbox_publish", { ...publish, attachment })).isError).toBe(true);
    }
    expect((await call("horizon_get_inbox", { userId })).isError).toBe(true);
    expect((await call("horizon_claim_inbox", { userId, sessionToken: "s", entryId: "other:bad" })).isError).toBe(true);
    expect((await call("horizon_admin_inbox_publish", { ...publish, expectedRevision: -1 })).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("discovers all eight tools, the resource and engine prompts", async () => {
    const tools = await client.listTools();
    expect(tools.tools.filter(t => t.name.includes("inbox"))).toHaveLength(8);
    const resource = await client.readResource({ uri: "horizon://docs/inbox" });
    expect(resource.contents[0]).toMatchObject({ text: expect.stringContaining("serverTime") });
    for (const name of ["integrate-feature", "explain-feature"]) {
      const result = await client.getPrompt({ name, arguments: { feature: "inbox", ...(name === "integrate-feature" ? { engine: "unreal" } : {}) } });
      expect(result.messages[0].content).toMatchObject({ text: expect.stringContaining("horizon://docs/inbox") });
    }
    expect(request).not.toHaveBeenCalled();
  });
});
