import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import {
  noApiKeyResponse,
  errorResponse,
  jsonResponse,
  structuredResponse,
  describeTool,
  ADDITIVE_WRITE,
  IDEMPOTENT_WRITE,
  DESTRUCTIVE_WRITE,
  DESTRUCTIVE_NON_IDEMPOTENT,
  API_ERRORS,
} from "./tool-helpers.js";
import { CHECK_AUTH_OUTPUT } from "./output-schemas.js";

const userIdSchema = z
  .string()
  .uuid()
  .describe("Player user ID (UUID) from the result of horizon_signup_* or horizon_signin_*");

const includeRefreshTokenSchema = z.boolean().optional().describe(
  "Explicit opt-in to a rotating 30-day refresh session; omitted or false preserves access-only behavior. Store refresh tokens in platform secure storage",
);
const sessionTokenSchema = z.string().min(1).max(256).describe("Player accessToken from signup, signin or refresh-session, passed as sessionToken (max 256 characters)");
const googleCodeSchema = z.string().min(1).max(2000).describe("Fresh single-use Google authorization code obtained by the player's OAuth consent flow (max 2000 characters)");
const googleRedirectSchema = z.string().max(500).describe("Exact redirect URI used to obtain the Google authorization code; empty string for configured native flows (max 500 characters)");
const appleTokenSchema = z.string().min(1).max(4096).describe("Apple identity-token JWT obtained after player consent, with audience matching this project's configured Services ID or Bundle ID");
const emailTokenSchema = z.string().min(1).max(256).describe("Single-use token from the player's verification or password-reset email (max 256 characters)");

// An upstream validation error must not echo credentials into the MCP error text.
function authErrorResponse(error: unknown, ...secrets: (string | undefined)[]) {
  const result = errorResponse(error);
  const redactions = new Set(secrets.filter((secret): secret is string => !!secret)
    .flatMap(secret => [secret, JSON.stringify(secret).slice(1, -1)]));
  for (const content of result.content) {
    for (const secret of redactions) content.text = content.text.split(secret).join("[redacted]");
  }
  return result;
}

export function registerAuthTools(server: McpServer): void {
  // --- Sign up anonymously ---
  server.registerTool("horizon_signup_anonymous", {
    title: "Sign Up Anonymously",
    description: describeTool({
      summary: "Creates a new anonymous (guest) player account that needs only a display name and returns its anonymousToken.",
      use: "a player starts without email, for example on first launch of a game with guest play.",
      avoid: "players who sign up with email and password (use horizon_signup_email) or returning guests (use horizon_signin_anonymous with the stored anonymousToken).",
      effects: "creates one new player account per call after the player chooses guest play. Omitted/false includeRefreshToken starts no session; true also issues access and refresh tokens. Never automatically repeat an uncertain signup.",
      returns: "{userId, username, isAnonymous: true, anonymousToken, authStatus, createdAt}, plus session tokens only when opted in. The server alone issues the 32-character anonymousToken. Store it in platform secure storage. Without accessToken, call horizon_signin_anonymous.",
      errors: "400 for an invalid displayName: fix the name and retry.",
    }),
    inputSchema: {
      displayName: z.string().max(30).describe("Display name shown on leaderboards (max 30 characters)"),
      includeRefreshToken: includeRefreshTokenSchema,
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ displayName, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signup", {
        type: "ANONYMOUS",
        username: displayName,
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
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
      use: "a new player explicitly registers with email so the account can be recovered on other devices.",
      avoid: "existing accounts (use horizon_signin_email) and guest play without email (use horizon_signup_anonymous).",
      effects: "creates one player account and sends the verification email. It does not sign in.",
      returns: "201 with userId, isVerified: false and authStatus: USER_NOT_VERIFIED. No tokens are issued even with includeRefreshToken=true until the email is verified. Use horizon_verify_email, then horizon_signin_email.",
      errors: "409 when the email already belongs to an account: sign in with horizon_signin_email instead. 400 for an invalid email, a password outside 8 to 128 characters or a common password, or a bad name: fix the value and retry.",
    }),
    inputSchema: {
      email: z.string().email().max(40).describe("Player email address (valid format, max 40 characters); must not be registered yet"),
      password: z.string().min(8).max(128).describe("Password, 8 to 128 characters; common passwords such as \"password1\" are rejected. Sent to the API only, never returned"),
      displayName: z.string().max(30).describe("Display name shown on leaderboards (max 30 characters)"),
      includeRefreshToken: includeRefreshTokenSchema,
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ email, password, displayName, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signup", {
        type: "EMAIL",
        email,
        password,
        username: displayName,
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
      });
      return jsonResponse(result);
    } catch (error) {
      return authErrorResponse(error, password);
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
      returns: "{userId, username, email, accessToken, authStatus, message}, with refreshToken and both expiry timestamps only when explicitly opted in. Pass accessToken as sessionToken. Access sessions have a one-hour sliding lifetime; refresh tokens rotate and expire after 30 days.",
      errors: "401 INVALID_CREDENTIALS for wrong credentials. 403 USER_NOT_VERIFIED requires horizon_verify_email first. Use horizon_forgot_password only when the player requests recovery.",
    }),
    inputSchema: {
      email: z.string().email().max(40).describe("Email address the account was registered with (max 40 characters)"),
      password: z.string().min(1).max(128).describe("Account password (max 128 characters); sent to the API only, never returned"),
      includeRefreshToken: includeRefreshTokenSchema,
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ email, password, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signin", {
        type: "EMAIL",
        email,
        password,
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
      });
      return jsonResponse(result);
    } catch (error) {
      return authErrorResponse(error, password);
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
      returns: "{userId, username, accessToken, authStatus, message}, plus refreshToken and both expiry timestamps only when explicitly opted in. Pass accessToken as sessionToken. Store recovery and refresh tokens in platform secure storage, never logs or general preferences.",
      errors: "404 USER_NOT_FOUND means this token cannot restore the account: confirm the stored token and offer horizon_signup_anonymous only after the player chooses a new account. 429 may also be the configured project/IP or project/token limiter: honor Retry-After instead of assuming fixed limits.",
    }),
    inputSchema: {
      anonymousToken: z
        .string()
        .length(32)
        .regex(/^[A-Za-z0-9_-]+$/, "32 characters: letters, digits, _ and -")
        .describe("anonymousToken returned by horizon_signup_anonymous (exactly 32 characters: letters, digits, _ and -)"),
      includeRefreshToken: includeRefreshTokenSchema,
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ anonymousToken, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signin", {
        type: "ANONYMOUS",
        anonymousToken,
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
      });
      return jsonResponse(result);
    } catch (error) {
      return authErrorResponse(error, anonymousToken);
    }
  });

  // Provider consent and redirects remain in the player's app. Each tool makes one request.
  server.registerTool("horizon_signup_google", {
    title: "Sign Up with Google",
    description: describeTool({
      summary: "Creates a Google player, or signs an existing Google player in when signInIfExists is explicitly enabled.",
      use: "the player completes Google OAuth and explicitly chooses registration or one-click signup/signin.",
      avoid: "probing horizon_signin_google then reusing its authorization code for signup. Google codes are single-use; obtain a fresh code after any uncertain exchange.",
      requires: "a fresh Google authorization code and its exact redirect URI from the app's OAuth flow, plus the server's configured Google OAuth client.",
      effects: "exchanges the code once. signInIfExists omitted/false keeps strict signup semantics; true authenticates an existing Google identity. It does not link a different email/provider account.",
      returns: "201 user details and accessToken for new users or signInIfExists=true existing users, even without refresh opt-in. includeRefreshToken=true adds refreshToken and both expiry timestamps. The server derives the name from the Google email; use horizon_change_name later.",
      errors: "409 on an existing identity in strict signup mode or conflicting email. 400 for invalid provider data. Never automatically retry an uncertain exchange or reuse a spent code.",
    }),
    inputSchema: {
      googleAuthorizationCode: googleCodeSchema,
      googleRedirectUri: googleRedirectSchema,
      signInIfExists: z.boolean().optional().describe("Explicitly enable one-click Google registration/signin with one code exchange; omitted/false remains signup-only"),
      includeRefreshToken: includeRefreshTokenSchema,
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ googleAuthorizationCode, googleRedirectUri, signInIfExists, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try {
      return jsonResponse(await client.post("/api/v1/app/user-management/signup", {
        type: "GOOGLE", googleAuthorizationCode, googleRedirectUri,
        ...(signInIfExists === undefined ? {} : { signInIfExists }),
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
      }));
    } catch (error) { return authErrorResponse(error, googleAuthorizationCode); }
  });

  server.registerTool("horizon_signin_google", {
    title: "Sign In with Google",
    description: describeTool({
      summary: "Signs an existing Google player in by exchanging one fresh authorization code for a player session.",
      use: "a known Google player completes OAuth and requests signin.",
      avoid: "an unknown/new player: use horizon_signup_google with signInIfExists=true for one-click registration/signin instead of probing with this tool.",
      effects: "exchanges the Google code once and creates a session; no automatic signup, retries or provider UI.",
      returns: "user details, authStatus: AUTHENTICATED and accessToken, plus refreshToken and both expiry timestamps only with includeRefreshToken=true.",
      errors: "404 USER_NOT_FOUND requires a fresh OAuth code before signup. Never reuse this code after an error or lost response. 400 for invalid provider data, 403 for an unavailable user.",
    }),
    inputSchema: {
      googleAuthorizationCode: googleCodeSchema,
      googleRedirectUri: googleRedirectSchema,
      includeRefreshToken: includeRefreshTokenSchema,
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ googleAuthorizationCode, googleRedirectUri, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try {
      return jsonResponse(await client.post("/api/v1/app/user-management/signin", {
        type: "GOOGLE", googleAuthorizationCode, googleRedirectUri,
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
      }));
    } catch (error) { return authErrorResponse(error, googleAuthorizationCode); }
  });

  server.registerTool("horizon_signup_apple", {
    title: "Sign Up with Apple",
    description: describeTool({
      summary: "Creates an Apple player with a consented identity token and optional first-login name fields.",
      use: "horizon_signin_apple returned USER_NOT_FOUND and the player explicitly agrees to create the account.",
      avoid: "signup after any other Apple failure, dashboard-account login, or automatic account linking.",
      requires: "Apple Sign-In enabled for this project API key with matching Team ID, Services ID and/or Bundle ID in the dashboard, and an identity token from the app's native or browser consent flow.",
      effects: "creates a player. The server derives the name from appleFirstName/appleLastName or the token; use horizon_change_name for an override. No session without refresh opt-in.",
      returns: "201 with userId, appleUserId, isPrivateRelayEmail, isVerified and authStatus. includeRefreshToken=true also issues accessToken, refreshToken and both expiry timestamps. Otherwise call horizon_signin_apple after signup.",
      errors: "400 INVALID_APPLE_TOKEN or APPLE_NOT_CONFIGURED requires fixing the token/configuration, 409 means identity/email conflict. Do not create or link another account automatically.",
    }),
    inputSchema: {
      appleIdentityToken: appleTokenSchema,
      appleFirstName: z.string().max(50).optional().describe("Optional given name from Apple's first consent response (max 50 characters); Apple may not send it again"),
      appleLastName: z.string().max(50).optional().describe("Optional family name from Apple's first consent response (max 50 characters); Apple may not send it again"),
      includeRefreshToken: includeRefreshTokenSchema,
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ appleIdentityToken, appleFirstName, appleLastName, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try {
      return jsonResponse(await client.post("/api/v1/app/user-management/signup", {
        type: "APPLE", appleIdentityToken,
        ...(appleFirstName === undefined ? {} : { appleFirstName }),
        ...(appleLastName === undefined ? {} : { appleLastName }),
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
      }));
    } catch (error) { return authErrorResponse(error, appleIdentityToken); }
  });

  server.registerTool("horizon_signin_apple", {
    title: "Sign In with Apple",
    description: describeTool({
      summary: "Signs an existing Apple player in using the identity token obtained by the app's Apple consent flow.",
      use: "the player requests Apple signin with a token whose audience matches this project's Apple configuration.",
      avoid: "driving provider UI, dashboard-account signin, or automatically signing up after any error. Only USER_NOT_FOUND permits the explicit horizon_signup_apple flow.",
      effects: "validates the identity token and creates a player session; it does not create an account or retry.",
      returns: "user details, appleUserId, isPrivateRelayEmail, authStatus: AUTHENTICATED and accessToken. includeRefreshToken=true adds refreshToken and both expiry timestamps.",
      errors: "404 USER_NOT_FOUND permits signup with the still-valid identity JWT and first-consent name fields. 400 INVALID_APPLE_TOKEN or APPLE_NOT_CONFIGURED requires correction, not signup.",
    }),
    inputSchema: { appleIdentityToken: appleTokenSchema, includeRefreshToken: includeRefreshTokenSchema },
    annotations: ADDITIVE_WRITE,
  }, async ({ appleIdentityToken, includeRefreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try {
      return jsonResponse(await client.post("/api/v1/app/user-management/signin", {
        type: "APPLE", appleIdentityToken,
        ...(includeRefreshToken === undefined ? {} : { includeRefreshToken }),
      }));
    } catch (error) { return authErrorResponse(error, appleIdentityToken); }
  });

  server.registerTool("horizon_refresh_session", {
    title: "Rotate Player Session",
    description: describeTool({
      summary: "Rotates one opted-in player refresh token once, replacing both access and refresh credentials.",
      use: "a player opted into a long session and its client needs a new access token, with only one refresh in flight per token family.",
      avoid: "access-only sessions (use horizon_signin_*), concurrent refreshes, periodic auth polling or replay after a timeout/lost response. Read horizon://docs/auth first.",
      requires: "the latest refreshToken in platform secure storage and the same project API key as its issuing signin. Never put the token in logs, analytics, crash reports or general preferences.",
      effects: "consumes the token and invalidates its old access token. Reuse revokes the entire family. Atomically store the returned pair before any later refresh. This tool performs one request and never retries.",
      returns: "{accessToken, refreshToken, accessTokenExpiresAt, refreshTokenExpiresAt, tokenType: Bearer}; access has a one-hour sliding lifetime and the new refresh token expires 30 days after rotation.",
      errors: "REFRESH_TOKEN_INVALID/EXPIRED/REVOKED/REUSED, REFRESH_TOKEN_SCOPE_MISMATCH and REFRESH_USER_INVALID are surfaced with HTTP status. On REUSED clear local family credentials and sign in again. After an uncertain response never resubmit the old token: require fresh signin.",
    }, `${API_ERRORS} For refresh, never retry a token after an uncertain response; obtain a fresh signin instead.`),
    inputSchema: { refreshToken: z.string().min(1).max(512).describe("Latest single-use refreshToken from an explicitly opted-in signin/signup or successful rotation, never an access token (max 512 characters)") },
    annotations: DESTRUCTIVE_NON_IDEMPOTENT,
  }, async ({ refreshToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try {
      return jsonResponse(await client.post("/api/v1/app/user-management/refresh-session", { refreshToken }));
    } catch (error) {
      const result = authErrorResponse(error, refreshToken);
      result.content[0].text += "\nNo automatic retry was made. If the response was lost or uncertain, do not reuse this refresh token; sign in again. REFRESH_TOKEN_REUSED requires clearing local family credentials.";
      return result;
    }
  });

  server.registerTool("horizon_signout", {
    title: "Sign Out Player",
    description: describeTool({
      summary: "Revokes the current player session on the server, or all of that player's sessions when explicitly requested.",
      use: "the player explicitly chooses logout, or chooses to revoke all sessions on their devices.",
      avoid: "only clearing an SDK cache or logging out a developer dashboard account. Use horizon_signin_* for a future login.",
      effects: "revokes current access and refresh family, or all user sessions if allSessions=true. Clear corresponding local credentials after confirmed success; SDK SignOut alone only clears local state. It does not revoke the anonymous recovery credential.",
      returns: "empty HTTP 204 represented as null. allSessions omitted/false affects only the current session.",
      errors: "401 when the supplied access token is missing/invalid/expired. An error does not prove remote revocation; require signin if access has expired.",
    }),
    inputSchema: {
      sessionToken: sessionTokenSchema,
      allSessions: z.boolean().optional().describe("Revoke all sessions for this user only when explicitly requested; omitted/false revokes the current session only"),
    },
    annotations: DESTRUCTIVE_WRITE,
  }, async ({ sessionToken, allSessions }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try {
      return jsonResponse(await client.post("/api/v1/app/user-management/signout", { allSessions: allSessions ?? false }, sessionHeaders(sessionToken)));
    } catch (error) { return authErrorResponse(error, sessionToken); }
  });

  server.registerTool("horizon_change_name", {
    title: "Change Player Name",
    description: describeTool({
      summary: "Changes the authenticated player's display name using the matching user ID and current session.",
      use: "the player explicitly confirms a new display name.",
      avoid: "changing another player or account metadata. Use horizon_check_auth when session validity is uncertain.",
      effects: "replaces the player's current display name, with the same session validation and idle-time renewal as check-auth.",
      returns: "AuthStatusResponse with isAuthenticated, authStatus and message. Check the response status/message to confirm the change.",
      errors: "400 for a blank or over-50-character name. Invalid sessions return 200 with isAuthenticated=false and INVALID_CREDENTIALS; they do not update the name.",
    }),
    inputSchema: { userId: userIdSchema, sessionToken: sessionTokenSchema, newName: z.string().min(1).max(50).refine(value => value.trim().length > 0, "Name must not be blank").describe("New display name confirmed by the player, from 1 to 50 characters") },
    annotations: DESTRUCTIVE_WRITE,
  }, async ({ userId, sessionToken, newName }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post("/api/v1/app/user-management/change-name", { userId, sessionToken, newName })); }
    catch (error) { return authErrorResponse(error, sessionToken); }
  });

  server.registerTool("horizon_verify_email", {
    title: "Verify Player Email",
    description: describeTool({
      summary: "Verifies a player's email using the single-use token from their registration email.",
      use: "the player follows the verification email and explicitly requests completion.",
      avoid: "password reset tokens (use horizon_reset_password) or creating accounts (use horizon_signup_email).",
      effects: "consumes the verification token and marks the email verified. It does not sign in.",
      returns: "empty HTTP 200 represented as null; then use horizon_signin_email.",
      errors: "400 for an invalid or expired verification token; request a fresh verification email through the approved account support flow.",
    }),
    inputSchema: { token: emailTokenSchema },
    annotations: IDEMPOTENT_WRITE,
  }, async ({ token }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post("/api/v1/app/user-management/verify-email", { token })); }
    catch (error) { return authErrorResponse(error, token); }
  });

  server.registerTool("horizon_forgot_password", {
    title: "Request Player Password Reset",
    description: describeTool({
      summary: "Requests a password-reset email for a player without disclosing whether the email is registered.",
      use: "the player explicitly requests password recovery for this email address.",
      avoid: "account discovery, repeated email sends or resetting the password itself (use horizon_reset_password).",
      effects: "may send a reset email and replace the previous reset token. Never automatically repeat an uncertain request.",
      returns: "empty HTTP 200 represented as null regardless of whether the email exists; it does not prove delivery or account existence.",
      errors: "400 for an invalid email; common API errors are surfaced without attempting automatic retries.",
    }),
    inputSchema: { email: z.string().email().max(254).describe("Player's email address for the explicitly requested password recovery (max 254 characters)") },
    annotations: ADDITIVE_WRITE,
  }, async ({ email }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post("/api/v1/app/user-management/forgot-password", { email })); }
    catch (error) { return errorResponse(error); }
  });

  server.registerTool("horizon_reset_password", {
    title: "Reset Player Password",
    description: describeTool({
      summary: "Sets a new player password with the single-use reset token received by email and revokes existing sessions.",
      use: "the player explicitly confirms their new password after requesting horizon_forgot_password.",
      avoid: "verification tokens (use horizon_verify_email), account discovery or automatic password changes.",
      effects: "consumes the reset token, replaces the password and revokes all player sessions including refresh families. Clear corresponding local credentials and use horizon_signin_email again.",
      returns: "empty HTTP 200 represented as null; no session or password is returned.",
      errors: "400 for an invalid/expired reset token, an out-of-range password or a rejected common password. Obtain a fresh reset email only at the player's request.",
    }),
    inputSchema: { token: emailTokenSchema, newPassword: z.string().min(8).max(128).describe("New password explicitly chosen by the player, 8 to 128 characters; common passwords are rejected; never returned") },
    annotations: DESTRUCTIVE_WRITE,
  }, async ({ token, newPassword }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.post("/api/v1/app/user-management/reset-password", { token, newPassword })); }
    catch (error) { return authErrorResponse(error, token, newPassword); }
  });

  // --- Check auth ---
  server.registerTool("horizon_check_auth", {
    title: "Check Authentication",
    description: describeTool({
      summary: "Checks whether a player's session token (accessToken) is still valid for the given user.",
      use: "before a session tool when the token may have expired, or when a game resumes, to decide whether the player must sign in again.",
      avoid: "testing the API key or base URL (use horizon_test_connection) or getting a new token (use horizon_signin_email or horizon_signin_anonymous).",
      requires: "userId and the accessToken from horizon_signup_*, horizon_signin_* or horizon_refresh_session.",
      effects: "a valid check refreshes the session's one hour idle timeout; nothing else changes.",
      returns: "{userId, isAuthenticated, authStatus, message}. An invalid or expired token is not an HTTP error: isAuthenticated is false, so sign in again with horizon_signin_*.",
      errors: "400 for a malformed userId or token: pass the values from the sign-in result.",
    }),
    inputSchema: {
      userId: userIdSchema,
      sessionToken: sessionTokenSchema,
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
      return authErrorResponse(error, sessionToken);
    }
  });
}
