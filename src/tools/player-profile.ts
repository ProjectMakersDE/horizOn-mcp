import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, API_ERRORS } from "./tool-helpers.js";

const PROFILE_PATH = "/api/v1/app/player-profile";

/**
 * Cosmetic ID rule of the server (`PlayerProfileRules`): 1 to 32 characters,
 * lowercase letters, digits, `.`, `_`, `-`, starting with a letter or digit.
 */
export const COSMETIC_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,31}$/;

/** Maximum number of displayed badges per player. */
export const MAX_BADGES = 3;

const slotSchema = (slot: "avatar" | "frame") =>
  z
    .string()
    .max(32)
    .regex(/^$|^[a-z0-9][a-z0-9._-]{0,31}$/, "Cosmetic ID: lowercase letters, digits, '.', '_', '-', 1 to 32 characters")
    .nullable()
    .optional()
    .describe(
      `Cosmetic ID of type ${slot} from the catalog (for example "${slot}.gold"). Omit, null or "" clears the ${slot} slot.`,
    );

const PROFILE_ERRORS =
  "Errors carry a stable code in the body: 400 INVALID_BADGES, INVALID_COSMETIC_ID, COSMETIC_NOT_FOUND or COSMETIC_TYPE_MISMATCH; " +
  "401 SESSION_REQUIRED for a missing or expired session; 403 COSMETIC_LOCKED (locked and not unlocked) or SESSION_FORBIDDEN (session of another user); " +
  "404 PLAYER_NOT_FOUND. ";

export function registerPlayerProfileTools(server: McpServer): void {
  // --- Get player profile ---
  server.registerTool("horizon_get_profile", {
    title: "Get Player Profile",
    description:
      "Returns a player's profile (avatar, frame, badges), the player's unlocks and the cosmetics catalog of the API key with an available flag per entry. " +
      "Needs the player's session: sign in with horizon_signin_email or horizon_signin_anonymous first and pass its accessToken. " +
      "Returns {userId, profile: {avatarId, frameId, badges}, unlocks, cosmetics: [{id, type, locked, available}], limits: {maxBadges, maxUnlocks}}. " +
      "Use it before horizon_set_profile to see which IDs the player may select. " +
      PROFILE_ERRORS +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      sessionToken: z.string().min(1).max(256).describe("accessToken returned by horizon_signin_email or horizon_signin_anonymous for this user; sent as a Bearer session"),
    },
    annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get(PROFILE_PATH, { userId }, sessionHeaders(sessionToken));
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Set player profile ---
  server.registerTool("horizon_set_profile", {
    title: "Set Player Profile",
    description:
      "Sets a player's avatar, frame and displayed badges. This REPLACES THE WHOLE PROFILE: a slot that is omitted, null or empty is cleared, " +
      "so pass the current values (from horizon_get_profile) for slots that should stay. " +
      "Every ID must be in the catalog of the API key, have the type of its slot and be free or unlocked for the player; at most 3 distinct badges, order kept. " +
      "Needs the player's session: sign in with horizon_signin_email or horizon_signin_anonymous first and pass its accessToken. " +
      "Returns the same body as horizon_get_profile after the change. The profile appears in leaderboard entries. " +
      PROFILE_ERRORS +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      sessionToken: z.string().min(1).max(256).describe("accessToken returned by horizon_signin_email or horizon_signin_anonymous for this user; sent as a Bearer session"),
      avatarId: slotSchema("avatar"),
      frameId: slotSchema("frame"),
      badges: z
        .array(z.string().regex(COSMETIC_ID_PATTERN, "Cosmetic ID: lowercase letters, digits, '.', '_', '-', 1 to 32 characters"))
        .max(MAX_BADGES)
        .optional()
        .describe("Badge cosmetic IDs to display (0 to 3, distinct, order kept). Omit or [] clears all badges."),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ userId, sessionToken, avatarId, frameId, badges }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      // PUT replaces the whole profile, so every slot is sent explicitly
      const result = await client.put(
        PROFILE_PATH,
        {
          userId,
          avatarId: avatarId ? avatarId : null,
          frameId: frameId ? frameId : null,
          badges: badges ?? [],
        },
        sessionHeaders(sessionToken),
      );
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
