import { describe, it, expect, vi, afterEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCrashReportingTools } from "../crash-reporting.js";

// Mock api-client — keep real HorizonApiError so tool-helpers.ts works
vi.mock("../api-client.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api-client.js")>();
  return {
    ...actual,
    createApiClientFromEnv: vi.fn(),
  };
});

import { createApiClientFromEnv } from "../api-client.js";

const mockedCreateApiClient = vi.mocked(createApiClientFromEnv);

// Capture registered tools
const registeredTools = new Map<string, { schema: unknown; handler: Function }>();

function createMockServer(): McpServer {
  return {
    registerTool: vi.fn((name: string, config: unknown, handler: Function) => {
      registeredTools.set(name, { schema: config, handler });
    }),
  } as unknown as McpServer;
}

describe("registerCrashReportingTools", () => {
  afterEach(() => {
    registeredTools.clear();
    vi.restoreAllMocks();
  });

  it("registers both tools", () => {
    const server = createMockServer();
    registerCrashReportingTools(server);

    expect(registeredTools.has("horizon_create_crash_report")).toBe(true);
    expect(registeredTools.has("horizon_create_crash_session")).toBe(true);
    expect(registeredTools.size).toBe(2);
  });

  describe("horizon_create_crash_report", () => {
    it("returns no-api-key response when client is null", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);
      mockedCreateApiClient.mockReturnValue(null);

      const { handler } = registeredTools.get("horizon_create_crash_report")!;
      const result = await handler({
        type: "CRASH",
        message: "test",
        fingerprint: "fp1",
        appVersion: "1.0",
        sdkVersion: "0.5",
        platform: "Android",
        os: "Android 14",
        deviceModel: "Pixel 8",
        sessionId: "sess-1",
      });

      expect(result.content[0].text).toContain("HORIZON_API_KEY");
    });

    it("sends correct body with required fields only", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);

      const mockPost = vi.fn().mockResolvedValue({ id: "r1", groupId: "g1", createdAt: "2025-01-01T00:00:00" });
      mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

      const { handler } = registeredTools.get("horizon_create_crash_report")!;
      await handler({
        type: "CRASH",
        message: "NullRef",
        fingerprint: "fp1",
        appVersion: "1.0",
        sdkVersion: "0.5",
        platform: "Android",
        os: "Android 14",
        deviceModel: "Pixel 8",
        sessionId: "sess-1",
      });

      expect(mockPost).toHaveBeenCalledWith("/api/v1/app/crash-reports/create", {
        type: "CRASH",
        message: "NullRef",
        fingerprint: "fp1",
        appVersion: "1.0",
        sdkVersion: "0.5",
        platform: "Android",
        os: "Android 14",
        deviceModel: "Pixel 8",
        sessionId: "sess-1",
      });
    });

    it("includes optional fields only when defined", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);

      const mockPost = vi.fn().mockResolvedValue({ id: "r1", groupId: "g1", createdAt: "2025-01-01" });
      mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

      const { handler } = registeredTools.get("horizon_create_crash_report")!;
      await handler({
        type: "NON_FATAL",
        message: "test",
        stackTrace: "at line 42",
        fingerprint: "fp2",
        appVersion: "1.0",
        sdkVersion: "0.5",
        platform: "iOS",
        os: "iOS 17",
        deviceModel: "iPhone 15",
        deviceMemoryMb: 6144,
        sessionId: "sess-2",
        userId: "550e8400-e29b-41d4-a716-446655440000",
        breadcrumbs: [{ timestamp: "2025-01-01T00:00:00Z", type: "error", message: "something" }],
        customKeys: { scene: "Level5" },
      });

      const body = mockPost.mock.calls[0][1];
      expect(body.stackTrace).toBe("at line 42");
      expect(body.deviceMemoryMb).toBe(6144);
      expect(body.userId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(body.breadcrumbs).toHaveLength(1);
      expect(body.customKeys).toEqual({ scene: "Level5" });
    });

    it("returns error response on API failure", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);

      const mockPost = vi.fn().mockRejectedValue(new Error("Network error"));
      mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

      const { handler } = registeredTools.get("horizon_create_crash_report")!;
      const result = await handler({
        type: "CRASH",
        message: "test",
        fingerprint: "fp1",
        appVersion: "1.0",
        sdkVersion: "0.5",
        platform: "Android",
        os: "Android 14",
        deviceModel: "Pixel 8",
        sessionId: "sess-1",
      });

      expect(result.content[0].text).toContain("Network error");
    });
  });

  describe("horizon_create_crash_session", () => {
    it("returns no-api-key response when client is null", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);
      mockedCreateApiClient.mockReturnValue(null);

      const { handler } = registeredTools.get("horizon_create_crash_session")!;
      const result = await handler({
        sessionId: "sess-1",
        appVersion: "1.0",
        platform: "Android",
      });

      expect(result.content[0].text).toContain("HORIZON_API_KEY");
    });

    it("sends correct body with required fields", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);

      const mockPost = vi.fn().mockResolvedValue({ status: "ok" });
      mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

      const { handler } = registeredTools.get("horizon_create_crash_session")!;
      await handler({
        sessionId: "sess-1",
        appVersion: "1.0",
        platform: "Android",
      });

      expect(mockPost).toHaveBeenCalledWith("/api/v1/app/crash-reports/session", {
        sessionId: "sess-1",
        appVersion: "1.0",
        platform: "Android",
      });
    });

    it("includes userId when provided", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);

      const mockPost = vi.fn().mockResolvedValue({ status: "ok" });
      mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

      const { handler } = registeredTools.get("horizon_create_crash_session")!;
      await handler({
        sessionId: "sess-1",
        appVersion: "1.0",
        platform: "Android",
        userId: "550e8400-e29b-41d4-a716-446655440000",
      });

      const body = mockPost.mock.calls[0][1];
      expect(body.userId).toBe("550e8400-e29b-41d4-a716-446655440000");
    });

    it("returns error response on API failure", async () => {
      const server = createMockServer();
      registerCrashReportingTools(server);

      const mockPost = vi.fn().mockRejectedValue(new Error("timeout"));
      mockedCreateApiClient.mockReturnValue({ post: mockPost } as any);

      const { handler } = registeredTools.get("horizon_create_crash_session")!;
      const result = await handler({
        sessionId: "sess-1",
        appVersion: "1.0",
        platform: "Android",
      });

      expect(result.content[0].text).toContain("timeout");
    });
  });
});
