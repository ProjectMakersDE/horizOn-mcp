import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCloudSaveTools, parseRevision } from "../cloud-save.js";

vi.mock("../api-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api-client.js")>();
  return {
    ...actual,
    createApiClientFromEnv: vi.fn(),
  };
});

import { createApiClientFromEnv, HorizonApiError } from "../api-client.js";

// Server contract checked 2026-10-10 (horizOn-Server AppCloudSaveController and
// CloudSaveService.saveCloudSave): load answers X-Cloud-Save-Revision (0 = empty slot),
// save reads a plain numeric If-Match and answers 409 with {"error": "..."} on a mismatch.

const USER_ID = "550e8400-e29b-41d4-a716-446655440000";
const mockedCreateApiClient = vi.mocked(createApiClientFromEnv);
const registeredTools = new Map<string, { schema: unknown; handler: Function }>();

function createMockServer(): McpServer {
  return {
    registerTool: vi.fn((name: string, config: unknown, handler: Function) => {
      registeredTools.set(name, { schema: config, handler });
    }),
  } as unknown as McpServer;
}

describe("registerCloudSaveTools", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.restoreAllMocks();
  });

  it.each([
    [{ found: true, saveData: "{\"level\":2}" }, "3", 3],
    [{ found: false, saveData: null }, "0", 0],
    [{ found: false, saveData: null }, null, null],
  ])("load returns the revision header (%j, header %s)", async (body, header, revision) => {
    registerCloudSaveTools(createMockServer());
    const headers = new Headers(header === null ? {} : { "X-Cloud-Save-Revision": header });
    const mockPost = vi.fn().mockResolvedValue({ data: body, headers });
    mockedCreateApiClient.mockReturnValue({ postWithHeaders: mockPost } as any);

    const { handler } = registeredTools.get("horizon_load_cloud_data")!;
    const result = await handler({ userId: USER_ID, sessionToken: "session-985" });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/cloud-save/load",
      { userId: USER_ID },
      { Authorization: "Bearer session-985" },
    );
    expect(result.structuredContent).toEqual({ ...body, revision });
    expect(JSON.parse(result.content[0].text).revision).toBe(revision);
  });

  it("save sends expectedRevision as If-Match and returns the new revision", async () => {
    registerCloudSaveTools(createMockServer());
    const mockPost = vi.fn().mockResolvedValue({ success: true, dataSizeBytes: 11, revision: 4 });
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_save_cloud_data")!;
    const result = await handler({ userId: USER_ID, data: "{\"level\":3}", sessionToken: "session-985", expectedRevision: 3 });

    expect(mockPost).toHaveBeenCalledWith(
      "/api/v1/app/cloud-save/save",
      { userId: USER_ID, saveData: "{\"level\":3}" },
      { Authorization: "Bearer session-985", "If-Match": "3" },
    );
    expect(JSON.parse(result.content[0].text)).toEqual({ success: true, dataSizeBytes: 11, revision: 4 });
  });

  it("save sends If-Match 0 for an empty slot", async () => {
    registerCloudSaveTools(createMockServer());
    const mockPost = vi.fn().mockResolvedValue({ success: true, dataSizeBytes: 1, revision: 1 });
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_save_cloud_data")!;
    await handler({ userId: USER_ID, data: "x", sessionToken: "session-985", expectedRevision: 0 });

    expect(mockPost.mock.calls[0][2]).toEqual({ Authorization: "Bearer session-985", "If-Match": "0" });
  });

  it("save without expectedRevision stays an unconditional write", async () => {
    registerCloudSaveTools(createMockServer());
    const mockPost = vi.fn().mockResolvedValue({ success: true, dataSizeBytes: 1, revision: 2 });
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_save_cloud_data")!;
    await handler({ userId: USER_ID, data: "x", sessionToken: "session-985" });

    expect(mockPost.mock.calls[0][2]).toEqual({ Authorization: "Bearer session-985" });
  });

  it("save reports a 409 as a conflict with the way forward", async () => {
    registerCloudSaveTools(createMockServer());
    const body = "{\"error\":\"Cloud save changed on another device (expected revision 3, current revision 4)\"}";
    const mockPost = vi.fn().mockRejectedValue(new HorizonApiError(409, body));
    mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

    const { handler } = registeredTools.get("horizon_save_cloud_data")!;
    const result = await handler({ userId: USER_ID, data: "stale", sessionToken: "session-985", expectedRevision: 3 });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("conflict (HTTP 409)");
    expect(result.content[0].text).toContain("revision 3");
    expect(result.content[0].text).toContain("Nothing was written");
    expect(result.content[0].text).toContain("horizon_load_cloud_data");
    expect(result.content[0].text).toContain(body);
  });

  it("validates expectedRevision as a non-negative integer and keeps it optional", () => {
    registerCloudSaveTools(createMockServer());
    const { schema } = registeredTools.get("horizon_save_cloud_data")!;
    const inputSchema = (schema as { inputSchema: Record<string, { safeParse: (v: unknown) => { success: boolean } }> }).inputSchema;
    expect(inputSchema.expectedRevision.safeParse(undefined).success).toBe(true);
    expect(inputSchema.expectedRevision.safeParse(0).success).toBe(true);
    expect(inputSchema.expectedRevision.safeParse(12).success).toBe(true);
    expect(inputSchema.expectedRevision.safeParse(-1).success).toBe(false);
    expect(inputSchema.expectedRevision.safeParse(1.5).success).toBe(false);
  });

  it("documents the revision flow in both tool descriptions", () => {
    registerCloudSaveTools(createMockServer());
    const save = registeredTools.get("horizon_save_cloud_data")!.schema as { description: string };
    const load = registeredTools.get("horizon_load_cloud_data")!.schema as { description: string };
    expect(save.description).toContain("expectedRevision");
    expect(save.description).toContain("409");
    expect(load.description).toContain("revision");
    expect(load.description).toContain("unknown state");
  });
});

describe("parseRevision", () => {
  it.each([
    ["0", 0],
    ["7", 7],
    [" 12 ", 12],
    [null, null],
    ["", null],
    ["-1", null],
    ["abc", null],
    ["\"3\"", null],
  ])("parses %j as %j", (value, expected) => {
    expect(parseRevision(value)).toBe(expected);
  });
});
