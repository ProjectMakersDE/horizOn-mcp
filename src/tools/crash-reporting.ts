import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

const BreadcrumbSchema = z.object({
  timestamp: z.string().describe("When the event occurred"),
  type: z.string().min(1).max(50).describe("Event type (e.g. 'navigation', 'http', 'user', 'error')"),
  message: z.string().min(1).max(500).describe("Event description"),
});

export function registerCrashReportingTools(server: McpServer): void {
  server.registerTool("horizon_create_crash_report", {
    title: "Create Crash Report",
    description:
      "Submits a crash report to horizOn. Crashes are grouped by fingerprint, with automatic regression detection when a resolved group receives new crashes.",
    inputSchema: {
      type: z.enum(["CRASH", "NON_FATAL", "ANR"]).describe("Crash type: CRASH (fatal), NON_FATAL (exception), or ANR (Application Not Responding)"),
      message: z.string().min(1).max(5000).describe("Error message (1-5000 characters)"),
      stackTrace: z.string().max(20000).optional().describe("Full stack trace (max 20000 characters)"),
      fingerprint: z.string().min(1).max(128).describe("Grouping key — crashes with the same fingerprint are grouped together (1-128 characters)"),
      appVersion: z.string().min(1).max(50).describe("App version (e.g. '1.2.3')"),
      sdkVersion: z.string().min(1).max(50).describe("horizOn SDK version"),
      platform: z.string().min(1).max(50).describe("Platform (e.g. 'Android', 'iOS', 'Windows')"),
      os: z.string().min(1).max(100).describe("OS details (e.g. 'Android 14', 'iOS 17.2')"),
      deviceModel: z.string().min(1).max(100).describe("Device model (e.g. 'Pixel 8', 'iPhone 15')"),
      deviceMemoryMb: z.number().int().optional().describe("Device RAM in MB"),
      sessionId: z.string().min(1).max(100).describe("Session ID from horizon_create_crash_session"),
      userId: z.string().uuid().optional().describe("User ID (UUID) who experienced the crash"),
      breadcrumbs: z.array(BreadcrumbSchema).max(50).optional().describe("Activity trail before the crash (max 50 items)"),
      customKeys: z.record(z.string(), z.string()).optional().describe("Key-value metadata (max 10 entries)"),
    },
  }, async ({ type, message, stackTrace, fingerprint, appVersion, sdkVersion, platform, os, deviceModel, deviceMemoryMb, sessionId, userId, breadcrumbs, customKeys }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const body: Record<string, unknown> = {
        type, message, fingerprint, appVersion, sdkVersion,
        platform, os, deviceModel, sessionId,
      };
      if (stackTrace !== undefined) body.stackTrace = stackTrace;
      if (deviceMemoryMb !== undefined) body.deviceMemoryMb = deviceMemoryMb;
      if (userId !== undefined) body.userId = userId;
      if (breadcrumbs !== undefined) body.breadcrumbs = breadcrumbs;
      if (customKeys !== undefined) body.customKeys = customKeys;

      const result = await client.post("/api/v1/app/crash-reports/create", body);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  server.registerTool("horizon_create_crash_session", {
    title: "Create Crash Session",
    description:
      "Registers a game session for crash-free rate calculation. Call this at app start. If the session later has a crash report, it is marked automatically.",
    inputSchema: {
      sessionId: z.string().min(1).max(100).describe("Unique session identifier (1-100 characters)"),
      appVersion: z.string().min(1).max(50).describe("App version (e.g. '1.2.3')"),
      platform: z.string().min(1).max(50).describe("Platform (e.g. 'Android', 'iOS', 'Windows')"),
      userId: z.string().uuid().optional().describe("User ID (UUID) starting the session"),
    },
  }, async ({ sessionId, appVersion, platform, userId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const body: Record<string, unknown> = { sessionId, appVersion, platform };
      if (userId !== undefined) body.userId = userId;

      const result = await client.post("/api/v1/app/crash-reports/session", body);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
