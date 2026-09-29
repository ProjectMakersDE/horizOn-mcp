import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  registerValidatedActionsTools,
  computeInputLogHash,
  resolveInputLogHash,
  resolveInputLogBytes,
  findDuplicateEarnedKey,
  evidencePath,
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

const STATE_RESPONSE = {
  userId: USER_ID,
  day: "2026-09-29",
  values: [
    { key: "chest.gold", balance: 2, earnedToday: 0, dailyCap: null },
    { key: "gold", balance: 1250, earnedToday: 250, dailyCap: 5000 },
  ],
};

describe("findDuplicateEarnedKey", () => {
  it("returns the first repeated key or null", () => {
    expect(findDuplicateEarnedKey([])).toBeNull();
    expect(findDuplicateEarnedKey([{ key: "gold" }, { key: "gems" }])).toBeNull();
    expect(findDuplicateEarnedKey([{ key: "gold" }, { key: "gems" }, { key: "gold" }])).toBe("gold");
  });
});

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

describe("resolveInputLogBytes", () => {
  it("encodes text and base64 to the same bytes and hash", () => {
    expect(resolveInputLogBytes({ inputLog: "abc" })).toEqual({ base64: "YWJj", bytes: 3, hash: HASH_ABC });
    expect(resolveInputLogBytes({ inputLogBase64: "YW\nJj" })).toEqual({ base64: "YWJj", bytes: 3, hash: HASH_ABC });
  });

  it("rejects none, both, empty or malformed inputs", () => {
    expect(resolveInputLogBytes({})).toHaveProperty("error");
    expect(resolveInputLogBytes({ inputLog: "abc", inputLogBase64: "YWJj" })).toHaveProperty("error");
    expect(resolveInputLogBytes({ inputLog: "" })).toHaveProperty("error");
    expect(resolveInputLogBytes({ inputLogBase64: "not base64!" })).toHaveProperty("error");
  });

  it("builds the upload path from the run ID", () => {
    expect(evidencePath(RUN_RESPONSE.runId)).toBe(
      `/api/v1/app/validated-actions/runs/${RUN_RESPONSE.runId}/evidence`,
    );
  });
});

describe("registerValidatedActionsTools", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.restoreAllMocks();
  });

  it("registers the Part 1 to Part 3 tools", () => {
    registerValidatedActionsTools(createMockServer());

    expect(registeredTools.has("horizon_start_run")).toBe(true);
    expect(registeredTools.has("horizon_submit_validated")).toBe(true);
    expect(registeredTools.has("horizon_get_state")).toBe(true);
    expect(registeredTools.has("horizon_upload_evidence")).toBe(true);
    expect(registeredTools.size).toBe(4);
  });

  it("uploads evidence as base64 of the text bytes with the Bearer session", async () => {
    registerValidatedActionsTools(createMockServer());

    const response = { runId: RUN_RESPONSE.runId, status: "UPLOADED", bytes: 3 };
    const mockPut = vi.fn().mockResolvedValue(response);
    mockedCreateApiClient.mockReturnValue({ put: mockPut } as any);

    const { handler } = registeredTools.get("horizon_upload_evidence")!;
    const result = await handler({ userId: USER_ID, sessionToken: "session-888", runId: RUN_RESPONSE.runId, inputLog: "abc" });

    expect(mockPut).toHaveBeenCalledWith(
      `/api/v1/app/validated-actions/runs/${RUN_RESPONSE.runId}/evidence`,
      { userId: USER_ID, log: "YWJj" },
      { Authorization: "Bearer session-888" },
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({ ...response, inputLogHash: HASH_ABC });
  });

  it("uploads given base64 without whitespace", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPut = vi.fn().mockResolvedValue({ runId: RUN_RESPONSE.runId, status: "UPLOADED", bytes: 3 });
    mockedCreateApiClient.mockReturnValue({ put: mockPut } as any);

    const { handler } = registeredTools.get("horizon_upload_evidence")!;
    await handler({ userId: USER_ID, sessionToken: "s", runId: RUN_RESPONSE.runId, inputLogBase64: " YW Jj\n" });

    expect(mockPut.mock.calls[0][1]).toEqual({ userId: USER_ID, log: "YWJj" });
  });

  it("fails locally without a log input and sends nothing", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPut = vi.fn();
    mockedCreateApiClient.mockReturnValue({ put: mockPut } as any);

    const { handler } = registeredTools.get("horizon_upload_evidence")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s", runId: RUN_RESPONSE.runId });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("INVALID_INPUT_LOG");
    expect(mockPut).not.toHaveBeenCalled();
  });

  it("names the evidence code and the local hash when the upload fails", async () => {
    registerValidatedActionsTools(createMockServer());

    const body = JSON.stringify({ status: 422, code: "EVIDENCE_HASH_MISMATCH", message: "The log does not match the input log hash of the run" });
    const mockPut = vi.fn().mockRejectedValue(new HorizonApiError(422, body));
    mockedCreateApiClient.mockReturnValue({ put: mockPut } as any);

    const { handler } = registeredTools.get("horizon_upload_evidence")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s", runId: RUN_RESPONSE.runId, inputLog: "abc" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 422, code EVIDENCE_HASH_MISMATCH");
    expect(result.content[0].text).toContain(HASH_ABC);
  });

  it("returns the no API key result for the upload without a client", async () => {
    registerValidatedActionsTools(createMockServer());
    mockedCreateApiClient.mockReturnValue(null);

    const { handler } = registeredTools.get("horizon_upload_evidence")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s", runId: RUN_RESPONSE.runId, inputLog: "abc" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HORIZON_API_KEY");
  });

  it("validates the upload inputs and describes the evidence codes", () => {
    registerValidatedActionsTools(createMockServer());

    const schema = inputSchema("horizon_upload_evidence");
    expect(schema.runId.safeParse(RUN_RESPONSE.runId).success).toBe(true);
    expect(schema.runId.safeParse("run-1").success).toBe(false);
    expect(schema.inputLogBase64.safeParse("").success).toBe(false);

    const text = description("horizon_upload_evidence");
    for (const code of [
      "EVIDENCE_INVALID_ENCODING",
      "EVIDENCE_NOT_REQUESTED",
      "EVIDENCE_ALREADY_UPLOADED",
      "EVIDENCE_EXPIRED",
      "EVIDENCE_TOO_LARGE",
      "EVIDENCE_HASH_MISMATCH",
    ]) {
      expect(text).toContain(code);
    }
    expect(description("horizon_submit_validated")).toContain("horizon_upload_evidence");
  });

  it("reads the player state with the Bearer session", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockGet = vi.fn().mockResolvedValue(STATE_RESPONSE);
    mockedCreateApiClient.mockReturnValue({ get: mockGet } as any);

    const { handler } = registeredTools.get("horizon_get_state")!;
    const result = await handler({ userId: USER_ID, sessionToken: "session-887" });

    expect(mockGet).toHaveBeenCalledWith(
      "/api/v1/app/validated-actions/state",
      { userId: USER_ID },
      { Authorization: "Bearer session-887" },
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual(STATE_RESPONSE);
  });

  it("names the session code when reading the state fails", async () => {
    registerValidatedActionsTools(createMockServer());

    const body = JSON.stringify({ status: 403, code: "SESSION_FORBIDDEN", message: "Session is not authorized for this player" });
    const mockGet = vi.fn().mockRejectedValue(new HorizonApiError(403, body));
    mockedCreateApiClient.mockReturnValue({ get: mockGet } as any);

    const { handler } = registeredTools.get("horizon_get_state")!;
    const result = await handler({ userId: USER_ID, sessionToken: "other" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 403, code SESSION_FORBIDDEN");
  });

  it("returns the no API key result for the state without a client", async () => {
    registerValidatedActionsTools(createMockServer());
    mockedCreateApiClient.mockReturnValue(null);

    const { handler } = registeredTools.get("horizon_get_state")!;
    const result = await handler({ userId: USER_ID, sessionToken: "s" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HORIZON_API_KEY");
  });

  it("marks the state tool read only and validates its inputs", () => {
    registerValidatedActionsTools(createMockServer());

    const config = registeredTools.get("horizon_get_state")!.schema as { annotations: { readOnlyHint: boolean } };
    expect(config.annotations.readOnlyHint).toBe(true);

    const state = inputSchema("horizon_get_state");
    expect(state.userId.safeParse(USER_ID).success).toBe(true);
    expect(state.userId.safeParse("not-a-uuid").success).toBe(false);
    expect(state.sessionToken.safeParse("").success).toBe(false);
    expect(state.sessionToken.safeParse(undefined).success).toBe(false);
  });

  it("returns requested and credited of a submit with earned values unchanged", async () => {
    registerValidatedActionsTools(createMockServer());

    const response = {
      ...SUBMIT_RESPONSE,
      state: {
        day: "2026-09-29",
        values: [
          { key: "chest.gold", balance: 1, earnedToday: 0, dailyCap: null, requested: -1, credited: -1 },
          { key: "gold", balance: 5000, earnedToday: 5000, dailyCap: 5000, requested: 500, credited: 250 },
          { key: "gems", balance: 3, earnedToday: 0, dailyCap: null },
        ],
      },
    };
    const mockPost = vi.fn().mockResolvedValue(response);
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    const earned = [
      { key: "gold", amount: 500 },
      { key: "chest.gold", amount: -1 },
    ];
    const result = await handler({
      userId: USER_ID,
      sessionToken: "s",
      ticket: TICKET,
      inputLogHash: HASH_ABC,
      score: 18250,
      earned,
    });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/validated-actions/submit",
      { userId: USER_ID, ticket: TICKET, inputLogHash: HASH_ABC, score: 18250, earned },
      { Authorization: "Bearer s" },
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ ...response, inputLogHash: HASH_ABC });
  });

  it("fails locally on a duplicate earned key and keeps the ticket", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPost = vi.fn();
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    const result = await handler({
      userId: USER_ID,
      sessionToken: "s",
      ticket: TICKET,
      inputLogHash: HASH_ABC,
      earned: [
        { key: "gold", amount: 10 },
        { key: "gold", amount: 5 },
      ],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("DUPLICATE_VALUE_KEY");
    expect(result.content[0].text).toContain("gold");
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("omits an empty earned list", async () => {
    registerValidatedActionsTools(createMockServer());

    const mockPost = vi.fn().mockResolvedValue(SUBMIT_RESPONSE);
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    await handler({ userId: USER_ID, sessionToken: "s", ticket: TICKET, inputLogHash: HASH_ABC, score: 1, earned: [] });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/validated-actions/submit",
      { userId: USER_ID, ticket: TICKET, inputLogHash: HASH_ABC, score: 1 },
      { Authorization: "Bearer s" },
    );
  });

  it("names a value rejection code in the error result", async () => {
    registerValidatedActionsTools(createMockServer());

    const body = JSON.stringify({
      status: 422,
      code: "INSUFFICIENT_BALANCE",
      message: "earned[0].amount spends more than the balance",
      runId: RUN_RESPONSE.runId,
    });
    const mockPost = vi.fn().mockRejectedValue(new HorizonApiError(422, body));
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_submit_validated")!;
    const result = await handler({
      userId: USER_ID,
      sessionToken: "s",
      ticket: TICKET,
      inputLogHash: HASH_ABC,
      earned: [{ key: "gold", amount: -100 }],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("HTTP 422, code INSUFFICIENT_BALANCE");
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
    expect(submit.earned.safeParse([{ key: "chest.gold", amount: Number.MAX_SAFE_INTEGER }]).success).toBe(true);
    expect(submit.earned.safeParse([{ key: "gold", amount: -Number.MAX_SAFE_INTEGER }]).success).toBe(true);
    expect(submit.earned.safeParse([{ key: "gold", amount: Number.MAX_SAFE_INTEGER + 2 }]).success).toBe(false);
    expect(submit.earned.safeParse([{ key: "gold", amount: 1.5 }]).success).toBe(false);
    expect(submit.earned.safeParse([{ key: "a".repeat(25), amount: 1 }]).success).toBe(false);

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

  it("describes the Part 2 value codes and the credited result", () => {
    registerValidatedActionsTools(createMockServer());

    const text = description("horizon_submit_validated");
    for (const code of [
      "UNKNOWN_VALUE_KEY",
      "DUPLICATE_VALUE_KEY",
      "EARNED_ABOVE_MAX",
      "EARNED_BELOW_MIN",
      "INSUFFICIENT_BALANCE",
    ]) {
      expect(text).toContain(code);
    }
    expect(text).toContain("requested");
    expect(text).toContain("credited == requested");
    expect(text).toContain("horizon_get_state");

    const state = description("horizon_get_state");
    expect(state).toContain("earnedToday");
    expect(state).toContain("dailyCap");
    expect(state).toContain("SESSION_FORBIDDEN");
  });
});
