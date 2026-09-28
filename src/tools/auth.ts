import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, ADDITIVE_WRITE, API_ERRORS } from "./tool-helpers.js";

export function registerAuthTools(server: McpServer): void {
  // --- Sign up anonymously ---
  server.registerTool("horizon_signup_anonymous", {
    title: "Sign Up Anonymously",
    description:
      "Creates a guest account with only a display name, for players without email. For accounts with email and password, use horizon_signup_email. " +
      "The server generates an anonymousToken and returns it with the new user as {userId, username, isAnonymous, anonymousToken, createdAt}. " +
      "Keep the anonymousToken: it is the only way back into this account with horizon_signin_anonymous. " +
      "Sign-up starts no session, so call horizon_signin_anonymous before tools that need one. Each call creates another account. " +
      API_ERRORS,
    inputSchema: {
      displayName: z.string().max(30).describe("Display name for the anonymous user (max 30 characters)"),
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
    description:
      "Creates an account with email, password and display name. Use horizon_signin_email for existing accounts and horizon_signup_anonymous for guests. " +
      "The new account starts unverified and sign-up starts no session: horizon_signin_email returns 403 (NOT_VERIFIED) until the email address is verified. " +
      "Returns the new user with userId and isVerified false. An email that is already registered gives 409. " +
      API_ERRORS,
    inputSchema: {
      email: z.string().email().max(40).describe("Email address (max 40 characters)"),
      password: z.string().min(4).max(32).describe("Password (4-32 characters)"),
      displayName: z.string().max(30).describe("Display name (max 30 characters)"),
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
    description:
      "Signs in an existing email account and starts a session. Use horizon_signup_email to create one and horizon_signin_anonymous for guest accounts. " +
      "Returns {userId, username, email, accessToken, authStatus, message}. Pass accessToken as sessionToken to horizon_submit_score, " +
      "horizon_save_cloud_data, horizon_load_cloud_data and horizon_check_auth; it stays valid for one hour after its last use. " +
      "A wrong password or unknown email gives 401, an unverified email 403. Signing in again does not end older sessions. " +
      API_ERRORS,
    inputSchema: {
      email: z.string().email().describe("Email address"),
      password: z.string().describe("Password"),
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
    description:
      "Signs in a guest account with the anonymousToken returned by horizon_signup_anonymous and starts a session. Use horizon_signin_email for email accounts. " +
      "Returns {userId, username, accessToken, authStatus, message}; pass accessToken as sessionToken to the tools that need a session. " +
      "An unknown token gives 404. Besides the account rate limit, anonymous sign-in allows 5 attempts per token and 30 per IP address per minute. " +
      API_ERRORS,
    inputSchema: {
      anonymousToken: z.string().max(32).describe("anonymousToken returned by horizon_signup_anonymous (max 32 characters)"),
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
    description:
      "Checks whether a session token from horizon_signin_email or horizon_signin_anonymous is still valid for this user, for example before a call that needs a session. " +
      "Returns {userId, isAuthenticated, authStatus, message}. An invalid or expired token is not an HTTP error: isAuthenticated is false and the player has to sign in again. " +
      "A successful check can extend the session's lifetime. To test the API key itself, use horizon_test_connection. " +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID) returned by a horizon_signup_* or horizon_signin_* tool"),
      sessionToken: z.string().max(256).describe("accessToken returned by a horizon_signin_* tool (max 256 characters)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/check-auth", {
        userId,
        sessionToken,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
