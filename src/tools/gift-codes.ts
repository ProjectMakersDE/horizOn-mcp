import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerGiftCodeTools(server: McpServer): void {
  // --- Validate gift code ---
  server.registerTool("horizon_validate_gift_code", {
    title: "Validate Gift Code",
    description:
      "Validates a gift code on horizOn without redeeming it. Checks if the code is valid for the given user.",
    inputSchema: {
      code: z.string().max(50).describe("Gift code to validate (max 50 characters)"),
      userId: z.string().uuid().describe("User ID (UUID)"),
    },
  }, async ({ code, userId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/gift-codes/validate", {
        code,
        userId,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Redeem gift code ---
  server.registerTool("horizon_redeem_gift_code", {
    title: "Redeem Gift Code",
    description:
      "Redeems a gift code on horizOn for the given user.",
    inputSchema: {
      code: z.string().max(50).describe("Gift code to redeem (max 50 characters)"),
      userId: z.string().uuid().describe("User ID (UUID)"),
    },
  }, async ({ code, userId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/gift-codes/redeem", {
        code,
        userId,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
