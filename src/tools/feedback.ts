import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, ADDITIVE_WRITE, API_ERRORS } from "./tool-helpers.js";

export function registerFeedbackTools(server: McpServer): void {
  server.registerTool("horizon_submit_feedback", {
    title: "Submit Feedback",
    description:
      "Sends player feedback, such as a bug report, a feature request or a general comment, to the horizOn dashboard, where the developer reads it. " +
      "Use horizon_create_crash_report for crashes and horizon_create_log for technical events. " +
      "category is free text; the horizOn SDKs use BUG, FEATURE and GENERAL. Each call creates a new entry. Returns \"ok\". " +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      title: z.string().min(1).max(100).describe("Feedback title (1-100 characters)"),
      message: z.string().min(1).max(2048).describe("Feedback message (1-2048 characters)"),
      category: z.string().max(50).optional().describe("Feedback category, free text such as BUG, FEATURE or GENERAL (max 50 characters)"),
      email: z.string().email().optional().describe("Contact email address"),
      deviceInfo: z.string().max(500).optional().describe("Device information (max 500 characters)"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ userId, title, message, category, email, deviceInfo }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const body: Record<string, unknown> = { userId, title, message };
      if (category !== undefined) body.category = category;
      if (email !== undefined) body.email = email;
      if (deviceInfo !== undefined) body.deviceInfo = deviceInfo;

      const result = await client.post("/api/v1/app/user-feedback/submit", body);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
