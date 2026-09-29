import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { registerAllTools } from "../index.js";
import { createServer } from "../../server.js";
import { errorResponse, noApiKeyResponse, structuredResponse, describeTool, API_ERRORS } from "../tool-helpers.js";
import { ADMIN_AUTH } from "../admin/_utils.js";

type Annotations = {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

type Describable = { description?: string };

type ToolConfig = {
  title?: string;
  description?: string;
  inputSchema?: Record<string, Describable>;
  outputSchema?: unknown;
  annotations?: Annotations;
};

/** Tool names are part of the public contract: renaming one is a breaking change. */
const PLAYER_TOOLS = [
  "horizon_test_connection",
  "horizon_signup_anonymous",
  "horizon_signup_email",
  "horizon_signin_email",
  "horizon_signin_anonymous",
  "horizon_check_auth",
  "horizon_list_leaderboards",
  "horizon_submit_score",
  "horizon_get_leaderboard_top",
  "horizon_get_user_rank",
  "horizon_get_leaderboard_around",
  "horizon_save_cloud_data",
  "horizon_load_cloud_data",
  "horizon_get_remote_config",
  "horizon_get_all_remote_configs",
  "horizon_get_localization",
  "horizon_get_all_localizations",
  "horizon_get_localization_languages",
  "horizon_get_news",
  "horizon_validate_gift_code",
  "horizon_redeem_gift_code",
  "horizon_get_profile",
  "horizon_set_profile",
  "horizon_start_run",
  "horizon_submit_validated",
  "horizon_get_state",
  "horizon_upload_evidence",
  "horizon_submit_feedback",
  "horizon_create_log",
  "horizon_create_crash_report",
  "horizon_create_crash_session",
  "horizon_send_email",
  "horizon_cancel_email",
  "horizon_get_email_status",
].sort();

/** Read-only player tools that return an object and declare an outputSchema. */
const STRUCTURED_TOOLS = [
  "horizon_test_connection",
  "horizon_check_auth",
  "horizon_list_leaderboards",
  "horizon_get_leaderboard_top",
  "horizon_get_user_rank",
  "horizon_get_leaderboard_around",
  "horizon_load_cloud_data",
  "horizon_get_remote_config",
  "horizon_get_all_remote_configs",
  "horizon_get_localization",
  "horizon_get_all_localizations",
  "horizon_get_localization_languages",
  "horizon_validate_gift_code",
  "horizon_get_profile",
  "horizon_get_state",
  "horizon_get_email_status",
].sort();

const registeredTools = new Map<string, ToolConfig>();

function createMockServer(): McpServer {
  return {
    registerTool: vi.fn((name: string, config: ToolConfig) => {
      registeredTools.set(name, config);
    }),
    registerPrompt: vi.fn(),
    registerResource: vi.fn(),
  } as unknown as McpServer;
}

function registerTools(withAdmin: boolean): Map<string, ToolConfig> {
  registeredTools.clear();
  vi.stubEnv("HORIZON_ACCOUNT_API_KEY", withAdmin ? "test-account-key" : "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  registerAllTools(createMockServer());
  return new Map(registeredTools);
}

/**
 * The quality bar every tool description has to meet: a front-loaded first
 * line, then usage guidance, the result and the failure cases with the auth
 * note of its family.
 */
function expectDescriptionQuality(name: string, description: string | undefined, footer: string): void {
  expect(description, name).toBeDefined();
  const text = description as string;
  const [summary] = text.split("\n");

  // Purpose: one sentence, front-loaded, starting with a verb
  expect(summary.length, `${name}: summary too long`).toBeLessThanOrEqual(240);
  expect(summary.length, `${name}: summary too short`).toBeGreaterThanOrEqual(40);
  expect(summary, `${name}: summary must start with a capitalised verb`).toMatch(/^[A-Z][a-z]+s\b/);

  // Usage guidelines, result and failure handling
  expect(text, `${name}: missing "Use when:"`).toContain("\nUse when: ");
  expect(text, `${name}: missing "Not for:"`).toContain("\nNot for: ");
  expect(text, `${name}: missing "Returns:"`).toContain("\nReturns: ");
  expect(text, `${name}: missing "Errors:"`).toContain("\nErrors: ");
  expect(text, `${name}: missing auth note`).toContain(footer);

  // Points at a sibling tool, so the agent knows what to use instead
  const siblings = (text.match(/horizon_[a-z_*]+/g) ?? []).filter((tool) => tool !== name);
  expect(siblings.length, `${name}: names no sibling tool`).toBeGreaterThan(0);

  // House style: no em or en dashes
  expect(text, `${name}: contains a dash`).not.toMatch(/[–—]/);
}

function expectAnnotations(name: string, annotations: Annotations | undefined): void {
  expect(annotations, name).toBeDefined();
  const hints = annotations as Annotations;
  for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
    expect(typeof hints[hint], `${name}: ${hint}`).toBe("boolean");
  }
  // Every tool calls the horizOn API
  expect(hints.openWorldHint, name).toBe(true);
  if (hints.readOnlyHint) {
    expect(hints.destructiveHint, `${name}: a read-only tool cannot be destructive`).toBe(false);
    expect(hints.idempotentHint, `${name}: a read-only tool is idempotent`).toBe(true);
  }
}

function expectParameterDescriptions(name: string, inputSchema: Record<string, Describable> | undefined): void {
  for (const [param, schema] of Object.entries(inputSchema ?? {})) {
    expect(schema.description, `${name}.${param} has no description`).toBeDefined();
    expect((schema.description as string).length, `${name}.${param} description too short`).toBeGreaterThanOrEqual(15);
    expect(schema.description as string, `${name}.${param}: contains a dash`).not.toMatch(/[–—]/);
  }
}

describe("player tool metadata", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("registers exactly the published player tool names", () => {
    const tools = registerTools(false);
    expect([...tools.keys()].sort()).toEqual(PLAYER_TOOLS);
  });

  it("gives every player tool a title, all four annotations and described parameters", () => {
    for (const [name, config] of registerTools(false)) {
      expect(config.title, name).toBeTruthy();
      expectAnnotations(name, config.annotations);
      expectParameterDescriptions(name, config.inputSchema);
    }
  });

  it("gives every player tool a structured description with usage, result and errors", () => {
    for (const [name, config] of registerTools(false)) {
      expectDescriptionQuality(name, config.description, API_ERRORS);
    }
  });

  it("declares an outputSchema exactly for the structured read tools", () => {
    const tools = registerTools(false);
    const withOutput = [...tools].filter(([, config]) => config.outputSchema !== undefined).map(([name]) => name);
    expect(withOutput.sort()).toEqual(STRUCTURED_TOOLS);
    for (const name of STRUCTURED_TOOLS) {
      expect(tools.get(name)?.annotations?.destructiveHint, name).toBe(false);
    }
  });

  it("marks the destructive player tools", () => {
    const tools = registerTools(false);
    const destructive = [...tools]
      .filter(([, config]) => config.annotations?.destructiveHint)
      .map(([name]) => name)
      .sort();
    expect(destructive).toEqual(
      ["horizon_cancel_email", "horizon_save_cloud_data", "horizon_set_profile", "horizon_submit_validated"].sort(),
    );
  });

  it("marks error results as errors", () => {
    expect(noApiKeyResponse().isError).toBe(true);
    expect(errorResponse(new Error("boom")).isError).toBe(true);
  });
});

describe("admin tool metadata", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("registers admin tools only with an Account Key", () => {
    const player = registerTools(false);
    const all = registerTools(true);
    const admin = [...all.keys()].filter((name) => !player.has(name));
    expect(admin.length).toBe(79);
    expect(admin.every((name) => name.startsWith("horizon_admin_"))).toBe(true);
  });

  it("gives every admin tool a title, all four annotations, described parameters and a structured description", () => {
    const player = registerTools(false);
    for (const [name, config] of registerTools(true)) {
      if (player.has(name)) continue;
      expect(config.title, name).toBeTruthy();
      expectAnnotations(name, config.annotations);
      expectParameterDescriptions(name, config.inputSchema);
      expectDescriptionQuality(name, config.description, ADMIN_AUTH);
    }
  });

  it("marks every admin delete tool as destructive and every list or get tool as read-only", () => {
    const player = registerTools(false);
    for (const [name, config] of registerTools(true)) {
      if (player.has(name)) continue;
      if (/_(delete|bulk_delete)$/.test(name)) {
        expect(config.annotations?.destructiveHint, name).toBe(true);
      }
      if (/_(list|get|stats|statistics)$/.test(name)) {
        expect(config.annotations?.readOnlyHint, name).toBe(true);
      }
    }
  });
});

describe("describeTool", () => {
  it("puts the summary first and the footer on the Errors line", () => {
    const text = describeTool(
      { summary: "Reads a thing.", use: "you need it.", returns: "{thing}.", errors: "404 when missing." },
      "FOOTER",
    );
    expect(text).toBe("Reads a thing.\nUse when: you need it.\nReturns: {thing}.\nErrors: 404 when missing. FOOTER");
  });

  it("wraps non-object data for structuredContent", () => {
    expect(structuredResponse({ a: 1 }).structuredContent).toEqual({ a: 1 });
    expect(structuredResponse([1, 2]).structuredContent).toEqual({ value: [1, 2] });
    expect(structuredResponse(null).structuredContent).toEqual({ value: null });
  });
});

describe("tool metadata over the MCP protocol", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function connect(): Promise<Client> {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = createServer();
    const client = new Client({ name: "metadata-test", version: "0.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it("lists annotations and output schemas as JSON Schema", async () => {
    vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "");
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.length).toBe(PLAYER_TOOLS.length);
    for (const tool of tools) {
      expect(tool.annotations?.openWorldHint, tool.name).toBe(true);
      expect(tool.title, tool.name).toBeTruthy();
    }
    const rank = tools.find((tool) => tool.name === "horizon_get_user_rank");
    expect(rank?.outputSchema?.type).toBe("object");
    expect(Object.keys(rank?.outputSchema?.properties ?? {})).toEqual(
      expect.arrayContaining(["position", "username", "score", "profile"]),
    );
    await client.close();
  });

  it("returns structuredContent that passes the SDK's output validation, also with unknown or null fields", async () => {
    vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "");
    vi.stubEnv("HORIZON_API_KEY", "test-key");
    vi.stubEnv("HORIZON_BASE_URL", "http://mock.invalid");
    const body = {
      position: 3,
      username: "Ada",
      score: 1200,
      profile: { avatarId: null, frameId: null, badges: [] },
      newServerField: "tolerated",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } })),
    );

    const client = await connect();
    const result = await client.callTool({
      name: "horizon_get_user_rank",
      arguments: { userId: "550e8400-e29b-41d4-a716-446655440000" },
    });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(body);
    await client.close();
  });
});
