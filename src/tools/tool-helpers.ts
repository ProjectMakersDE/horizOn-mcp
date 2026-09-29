/**
 * Shared helpers for tool handlers.
 */

import { HorizonApiError } from "./api-client.js";

type ToolContent = { type: "text"; text: string };
type ToolResult = { content: ToolContent[]; isError?: boolean };

/**
 * Tool annotations for the player tools. They all call the horizOn API.
 */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
export const ADDITIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/**
 * Sentence appended to every player tool description.
 */
export const API_ERRORS =
  "Needs HORIZON_API_KEY. API failures (for example 401 for a wrong key or 429 when the account's per-minute rate limit is reached) return an error result with the HTTP status and body.";

/**
 * Returns a tool result telling the user to set HORIZON_API_KEY.
 */
export function noApiKeyResponse(): ToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: "HORIZON_API_KEY environment variable is not set. Please set it to your horizOn API key.",
      },
    ],
    isError: true,
  };
}

/**
 * Reads the stable error `code` from a JSON error body (player profile
 * errors and simpleServer errors carry one). Returns null when there is none.
 */
export function errorCode(body: string): string | null {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object" && "code" in parsed) {
      const code = (parsed as { code: unknown }).code;
      return typeof code === "string" && code.length > 0 ? code : null;
    }
  } catch {
    // not JSON
  }
  return null;
}

/**
 * Returns a formatted error tool result. When the body carries a stable
 * error `code` (for example COSMETIC_LOCKED), it is named in the text.
 */
export function errorResponse(error: unknown): ToolResult {
  let message: string;
  if (error instanceof HorizonApiError) {
    const code = errorCode(error.body);
    message = code
      ? `horizOn API error (HTTP ${error.status}, code ${code}): ${error.body}`
      : `horizOn API error (HTTP ${error.status}): ${error.body}`;
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

/**
 * Returns a successful tool result with JSON-formatted data.
 */
export function jsonResponse(data: unknown): ToolResult {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
