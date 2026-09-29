import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerGiftCodeTools } from "../gift-codes.js";

vi.mock("../api-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api-client.js")>();
  return {
    ...actual,
    createApiClientFromEnv: vi.fn(),
  };
});

import { createApiClientFromEnv } from "../api-client.js";

const mockedCreateApiClient = vi.mocked(createApiClientFromEnv);
const registeredTools = new Map<string, { schema: unknown; handler: Function }>();

function createMockServer(): McpServer {
  return {
    registerTool: vi.fn((name: string, config: unknown, handler: Function) => {
      registeredTools.set(name, { schema: config, handler });
    }),
  } as unknown as McpServer;
}

describe("registerGiftCodeTools", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.restoreAllMocks();
  });

  it("redeems with the player session as Bearer header", async () => {
    const server = createMockServer();
    registerGiftCodeTools(server);

    const mockPost = vi.fn().mockResolvedValue({ success: true, message: "ok", giftData: "{}" });
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_redeem_gift_code")!;
    const result = await handler({
      code: "SUMMER2026",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      sessionToken: "session-886",
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/gift-codes/redeem",
      { code: "SUMMER2026", userId: "550e8400-e29b-41d4-a716-446655440000" },
      { Authorization: "Bearer session-886" },
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ success: true, message: "ok", giftData: "{}" });
  });

  it("passes grantedUnlocks of a code with grants through", async () => {
    const server = createMockServer();
    registerGiftCodeTools(server);

    const response = {
      success: true,
      message: "Gift code redeemed successfully",
      giftData: "{\"grants\": [\"badge.supporter\"]}",
      grantedUnlocks: ["badge.supporter"],
    };
    const mockPost = vi.fn().mockResolvedValue(response);
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler, schema } = registeredTools.get("horizon_redeem_gift_code")!;
    const result = await handler({
      code: "SUPPORTER",
      userId: "550e8400-e29b-41d4-a716-446655440000",
      sessionToken: "session-881",
    });

    expect(JSON.parse(result.content[0].text).grantedUnlocks).toEqual(["badge.supporter"]);
    expect((schema as { description: string }).description).toContain("grantedUnlocks");
  });

  it("requires a session token for redeem", () => {
    const server = createMockServer();
    registerGiftCodeTools(server);

    const { schema } = registeredTools.get("horizon_redeem_gift_code")!;
    const inputSchema = (schema as { inputSchema: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }).inputSchema;
    expect(inputSchema.sessionToken.safeParse(undefined).success).toBe(false);
    expect(inputSchema.sessionToken.safeParse("session-886").success).toBe(true);
  });

  it("validates without a session because validate has no side effects", async () => {
    const server = createMockServer();
    registerGiftCodeTools(server);

    const mockPost = vi.fn().mockResolvedValue({ valid: true });
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_validate_gift_code")!;
    await handler({ code: "SUMMER2026", userId: "550e8400-e29b-41d4-a716-446655440000" });

    expect(mockPost).toHaveBeenCalledWith("/api/v1/app/gift-codes/validate", {
      code: "SUMMER2026",
      userId: "550e8400-e29b-41d4-a716-446655440000",
    });
  });
});
