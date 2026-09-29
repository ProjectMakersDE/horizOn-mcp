import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, describeTool, ADDITIVE_WRITE } from "./tool-helpers.js";

const BreadcrumbSchema = z.object({
  timestamp: z.string().describe("When the event occurred, ISO 8601 (for example 2026-09-29T14:03:12Z)"),
  type: z.string().min(1).max(50).describe("Event type (e.g. 'navigation', 'http', 'user', 'error')"),
  message: z.string().min(1).max(500).describe("Event description"),
});

export function registerCrashReportingTools(server: McpServer): void {
  server.registerTool("horizon_create_crash_report", {
    title: "Create Crash Report",
    description: describeTool({
      summary: "Submits one crash (CRASH), caught exception (NON_FATAL) or freeze (ANR) with device data to horizOn Crash Reporting, grouped by fingerprint.",
      use: "the game crashed (send on next start) or caught an exception worth tracking.",
      avoid: "technical events without a crash (use horizon_create_log) and messages written by players (use horizon_submit_feedback).",
      requires: "a sessionId registered with horizon_create_crash_session for this app run; userId is optional.",
      effects:
        "adds one report per call (a repeat adds a duplicate) and marks the session as crashed. Reports with the same fingerprint form one group; " +
        "a group marked resolved becomes REGRESSED when a newer app version crashes again.",
      returns: "{id, groupId, createdAt}; groupId identifies the crash group in the dashboard.",
      errors: "400 when a required field is missing or too long: fix it and resend.",
    }),
    inputSchema: {
      type: z.enum(["CRASH", "NON_FATAL", "ANR"]).describe("Crash type: CRASH (fatal), NON_FATAL (exception), or ANR (Application Not Responding)"),
      message: z.string().min(1).max(5000).describe("Error or exception message (1 to 5000 characters)"),
      stackTrace: z.string().max(20000).optional().describe("Full stack trace (max 20000 characters)"),
      fingerprint: z.string().min(1).max(128).describe("Grouping key: reports with the same fingerprint form one crash group, for example a hash of exception type and top stack frame (1 to 128 characters)"),
      appVersion: z.string().min(1).max(50).describe("App version (e.g. '1.2.3')"),
      sdkVersion: z.string().min(1).max(50).describe("horizOn SDK version, for example '1.8.2' (1 to 50 characters)"),
      platform: z.string().min(1).max(50).describe("Platform (e.g. 'Android', 'iOS', 'Windows')"),
      os: z.string().min(1).max(100).describe("OS details (e.g. 'Android 14', 'iOS 17.2')"),
      deviceModel: z.string().min(1).max(100).describe("Device model (e.g. 'Pixel 8', 'iPhone 15')"),
      deviceMemoryMb: z.number().int().optional().describe("Device RAM in MB, for example 8192"),
      sessionId: z.string().min(1).max(100).describe("The sessionId registered with horizon_create_crash_session for this app run (1 to 100 characters)"),
      userId: z.string().uuid().optional().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*, if a player is signed in"),
      breadcrumbs: z.array(BreadcrumbSchema).max(50).optional().describe("Recent events before the crash, oldest first (max 50)"),
      customKeys: z.record(z.string(), z.string()).optional().describe("String key to string value metadata such as level or build flavor (max 10 entries)"),
    },
    annotations: ADDITIVE_WRITE,
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
    description: describeTool({
      summary: "Registers one app run (session) so horizOn can calculate the crash-free session rate.",
      use: "once at every app start, with a new unique sessionId; keep that ID for horizon_create_crash_report.",
      avoid: "reporting the crash itself (use horizon_create_crash_report) or player sign-in sessions (those come from horizon_signin_*).",
      effects: "records one session per call; a later crash report with the same sessionId marks it as crashed.",
      returns: "{status: 'ok'}.",
      errors: "400 when a field is missing or too long: fix it and resend.",
    }),
    inputSchema: {
      sessionId: z.string().min(1).max(100).describe("New unique ID for this app run, for example a UUID generated at start (1 to 100 characters)"),
      appVersion: z.string().min(1).max(50).describe("App version (e.g. '1.2.3')"),
      platform: z.string().min(1).max(50).describe("Platform (e.g. 'Android', 'iOS', 'Windows')"),
      userId: z.string().uuid().optional().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*, if a player is signed in"),
    },
    annotations: ADDITIVE_WRITE,
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
