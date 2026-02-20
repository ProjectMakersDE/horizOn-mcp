/**
 * Shared helpers for tool handlers.
 */

import { HorizonApiError } from "./api-client.js";

type ToolContent = { type: "text"; text: string };
type ToolResult = { content: ToolContent[] };

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
  };
}

/**
 * Returns a formatted error tool result.
 */
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
