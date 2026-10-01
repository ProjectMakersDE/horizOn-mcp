/**
 * Shared helpers for tool handlers.
 */

import { HorizonApiError } from "./api-client.js";

type ToolContent = { type: "text"; text: string };
type ToolResult = { content: ToolContent[]; isError?: boolean; structuredContent?: Record<string, unknown> };

/**
 * MCP tool annotations. Every tool sets all four hints explicitly so clients
 * (and registries such as Glama) can tell reads from writes without guessing.
 * All horizOn tools call the horizOn API, so openWorldHint is always true.
 */

/** Reads data and changes nothing. */
export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Creates a new record on every call (a repeat creates another one). */
export const ADDITIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/** Changes state without losing data; repeating the same call changes nothing more. */
export const IDEMPOTENT_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Overwrites or deletes data; repeating the same call changes nothing more. */
export const DESTRUCTIVE_WRITE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

/** Overwrites, consumes or deletes data, and a repeat has a further effect. */
export const DESTRUCTIVE_NON_IDEMPOTENT = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
} as const;

/**
 * Sentence appended to every player tool description.
 */
export const API_ERRORS =
  "Needs HORIZON_API_KEY. Every failure returns an error result (isError) with the HTTP status and body: " +
  "a 401 that horizon_test_connection also returns means HORIZON_API_KEY is wrong, 429 means the account's per-minute rate limit was reached (wait a minute, then retry).";

/**
 * The parts of a tool description. The builder joins them into labelled
 * lines in a fixed order, so every tool reads the same way: what it does
 * first, then when to use it, prerequisites, side effects, the result and
 * the failure cases with their recovery.
 */
export interface ToolDoc {
  /** One sentence: verb + resource, and what sets it apart from its siblings. */
  summary: string;
  /** When to call it. */
  use?: string;
  /** When not to call it and which sibling to use instead. */
  avoid?: string;
  /** Prerequisites: credentials, IDs or tokens from other tools, tiers. */
  requires?: string;
  /** Writes and other side effects, or "None (read only)". */
  effects?: string;
  /** What a successful call returns. */
  returns: string;
  /** Failure cases and how to recover. */
  errors?: string;
}

/**
 * Builds a tool description from its parts. `footer` is appended to the
 * Errors line (the auth and API failure note of the tool family).
 */
export function describeTool(doc: ToolDoc, footer: string = API_ERRORS): string {
  const lines = [doc.summary.trim()];
  if (doc.use) lines.push(`Use when: ${doc.use.trim()}`);
  if (doc.avoid) lines.push(`Not for: ${doc.avoid.trim()}`);
  if (doc.requires) lines.push(`Requires: ${doc.requires.trim()}`);
  if (doc.effects) lines.push(`Side effects: ${doc.effects.trim()}`);
  lines.push(`Returns: ${doc.returns.trim()}`);
  lines.push(`Errors: ${[doc.errors?.trim(), footer].filter(Boolean).join(" ")}`);
  return lines.join("\n");
}

/**
 * Prerequisite text for the tools that need the player's session.
 */
export const SESSION_REQUIRED =
  "userId and the player's session: sign in with horizon_signin_email or horizon_signin_anonymous and pass its accessToken as sessionToken.";

/**
 * Recovery text for the session errors the session tools share.
 */
export const SESSION_ERRORS =
  "401 means the session is missing or expired: sign in again and retry with the new accessToken. " +
  "403 for a session means the token belongs to another user: pass the userId that signed in.";

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

/**
 * Like jsonResponse, but also returns the data as structuredContent for tools
 * that declare an outputSchema. A value that is not a plain object is
 * wrapped as {value}, because structuredContent must be an object.
 */
export function structuredResponse(data: unknown): ToolResult {
  const structured =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : { value: data };
  return { ...jsonResponse(data), structuredContent: structured };
}
