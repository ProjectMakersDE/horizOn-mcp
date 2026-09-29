import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import {
  noApiKeyResponse,
  errorResponse,
  jsonResponse,
  structuredResponse,
  describeTool,
  ADDITIVE_WRITE,
  IDEMPOTENT_WRITE,
} from "./tool-helpers.js";
import { CHECK_AUTH_OUTPUT } from "./output-schemas.js";

const userIdSchema = z
  .string()
  .uuid()
  .describe("Player user ID (UUID) from the result of horizon_signup_* or horizon_signin_*");

export function registerAuthTools(server: McpServer): void {
  // --- Sign up anonymously ---
  server.registerTool("horizon_signup_anonymous", {
    title: "Sign Up Anonymously",
    description: describeTool({
      summary: "Creates a new anonymous (guest) player account that needs only a display name and returns its anonymousToken.",
      use: "a player starts without email, for example on first launch of a game with guest play.",
      avoid: "players who sign up with email and password (use horizon_signup_email) or returning guests (use horizon_signin_anonymous with the stored anonymousToken).",
      effects: "creates one new player account per call; calling it again creates another account, it never finds an existing one. Sign-up starts no session.",
      returns: "{userId, username, isAnonymous: true, anonymousToken, createdAt}. Store anonymousToken on the device: it is the only way back into this account. Then call horizon_signin_anonymous to get the accessToken that session tools need.",
      errors: "400 for an invalid displayName: fix the name and retry.",
    }),
    inputSchema: {
      displayName: z.string().max(30).describe("Display name shown on leaderboards (max 30 characters)"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ displayName }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signup", {
        type: "ANONYMOUS",
        username: displayName,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Sign up with email ---
  server.registerTool("horizon_signup_email", {
    title: "Sign Up with Email",
    description: describeTool({
      summary: "Creates a new player account with email, password and display name; the account starts unverified and without a session.",
      use: "a new player registers with email so the account can be recovered on other devices.",
      avoid: "existing accounts (use horizon_signin_email) and guest play without email (use horizon_signup_anonymous).",
      effects: "creates one player account and sends the verification email. It does not sign in.",
      returns: "the new user with userId and isVerified: false. After the player verified the email address, call horizon_signin_email to get the accessToken.",
      errors: "409 when the email already belongs to an account: sign in with horizon_signin_email instead. 400 for an invalid email, a password outside 8 to 128 characters or a common password, or a bad name: fix the value and retry.",
    }),
    inputSchema: {
      email: z.string().email().max(40).describe("Player email address (valid format, max 40 characters); must not be registered yet"),
      password: z.string().min(8).max(128).describe("Password, 8 to 128 characters; common passwords such as \"password1\" are rejected. Sent to the API only, never returned"),
      displayName: z.string().max(30).describe("Display name shown on leaderboards (max 30 characters)"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ email, password, displayName }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signup", {
        type: "EMAIL",
        email,
        password,
        username: displayName,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Sign in with email ---
  server.registerTool("horizon_signin_email", {
    title: "Sign In with Email",
    description: describeTool({
      summary: "Signs in an existing email account with email and password and starts a player session (accessToken).",
      use: "a registered, verified player logs in, before any tool that needs sessionToken (submit score, cloud save, gift code redeem, profile, validated runs).",
      avoid: "guest accounts (use horizon_signin_anonymous), new players (use horizon_signup_email) or checking an existing token (use horizon_check_auth).",
      effects: "creates a new session on every call; older sessions stay valid.",
      returns: "{userId, username, email, accessToken, authStatus, message}. Pass userId and accessToken (as sessionToken) to the session tools; the token stays valid for one hour after its last use.",
      errors: "401 for a wrong password or unknown email: ask the player to check the credentials. 403 (NOT_VERIFIED) for an unverified email: the player must confirm the verification email first.",
    }),
    inputSchema: {
      email: z.string().email().max(40).describe("Email address the account was registered with (max 40 characters)"),
      password: z.string().min(1).max(128).describe("Account password (max 128 characters); sent to the API only, never returned"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ email, password }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signin", {
        type: "EMAIL",
        email,
        password,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Sign in anonymously ---
  server.registerTool("horizon_signin_anonymous", {
    title: "Sign In Anonymously",
    description: describeTool({
      summary: "Signs in an anonymous (guest) account with its stored anonymousToken and starts a player session (accessToken).",
      use: "a returning guest opens the game, or right after horizon_signup_anonymous, before any tool that needs sessionToken.",
      avoid: "email accounts (use horizon_signin_email) or creating a guest (use horizon_signup_anonymous).",
      requires: "the anonymousToken returned by horizon_signup_anonymous for this account.",
      effects: "creates a new session on every call; older sessions stay valid.",
      returns: "{userId, username, accessToken, authStatus, message}. Pass userId and accessToken (as sessionToken) to the session tools; the token stays valid for one hour after its last use.",
      errors: "404 for an unknown anonymousToken: the account is lost, create a new one with horizon_signup_anonymous. 429 also comes from the per-token limit (5 attempts per minute) and the per-IP limit (30 per minute): wait a minute.",
    }),
    inputSchema: {
      anonymousToken: z
        .string()
        .length(32)
        .regex(/^[A-Za-z0-9_-]+$/, "32 characters: letters, digits, _ and -")
        .describe("anonymousToken returned by horizon_signup_anonymous (exactly 32 characters: letters, digits, _ and -)"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ anonymousToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signin", {
        type: "ANONYMOUS",
        anonymousToken,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Check auth ---
  server.registerTool("horizon_check_auth", {
    title: "Check Authentication",
    description: describeTool({
      summary: "Checks whether a player's session token (accessToken) is still valid for the given user.",
      use: "before a session tool when the token may have expired, or when a game resumes, to decide whether the player must sign in again.",
      avoid: "testing the API key or base URL (use horizon_test_connection) or getting a new token (use horizon_signin_email or horizon_signin_anonymous).",
      requires: "userId and the accessToken from horizon_signin_email or horizon_signin_anonymous.",
      effects: "a valid check refreshes the session's one hour idle timeout; nothing else changes.",
      returns: "{userId, isAuthenticated, authStatus, message}. An invalid or expired token is not an HTTP error: isAuthenticated is false, so sign in again with horizon_signin_*.",
      errors: "400 for a malformed userId or token: pass the values from the sign-in result.",
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: z.string().min(1).max(256).describe("accessToken from horizon_signin_email or horizon_signin_anonymous (max 256 characters)"),
    },
    outputSchema: CHECK_AUTH_OUTPUT,
    annotations: IDEMPOTENT_WRITE,
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/check-auth", {
        userId,
        sessionToken,
      });
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
