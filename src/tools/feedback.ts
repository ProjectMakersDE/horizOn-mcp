import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, describeTool, ADDITIVE_WRITE } from "./tool-helpers.js";

export function registerFeedbackTools(server: McpServer): void {
  server.registerTool("horizon_submit_feedback", {
    title: "Submit Feedback",
    description: describeTool({
      summary: "Sends a message written by a player (bug report, feature request or comment) to the developer's feedback inbox in the horizOn dashboard.",
      use: "the player fills in a feedback or bug report form in the game.",
      avoid: "crashes and caught exceptions (use horizon_create_crash_report) or technical events the game logs by itself (use horizon_create_log).",
      requires: "a userId from horizon_signup_* or horizon_signin_*; no session token.",
      effects: "creates one feedback entry per call; a repeat creates a duplicate.",
      returns: "the text \"ok\" when the entry was stored.",
      errors: "An unknown userId, or one of another API key, is rejected: pass the ID from the sign-in result. 403 when the account's feedback limit is reached: delete old feedback in the dashboard.",
    }),
    inputSchema: {
      userId: z.string().uuid().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*"),
      title: z.string().min(1).max(100).describe("Short summary shown in the dashboard list (1 to 100 characters)"),
      message: z.string().min(1).max(2048).describe("Full feedback text (1 to 2048 characters)"),
      category: z.string().max(50).optional().describe("Free text category (max 50 characters); the horizOn SDKs use BUG, FEATURE and GENERAL. Omit for none"),
      email: z.string().email().optional().describe("Contact email address for a reply, if the player wants one"),
      deviceInfo: z.string().max(500).optional().describe("Device and OS details for bug reports, for example 'Pixel 8, Android 14' (max 500 characters)"),
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
