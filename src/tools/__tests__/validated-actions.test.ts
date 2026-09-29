import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerValidatedActionsTools,
  computeInputLogHash,
  resolveInputLogHash,
} from "../validated-actions.js";
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

function description(tool: string): string {
  return (registeredTools.get(tool)!.schema as { description: string }).description;
}

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const TICKET = "hzn-rt1:2026-09:Qm9vb29vb29v:c2VjcmV0";

/** SHA-256 test vectors (FIPS 180-2). */
const HASH_EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const HASH_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

const RUN_RESPONSE = {
  runId: "5b0b6c1e-8d0f-4c55-9b0e-0e6a4a8a3d11",
  ticket: TICKET,
  seed: 1834201177,
  leaderboardKey: "weekly",
  issuedAt: "2026-09-29T14:00:00.120Z",
  expiresAt: "2026-09-29T16:00:00.120Z",
  expiresInSeconds: 7200,
};

const SUBMIT_RESPONSE = {
  accepted: true,
  runId: RUN_RESPONSE.runId,
  leaderboardKey: "weekly",
  score: 18250,
  bestScore: 21000,
  isNewHighScore: false,
  rank: 17,
  durationSeconds: 734,
  state: null,
  evidence: null,
};

describe("input log hash helpers", () => {
  it("hashes raw bytes as lower case hex SHA-256", () => {
    expect(computeInputLogHash(new Uint8Array())).toBe(HASH_EMPTY);
    expect(computeInputLogHash(Buffer.from("abc", "utf8"))).toBe(HASH_ABC);
  });

  it("accepts a ready hash and lower cases it", () => {
    expect(resolveInputLogHash({ inputLogHash: HASH_ABC.toUpperCase() })).toEqual({ hash: HASH_ABC });
  });

  it("hashes base64 bytes and UTF-8 text to the same value", () => {
    expect(resolveInputLogHash({ inputLogBase64: "YWJj" })).toEqual({ hash: HASH_ABC });
    expect(resolveInputLogHash({ inputLog: "abc" })).toEqual({ hash: HASH_ABC });
    expect(resolveInputLogHash({ inputLog: "" })).toEqual({ hash: HASH_EMPTY });
  });

  it("rejects none, several or malformed inputs", () => {
    expect(resolveInputLogHash({})).toHaveProperty("error");
    expect(resolveInputLogHash({ inputLogHash: HASH_ABC, inputLog: "abc" })).toHaveProperty("error");
    expect(resolveInputLogHash({ inputLogHash: "abc" })).toHaveProperty("error");
    expect(resolveInputLogHash({ inputLogBase64: "not base64!" })).toHaveProperty("error");
  });
});

describe("registerValidatedActionsTools", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.restoreAllMocks();
  });

  it("registers the Part 1 tools", () => {
    registerValidatedActionsTools(createMockServer());

    expect(registeredTools.has("horizon_start_run")).toBe(true);
    expect(registeredTools.has("horizon_submit_validated")).toBe(true);
    expect(registeredTools.size).toBe(2);
  });

  it("starts a run bound to a board with the Bearer session", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPost = vi.fn().mockResolvedValue(RUN_RESPONSE);
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_start_run")!;
    const result = await handler({ userId: USER_ID, sessionToken: "session-883", leaderboardKey: "weekly" });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/validated-actions/runs",
      { userId: USER_ID, leaderboardKey: "weekly" },
      { Authorization: "Bearer session-883" },
    );
    expect(JSON.parse(result.content[0].text)).toEqual(RUN_RESPONSE);
  });

  it("omits leaderboardKey for an unbound run", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPost = vi.fn().mockResolvedValue({ ...RUN_RESPONSE, leaderboardKey: null });
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_start_run")!;
    await handler({ userId: USER_ID, sessionToken: "s" });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/validated-actions/runs",
      { userId: USER_ID },
      { Authorization: "Bearer s" },
    );
  });

  it("submits with a locally computed hash and only the given fields", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPost = vi.fn().mockResolvedValue(SUBMIT_RESPONSE);
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    const result = await handler({
      userId: USER_ID,
      sessionToken: "session-883",
      ticket: TICKET,
      inputLog: "abc",
      score: 18250,
      leaderboardKey: "weekly",
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/validated-actions/submit",
      { userId: USER_ID, ticket: TICKET, inputLogHash: HASH_ABC, score: 18250, leaderboardKey: "weekly" },
      { Authorization: "Bearer session-883" },
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ ...SUBMIT_RESPONSE, inputLogHash: HASH_ABC });
  });

  it("sends stage and earned values when given", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPost = vi.fn().mockResolvedValue({ ...SUBMIT_RESPONSE, leaderboardKey: null });
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    await handler({
      userId: USER_ID,
      sessionToken: "s",
      ticket: TICKET,
      inputLogBase64: "YWJj",
      stage: "level-3",
      earned: [{ key: "gold", amount: 250 }],
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/validated-actions/submit",
      { userId: USER_ID, ticket: TICKET, inputLogHash: HASH_ABC, stage: "level-3", earned: [{ key: "gold", amount: 250 }] },
      { Authorization: "Bearer s" },
    );
  });

  it("fails locally without a hash input and sends nothing", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPost = vi.fn();
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s", ticket: TICKET, score: 1 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("INVALID_INPUT_LOG_HASH");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("names the rejection code in the error result", async () => {
    registerValidatedActionsTools(createMockServer());

    const body = JSON.stringify({
      status: 422,
      code: "DURATION_TOO_SHORT",
      message: "The run was shorter than allowed",
      runId: RUN_RESPONSE.runId,
    });
    const mockPost = vi.fn().mockRejectedValue(new HorizonApiError(422, body));
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s", ticket: TICKET, inputLogHash: HASH_ABC, score: 5 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 422, code DURATION_TOO_SHORT");
  });

  it("returns the no API key result without a client", async () => {
    registerValidatedActionsTools(createMockServer());
    mockedCreateApiClient.mockReturnValue(null);

    const { handler } = registeredTools.get("horizon_start_run")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HORIZON_API_KEY");
  });

  it("validates inputs locally", () => {
    registerValidatedActionsTools(createMockServer());
    const submit = inputSchema("horizon_submit_validated");

    expect(submit.sessionToken.safeParse(undefined).success).toBe(false);
    expect(submit.ticket.safeParse("").success).toBe(false);
    expect(submit.ticket.safeParse("t".repeat(513)).success).toBe(false);
    expect(submit.inputLogHash.safeParse(HASH_ABC).success).toBe(true);
    expect(submit.inputLogHash.safeParse("xyz").success).toBe(false);
    expect(submit.score.safeParse(-1).success).toBe(false);
    expect(submit.score.safeParse(Number.MAX_SAFE_INTEGER).success).toBe(true);
    expect(submit.stage.safeParse("level-3").success).toBe(true);
    expect(submit.stage.safeParse("Level 3").success).toBe(false);
    expect(submit.leaderboardKey.safeParse("Weekly").success).toBe(false);
    expect(submit.earned.safeParse([{ key: "gold", amount: -5 }]).success).toBe(true);
    expect(submit.earned.safeParse([{ key: "Gold", amount: 5 }]).success).toBe(false);
    expect(submit.earned.safeParse(Array.from({ length: 65 }, () => ({ key: "gold", amount: 1 }))).success).toBe(false);

    const start = inputSchema("horizon_start_run");
    expect(start.userId.safeParse("not-a-uuid").success).toBe(false);
    expect(start.leaderboardKey.safeParse("weekly").success).toBe(true);
  });

  it("describes the hash inputs and the rejection codes", () => {
    registerValidatedActionsTools(createMockServer());

    const text = description("horizon_submit_validated");
    expect(text).toContain("SHA-256");
    expect(text).toContain("inputLogBase64");
    expect(text).toContain("TICKET_CONSUMED");
    expect(text).toContain("SCORE_RATE_TOO_HIGH");
    expect(description("horizon_start_run")).toContain("RUN_CAPACITY_REACHED");
  });
});
