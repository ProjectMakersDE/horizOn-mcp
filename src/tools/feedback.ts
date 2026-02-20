import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerFeedbackTools(server: McpServer): void {
  server.registerTool("horizon_submit_feedback", {
    title: "Submit Feedback",
    description:
      "Submits user feedback to horizOn with a title, message, and optional category, email, and device info.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
      title: z.string().min(1).max(100).describe("Feedback title (1-100 characters)"),
      message: z.string().min(1).max(2048).describe("Feedback message (1-2048 characters)"),
      category: z.string().max(50).optional().describe("Feedback category (max 50 characters)"),
      email: z.string().email().optional().describe("Contact email address"),
      deviceInfo: z.string().max(500).optional().describe("Device information (max 500 characters)"),
    },
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
