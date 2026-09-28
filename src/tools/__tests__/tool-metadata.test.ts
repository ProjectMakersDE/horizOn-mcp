import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllTools } from "../index.js";
import { errorResponse, noApiKeyResponse, API_ERRORS } from "../tool-helpers.js";

type ToolConfig = {
  description?: string;
  annotations?: { readOnlyHint?: boolean; openWorldHint?: boolean };
};

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

describe("player tool metadata", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.unstubAllEnvs();
  });

  it("gives every player tool annotations and the API error note", () => {
    vi.stubEnv("HORIZON_ACCOUNT_API_KEY", "");
    registerAllTools(createMockServer());

    expect(registeredTools.size).toBe(28);
    for (const [name, config] of registeredTools) {
      expect(config.annotations, name).toBeDefined();
      expect(config.annotations?.openWorldHint, name).toBe(true);
      expect(config.description, name).toContain(API_ERRORS);
    }
  });

  it("marks error results as errors", () => {
    expect(noApiKeyResponse().isError).toBe(true);
    expect(errorResponse(new Error("boom")).isError).toBe(true);
  });
});
