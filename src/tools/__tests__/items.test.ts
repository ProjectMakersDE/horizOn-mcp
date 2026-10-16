import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const instanceId = "650e8400-e29b-41d4-a716-446655440001";
const projectApiKeyId = "750e8400-e29b-41d4-a716-446655440002";
const session = { userId, sessionToken: "fixture-player-session" };
const definition = { name: "Ü Sword", type: "weapon", rarity: "common", active: true,
  baseProperties: { damage: 2, label: "é/😀\n", enabled: true }, propertyRules: [{ key: "damage", min: 0, max: 10, maxChangePerCall: 2 }] };
const snapshot = { userId, revision: 7, instances: [{ instanceId, itemKey: "sword", properties: definition.baseProperties, equipped: false, createdAt: "2026-10-16T00:00:00Z" }],
  limits: { catalog: 20, inventory: 10, receipts: 10 }, serverTime: "2026-10-16T00:00:00Z" };
let client: Client;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key"); vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key"); vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify(snapshot), { status: 200 })); vi.stubGlobal("fetch", request);
  client = new Client({ name: "items-test", version: "1" }); const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name: "horizon_" + name, arguments: args });
const calls = () => request.mock.calls as unknown as [string, RequestInit][];
const body = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text);
const set = (replacement: unknown, key = "sword", expectedRevision: unknown = 7) => call("admin_items_catalog_set", { projectApiKeyId, key, expectedRevision, definition: replacement });

describe("items through actual MCP transport", () => {
  it("preserves complete inventory and pages with only player authentication", async () => {
    expect(body(await call("get_items", session))).toEqual(snapshot);
    const page = { revision: 0, definitions: [{ key: "sword", ...definition }], nextAfterKey: null, total: 1, limits: snapshot.limits, serverTime: snapshot.serverTime };
    request.mockImplementationOnce(async () => new Response(JSON.stringify(page)));
    expect(body(await call("get_item_catalog", { ...session, afterKey: "armor", limit: 3, catalogRevision: 0 }))).toEqual(page);
    expect(calls()[0][0]).toBe(`http://fixture.invalid/api/v1/app/items?userId=${userId}`);
    const parsed = new URL(calls()[1][0]); expect(parsed.pathname).toBe("/api/v1/app/items/catalog");
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ userId, afterKey: "armor", limit: "3", catalogRevision: "0" });
    for (const [url, options] of calls()) {
      expect(options.method).toBe("GET"); expect(url).not.toContain(session.sessionToken);
      expect(options.headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer fixture-player-session" });
      expect(options.headers).not.toHaveProperty("X-Account-API-Key"); expect(options.body).toBeUndefined();
    }
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("sends exact reviewed identities and deltas without synthesizing local inventory", async () => {
    for (const [action, fields] of [["adjust", { changes: [{ key: "damage", amount: -1 }] }], ["equip", { equipped: false }], ["discard", {}]] as const) {
      expect(body(await call(action + "_item", { ...session, instanceId, expectedRevision: 7, ...fields }))).toEqual(snapshot);
      const [url, options] = calls().at(-1)!;
      expect(url).toBe("http://fixture.invalid/api/v1/app/items/" + action); expect(options.method).toBe("POST");
      expect(JSON.parse(options.body as string)).toEqual({ userId, instanceId, expectedRevision: 7, ...fields });
      expect(options.headers).toMatchObject({ Authorization: "Bearer fixture-player-session", "X-API-Key": "fixture-app-key" });
      expect(options.headers).not.toHaveProperty("X-Account-API-Key");
    }
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("never retries uncertain writes or replaces their reviewed revision", async () => {
    request.mockImplementationOnce(async () => { throw new Error("response lost"); });
    expect((await call("discard_item", { ...session, instanceId, expectedRevision: 7 })).isError).toBe(true);
    for (const [status, code] of [[409,"REVISION_CONFLICT"],[404,"ITEM_NOT_FOUND"],[422,"ITEM_PROPERTY_LIMIT_REACHED"],[429,"RATE_LIMIT_EXCEEDED"],[503,"TEMPORARILY_UNAVAILABLE"]] as const) {
      request.mockImplementationOnce(async () => new Response(JSON.stringify({ code }), { status, headers: { "Retry-After": "3" } }));
      const response = await call("equip_item", { ...session, instanceId, expectedRevision: 7, equipped: true });
      expect(response.isError).toBe(true); expect((response.content as { text: string }[])[0].text).toContain(code);
    }
    expect(request).toHaveBeenCalledTimes(6);
    expect(calls().every(([, options]) => options.method === "POST" && JSON.parse(options.body as string).expectedRevision === 7)).toBe(true);
  });
  it("rejects unsafe decisions, invalid deltas and unbounded pages before HTTP", async () => {
    for (const expectedRevision of [undefined, null, -1, 0.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      expect((await call("discard_item", { ...session, instanceId, expectedRevision })).isError).toBe(true);
    }
    for (const changes of [[], [{ key: "damage", amount: 0 }], [{ key: "damage", amount: 1.5 }], [{ key: "damage", amount: "1" }], [{ key: "damage", amount: Number.MAX_SAFE_INTEGER + 1 }],
      [{ key: "damage", amount: 1 }, { key: "damage", amount: 2 }], [{ key: "damage\n", amount: 1 }], [{ key: "damage", amount: 1, unknown: true }]]) {
      expect((await call("adjust_item", { ...session, instanceId, expectedRevision: 7, changes })).isError).toBe(true);
    }
    for (const limit of [0, 51, 1.5, "50"]) expect((await call("get_item_catalog", { ...session, limit })).isError).toBe(true);
    expect((await call("get_items", { userId })).isError).toBe(true);
    expect((await call("equip_item", { ...session, instanceId, expectedRevision: 7, equipped: "false" })).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("preserves template data and If-Match with only scoped admin authentication", async () => {
    await set(definition);
    const [url, options] = calls()[0];
    expect(url).toBe(`http://fixture.invalid/api/v1/admin/items/catalog/sword?apiKeyId=${projectApiKeyId}`);
    expect(options.method).toBe("PUT"); expect(JSON.parse(options.body as string)).toEqual(definition);
    expect(options.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key", "If-Match": "7" });
    expect(options.headers).not.toHaveProperty("Authorization"); expect(options.headers).not.toHaveProperty("X-API-Key");
    for (const [name, suffix, fields] of [["catalog_get", "/catalog", { afterKey: "armor", limit: 2, catalogRevision: 0 }], ["player_get", "/players/" + userId, { userId }], ["limits", "/limits", {}]] as const) {
      await call("admin_items_" + name, { projectApiKeyId, ...fields });
      const [url, options] = calls().at(-1)!; const parsed = new URL(url);
      expect(parsed.pathname).toBe("/api/v1/admin/items" + suffix); expect(parsed.searchParams.get("apiKeyId")).toBe(projectApiKeyId);
      expect(options.method).toBe("GET"); expect(options.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key" });
      expect(options.headers).not.toHaveProperty("Authorization"); expect(options.headers).not.toHaveProperty("X-API-Key");
      if (name === "catalog_get") expect(parsed.searchParams.get("catalogRevision")).toBe("0");
    }
    expect(request).toHaveBeenCalledTimes(4);
  });
  it("enforces primitive properties, exact UTF-8 bounds and complete template rules", async () => {
    const minimal = { ...definition, baseProperties: { x: "a".repeat(248) }, propertyRules: [] };
    expect((await set(minimal)).isError).not.toBe(true); // {"x":""} is eight bytes.
    expect((await set({ ...minimal, baseProperties: { x: "a".repeat(249) } })).isError).toBe(true);
    for (const baseProperties of [{ x: null }, { x: {} }, { x: [] }, { x: 1.5 }, { x: Number.MAX_SAFE_INTEGER + 1 }, { x: "\ud800" }, { x: "\udc00" }, { "x.y": 1 }]) {
      expect((await set({ ...minimal, baseProperties })).isError).toBe(true);
    }
    for (const propertyRules of [[{ key: "missing", min: 0, max: 10, maxChangePerCall: 1 }], [{ key: "damage", min: 3, max: 10, maxChangePerCall: 1 }],
      [{ key: "damage", min: 0, max: 10, maxChangePerCall: 0 }], [...definition.propertyRules, ...definition.propertyRules]]) {
      expect((await set({ ...definition, propertyRules })).isError).toBe(true);
    }
    for (const change of [{ active: "false" }, { extra: 1 }, { name: "é".repeat(61) }, { name: "\ud800" }]) expect((await set({ ...definition, ...change })).isError).toBe(true);
    expect((await set(definition, "sword\n")).isError).toBe(true);
    expect(request).toHaveBeenCalledOnce();
  });
  it("accepts item-only purchases and preserves old value-only offers with strict bounded quantities", async () => {
    const common = { projectApiKeyId, expectedRevision: 0, definitions: [{ key: "gold", name: "Gold" }] };
    const offer = { key: "sword_offer", name: "Sword", costs: [{ key: "gold", amount: 2 }], rewards: [], itemRewards: [{ itemKey: "sword", quantity: 4 }] };
    expect((await call("admin_player_values_config_set", { ...common, offers: [offer] })).isError).not.toBe(true);
    expect(JSON.parse(calls()[0][1].body as string).offers).toEqual([offer]);
    const old = { key: "coins", name: "Coins", costs: [{ key: "gold", amount: 2 }], rewards: [{ key: "gold", amount: 1 }] };
    expect((await call("admin_player_values_config_set", { ...common, offers: [old] })).isError).not.toBe(true);
    expect(JSON.parse(calls()[1][1].body as string).offers).toEqual([old]);
    for (const itemRewards of [[], [{ itemKey: "sword", quantity: 0 }], [{ itemKey: "sword", quantity: 5 }], [{ itemKey: "sword", quantity: "1" }],
      [{ itemKey: "sword", quantity: 1.5 }], [{ itemKey: "sword", quantity: 1 }, { itemKey: "sword", quantity: 1 }],
      [{ itemKey: "sword", quantity: 3 }, { itemKey: "armor", quantity: 2 }], [null]]) {
      expect((await call("admin_player_values_config_set", { ...common, offers: [{ ...offer, itemRewards }] })).isError).toBe(true);
    }
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("discovers all nine tools and honest engine guidance without HTTP", async () => {
    const { tools } = await client.listTools();
    for (const name of ["get_items", "get_item_catalog", "admin_items_catalog_get", "admin_items_player_get", "admin_items_limits"]) {
      expect(tools.find(tool => tool.name === "horizon_" + name)?.annotations).toMatchObject({ readOnlyHint: true });
    }
    for (const name of ["adjust_item", "equip_item", "discard_item", "admin_items_catalog_set"]) {
      expect(tools.find(tool => tool.name === "horizon_" + name)?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: true });
    }
    expect((await client.readResource({ uri: "horizon://docs/items" })).contents[0]).toMatchObject({ text: expect.stringContaining("expectedRevision") });
    for (const engine of ["unity", "godot", "unreal"]) expect((await client.getPrompt({ name: "integrate-feature", arguments: { feature: "items", engine } })).messages[0].content)
      .toMatchObject({ text: expect.stringContaining("horizon://docs/items") });
    expect((await client.getPrompt({ name: "explain-feature", arguments: { feature: "items" } })).messages[0].content)
      .toMatchObject({ text: expect.stringContaining("horizon://docs/items") });
    expect(request).not.toHaveBeenCalled();
  });
});
