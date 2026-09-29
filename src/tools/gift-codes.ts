import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, ADDITIVE_WRITE, API_ERRORS } from "./tool-helpers.js";

export function registerGiftCodeTools(server: McpServer): void {
  // --- Validate gift code ---
  server.registerTool("horizon_validate_gift_code", {
    title: "Validate Gift Code",
    description:
      "Checks whether a gift code can be redeemed by this player, without using it up. " +
      "Use it before horizon_redeem_gift_code, for example to confirm a code the player typed. " +
      "Returns {valid}; valid is false when the code does not exist, has expired or has reached its redemption limit for this player or in total. " +
      API_ERRORS,
    inputSchema: {
      code: z.string().max(50).describe("Gift code to validate (max 50 characters)"),
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
    },
    annotations: READ_ONLY,
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
      "Redeems a gift code for a player and returns the reward. Needs the player's session: sign in with horizon_signin_email or horizon_signin_anonymous first and pass its accessToken. " +
      "Each call uses up one redemption and cannot be undone; codes can be limited per player and in total. To check a code without using it, call horizon_validate_gift_code. " +
      "Returns {success, message, giftData, grantedUnlocks}. giftData is a JSON string with the reward set in the dashboard, which the game must parse and apply. " +
      "grantedUnlocks lists the cosmetic IDs from giftData.grants the player owns after this redemption ([] without grants); call horizon_get_profile to show them. " +
      "An unknown code gives 404; an expired or revoked code or a reached limit gives 400; an expired session gives 401, a session of another user 403; " +
      "more than 25 unlocks gives 409 UNLOCK_LIMIT_REACHED and the code is not used up. " +
      API_ERRORS,
    inputSchema: {
      code: z.string().max(50).describe("Gift code to redeem (max 50 characters)"),
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      sessionToken: z.string().min(1).max(256).describe("accessToken returned by horizon_signin_email or horizon_signin_anonymous for this user; sent as a Bearer session"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ code, userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post(
        "/api/v1/app/gift-codes/redeem",
        { code, userId },
        sessionHeaders(sessionToken),
      );
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
