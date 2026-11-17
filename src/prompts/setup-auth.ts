import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerSetupAuthPrompt(server: McpServer): void {
  server.registerPrompt("setup-auth", {
    title: "Setup Authentication",
    description:
      "Step-by-step guide to set up horizOn authentication in your project.",
    argsSchema: {
      engine: z
        .enum(["godot", "unity", "unreal"])
        .describe("Your game engine"),
      method: z
        .enum(["anonymous", "email", "google", "apple"])
        .describe("Authentication method"),
      session: z
        .enum(["access-only", "refresh"])
        .optional()
        .describe("Session strategy: access-only by default, or explicit opt-in to secure 30-day rotating refresh sessions"),
    },
  }, ({ engine, method, session }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Set up horizOn ${method} authentication in my ${engine} project with ${session ?? "access-only"} sessions.\n\nPlease:\n1. Read horizon://docs/auth and horizon://quickstart/${engine}, then inspect the installed SDK before writing code.\n2. Walk through the player-approved signup AND signin flows. Use server-issued anonymous tokens only. For Google one-click auth use signup with signInIfExists=true: never probe signin then reuse the single-use code for signup. For Apple check project API-key Team ID, Services ID/Bundle ID and implement signup fallback only for USER_NOT_FOUND. Provider consent UI and browser callbacks belong in the app.\n3. Implement ${session === "refresh" ? "includeRefreshToken=true as an explicit opt-in. Use platform secure storage, one refresh in flight per token family and atomic replacement of the returned pair. Refresh tokens rotate with a 30-day lifetime. Never retry a lost/uncertain refresh response; require fresh signin. Clear family credentials on REFRESH_TOKEN_REUSED. Use an explicit REST adapter if the SDK lacks these methods" : "the existing access-only contract, leaving includeRefreshToken omitted/false. Explain the optional 30-day refresh flow and its secure-storage requirements without enabling it automatically"}. Never log credentials or store refresh/recovery tokens in general preferences or PlayerPrefs.\n4. Handle verification, password reset, change-name and server signout. SDK-local SignOut alone does not revoke server tokens. Inspect authStatus/isAuthenticated and honor Retry-After and the operation's retry rules.\n5. Provide fixture-based tests for success, error responses, provider fallback and session storage. Do not create live accounts, send verification/reset emails, exchange provider credentials or revoke sessions as an automatic setup test. Any live auth operation needs the player's corresponding explicit action.`,
        },
      },
    ],
  }));
}
