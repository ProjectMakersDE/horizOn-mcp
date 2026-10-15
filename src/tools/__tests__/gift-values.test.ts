import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const projectApiKeyId = "650e8400-e29b-41d4-a716-446655440001";
const id = "750e8400-e29b-41d4-a716-446655440002";
const values = [{ key: "gold", amount: 5000000000 }];
const create = { title: "Reward", projectApiKeyId, code: "REWARD", giftData: "{}" };
let client: Client;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify({ id, values }), { status: 200 }));
  vi.stubGlobal("fetch", request);
  client = new Client({ name: "gift-values-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const calls = () => request.mock.calls as unknown as [string, RequestInit][];
const body = (index = 0) => JSON.parse(calls()[index][1].body as string);

describe("gift-code values over actual MCP transport", () => {
  it("creates exact safe-integer values separately from legacy giftData", async () => {
    const result = await call("horizon_admin_giftcodes_create", { ...create, values });
    expect(result.isError).not.toBe(true);
    expect(body()).toMatchObject({ values, giftData: "{}", apiKeyId: projectApiKeyId });
    expect(new Headers(calls()[0][1].headers).get("X-Account-API-Key")).toBe("fixture-account-key");
  });
  it("preserves omission while sending explicit empty rewards on update", async () => {
    await call("horizon_admin_giftcodes_update", { id, title: "Renamed" });
    await call("horizon_admin_giftcodes_update", { id, values: [] });
    expect(body()).toEqual({ title: "Renamed" });
    expect(body(1)).toEqual({ values: [] });
  });
  it("rejects malformed values before any network write", async () => {
    for (const invalid of [null, [{ key: "gold", amount: 0 }], [{ key: "gold", amount: 1.5 }],
      [{ key: "gold", amount: "5" }], [{ key: "gold", amount: 9007199254740992 }],
      [values[0], values[0]], [{ key: "BAD", amount: 1 }],
      Array.from({ length: 9 }, (_, n) => ({ key: `v${n}`, amount: 1 }))]) {
      expect((await call("horizon_admin_giftcodes_create", { ...create, values: invalid })).isError).toBe(true);
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("forwards the same intent identity and current snapshot on repeated redemption", async () => {
    const response = { success: true, giftData: "{}", grantedUnlocks: [], grantedValues: values,
      playerValues: { userId, values: [{ key: "gold", balance: 7 }] }, replayed: true };
    request.mockImplementation(async () => new Response(JSON.stringify(response), { status: 200 }));
    const intent = { code: "REWARD", userId, sessionToken: "fixture-session", idempotencyId: "stable-reward-intent" };
    for (let index = 0; index < 2; index++) {
      const result = await call("horizon_redeem_gift_code", intent);
      expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(response);
      expect(body(index)).toEqual({ code: "REWARD", userId, idempotencyId: intent.idempotencyId });
      expect(new Headers(calls()[index][1].headers).get("Authorization")).toBe("Bearer fixture-session");
    }
  });
  it("keeps the legacy request shape and does not generate hidden intent IDs", async () => {
    await call("horizon_redeem_gift_code", { code: "REWARD", userId, sessionToken: "fixture-session" });
    expect(body()).toEqual({ code: "REWARD", userId });
    const invalid = await call("horizon_redeem_gift_code", { code: "REWARD", userId, sessionToken: "fixture-session", idempotencyId: "   " });
    expect(invalid.isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("keeps maximum-balance errors actionable and never retries them", async () => {
    request.mockImplementation(async () => new Response(JSON.stringify({ code: "MAX_BALANCE_REACHED", message: "Reward does not fit" }), { status: 422 }));
    const result = await call("horizon_redeem_gift_code", { code: "REWARD", userId, sessionToken: "fixture-session", idempotencyId: "unchanged-intent" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("MAX_BALANCE_REACHED");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
