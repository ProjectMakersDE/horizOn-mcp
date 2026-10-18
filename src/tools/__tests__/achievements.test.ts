import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const projectApiKeyId = "650e8400-e29b-41d4-a716-446655440001";
const session = { userId, sessionToken: "player-session" };
const snapshot = { userId, revision: 3, definitionVersion: "a".repeat(64), definitions: null,
  progress: [{ key: "first-win", rewardState: "pending", pendingReward: { issuedAt: "2026-10-15T12:00:00Z", values: [{ key: "gold", amount: 5000000000 }] } }],
  limits: { maxDefinitions: 20, maxLifetimeKeys: 500 }, serverTime: "2026-10-16T12:00:00Z" };
const manual = { key: "first-win", name: "First win", mode: "manual", rewards: { values: [{ key: "gold", amount: 5000000000 }] } };
let client: Client;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 }));
  vi.stubGlobal("fetch", request);
  client = new Client({ name: "achievements-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const calls = () => request.mock.calls as unknown as [string, RequestInit][];
const body = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text);

describe("achievements over actual MCP transport", () => {
  it("preserves the opaque conditional version, null metadata and original pending values", async () => {
    const result = await call("horizon_get_achievements", { ...session, definitionVersion: snapshot.definitionVersion });
    expect(body(result)).toEqual(snapshot);
    expect(calls()[0][0]).toBe(`http://fixture.invalid/api/v1/app/achievements?userId=${userId}&definitionVersion=${snapshot.definitionVersion}`);
    expect(calls()[0][1].headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer player-session" });
    expect(calls()[0][1].headers).not.toHaveProperty("X-Account-API-Key");
    request.mockImplementationOnce(async () => new Response(JSON.stringify({ ...snapshot, definitions: [] })));
    expect(body(await call("horizon_get_achievements", session)).definitions).toEqual([]);
    expect(calls()[1][0]).not.toContain("definitionVersion");
  });
  it("sends only the permanent key and preserves manual replay and pending delivery", async () => {
    const replay = { achievements: snapshot, newlyUnlocked: [], replayed: true, deliveryResults: [{ key: "first-win", state: "pending", code: "INBOX_FULL" }] };
    request.mockImplementationOnce(async () => new Response(JSON.stringify(replay)));
    expect(body(await call("horizon_unlock_achievement", { ...session, key: "first-win" }))).toEqual(replay);
    expect(calls()[0][0]).toBe("http://fixture.invalid/api/v1/app/achievements/unlock");
    expect(JSON.parse(calls()[0][1].body as string)).toEqual({ userId, key: "first-win" });
    expect(request).toHaveBeenCalledOnce();
  });
  it("keeps partial handoff results distinct and never retries or claims automatically", async () => {
    const response = { achievements: snapshot, results: [{ key: "first-win", state: "delivered", inboxEntryId: "message:750e8400-e29b-41d4-a716-446655440002" }, { key: "second-win", state: "pending", code: "INBOX_FULL" }] };
    request.mockImplementationOnce(async () => new Response(JSON.stringify(response)));
    expect(body(await call("horizon_deliver_achievement_rewards", { ...session, keys: ["first-win", "second-win"] }))).toEqual(response);
    expect(calls()[0][0]).toBe("http://fixture.invalid/api/v1/app/achievements/rewards/deliver");
    expect(JSON.parse(calls()[0][1].body as string)).toEqual({ userId, keys: ["first-win", "second-win"] });
    expect(request).toHaveBeenCalledOnce();
  });
  it("does not hide uncertain outcomes, ownership errors or account rate limits", async () => {
    for (const [code, status] of [["STATE_CONFLICT", 409], ["SESSION_FORBIDDEN", 403], ["ACHIEVEMENT_NOT_MANUAL", 409], ["RATE_LIMIT_EXCEEDED", 429]] as const) {
      request.mockImplementationOnce(async () => new Response(JSON.stringify({ code }), { status }));
      const result = await call("horizon_unlock_achievement", { ...session, key: "first-win" });
      expect(result.isError).toBe(true);
      expect((result.content as { text: string }[])[0].text).toContain(code);
    }
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("replaces definitions with account-only auth and the reviewed If-Match", async () => {
    const statistic = { key: "ten-wins", name: "Ten wins", mode: "statistic", condition: { statisticKey: "wins", threshold: 5000000000 } };
    await call("horizon_admin_achievements_definitions_set", { projectApiKeyId, expectedRevision: 7, definitions: [manual, statistic] });
    const [url, options] = calls()[0];
    expect(url).toBe(`http://fixture.invalid/api/v1/admin/achievements/definitions?apiKeyId=${projectApiKeyId}`);
    expect(options.method).toBe("PUT");
    expect(options.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key", "If-Match": "7" });
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.headers).not.toHaveProperty("X-API-Key");
    expect(JSON.parse(options.body as string)).toEqual({ definitions: [
      { ...manual, description: "", hidden: false, active: true },
      { ...statistic, description: "", hidden: false, active: true, rewards: { values: [] } },
    ] });
    await call("horizon_admin_achievements_definitions_set", { projectApiKeyId, expectedRevision: 8, definitions: [] });
    expect(JSON.parse(calls()[1][1].body as string)).toEqual({ definitions: [] });
  });
  it("reads only the selected project, owned player and tier limits", async () => {
    for (const [name, suffix] of [["definitions_get", "/definitions"], ["limits", "/limits"], ["player_get", "/players/" + userId]]) {
      await call("horizon_admin_achievements_" + name, { projectApiKeyId, ...(name === "player_get" ? { userId } : {}) });
      const [url, options] = calls().at(-1)!;
      expect(url).toBe(`http://fixture.invalid/api/v1/admin/achievements${suffix}?apiKeyId=${projectApiKeyId}`);
      expect(options.method).toBe("GET");
      expect(options.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key" });
      expect(options.headers).not.toHaveProperty("Authorization");
    }
  });
  it("rejects unsafe values, duplicate keys and unsupported definition shapes before HTTP", async () => {
    const set = (definitions: unknown[], expectedRevision = 7) => call("horizon_admin_achievements_definitions_set", { projectApiKeyId, expectedRevision, definitions });
    for (const amount of [0, -1, 1.5, "1", null, Number.MAX_SAFE_INTEGER + 1]) {
      expect((await set([{ ...manual, rewards: { values: [{ key: "gold", amount }] } }])).isError).toBe(true);
    }
    for (const invalid of [
      { ...manual, condition: { statisticKey: "wins", threshold: 1 } },
      { ...manual, mode: "statistic" },
      { ...manual, mode: "statistic", condition: { statisticKey: "wins", threshold: -1 } },
      { ...manual, name: "😀".repeat(31) }, { ...manual, name: " " },
      { ...manual, description: "😀".repeat(129) },
      { ...manual, imageUrl: "https://user:password@example.invalid/a.png" },
      { ...manual, imageUrl: "file:///tmp/image.png" },
      { ...manual, rewards: { items: [] } },
      { ...manual, rewards: { values: [{ key: "gold", amount: 1 }, { key: "gold", amount: 2 }] } },
      { ...manual, key: "first-win\n" },
    ]) expect((await set([invalid])).isError).toBe(true);
    expect((await set([manual, manual])).isError).toBe(true);
    expect((await set([], -1)).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("requires matching identity inputs and bounded nonempty delivery batches", async () => {
    expect((await call("horizon_get_achievements", { userId })).isError).toBe(true);
    expect((await call("horizon_get_achievements", { ...session, definitionVersion: 1 })).isError).toBe(true);
    expect((await call("horizon_get_achievements", { ...session, definitionVersion: snapshot.definitionVersion + "\n" })).isError).toBe(true);
    for (const keys of [[], ["win", "win"], Array.from({ length: 9 }, (_, i) => "win-" + i)]) {
      expect((await call("horizon_deliver_achievement_rewards", { ...session, keys })).isError).toBe(true);
    }
    expect((await call("horizon_unlock_achievement", { ...session, key: "bad/key" })).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("discovers all seven tools, resource and three engine prompts with correct write hints", async () => {
    const { tools } = await client.listTools();
    expect(tools.filter(tool => tool.name.includes("achievement"))).toHaveLength(7);
    for (const name of ["horizon_unlock_achievement", "horizon_deliver_achievement_rewards"]) {
      expect(tools.find(tool => tool.name === name)?.annotations).toMatchObject({ readOnlyHint: name === "horizon_deliver_achievement_rewards", destructiveHint: false, idempotentHint: true });
    }
    expect((await client.readResource({ uri: "horizon://docs/achievements" })).contents[0]).toMatchObject({ text: expect.stringContaining("pendingReward") });
    for (const engine of ["unity", "godot", "unreal"]) {
      const result = await client.getPrompt({ name: "integrate-feature", arguments: { feature: "achievements", engine } });
      expect(result.messages[0].content).toMatchObject({ text: expect.stringContaining("horizon://docs/achievements") });
    }
    expect((await client.getPrompt({ name: "explain-feature", arguments: { feature: "achievements" } })).messages[0].content)
      .toMatchObject({ text: expect.stringContaining("horizon://docs/achievements") });
    expect(request).not.toHaveBeenCalled();
  });
});
