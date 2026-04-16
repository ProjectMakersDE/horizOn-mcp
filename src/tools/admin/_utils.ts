/**
 * Shared helpers for admin-tool handlers.
 *
 * These mirror the player-side helpers in ../tool-helpers.ts but tailored
 * for the account-key surface:
 *
 *  - getAdminClient()        — lazy factory, returns null when unconfigured
 *  - noAdminClientResponse() — consistent error when the key is missing
 *  - jsonResponse()          — pretty-print arbitrary JSON payloads
 *  - errorResponse()         — surface thrown errors to the caller
 */

import { createAdminApiClientFromEnv } from "../admin-api-client.js";
import { HorizonApiError } from "../api-client.js";

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
          "HORIZON_ACCOUNT_API_KEY is not configured. Admin tools require an account-level API key.",
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

export function errorResponse(error: unknown): ToolResult {
  let message: string;
  if (error instanceof HorizonApiError) {
    message = `horizOn API error (HTTP ${error.status}): ${error.body}`;
  } else if (error instanceof Error) {
    message = `Error: ${error.message}`;
  } else {
    message = `Unknown error: ${String(error)}`;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: message,
      },
    ],
    isError: true,
  };
}
