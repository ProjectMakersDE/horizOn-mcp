import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440000";
const projectApiKeyId = "650e8400-e29b-41d4-a716-446655440001";
const operationId = "1792100000000:750e8400-e29b-41d4-a716-446655440002";
const state = { userId, revision: 4, values: [{ key: "gold", balance: 5000000000, earnedToday: 0, dailyCap: null }], operation: { operationId, replayed: true, applied: [{ key: "gold", amount: -30 }] } };
let client: Client;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubEnv("HORIZON_API_KEY", "fixture-app-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.stubEnv("HORIZON_BASE_URL", "http://fixture.invalid");
  vi.spyOn(console, "error").mockImplementation(() => {});
  request = vi.fn(async () => new Response(JSON.stringify(state), { status: 200 }));
  vi.stubGlobal("fetch", request);
  client = new Client({ name: "player-values-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(serverTransport), client.connect(clientTransport)]);
});
afterEach(async () => { await client?.close(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });

describe("player values over MCP and HTTP transport", () => {
  it("forwards only the own session header and preserves replay plus 64-bit balances", async () => {
    const result = await call("horizon_purchase_player_value_offer", { userId, sessionToken: "player-session", offerKey: "gems", operationId });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse((result.content as { text: string }[])[0].text)).toEqual(state);
    expect(request).toHaveBeenCalledOnce();
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://fixture.invalid/api/v1/app/player-values/purchase");
    expect(options.headers).toMatchObject({ "X-API-Key": "fixture-app-key", Authorization: "Bearer player-session" });
    expect(options.headers).not.toHaveProperty("X-Account-API-Key");
    expect(JSON.parse(options.body as string)).toEqual({ userId, offerKey: "gems", operationId });
  });
  it("uses the four matching app routes without changing the operation payload", async () => {
    await call("horizon_get_player_values", { userId, sessionToken: "s" });
    await call("horizon_get_player_value_offers", { userId, sessionToken: "s" });
    await call("horizon_adjust_player_value", { userId, sessionToken: "s", key: "gold", amount: -5000000000, reason: "spend", operationId });
    const calls = request.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toBe(`http://fixture.invalid/api/v1/app/player-values?userId=${userId}`);
    expect(calls[1][0]).toBe(`http://fixture.invalid/api/v1/app/player-values/offers?userId=${userId}`);
    expect(calls[2][0]).toBe("http://fixture.invalid/api/v1/app/player-values/adjust");
    expect(JSON.parse(calls[2][1].body as string)).toEqual({ userId, key: "gold", amount: -5000000000, reason: "spend", operationId });
  });
  it("surfaces domain failure with state and never retries or replaces an uncertain ID", async () => {
    request.mockImplementationOnce(async () => new Response(JSON.stringify({ code: "OPERATION_EXPIRED", state }), { status: 409 }));
    const result = await call("horizon_purchase_player_value_offer", { userId, sessionToken: "s", offerKey: "gems", operationId });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0].text).toContain("OPERATION_EXPIRED");
    expect((result.content as { text: string }[])[0].text).toContain("5000000000");
    expect(request).toHaveBeenCalledOnce();
  });
  it("rejects unsafe numbers, blank audit reasons and missing sessions before HTTP", async () => {
    for (const amount of [1.5, "1", null, 9007199254740992, 0]) {
      expect((await call("horizon_adjust_player_value", { userId, sessionToken: "s", key: "gold", amount, reason: "audit", operationId })).isError).toBe(true);
    }
    expect((await call("horizon_adjust_player_value", { userId, sessionToken: "s", key: "gold", amount: 1, reason: " ", operationId })).isError).toBe(true);
    expect((await call("horizon_get_player_values", { userId })).isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
  it("uses account authentication and an explicit If-Match revision for catalogue replacement", async () => {
    const definitions = [{ key: "gold", name: "Gold", initialBalance: 5000000000, dailyCap: null }];
    await call("horizon_admin_player_values_config_set", { projectApiKeyId, expectedRevision: 3, definitions, offers: [] });
    const [url, options] = request.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`http://fixture.invalid/api/v1/admin/player-values/config?apiKeyId=${projectApiKeyId}`);
    expect(options.headers).toMatchObject({ "X-Account-API-Key": "fixture-account-key", "If-Match": '"3"' });
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.headers).not.toHaveProperty("X-API-Key");
    expect(JSON.parse(options.body as string)).toEqual({ definitions, offers: [] });
  });
  it("routes bounded history and corrections to the selected project and retains the support note", async () => {
    await call("horizon_admin_player_values_config_get", { projectApiKeyId });
    await call("horizon_admin_player_values_player_get", { projectApiKeyId, userId });
    await call("horizon_admin_player_values_player_correct", { projectApiKeyId, userId, values: [{ key: "gold", balance: 0 }], note: "Refund case", operationId });
    const calls = request.mock.calls as unknown as [string, RequestInit][];
    expect(calls[0][0]).toContain("/config?apiKeyId=");
    expect(calls[1][0]).toBe(`http://fixture.invalid/api/v1/admin/player-values/players/${userId}?apiKeyId=${projectApiKeyId}`);
    expect(calls[2][1].method).toBe("PUT");
    expect(JSON.parse(calls[2][1].body as string)).toEqual({ values: [{ key: "gold", balance: 0 }], note: "Refund case", operationId });
    expect((await call("horizon_admin_player_values_player_correct", { projectApiKeyId, userId, values: [{ key: "gold", balance: 0 }], note: " ", operationId })).isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(3);
  });
  it("discovers the resource and both prompts with the player-values contract", async () => {
    const resources = await client.listResources();
    expect(resources.resources.some(r => r.uri === "horizon://docs/player-values")).toBe(true);
    const resource = await client.readResource({ uri: "horizon://docs/player-values" });
    expect(resource.contents[0]).toMatchObject({ text: expect.stringContaining("OPERATION_EXPIRED") });
    for (const name of ["integrate-feature", "explain-feature"]) {
      const result = await client.getPrompt({ name, arguments: { feature: "player-values", ...(name === "integrate-feature" ? { engine: "unreal" } : {}) } });
      expect(result.messages[0].content).toMatchObject({ type: "text", text: expect.stringContaining("horizon://docs/player-values") });
    }
    expect(request).not.toHaveBeenCalled();
  });
});
