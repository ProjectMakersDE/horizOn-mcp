import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerUserLogTools(server: McpServer): void {
  server.registerTool("horizon_create_log", {
    title: "Create Log",
    description:
      "Creates a user log entry on horizOn with a message, type (INFO/WARN/ERROR), and optional error code.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
      message: z.string().max(1000).describe("Log message (max 1000 characters)"),
      type: z.enum(["INFO", "WARN", "ERROR"]).describe("Log level: INFO, WARN, or ERROR"),
      errorCode: z.string().max(50).optional().describe("Error code (max 50 characters)"),
    },
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
