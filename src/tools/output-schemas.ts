/**
 * Output schemas for the read-only player tools.
 *
 * They document the result shape for clients and registries. They are
 * deliberately lenient: every field is optional and nullable and unknown
 * fields pass, because the MCP SDK turns a structuredContent that does not
 * match its outputSchema into an error result. A new or renamed server field
 * must never break a working read. Write tools declare no outputSchema, so a
 * shape change can never make a completed write look failed.
 */

import { z } from "zod/v4";

type Shape = Record<string, z.ZodType>;

/**
 * Object schema whose fields are all optional and nullable and which lets
 * unknown fields through.
 */
export function lenientObject(shape: Shape) {
  const relaxed: Shape = {};
  for (const [key, schema] of Object.entries(shape)) {
    relaxed[key] = schema.nullable().optional();
  }
  return z.object(relaxed).loose();
}

const profile = lenientObject({
  avatarId: z.string().describe("Avatar cosmetic ID, null when not set"),
  frameId: z.string().describe("Frame cosmetic ID, null when not set"),
  badges: z.array(z.string()).describe("Displayed badge cosmetic IDs (0 to 3)"),
}).describe("The player's displayed cosmetics");

const leaderboardEntry = lenientObject({
  position: z.number().describe("1-based position on the board"),
  username: z.string().describe("Player display name"),
  score: z.number().describe("Best score of the player on this board"),
  profile,
});

export const TEST_CONNECTION_OUTPUT = lenientObject({
  success: z.boolean().describe("true when the API key and base URL work"),
  data: z.unknown().describe("The app's remote configs as returned by the API"),
});

export const CHECK_AUTH_OUTPUT = lenientObject({
  userId: z.string().describe("User ID the session belongs to"),
  isAuthenticated: z.boolean().describe("true when the session is valid"),
  authStatus: z.string().describe("Server auth status name"),
  message: z.string().describe("Human-readable status message"),
});

export const LIST_LEADERBOARDS_OUTPUT = lenientObject({
  boards: z
    .array(
      lenientObject({
        key: z.string().describe("Board key to pass as leaderboardKey"),
        name: z.string().describe("Display name"),
        sortOrder: z.string().describe("DESC (higher wins) or ASC (lower wins)"),
        isActive: z.boolean().describe("false when the board is disabled"),
        scoreCount: z.number().describe("Number of entries"),
        validatedOnly: z.boolean().describe("true when only horizon_submit_validated may write scores"),
      }),
    )
    .describe("Boards of the API key"),
  totalElements: z.number().describe("Number of boards"),
});

export const LEADERBOARD_ENTRIES_OUTPUT = lenientObject({
  entries: z.array(leaderboardEntry).describe("Leaderboard entries in board order"),
});

export const USER_RANK_OUTPUT = lenientObject({
  position: z.number().describe("1-based position on the board"),
  username: z.string().describe("Player display name"),
  score: z.number().describe("Best score of the player on this board"),
  profile,
});

export const LOAD_CLOUD_DATA_OUTPUT = lenientObject({
  found: z.boolean().describe("false when the player never saved"),
  saveData: z.string().describe("The stored save string, null when found is false"),
});

export const REMOTE_CONFIG_OUTPUT = lenientObject({
  configKey: z.string().describe("The requested key"),
  configValue: z.string().describe("The value as a string, null when not found"),
  found: z.boolean().describe("false when the key does not exist"),
});

export const ALL_REMOTE_CONFIGS_OUTPUT = lenientObject({
  configs: z.record(z.string(), z.string()).describe("Map of config key to string value"),
  total: z.number().describe("Number of configs"),
});

export const LOCALIZATION_OUTPUT = lenientObject({
  localizationKey: z.string().describe("The requested key"),
  value: z.string().describe("The translated text, null when not found"),
  language: z.string().describe("ISO 639-1 code of the language used"),
  found: z.boolean().describe("false when the key has no translation"),
});

export const ALL_LOCALIZATIONS_OUTPUT = lenientObject({
  translations: z.record(z.string(), z.string()).describe("Map of localization key to translated text"),
  language: z.string().describe("ISO 639-1 code of the language used"),
  total: z.number().describe("Number of translations"),
});

export const LOCALIZATION_LANGUAGES_OUTPUT = lenientObject({
  languages: z.array(z.string()).describe("ISO 639-1 codes with at least one translation"),
  total: z.number().describe("Number of languages"),
});

export const VALIDATE_GIFT_CODE_OUTPUT = lenientObject({
  valid: z.boolean().describe("true when the player can redeem the code now"),
});

export const PLAYER_PROFILE_OUTPUT = lenientObject({
  userId: z.string().describe("User ID"),
  profile,
  unlocks: z.array(z.string()).describe("Cosmetic IDs the player has unlocked"),
  cosmetics: z
    .array(
      lenientObject({
        id: z.string().describe("Cosmetic ID"),
        type: z.string().describe("avatar, frame or badge"),
        locked: z.boolean().describe("true when the cosmetic needs an unlock"),
        available: z.boolean().describe("true when this player may select it"),
      }),
    )
    .describe("Cosmetics catalog of the API key"),
  limits: lenientObject({
    maxBadges: z.number().describe("Most badges a player may display"),
    maxUnlocks: z.number().describe("Most unlocks a player may own"),
  }),
});

export const PLAYER_STATE_OUTPUT = lenientObject({
  userId: z.string().describe("User ID"),
  day: z.string().describe("Current UTC day"),
  values: z
    .array(
      lenientObject({
        key: z.string().describe("Value key from the rules"),
        balance: z.number().describe("Current balance"),
        earnedToday: z.number().describe("Positive credit on the current UTC day"),
        dailyCap: z.number().describe("Daily cap, null without cap"),
      }),
    )
    .describe("Every value key of the rules, sorted by key"),
});

export const EMAIL_STATUS_OUTPUT = lenientObject({
  id: z.string().describe("Email ID"),
  status: z.string().describe("pending, processing, sent or failed"),
  templateSlug: z.string().describe("Template used"),
  userId: z.string().describe("Recipient user ID"),
  language: z.string().describe("Template language"),
  scheduledAt: z.string().describe("Scheduled send time, null for immediate"),
  processedAt: z.string().describe("When the email was processed, null while pending"),
  errorReason: z.string().describe("Why sending failed, null unless failed"),
  createdAt: z.string().describe("When the email was queued"),
});
