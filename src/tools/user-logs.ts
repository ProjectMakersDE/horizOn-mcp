import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, ADDITIVE_WRITE, API_ERRORS } from "./tool-helpers.js";

export function registerUserLogTools(server: McpServer): void {
  server.registerTool("horizon_create_log", {
    title: "Create Log",
    description:
      "Writes a server-side log entry for a player, visible in the horizOn dashboard. " +
      "Use it for game events and handled errors; use horizon_create_crash_report for crashes and horizon_submit_feedback for messages written by players. " +
      "errorCode is optional for every type and useful with ERROR to group entries. " +
      "Only available on the BASIC tier and above; the FREE tier returns HTTP 403. Each call adds an entry. Returns {id, createdAt}. " +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      message: z.string().max(1000).describe("Log message (max 1000 characters)"),
      type: z.enum(["INFO", "WARN", "ERROR"]).describe("Log level: INFO, WARN, or ERROR"),
      errorCode: z.string().max(50).optional().describe("Error code (max 50 characters)"),
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
