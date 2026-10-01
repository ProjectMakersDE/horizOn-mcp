import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, describeTool, ADDITIVE_WRITE } from "./tool-helpers.js";

export function registerUserLogTools(server: McpServer): void {
  server.registerTool("horizon_create_log", {
    title: "Create Log",
    description: describeTool({
      summary: "Writes one server-side log entry (INFO, WARN or ERROR) for a player, visible in the horizOn dashboard's user logs.",
      use: "the game records a technical event or a handled error for later debugging, for example a failed purchase or a slow load.",
      avoid: "crashes and exceptions with a stack trace (use horizon_create_crash_report) or messages written by players (use horizon_submit_feedback).",
      requires: "a userId from horizon_signup_* or horizon_signin_* and the BASIC tier or higher; no session token.",
      effects: "creates one log entry per call; a repeat creates a duplicate.",
      returns: "{id, createdAt} of the new entry.",
      errors: "403 on the FREE tier: logs need BASIC or higher, so upgrade or skip logging. 400 for an invalid userId: pass the ID from the sign-in result.",
    }),
    inputSchema: {
      userId: z.string().uuid().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*"),
      message: z.string().max(1000).describe("Log message (max 1000 characters)"),
      type: z.enum(["INFO", "WARN", "ERROR"]).describe("Log level: INFO, WARN or ERROR"),
      errorCode: z.string().max(50).optional().describe("Optional code to group entries in the dashboard, useful with ERROR, for example 'IAP_TIMEOUT' (max 50 characters)"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ userId, message, type, errorCode }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const body: Record<string, unknown> = { userId, message, type };
      if (errorCode !== undefined) body.errorCode = errorCode;

      const result = await client.post("/api/v1/app/user-logs/create", body);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
