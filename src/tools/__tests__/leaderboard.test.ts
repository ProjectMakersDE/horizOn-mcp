import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerLeaderboardTools } from "../leaderboard.js";

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

describe("registerLeaderboardTools", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.restoreAllMocks();
  });

  it("registers default and multi-board leaderboard tools", () => {
    const server = createMockServer();
    registerLeaderboardTools(server);

    expect(registeredTools.has("horizon_list_leaderboards")).toBe(true);
    expect(registeredTools.has("horizon_submit_score")).toBe(true);
    expect(registeredTools.has("horizon_get_leaderboard_top")).toBe(true);
    expect(registeredTools.has("horizon_get_user_rank")).toBe(true);
    expect(registeredTools.has("horizon_get_leaderboard_around")).toBe(true);
    expect(registeredTools.size).toBe(5);
  });

  it("lists available leaderboard boards", async () => {
    const server = createMockServer();
    registerLeaderboardTools(server);

    const mockGet = vi.fn().mockResolvedValue({ boards: [], totalElements: 0 });
    mockedCreateApiClient.mockReturnValue({ get: mockGet } as any);

    const { handler } = registeredTools.get("horizon_list_leaderboards")!;
    await handler({});

    expect(mockGet).toHaveBeenCalledWith("/api/v1/app/leaderboards");
  });

  it("submits scores to a named board", async () => {
    const server = createMockServer();
    registerLeaderboardTools(server);

    // The API answers with an empty body, which the client turns into null
    const mockPost = vi.fn().mockResolvedValue(null);
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_score")!;
    const result = await handler({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      score: 1200,
      leaderboardKey: "weekly_speed",
      sessionToken: "session-123",
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/leaderboards/weekly_speed/submit",
      {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        score: 1200,
        leaderboardKey: "weekly_speed",
      },
      { Authorization: "Bearer session-123" },
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ success: true });
  });

  it("gets top scores from a named board", async () => {
    const server = createMockServer();
    registerLeaderboardTools(server);

    const mockGet = vi.fn().mockResolvedValue({ entries: [] });
    mockedCreateApiClient.mockReturnValue({ get: mockGet } as any);

    const { handler } = registeredTools.get("horizon_get_leaderboard_top")!;
    await handler({
      userId: "550e8400-e29b-41d4-a716-446655440000",
      limit: 5,
      leaderboardKey: "daily",
    });

    expect(mockGet).toHaveBeenCalledWith(
      "/api/v1/app/leaderboards/daily/top",
      {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        limit: "5",
      },
    );
  });

  it("names VALIDATED_SUBMIT_REQUIRED for validated only boards", () => {
    registerLeaderboardTools(createMockServer());

    const submit = registeredTools.get("horizon_submit_score")!.schema as { description: string };
    expect(submit.description).toContain("VALIDATED_SUBMIT_REQUIRED");
    expect(submit.description).toContain("horizon_submit_validated");

    const list = registeredTools.get("horizon_list_leaderboards")!.schema as { description: string };
    expect(list.description).toContain("validatedOnly");
  });
});
