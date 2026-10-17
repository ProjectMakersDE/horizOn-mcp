import { createServer as httpServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";
const userId = "550e8400-e29b-41d4-a716-446655440000";
const campaignId = "750e8400-e29b-41d4-a716-446655440002";
const initial = 9007199254740993n;
let client: Client, http: Server, count: bigint, lose: boolean, failure: string | null;
let replyOverride: Record<string, unknown>;
let requests: { path: string; body: Record<string, unknown>; headers: Record<string, unknown> }[];
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const data = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text);
const prepare = async () => data(await call("horizon_prepare_gift_code", { code: "REWARD", userId, sessionToken: "fixture-session" })).intent;
const redeem = (intent: Record<string, unknown>) => call("horizon_redeem_gift_code", { intent, sessionToken: "fixture-session" });
beforeEach(async () => {
  count = initial; lose = false; failure = null; requests = []; replyOverride = {};
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key"); vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  http = httpServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    requests.push({ path: req.url!, body, headers: req.headers });
    res.setHeader("Content-Type", "application/json");
    if (req.url!.startsWith("/api/v1/admin/")) {
      const totals = { exactCurrentTotalRedemptions: "9223372036854775807", exactRemainingRedemptions: null, currentTotalRedemptions: 9223372036854776000, remainingRedemptions: null };
      res.end(JSON.stringify(req.url!.endsWith("/statistics") ? { exactTotalRedemptions: "18446744073709551614", totalRedemptions: 18446744073709552000 } : req.url!.includes("?") ? { giftCodes: [totals] } : totals)); return;
    }
    if (req.url!.endsWith("/validate")) {
      res.end(JSON.stringify(body.includeIntent ? { valid: true, protocolVersion: 2, campaignId, expectedCount: String(count), configRevision: "7" } : { valid: true })); return;
    }
    if (failure) { res.statusCode = 409; res.end(JSON.stringify({ code: failure, count: String(count), configRevision: "8" })); return; }
    const expected = BigInt(body.expectedCount as string), replay = count > expected;
    if (!replay) count++;
    if (lose) { lose = false; res.destroy(); return; }
    res.end(JSON.stringify({ success: true, message: "ok", campaignId: body.campaignId, count: String(count), configRevision: replay ? "8" : "7",
      alreadyApplied: replay, replayed: replay, giftData: replay ? null : "{}", grantedValues: replay ? [] : [{ key: "gold", amount: 7 }], grantedUnlocks: [],
      playerValues: { userId, values: [{ key: "gold", balance: 90 }] }, ...replyOverride }));
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  const address = http.address() as { port: number }; vi.stubEnv("HORIZON_BASE_URL", `http://127.0.0.1:${address.port}`);
  client = new Client({ name: "gift-v2-native-http", version: "1" }); const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client.close(); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve())); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("gift V2 over actual MCP and loopback HTTP", () => {
  it("keeps public validate sessionless, preparation read-only and exact, redeem narrowly scoped", async () => {
    expect(data(await call("horizon_validate_gift_code", { code: "REWARD", userId }))).toEqual({ valid: true });
    const intent = await prepare(); expect(count).toBe(initial); expect(Object.keys(intent)).toHaveLength(7);
    expect(intent.expectedCount).toBe("9007199254740993"); expect(intent.projectScope).toMatch(/^[a-f0-9]{64}$/);
    const result = data(await redeem(intent)); expect(result.count).toBe("9007199254740994"); expect(result.playerValues.values[0].balance).toBe(90);
    expect(requests[0].headers.authorization).toBeUndefined();
    expect(requests[1].body).toEqual({ code: "REWARD", userId, includeIntent: true });
    const { projectScope, ...wire } = intent; expect(requests[2].body).toEqual(wire);
    for (const r of requests.slice(1)) { expect(r.headers.authorization).toBe("Bearer fixture-session"); expect(r.headers["x-api-key"]).toBe("fixture-app-key"); expect(r.headers["x-account-api-key"]).toBeUndefined(); }
  });
  it("retries a lost reply with the identical persisted tuple after reconnect, never preparing a new slot", async () => {
    const original = await prepare(), persisted = JSON.stringify(original); lose = true;
    expect((await redeem(original)).isError).toBe(true); expect(count).toBe(initial + 1n);
    await client.close(); client = new Client({ name: "gift-restarted-client", version: "1" }); const [a,b] = InMemoryTransport.createLinkedPair();
    await Promise.all([createServer().connect(b), client.connect(a)]);
    const replay = data(await redeem(JSON.parse(persisted)));
    expect(replay).toMatchObject({ alreadyApplied: true, replayed: true, giftData: null, grantedValues: [], grantedUnlocks: [], count: String(initial + 1n), configRevision: "8" });
    expect(count).toBe(initial + 1n); expect(requests).toHaveLength(3); expect(requests[1].body).toEqual(requests[2].body);
    expect(JSON.stringify(original)).toBe(persisted);
  });
  it("two devices sharing a prepared slot consume once and keep the immutable campaign UUID", async () => {
    const first = await prepare(), second = await prepare(); expect(second).toEqual(first);
    expect(data(await redeem(first)).alreadyApplied).toBe(false); expect(data(await redeem(second)).alreadyApplied).toBe(true);
    expect(count).toBe(initial + 1n); expect(requests.slice(2).map(r => r.body.campaignId)).toEqual([campaignId, campaignId]);
  });
  it("rejects V1, mixed forms, malformed tuples and foreign local project before HTTP", async () => {
    const intent = await prepare(), before = requests.length;
    const old = await call("horizon_redeem_gift_code", { code: "REWARD", userId, idempotencyId: "v1", sessionToken: "s" });
    expect(JSON.stringify(old)).toContain("UPGRADE_REQUIRED");
    expect(JSON.stringify(await call("horizon_redeem_gift_code", { intent, code: "REWARD", sessionToken: "s" }))).toContain("INVALID_REQUEST");
    for (const expectedCount of [1, "01", "-1", "9223372036854775808"]) expect((await redeem({ ...intent, expectedCount })).isError).toBe(true);
    expect((await redeem({ ...intent, idempotencyId: "v1" })).isError).toBe(true);
    vi.stubEnv("HORIZON_API_KEY", "foreign-key"); expect(JSON.stringify(await redeem(intent))).toContain("PROJECT_SCOPE_CHANGED");
    expect(requests).toHaveLength(before); expect(count).toBe(initial);
  });
  it("surfaces each domain error once without advancing or changing the saved tuple", async () => {
    const intent = await prepare(), saved = JSON.stringify(intent);
    for (const code of ["MIGRATION_REQUIRED", "UPGRADE_REQUIRED", "COUNT_AHEAD", "CAMPAIGN_CHANGED", "COUNTER_EXHAUSTED", "STATE_CONFLICT", "MAX_BALANCE_REACHED"]) {
      failure = code; const n = requests.length, result = await redeem(intent);
      expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain(code); expect(requests).toHaveLength(n + 1); expect(JSON.stringify(intent)).toBe(saved);
    }
    expect(count).toBe(initial);
  });
  it.each([{ count: "9007199254740995" }, { configRevision: "8" }, { campaignId: userId }, { count: 9007199254740994 }, { playerValues: undefined }])("retains an uncertain original after malformed fresh HTTP reply %j", async change => {
    const intent = await prepare(), saved = JSON.stringify(intent); replyOverride = change;
    const result = await redeem(intent); expect(result.isError).toBe(true);
    expect(requests).toHaveLength(2); expect(count).toBe(initial + 1n); expect(JSON.stringify(intent)).toBe(saved);
  });
  it("preserves exact admin Int64 and arbitrary aggregate strings including null unlimited", async () => {
    const one = data(await call("horizon_admin_giftcodes_get", { id: campaignId }));
    expect(one.exactCurrentTotalRedemptions).toBe("9223372036854775807"); expect(one.exactRemainingRedemptions).toBeNull();
    const list = data(await call("horizon_admin_giftcodes_list", {})); expect(list.giftCodes[0]).toEqual(one);
    const stats = data(await call("horizon_admin_giftcodes_getStats", {})); expect(stats.exactTotalRedemptions).toBe("18446744073709551614");
    expect(requests.every(r => r.headers["x-account-api-key"] === "fixture-account-key" && r.headers["x-api-key"] === undefined && r.headers.authorization === undefined)).toBe(true);
  });
  it("publishes prepare as read-only and consume as idempotent, with discoverable V2 docs/prompts", async () => {
    const { tools } = await client.listTools(); expect(tools.find(t => t.name === "horizon_prepare_gift_code")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find(t => t.name === "horizon_redeem_gift_code")?.annotations?.idempotentHint).toBe(true);
    expect(JSON.stringify(await client.readResource({ uri: "horizon://docs/gift-codes" }))).toContain("horizon_prepare_gift_code");
    for (const engine of ["godot", "unity", "unreal"]) expect(JSON.stringify(await client.getPrompt({ name: "integrate-feature", arguments: { feature: "gift-codes", engine } }))).toContain("original");
    expect(requests).toHaveLength(0);
  });
});
