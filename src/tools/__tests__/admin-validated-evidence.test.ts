import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import {
  registerAdminValidatedActionsTools,
  describeDownloadedLog,
} from "../admin/validated-actions.js";

// Contract checked against horizOn-Server AdminEvidenceController and EvidenceService
// (develop, TASK-888) on 2026-09-29, API key scoping on 2026-09-30. Never call a live API here.

const BASE = "https://evidence.test.invalid";
const RUN_ID = "5b0b6c1e-8d0f-4c55-9b0e-0e6a4a8a3d11";
const PROJECT_KEY = "11111111-1111-4111-8111-111111111111";
const HASH_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

type TextResult = { isError?: boolean; content: Array<{ type: string; text: string }> };

describe("describeDownloadedLog", () => {
  const bytes = new Uint8Array(Buffer.from("abc", "utf8"));

  it("returns hashes and base64 of the log", () => {
    expect(describeDownloadedLog(RUN_ID, bytes, HASH_ABC.toUpperCase(), "base64")).toEqual({
      runId: RUN_ID,
      bytes: 3,
      logHash: HASH_ABC,
      computedHash: HASH_ABC,
      hashMatches: true,
      logBase64: "YWJj",
    });
  });

  it("omits the log for the hash format and reports a mismatch", () => {
    const result = describeDownloadedLog(RUN_ID, bytes, "00".repeat(32), "hash");
    expect(result).not.toHaveProperty("logBase64");
    expect(result.hashMatches).toBe(false);
  });

  it("reports an unknown match without the hash header", () => {
    expect(describeDownloadedLog(RUN_ID, bytes, null, "hash").hashMatches).toBeNull();
  });
});

describe("admin evidence tools over MCP", () => {
  let server: McpServer;
  let client: Client;
  let request: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "test-account-key");
    vi.stubEnv("HORIZON_BASE_URL", BASE);
    request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], page: 0, size: 20, totalElements: 0 })));
    vi.stubGlobal("fetch", request);
    server = new McpServer({ name: "test", version: "1.0.0" });
    registerAdminValidatedActionsTools(server);
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

  it("registers the five evidence tools", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "horizon_admin_validated_evidence_delete",
      "horizon_admin_validated_evidence_download",
      "horizon_admin_validated_evidence_get",
      "horizon_admin_validated_evidence_list",
      "horizon_admin_validated_evidence_quota",
    ]);
    const del = tools.find((t) => t.name === "horizon_admin_validated_evidence_delete");
    expect(del?.annotations?.destructiveHint).toBe(true);
  });

  it("lists with the filters as query parameters and the account key header", async () => {
    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_list",
      arguments: { projectApiKeyId: PROJECT_KEY, leaderboardKey: "weekly", status: "UPLOADED", page: 1, size: 50 },
    })) as TextResult;

    expect(result.isError).not.toBe(true);
    const [url, options] = request.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(`${BASE}/api/v1/admin/validated-actions/evidence`);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      page: "1",
      size: "50",
      apiKeyId: PROJECT_KEY,
      leaderboardKey: "weekly",
      status: "UPLOADED",
    });
    expect(options.method).toBe("GET");
    expect(options.headers["X-Account-API-Key"]).toBe("test-account-key");
  });

  it("sends only page and size without filters", async () => {
    await client.callTool({ name: "horizon_admin_validated_evidence_list", arguments: {} });
    const parsed = new URL(request.mock.calls[0][0]);
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ page: "0", size: "20" });
  });

  it("rejects a leaderboardKey without projectApiKeyId before any request", async () => {
    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_list",
      arguments: { leaderboardKey: "weekly" },
    })) as TextResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("API_KEY_REQUIRED");
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps the same leaderboardKey of two Project API keys apart", async () => {
    const OTHER_KEY = "22222222-2222-4222-8222-222222222222";
    await client.callTool({
      name: "horizon_admin_validated_evidence_list",
      arguments: { projectApiKeyId: PROJECT_KEY, leaderboardKey: "weekly" },
    });
    await client.callTool({
      name: "horizon_admin_validated_evidence_list",
      arguments: { projectApiKeyId: OTHER_KEY, leaderboardKey: "weekly" },
    });

    const queries = request.mock.calls.map(([url]) => Object.fromEntries(new URL(url).searchParams));
    expect(queries).toEqual([
      { page: "0", size: "20", apiKeyId: PROJECT_KEY, leaderboardKey: "weekly" },
      { page: "0", size: "20", apiKeyId: OTHER_KEY, leaderboardKey: "weekly" },
    ]);
  });

  it("rejects an unknown status before any request", async () => {
    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_list",
      arguments: { status: "DONE" },
    })) as TextResult;
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("reads the quota", async () => {
    const quota = { used: 12, limit: 50, full: false, topNAllocated: 30, maxBytes: 32768 };
    request.mockResolvedValueOnce(new Response(JSON.stringify(quota)));

    const result = (await client.callTool({ name: "horizon_admin_validated_evidence_quota", arguments: {} })) as TextResult;

    expect(request.mock.calls[0][0]).toBe(`${BASE}/api/v1/admin/validated-actions/evidence/quota`);
    expect(JSON.parse(result.content[0].text)).toEqual(quota);
  });

  it("reads the metadata of one record", async () => {
    await client.callTool({ name: "horizon_admin_validated_evidence_get", arguments: { runId: RUN_ID } });
    expect(request.mock.calls[0][0]).toBe(`${BASE}/api/v1/admin/validated-actions/evidence/${RUN_ID}`);
  });

  it("scopes get, download and delete to projectApiKeyId", async () => {
    request.mockResolvedValueOnce(new Response(JSON.stringify({ runId: RUN_ID })));
    request.mockResolvedValueOnce(new Response(Buffer.from("abc", "utf8"), { headers: { "X-Input-Log-Hash": HASH_ABC } }));
    request.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await client.callTool({ name: "horizon_admin_validated_evidence_get", arguments: { runId: RUN_ID, projectApiKeyId: PROJECT_KEY } });
    await client.callTool({
      name: "horizon_admin_validated_evidence_download",
      arguments: { runId: RUN_ID, projectApiKeyId: PROJECT_KEY, format: "hash" },
    });
    await client.callTool({ name: "horizon_admin_validated_evidence_delete", arguments: { runId: RUN_ID, projectApiKeyId: PROJECT_KEY } });

    const record = `${BASE}/api/v1/admin/validated-actions/evidence/${RUN_ID}`;
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      `${record}?apiKeyId=${PROJECT_KEY}`,
      `${record}/log?apiKeyId=${PROJECT_KEY}`,
      `${record}?apiKeyId=${PROJECT_KEY}`,
    ]);
    expect(request.mock.calls[2][1].method).toBe("DELETE");
  });

  it("names the code when the record belongs to another Project API key", async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 404, code: "EVIDENCE_NOT_FOUND", message: "Evidence not found" }), { status: 404 }),
    );

    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_delete",
      arguments: { runId: RUN_ID, projectApiKeyId: PROJECT_KEY },
    })) as TextResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 404, code EVIDENCE_NOT_FOUND");
  });

  it("rejects a projectApiKeyId that is not a UUID before any request", async () => {
    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_get",
      arguments: { runId: RUN_ID, projectApiKeyId: "weekly" },
    })) as TextResult;
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });

  it("downloads the log as base64 and checks the hash header", async () => {
    request.mockResolvedValueOnce(
      new Response(Buffer.from("abc", "utf8"), {
        headers: { "Content-Type": "application/octet-stream", "X-Input-Log-Hash": HASH_ABC },
      }),
    );

    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_download",
      arguments: { runId: RUN_ID },
    })) as TextResult;

    expect(request.mock.calls[0][0]).toBe(`${BASE}/api/v1/admin/validated-actions/evidence/${RUN_ID}/log`);
    expect(JSON.parse(result.content[0].text)).toEqual({
      runId: RUN_ID,
      bytes: 3,
      logHash: HASH_ABC,
      computedHash: HASH_ABC,
      hashMatches: true,
      logBase64: "YWJj",
    });
  });

  it("downloads only the hashes for format hash", async () => {
    request.mockResolvedValueOnce(
      new Response(Buffer.from("abc", "utf8"), { headers: { "X-Input-Log-Hash": HASH_ABC } }),
    );

    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_download",
      arguments: { runId: RUN_ID, format: "hash" },
    })) as TextResult;

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).not.toHaveProperty("logBase64");
    expect(parsed.hashMatches).toBe(true);
  });

  it("names the code when the log is not uploaded yet", async () => {
    request.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 404, code: "EVIDENCE_NOT_UPLOADED", message: "The log was not uploaded yet" }), { status: 404 }),
    );

    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_download",
      arguments: { runId: RUN_ID },
    })) as TextResult;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 404, code EVIDENCE_NOT_UPLOADED");
  });

  it("deletes a record with DELETE and confirms it", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_delete",
      arguments: { runId: RUN_ID },
    })) as TextResult;

    const [url, options] = request.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/admin/validated-actions/evidence/${RUN_ID}`);
    expect(options.method).toBe("DELETE");
    expect(JSON.parse(result.content[0].text)).toEqual({ runId: RUN_ID, deleted: true });
  });

  it("rejects a run ID that is not a UUID before any request", async () => {
    const result = (await client.callTool({
      name: "horizon_admin_validated_evidence_delete",
      arguments: { runId: "../quota" },
    })) as TextResult;
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});

describe("admin evidence tools without an account key", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("answer with the missing key result", async () => {
    vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "");
    const server = new McpServer({ name: "test", version: "1.0.0" });
    registerAdminValidatedActionsTools(server);
    const client = new Client({ name: "test", version: "1.0.0" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    const result = (await client.callTool({ name: "horizon_admin_validated_evidence_quota", arguments: {} })) as TextResult;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HORIZON_ACCOUNT_API_KEY");

    await client.close();
    await server.close();
  });
});
