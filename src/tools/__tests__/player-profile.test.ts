import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPlayerProfileTools } from "../player-profile.js";
import { HorizonApiError } from "../api-client.js";

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

type SafeParse = { safeParse: (v: unknown) => { success: boolean } };

function createMockServer(): McpServer {
  return {
    registerTool: vi.fn((name: string, config: unknown, handler: Function) => {
      registeredTools.set(name, { schema: config, handler });
    }),
  } as unknown as McpServer;
}

function inputSchema(tool: string): Record<string, SafeParse> {
  const { schema } = registeredTools.get(tool)!;
  return (schema as { inputSchema: Record<string, SafeParse> }).inputSchema;
}

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";

const PROFILE_RESPONSE = {
  userId: USER_ID,
  profile: { avatarId: "avatar.zombie_07", frameId: null, badges: ["badge.supporter"] },
  unlocks: ["badge.supporter"],
  cosmetics: [
    { id: "avatar.zombie_07", type: "avatar", locked: false, available: true },
    { id: "badge.supporter", type: "badge", locked: true, available: true },
  ],
  limits: { maxBadges: 3, maxUnlocks: 25 },
};

describe("registerPlayerProfileTools", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.restoreAllMocks();
  });

  it("registers the get and set tools", () => {
    registerPlayerProfileTools(createMockServer());

    expect(registeredTools.has("horizon_get_profile")).toBe(true);
    expect(registeredTools.has("horizon_set_profile")).toBe(true);
    expect(registeredTools.size).toBe(2);
  });

  it("gets the profile with the player session as Bearer header", async () => {
    registerPlayerProfileTools(createMockServer());

    const mockGet = vi.fn().mockResolvedValue(PROFILE_RESPONSE);
    mockedCreateApiClient.mockReturnValue({ get: mockGet } as any);

    const { handler } = registeredTools.get("horizon_get_profile")!;
    const result = await handler({ userId: USER_ID, sessionToken: "session-881" });

    expect(mockGet).toHaveBeenCalledWith(
      "/api/v1/app/player-profile",
      { userId: USER_ID },
      { Authorization: "Bearer session-881" },
    );
    expect(JSON.parse(result.content[0].text)).toEqual(PROFILE_RESPONSE);
  });

  it("sets the whole profile with PUT and the Bearer header", async () => {
    registerPlayerProfileTools(createMockServer());

    const mockPut = vi.fn().mockResolvedValue(PROFILE_RESPONSE);
    mockedCreateApiClient.mockReturnValue({ put: mockPut } as any);

    const { handler } = registeredTools.get("horizon_set_profile")!;
    await handler({
      userId: USER_ID,
      sessionToken: "session-881",
      avatarId: "avatar.zombie_07",
      badges: ["badge.supporter"],
    });

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/app/player-profile",
      { userId: USER_ID, avatarId: "avatar.zombie_07", frameId: null, badges: ["badge.supporter"] },
      { Authorization: "Bearer session-881" },
    );
  });

  it("sends null slots and an empty badge list when everything is cleared", async () => {
    registerPlayerProfileTools(createMockServer());

    const mockPut = vi.fn().mockResolvedValue(PROFILE_RESPONSE);
    mockedCreateApiClient.mockReturnValue({ put: mockPut } as any);

    const { handler } = registeredTools.get("horizon_set_profile")!;
    await handler({ userId: USER_ID, sessionToken: "s", avatarId: "", frameId: null });

    expect(mockPut).toHaveBeenCalledWith(
      "/api/v1/app/player-profile",
      { userId: USER_ID, avatarId: null, frameId: null, badges: [] },
      { Authorization: "Bearer s" },
    );
  });

  it("requires a session token for both tools", () => {
    registerPlayerProfileTools(createMockServer());

    for (const tool of ["horizon_get_profile", "horizon_set_profile"]) {
      const schema = inputSchema(tool);
      expect(schema.sessionToken.safeParse(undefined).success, tool).toBe(false);
      expect(schema.sessionToken.safeParse("session-881").success, tool).toBe(true);
    }
  });

  it("validates badges and cosmetic IDs locally", () => {
    registerPlayerProfileTools(createMockServer());
    const schema = inputSchema("horizon_set_profile");

    expect(schema.badges.safeParse(["badge.a", "badge.b", "badge.c"]).success).toBe(true);
    expect(schema.badges.safeParse(["badge.a", "badge.b", "badge.c", "badge.d"]).success).toBe(false);
    expect(schema.badges.safeParse(["Badge A"]).success).toBe(false);
    expect(schema.avatarId.safeParse("avatar.zombie_07").success).toBe(true);
    expect(schema.avatarId.safeParse("").success).toBe(true);
    expect(schema.avatarId.safeParse(null).success).toBe(true);
    expect(schema.avatarId.safeParse("Avatar.Zombie").success).toBe(false);
    expect(schema.frameId.safeParse("f".repeat(33)).success).toBe(false);
  });

  it("says that set replaces the whole profile", () => {
    registerPlayerProfileTools(createMockServer());
    const { schema } = registeredTools.get("horizon_set_profile")!;
    expect((schema as { description: string }).description).toContain("REPLACES THE WHOLE PROFILE");
  });

  it("names the server error code in the error result", async () => {
    registerPlayerProfileTools(createMockServer());

    const body = JSON.stringify({ status: 403, code: "COSMETIC_LOCKED", message: "Cosmetic 'frame.gold' is locked for this player" });
    const mockPut = vi.fn().mockRejectedValue(new HorizonApiError(403, body));
    mockedCreateApiClient.mockReturnValue({ put: mockPut } as any);

    const { handler } = registeredTools.get("horizon_set_profile")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s", frameId: "frame.gold" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 403, code COSMETIC_LOCKED");
  });

  it("returns the no API key result without a client", async () => {
    registerPlayerProfileTools(createMockServer());
    mockedCreateApiClient.mockReturnValue(null);

    const { handler } = registeredTools.get("horizon_get_profile")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HORIZON_API_KEY");
  });
});
