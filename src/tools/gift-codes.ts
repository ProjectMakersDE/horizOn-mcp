import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import {
  noApiKeyResponse,
  errorResponse,
  jsonResponse,
  structuredResponse,
  describeTool,
  READ_ONLY,
  ADDITIVE_WRITE,
  SESSION_REQUIRED,
  SESSION_ERRORS,
} from "./tool-helpers.js";
import { VALIDATE_GIFT_CODE_OUTPUT } from "./output-schemas.js";

const userIdSchema = z.string().uuid().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*");

export function registerGiftCodeTools(server: McpServer): void {
  // --- Validate gift code ---
  server.registerTool("horizon_validate_gift_code", {
    title: "Validate Gift Code",
    description: describeTool({
      summary: "Checks whether a gift code can be redeemed by this player right now, without using it up.",
      use: "before horizon_redeem_gift_code, for example to confirm a code the player typed and show an error early.",
      avoid: "claiming the reward (use horizon_redeem_gift_code; validating alone grants nothing).",
      requires: "a userId from horizon_signup_* or horizon_signin_*; no session token.",
      effects: "None (read only); no redemption is used.",
      returns: "{valid}. valid false means the code does not exist, has expired, was revoked or reached its limit for this player or in total; tell the player the code does not work.",
    }),
    inputSchema: {
      code: z.string().min(1).max(50).describe("Gift code as the player typed it (max 50 characters)"),
      userId: userIdSchema,
    },
    outputSchema: VALIDATE_GIFT_CODE_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ code, userId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/gift-codes/validate", {
        code,
        userId,
      });
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Redeem gift code ---
  server.registerTool("horizon_redeem_gift_code", {
    title: "Redeem Gift Code",
    description: describeTool({
      summary: "Redeems a gift code for a player: uses up one redemption and returns the reward data and any cosmetic unlocks.",
      use: "the player confirms a code in the game. Check it first with horizon_validate_gift_code when unsure.",
      avoid: "only checking a code (use horizon_validate_gift_code, which uses nothing up).",
      requires: SESSION_REQUIRED,
      effects: "each successful call uses up one redemption and cannot be undone; cosmetic grants are added to the player's unlocks. A repeat redeems again or fails when the per-player limit is reached.",
      returns:
        "{success, message, giftData, grantedUnlocks}. giftData is a JSON string with the reward set in the dashboard, which the game must parse and apply. " +
        "grantedUnlocks lists the cosmetic IDs from giftData.grants the player owns after this redemption ([] without grants); show them with horizon_get_profile.",
      errors:
        "404 for an unknown code. 400 for an expired or revoked code or a reached limit: tell the player the code does not work. " +
        "409 UNLOCK_LIMIT_REACHED when the player would own more than 25 unlocks; the code is not used up. " +
        SESSION_ERRORS,
    }),
    inputSchema: {
      code: z.string().min(1).max(50).describe("Gift code as the player typed it (max 50 characters)"),
      userId: userIdSchema,
      sessionToken: z.string().min(1).max(256).describe("accessToken from horizon_signin_email or horizon_signin_anonymous for this userId; sent as a Bearer session"),
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
