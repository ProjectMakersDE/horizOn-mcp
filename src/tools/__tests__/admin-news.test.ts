import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAdminNewsTools } from "../admin/news.js";

// Contract checked against horizOn-Server NewsService.applyPublicationState and
// CreateNewsRequest/UpdateNewsRequest on 2026-09-23. Never call a live API here.
describe("admin news scheduling over MCP", () => {
  let server: McpServer;
  let client: Client;
  let request: ReturnType<typeof vi.fn>;
  const id = "11111111-1111-4111-8111-111111111111";
  const input = {
    projectApiKeyId: id, titles: { de: "Neu", en: "New" },
    messages: { de: "Nachricht", en: "Message" },
    releaseDate: "2026-09-24T12:30:00",
  };

  beforeEach(async () => {
    vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "test-account-key");
    vi.stubEnv("HORIZON_BASE_URL", "https://news.test.invalid");
    request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id })));
    vi.stubGlobal("fetch", request);
    server = new McpServer({ name: "test", version: "1.0.0" });
    registerAdminNewsTools(server);
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

  it("advertises scheduling for create and update", async () => {
    const { tools } = await client.listTools();
    for (const action of ["create", "update"]) {
      expect(tools.find(t => t.name === `horizon_admin_news_${action}`)?.inputSchema.properties)
        .toHaveProperty("isScheduled");
    }
  });
  it.each([true, false])("forwards isScheduled=%s on create", async isScheduled => {
    const result = await client.callTool({ name: "horizon_admin_news_create", arguments: { ...input, isPublished: false, isScheduled } });
    expect(result.isError).not.toBe(true);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://news.test.invalid/api/v1/admin/news");
    expect(options.headers["X-Account-API-Key"]).toBe("test-account-key");
    expect(JSON.parse(options.body)).toEqual({ apiKeyId: id, titles: input.titles, messages: input.messages, releaseDate: input.releaseDate, isPublished: false, isScheduled });
  });
  it.each([true, false])("forwards isScheduled=%s on update", async isScheduled => {
    await client.callTool({ name: "horizon_admin_news_update", arguments: { id, isScheduled, releaseDate: input.releaseDate } });
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ isScheduled, releaseDate: input.releaseDate });
  });
  it("keeps omitted scheduling absent on partial update", async () => {
    await client.callTool({ name: "horizon_admin_news_update", arguments: { id, titles: input.titles } });
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ titles: input.titles });
  });
  it.each(["create", "update"])("rejects published plus scheduled for %s before HTTP", async action => {
    const result = await client.callTool({ name: `horizon_admin_news_${action}`, arguments: { ...(action === "create" ? input : { id }), isPublished: true, isScheduled: true } });
    expect(result.isError).toBe(true);
    expect(request).not.toHaveBeenCalled();
  });
});
