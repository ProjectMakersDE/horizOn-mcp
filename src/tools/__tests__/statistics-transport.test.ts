import { createServer as httpServer, type Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../server.js";

const userId = "550e8400-e29b-41d4-a716-446655440001";
const projectApiKeyId = "550e8400-e29b-41d4-a716-446655440002";
const operationId = "1792000000000:550E8400-E29B-41D4-A716-446655440003";
const definitions = Array.from({ length: 201 }, (_, i) => ({ key: `counter-${i}`, name: `Counter ${i}`, mode: "sum", reset: "none" }));
const updates = definitions.map(({ key }) => ({ key, value: 1 }));
const player = { userId, sessionToken: "fixture-session" };
let client: Client, http: Server, configuredLimit: number, applied: boolean;
let requests: { path: string; body: Record<string, unknown>; headers: Record<string, unknown> }[];
const call = (name: string, args: Record<string, unknown>) => client.callTool({ name, arguments: args });
const data = (result: Awaited<ReturnType<typeof call>>) => JSON.parse((result.content as { text: string }[])[0].text);

beforeEach(async () => {
  configuredLimit = 250; applied = false; requests = [];
  vi.stubEnv("HORIZON_API_KEY", "fixture-project-key");
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "fixture-account-key");
  vi.spyOn(console, "error").mockImplementation(() => {});
  http = httpServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    requests.push({ path: req.url!, body, headers: req.headers });
    res.setHeader("Content-Type", "application/json");
    const admin = req.url!.startsWith("/api/v1/admin/");
    if (admin) {
      if (req.url!.includes("/limits")) { res.end(JSON.stringify({ maxDefinitions: configuredLimit })); return; }
      if (req.method === "PUT" && body.definitions.length > configuredLimit) {
        res.statusCode = 403; res.end(JSON.stringify({ code: "STATISTIC_LIMIT_REACHED" })); return;
      }
      res.end(JSON.stringify({ apiKeyId: projectApiKeyId, definitionVersion: 4, definitions, limits: { maxDefinitions: configuredLimit } })); return;
    }
    const replayed = req.method === "POST" && applied && body.operationId === operationId;
    if (req.method === "POST" && !replayed && body.updates.length > configuredLimit) {
      res.statusCode = 422; res.end(JSON.stringify({ code: "STATISTIC_LIMIT_REACHED" })); return;
    }
    if (req.method === "POST") applied = true;
    if (req.url!.includes("/definitions")) { res.end(JSON.stringify({ definitionVersion: 4, definitions })); return; }
    res.end(JSON.stringify({ userId, definitionVersion: 4, definitions, revision: applied ? 1 : 0,
      values: definitions.map(({ key }) => ({ key, value: applied ? 1 : 0, hasValue: applied, period: null })),
      operationWindow: { serverTimeUnixMillis: 1792000000000, maxAgeSeconds: 86400, maxFutureSkewSeconds: 30 },
      operationId: req.method === "POST" ? body.operationId : null, replayed, newlyUnlocked: [] }));
  });
  await new Promise<void>(resolve => http.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("HORIZON_BASE_URL", `http://127.0.0.1:${(http.address() as { port: number }).port}`);
  client = new Client({ name: "statistics-configured-limit-http", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer().connect(b), client.connect(a)]);
});
afterEach(async () => {
  await client.close(); http.closeAllConnections(); await new Promise<void>(resolve => http.close(() => resolve()));
  vi.unstubAllEnvs(); vi.restoreAllMocks();
});

describe("statistics operator limits over actual MCP and loopback HTTP", () => {
  it("transmits an operator-enabled catalog and atomic batch above the former 100-key ceiling", async () => {
    const admin = data(await call("horizon_admin_statistics_definitions_set", { projectApiKeyId, expectedVersion: 3, definitions }));
    expect(admin.definitions).toEqual(definitions);
    const result = data(await call("horizon_update_statistics", { ...player, operationId, updates }));
    expect(result.definitions).toEqual(definitions); expect(result.values).toHaveLength(201);
    expect(result.operationId).toBe(operationId); expect(result.replayed).toBe(false);
    expect(requests).toHaveLength(2);
    expect(requests[0].path).toBe(`/api/v1/admin/statistics/definitions?apiKeyId=${projectApiKeyId}`);
    expect(requests[0].headers["if-match"]).toBe("3"); expect(requests[0].headers["x-account-api-key"]).toBe("fixture-account-key");
    expect(requests[0].headers.authorization).toBeUndefined(); expect(requests[0].body).toEqual({ definitions });
    expect(requests[1].headers.authorization).toBe("Bearer fixture-session"); expect(requests[1].headers["x-api-key"]).toBe("fixture-project-key");
    expect(requests[1].headers["x-account-api-key"]).toBeUndefined(); expect(requests[1].body).toEqual({ userId, operationId, updates });
  });
  it("keeps existing reads and the identical original retry intact after the configured limit falls", async () => {
    const original = { ...player, operationId, updates }, saved = JSON.stringify(original);
    await call("horizon_update_statistics", original); configuredLimit = 20;
    expect(data(await call("horizon_admin_statistics_limits", { projectApiKeyId })).maxDefinitions).toBe(20);
    expect(data(await call("horizon_get_statistics_definitions", { sessionToken: player.sessionToken })).definitions).toEqual(definitions);
    expect(data(await call("horizon_get_statistics", player)).values).toHaveLength(201);
    expect(data(await call("horizon_admin_statistics_definitions_get", { projectApiKeyId })).definitions).toEqual(definitions);
    const replay = data(await call("horizon_update_statistics", JSON.parse(saved)));
    expect(replay.replayed).toBe(true); expect(replay.operationId).toBe(operationId); expect(replay.values).toHaveLength(201);
    expect(requests[0].body).toEqual(requests.at(-1)!.body); expect(JSON.stringify(original)).toBe(saved);
  });
  it("surfaces the server's configured rejection once without truncating a catalog or changing an operation", async () => {
    configuredLimit = 20;
    const args = { ...player, operationId, updates }, saved = JSON.stringify(args);
    for (const [name, input] of [
      ["horizon_admin_statistics_definitions_set", { projectApiKeyId, expectedVersion: 3, definitions }],
      ["horizon_update_statistics", args],
    ] as const) {
      const before = requests.length, result = await call(name, input);
      expect(result.isError).toBe(true); expect(JSON.stringify(result)).toContain("STATISTIC_LIMIT_REACHED");
      expect(requests).toHaveLength(before + 1);
    }
    expect(requests[0].body).toEqual({ definitions }); expect(requests[1].body).toEqual({ userId, operationId, updates });
    expect(JSON.stringify(args)).toBe(saved); expect(applied).toBe(false);
  });
});
