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
  DESTRUCTIVE_WRITE,
  SESSION_REQUIRED,
} from "./tool-helpers.js";
import { PLAYER_PROFILE_OUTPUT } from "./output-schemas.js";

const userIdSchema = z.string().uuid().describe("Player user ID (UUID) from horizon_signup_* or horizon_signin_*");

const sessionTokenSchema = z
  .string()
  .min(1)
  .max(256)
  .describe("accessToken from horizon_signin_email or horizon_signin_anonymous for this userId; sent as a Bearer session");

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

const SESSION_CODES =
  "401 SESSION_REQUIRED for a missing or expired session: sign in again. 403 SESSION_FORBIDDEN for a session of another user: pass the userId that signed in. " +
  "404 PLAYER_NOT_FOUND for an unknown userId.";

const PROFILE_ERRORS =
  "The error result names the stable code. 400 INVALID_BADGES, INVALID_COSMETIC_ID, COSMETIC_NOT_FOUND or COSMETIC_TYPE_MISMATCH: pick IDs of the right type from horizon_get_profile. " +
  "403 COSMETIC_LOCKED: the cosmetic is locked and the player has not unlocked it (unlocks come from gift code grants). " +
  SESSION_CODES;

export function registerPlayerProfileTools(server: McpServer): void {
  // --- Get player profile ---
  server.registerTool("horizon_get_profile", {
    title: "Get Player Profile",
    description: describeTool({
      summary: "Returns a player's profile (avatar, frame, badges), the player's unlocks and the cosmetics catalog of the API key with an available flag per entry.",
      use: "before horizon_set_profile, to show the selection screen and learn which IDs the player may pick.",
      avoid: "changing the profile (use horizon_set_profile) or showing other players' profiles (leaderboard entries already carry them).",
      requires: SESSION_REQUIRED,
      effects: "None (read only).",
      returns: "{userId, profile: {avatarId, frameId, badges}, unlocks, cosmetics: [{id, type, locked, available}], limits: {maxBadges, maxUnlocks}}. available true means this player may select the entry.",
      errors: SESSION_CODES,
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
    },
    outputSchema: PLAYER_PROFILE_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get(PROFILE_PATH, { userId }, sessionHeaders(sessionToken));
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Set player profile ---
  server.registerTool("horizon_set_profile", {
    title: "Set Player Profile",
    description: describeTool({
      summary: "Sets a player's avatar, frame and displayed badges. This REPLACES THE WHOLE PROFILE: an omitted, null or empty slot is cleared.",
      use: "the player confirms a new look. Pass the current values from horizon_get_profile for the slots that should stay.",
      avoid: "reading the profile or the catalog (use horizon_get_profile).",
      requires: SESSION_REQUIRED + " Every ID must be in the API key's catalog, have the type of its slot and be free or unlocked for the player; at most 3 distinct badges.",
      effects: "overwrites all three slots; the same call again changes nothing more. The profile shows up in leaderboard entries.",
      returns: "the same body as horizon_get_profile after the change.",
      errors: PROFILE_ERRORS,
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
      avatarId: slotSchema("avatar"),
      frameId: slotSchema("frame"),
      badges: z
        .array(z.string().regex(COSMETIC_ID_PATTERN, "Cosmetic ID: lowercase letters, digits, '.', '_', '-', 1 to 32 characters"))
        .max(MAX_BADGES)
        .optional()
        .describe("Badge cosmetic IDs of type badge to display (0 to 3, distinct, order kept, each 1 to 32 characters: a-z, 0-9, ., _ and -). Omit or [] clears all badges."),
    },
    annotations: DESTRUCTIVE_WRITE,
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
