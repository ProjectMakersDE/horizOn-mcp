/**
 * Shared helpers for admin-tool handlers.
 *
 * These mirror the player-side helpers in ../tool-helpers.ts but tailored
 * for the account-key surface:
 *
 *  - getAdminClient()        — lazy factory, returns null when unconfigured
 *  - noAdminClientResponse() — consistent error when the key is missing
 *  - jsonResponse()          — pretty-print arbitrary JSON payloads
 *  - errorResponse()         — surface thrown errors to the caller (names the error code)
 *  - describeTool, ADMIN_AUTH and the annotation presets for tool metadata
 */

import { createAdminApiClientFromEnv } from "../admin-api-client.js";

type ToolContent = { type: "text"; text: string };
type ToolResult = { content: ToolContent[]; isError?: boolean };

export function getAdminClient() {
  return createAdminApiClientFromEnv();
}

export function noAdminClientResponse(): ToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text:
          "HORIZON_ACCOUNT_API_KEY is not configured. Admin tools require an Account Key.",
      },
    ],
    isError: true,
  };
}

export function jsonResponse<T>(data: T): ToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Error results name the stable server error code when the body has one
 * (same helper as the player tools).
 */
export { errorResponse } from "../tool-helpers.js";

export {
  describeTool,
  READ_ONLY,
  ADDITIVE_WRITE,
  IDEMPOTENT_WRITE,
  DESTRUCTIVE_WRITE,
  DESTRUCTIVE_NON_IDEMPOTENT,
} from "../tool-helpers.js";

/**
 * Auth and failure note appended to every admin tool description (pass it
 * as the footer of describeTool).
 */
export const ADMIN_AUTH =
  "Needs HORIZON_ACCOUNT_API_KEY (an Account Key from the horizOn dashboard; admin tools are only registered when it is set). " +
  "Every failure returns an error result (isError) with the HTTP status and body: 401 means the Account Key is wrong or revoked, " +
  "403 means the key's scope (single project or feature groups) does not cover this call, 429 means the rate limit was reached (wait a minute, then retry).";
