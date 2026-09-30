import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAdminValidatedActionsConfigTools } from "../admin/validated-actions-config.js";

// Contract checked against horizOn-Server AdminValidatedActionsController and
// AdminPlayerStateController (develop f55c3bc) on 2026-09-30. Never call a live API here.

const BASE = "https://validated.test.invalid";
const PROJECT_KEY = "11111111-1111-4111-8111-111111111111";
const USER_ID = "0d7e2f4a-9c1b-4a55-8e0e-3f6a4a8a3d11";

type TextResult = { isError?: boolean; content: Array<{ type: string; text: string }> };

describe("admin validated actions config tools over MCP", () => {
  let server: McpServer;
  let client: Client;
  let request: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "test-account-key");
    vi.stubEnv("HORIZON_BASE_URL", BASE);
    request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", request);
    server = new McpServer({ name: "test", version: "1.0.0" });
    registerAdminValidatedActionsConfigTools(server);
    client = new Client({ name: "test", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function lastCall(): { url: URL; options: RequestInit & { headers: Record<string, string> } } {
    const [url, options] = request.mock.calls[request.mock.calls.length - 1];
    return { url: new URL(url), options };
  }

  it("registers the seven config tools with matching annotations", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "horizon_admin_validated_rules_delete",
      "horizon_admin_validated_rules_get",
      "horizon_admin_validated_rules_set",
      "horizon_admin_validated_runs_list",
      "horizon_admin_validated_state_correct",
      "horizon_admin_validated_state_get",
      "horizon_admin_validated_usage_get",
    ]);
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const name of ["horizon_admin_validated_rules_set", "horizon_admin_validated_rules_delete", "horizon_admin_validated_state_correct"]) {
      expect(byName.get(name)?.annotations?.destructiveHint, name).toBe(true);
    }
    for (const name of ["horizon_admin_validated_rules_get", "horizon_admin_validated_usage_get", "horizon_admin_validated_runs_list", "horizon_admin_validated_state_get"]) {
      expect(byName.get(name)?.annotations?.readOnlyHint, name).toBe(true);
    }
  });

  it("reads the rules of a project key with the account key header", async () => {
    const result = (await client.callTool({
      name: "horizon_admin_validated_rules_get",
      arguments: { projectApiKeyId: PROJECT_KEY },
    })) as TextResult;
    expect(result.isError).not.toBe(true);
    const { url, options } = lastCall();
    expect(url.origin + url.pathname).toBe(`${BASE}/api/v1/admin/validated-actions/rules`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ apiKeyId: PROJECT_KEY });
    expect(options.method).toBe("GET");
    expect(options.headers["X-Account-API-Key"]).toBe("test-account-key");
  });

  it("replaces the rules with {apiKeyId, rules} as the body", async () => {
    const rules = { formatVersion: 1, defaults: { maxScore: 1000000, minDurationSeconds: 30 } };
    await client.callTool({
      name: "horizon_admin_validated_rules_set",
      arguments: { projectApiKeyId: PROJECT_KEY, rules },
    });
    const { url, options } = lastCall();
    expect(url.pathname).toBe("/api/v1/admin/validated-actions/rules");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ apiKeyId: PROJECT_KEY, rules });
  });

  it("deletes the rules with apiKeyId as query parameter and reports it", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 204 }));
    const result = (await client.callTool({
      name: "horizon_admin_validated_rules_delete",
      arguments: { projectApiKeyId: PROJECT_KEY },
    })) as TextResult;
    const { url, options } = lastCall();
    expect(url.pathname).toBe("/api/v1/admin/validated-actions/rules");
    expect(Object.fromEntries(url.searchParams)).toEqual({ apiKeyId: PROJECT_KEY });
    expect(options.method).toBe("DELETE");
    expect(JSON.parse(result.content[0].text)).toEqual({ projectApiKeyId: PROJECT_KEY, deleted: true });
  });

  it("reads the usage without parameters", async () => {
    const usage = { runsThisHour: 112, runsPerHourLimit: 300, windowStartsAt: "2026-09-29T14:00:00Z", windowEndsAt: "2026-09-29T15:00:00Z" };
    request.mockResolvedValueOnce(new Response(JSON.stringify(usage)));
    const result = (await client.callTool({ name: "horizon_admin_validated_usage_get", arguments: {} })) as TextResult;
    const { url } = lastCall();
    expect(url.pathname).toBe("/api/v1/admin/validated-actions/usage");
    expect(url.search).toBe("");
    expect(JSON.parse(result.content[0].text)).toEqual(usage);
  });

  it("lists runs with apiKeyId, limit and the optional status", async () => {
    await client.callTool({
      name: "horizon_admin_validated_runs_list",
      arguments: { projectApiKeyId: PROJECT_KEY, status: "REJECTED", limit: 10 },
    });
    let { url } = lastCall();
    expect(url.pathname).toBe("/api/v1/admin/validated-actions/runs");
    expect(Object.fromEntries(url.searchParams)).toEqual({ apiKeyId: PROJECT_KEY, limit: "10", status: "REJECTED" });

    await client.callTool({ name: "horizon_admin_validated_runs_list", arguments: { projectApiKeyId: PROJECT_KEY } });
    ({ url } = lastCall());
    expect(Object.fromEntries(url.searchParams)).toEqual({ apiKeyId: PROJECT_KEY, limit: "50" });
  });

  it("rejects an unknown run status before any request", async () => {
    const result = (await client.callTool({
      name: "horizon_admin_validated_runs_list",
      arguments: { projectApiKeyId: PROJECT_KEY, status: "DONE" },
    })) as TextResult;
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("reads a player's state with and without the project filter", async () => {
    await client.callTool({ name: "horizon_admin_validated_state_get", arguments: { userId: USER_ID } });
    let { url, options } = lastCall();
    expect(url.pathname).toBe(`/api/v1/admin/validated-actions/state/${USER_ID}`);
    expect(url.search).toBe("");
    expect(options.method).toBe("GET");

    await client.callTool({ name: "horizon_admin_validated_state_get", arguments: { userId: USER_ID, projectApiKeyId: PROJECT_KEY } });
    ({ url } = lastCall());
    expect(Object.fromEntries(url.searchParams)).toEqual({ apiKeyId: PROJECT_KEY });
  });

  it("corrects balances with values and note, apiKeyId as query parameter", async () => {
    await client.callTool({
      name: "horizon_admin_validated_state_correct",
      arguments: {
        userId: USER_ID,
        projectApiKeyId: PROJECT_KEY,
        values: [{ key: "gold", balance: 1250 }],
        note: "Refund for ticket 4711",
      },
    });
    const { url, options } = lastCall();
    expect(url.pathname).toBe(`/api/v1/admin/validated-actions/state/${USER_ID}`);
    expect(Object.fromEntries(url.searchParams)).toEqual({ apiKeyId: PROJECT_KEY });
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({
      values: [{ key: "gold", balance: 1250 }],
      note: "Refund for ticket 4711",
    });
  });

  it("leaves out a blank note and refuses a negative balance", async () => {
    await client.callTool({
      name: "horizon_admin_validated_state_correct",
      arguments: { userId: USER_ID, values: [{ key: "gold", balance: 0 }], note: "  " },
    });
    const { url, options } = lastCall();
    expect(url.search).toBe("");
    expect(JSON.parse(options.body as string)).toEqual({ values: [{ key: "gold", balance: 0 }] });

    request.mockClear();
    const result = (await client.callTool({
      name: "horizon_admin_validated_state_correct",
      arguments: { userId: USER_ID, values: [{ key: "gold", balance: -1 }] },
    })) as TextResult;
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("names the server code of an error", async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: "UNKNOWN_VALUE_KEY", message: "values[0].key" }), { status: 400 }),
    );
    const result = (await client.callTool({
      name: "horizon_admin_validated_state_correct",
      arguments: { userId: USER_ID, values: [{ key: "gems", balance: 5 }] },
    })) as TextResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("UNKNOWN_VALUE_KEY");
  });
});
