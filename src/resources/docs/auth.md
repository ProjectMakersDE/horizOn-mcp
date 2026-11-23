# Authentication

App-player authentication uses `X-API-Key: YOUR_PROJECT_API_KEY` on every
`/api/v1/app/user-management/*` request. It is separate from the developer's
dashboard account and `/api/v1/public/auth/*` flows. MCP gets this key from
`HORIZON_API_KEY`; it never launches provider consent screens or stores a player's
credentials for the game.

| Method | `type` | Credential |
|--------|--------|------------|
| Anonymous | `ANONYMOUS` | Server-issued recovery token, no email/password |
| Email | `EMAIL` | Email/password, with email verification and password reset |
| Google | `GOOGLE` | Fresh authorization code and the exact OAuth redirect URI |
| Apple | `APPLE` | Apple identity-token JWT with a configured project audience |

Create accounts, send emails, change names/passwords and revoke sessions only
after the player's corresponding choice. Do not create replacement guest accounts
or run live signup/signin as an automatic integration test. Provider tokens and
passwords belong in the app's approved credential flow. MCP auth responses contain
credentials, so do not copy them into source, chat summaries, logs, analytics or
crash reports. Use fixtures for implementation tests.

## Signup and signin

`POST /signup` creates a player and returns **201**, not 200.
`POST /signin` authenticates an existing player and returns **200**.
Paths below are relative to `/api/v1/app/user-management`.

| Request field | Signup | Signin | Constraint |
|---------------|--------|--------|------------|
| `type` | Required | Required | `ANONYMOUS`, `EMAIL`, `GOOGLE`, `APPLE` |
| `username` | Display name for anonymous/email | Omit | Max 30 characters at signup |
| `email` | Required for email | Required for email | Valid address, max 40 characters |
| `password` | Required for email | Required for email | Signup 8-128 characters, common passwords rejected; signin max 128 |
| `anonymousToken` | **Omit** | Required for anonymous | Server-issued, exactly 32 Base64URL characters (`A-Z`, `a-z`, `0-9`, `_`, `-`) |
| `googleAuthorizationCode` | Required for Google | Required for Google | Fresh single-use authorization code, max 2000 characters |
| `googleRedirectUri` | Required for Google | Required for Google | Exact original redirect URI, max 500; empty string for configured native flows |
| `appleIdentityToken` | Required for Apple | Required for Apple | Identity JWT, max 4096 characters |
| `appleFirstName`, `appleLastName` | Optional Apple first-consent profile | Omit | Max 50 characters each |
| `preferredLanguage` | Optional email-link language | Omit | Max 35 characters; otherwise `Accept-Language` |
| `includeRefreshToken` | Optional explicit opt-in | Optional explicit opt-in | Default `false`; see long sessions below |
| `signInIfExists` | Optional, **Google only** | Omit | Default `false`; one-click Google signup/signin |

Signup returns `userId`, `username`, `isAnonymous`, `isVerified`, `authStatus`,
`createdAt` and provider-specific fields. Successful signin returns `userId`,
`username`, `accessToken`, `authStatus: "AUTHENTICATED"` and provider-specific
fields. Pass the returned `accessToken` as `sessionToken` to MCP session tools.
An authenticated status on signup alone does not imply an access token exists.

### Anonymous

Call `horizon_signup_anonymous({displayName})` only when the player chooses a new
guest account. Never generate or send an anonymous signup token. A supplied
`anonymousToken` is rejected with 400. Store the server's returned recovery token
in Keychain, Keystore or an equivalent platform secret store. It is the credential
for `horizon_signin_anonymous`, including on later launches. Signup without
refresh opt-in returns no access token, so signin is needed before session tools.
With `includeRefreshToken: true`, signup returns the access/refresh pair directly.

An unknown guest token returns 404 `USER_NOT_FOUND`. Confirm the original stored
credential and explain recovery options before offering a new account. Creating
another account cannot recover the old progress.

### Email

1. `horizon_signup_email({email, password, displayName})` creates an unverified user
   and sends the verification email. It returns 201 with
   `authStatus: "USER_NOT_VERIFIED"` and no session, even with refresh opt-in.
2. `horizon_verify_email({token})` consumes the player's email token. Success is
   an empty HTTP 200, represented by MCP as `null`.
3. `horizon_signin_email({email, password, includeRefreshToken?})` obtains a session
   after verification. Wrong credentials return 401 `INVALID_CREDENTIALS`;
   unverified users return 403 `USER_NOT_VERIFIED`.

### Google: exchange each code once

The player's app completes Google OAuth consent and obtains an **authorization
code**, not a Google identity token for the dashboard endpoint. The server's
Google OAuth client and the redirect URI must match that flow. Do not put the
server's Google client secret into the game or MCP arguments.

For a one-click flow, call `horizon_signup_google` with
`{googleAuthorizationCode, googleRedirectUri, signInIfExists: true}`. The server
exchanges the code once, then creates a player or signs in the existing Google
identity. Both cases return 201 with an access token. Refresh opt-in adds the
refresh pair and expiry fields. Omitted/false `signInIfExists` is strict signup:
an existing identity returns 409. A conflicting email owned by another auth
method is also 409 and does not link accounts.

`horizon_signin_google` is available for an already known Google player. A 404
does not make its code reusable for signup. Never probe signin then signup with
the same code, and never automatically retry a timeout or lost exchange response.
Obtain a fresh authorization code for a new attempt.

### Apple: project configuration and explicit fallback

Enable Apple Sign-In for this project's API key in the dashboard, with the
matching Apple Team ID, Services ID for browser flows and/or Bundle ID for native
flows. The JWT audience must match a configured Services ID or Bundle ID. The
app obtains the identity token through Apple's native consent UI or an implemented
browser callback. MCP does not configure Apple, open its UI or harvest redirects.

Call `horizon_signin_apple({appleIdentityToken, includeRefreshToken?})`. Only a
404 with `authStatus: "USER_NOT_FOUND"` permits the player-approved signup
fallback using `horizon_signup_apple` with the still-valid JWT and the optional
`appleFirstName`/`appleLastName` from first consent. Apple may provide those names
only once. The server uses those names, or email/subject as fallback; use
`horizon_change_name` afterwards for a chosen display name.

Apple signup without refresh opt-in returns no session, so signin afterwards.
With opt-in it returns the session pair. `INVALID_APPLE_TOKEN` or
`APPLE_NOT_CONFIGURED` (400) requires correction, never a signup fallback. An
identity or email conflict (409, including `APPLE_EMAIL_CONFLICT` where returned)
does not authorize account linking. `appleUserId` and `isPrivateRelayEmail` are
provider response fields. A relay email must not be treated as the player's
ordinary email for account matching.

## Long sessions: opt-in, secure storage, serial rotation

Existing requests omit `includeRefreshToken` and keep their access-only contract.
Access sessions have a **one-hour sliding lifetime**. Use a long session only
when the player/product explicitly chooses it and platform secure storage is
implemented. All four signin types accept `includeRefreshToken: true`.
Immediately authenticated anonymous/Apple signup accepts it too. Google signup
already issues access without opt-in. Unverified email signup never issues tokens.

Opted-in auth responses add `refreshToken`, `accessTokenExpiresAt` and
`refreshTokenExpiresAt`. Retain the machine-readable ISO-8601 expiry fields from
the server. The fields are omitted from legacy access-only responses.

Call `horizon_refresh_session({refreshToken})`, equivalent to
`POST /refresh-session` with **only** `{refreshToken}` and the original project
API key. No access token or user ID is required. It returns:

```json
{
  "accessToken": "NEW_ACCESS_TOKEN",
  "refreshToken": "NEW_REFRESH_TOKEN",
  "accessTokenExpiresAt": "ISO_8601_EXPIRY",
  "refreshTokenExpiresAt": "ISO_8601_EXPIRY",
  "tokenType": "Bearer"
}
```

Refresh tokens are **single-use**. Each rotation invalidates the prior access
token, replaces both tokens atomically and gives the new refresh token 30 days
from rotation. Serialize refresh across all callers/tabs for a session family.
Atomically replace the pair in platform secure storage before allowing another
rotation. Never store refresh or anonymous recovery tokens in PlayerPrefs,
general preferences, plaintext files, logs, analytics or crash reports.

Never automatically retry refresh. If a response is lost or times out, the old
token may already be consumed: require fresh signin instead of replaying it.
Reusing a consumed token returns `REFRESH_TOKEN_REUSED` and revokes the **whole
family**, including its successor. Clear that family's local credentials and
require signin. Other stable failures are `REFRESH_TOKEN_INVALID`,
`REFRESH_TOKEN_EXPIRED`, `REFRESH_TOKEN_REVOKED`, `REFRESH_TOKEN_SCOPE_MISMATCH`
and `REFRESH_USER_INVALID`. Fix scope/user problems and use fresh signin rather
than looping refresh attempts.

## Session checks, logout and recovery

| MCP tool | Endpoint and wire request | Success / effect |
|----------|---------------------------|------------------|
| `horizon_check_auth` | `POST /check-auth` `{userId, sessionToken}` | 200 `{userId?, isAuthenticated, authStatus, message?}`; valid checks renew access idle time |
| `horizon_signout` | `POST /signout`, **Bearer accessToken**, `{allSessions: false}` | Empty **204** (`null`); revokes current access/refresh family; explicit `true` revokes all user sessions |
| `horizon_change_name` | `POST /change-name` `{userId, sessionToken, newName}` | 200 AuthStatusResponse; new name 1-50 characters |
| `horizon_link_email` / `horizon_link_google` / `horizon_link_apple` | `POST /link` `{userId, sessionToken, type, ...credentials}` | 200 with `isAnonymous: false` and the same userId; EMAIL answers USER_NOT_VERIFIED, GOOGLE and APPLE AUTHENTICATED; the guest anonymous token is deleted; 409 when taken or not a guest |
| `horizon_verify_email` | `POST /verify-email` `{token}` | Empty 200 (`null`); consumes verification token |
| `horizon_forgot_password` | `POST /forgot-password` `{email}` | Empty 200 (`null`) even for unknown emails; may send reset email, never proves delivery/existence |
| `horizon_reset_password` | `POST /reset-password` `{token, newPassword}` | Empty 200 (`null`); single-use reset, password 8-128 characters, revokes all sessions/refresh families |

`check-auth` and `change-name` can return HTTP 200 with
`isAuthenticated: false`, for example `INVALID_CREDENTIALS`, `USER_NOT_FOUND`,
`USER_DEACTIVATED` or `USER_DELETED`. Inspect those fields. The complete auth enum
also includes `AUTHENTICATED`, `USER_ALREADY_EXISTS`, `USER_NOT_VERIFIED`,
`TOKEN_EXPIRED`, `INVALID_TOKEN`, `INVALID_APPLE_TOKEN`, `APPLE_EMAIL_CONFLICT`
and `APPLE_NOT_CONFIGURED`. `FAILED` and `NOT_VERIFIED` are not server auth values.

Call server signout before clearing the local session. SDK-local `SignOut()`
alone does not revoke server tokens. On confirmed signout/reset clear corresponding
local credentials. Signout does not revoke the guest recovery token; retaining
that credential permits a later guest signin. A 401 on expired access does not
prove the server revoked a still-live refresh family. Password reset, user
deactivation and deletion revoke session families too.

## Engine integration coverage

The checked engine SDK auth APIs provide anonymous/email/Google/Apple calls,
session checks, name change, verification and password recovery:

| Engine | Auth entry point | Apple convenience helper | Local logout |
|--------|------------------|--------------------------|--------------|
| Unity | `UserManager.Instance` | `SignInWithApple()` | `SignOut(keepAnonymousToken)` |
| Godot | `Horizon.auth` | `sign_in_with_apple(services_id, redirect_uri)` | `signOut(keep_anonymous_token)` |
| Unreal | `Horizon->Auth` | `SignInWithApple(Callback)` | `SignOut()` |

Their checked source does **not** implement refresh-session rotation, secure
refresh storage, server signout or Google's `signInIfExists` option. Do not invent
SDK methods or treat existing cache helpers as secure refresh storage. Use an
explicit REST adapter for these contracts until the installed SDK provides them.
On non-iOS Apple flows, callback/token harvesting still needs app integration.
Godot's checked convenience helper attempts signup after any signin failure, so
implement the `USER_NOT_FOUND` condition explicitly instead. Check the installed
SDK source/version before choosing a convenience flow.

Direct MCP tools cover all four signup/signin types and the remaining auth
operations above, including refresh. Provider consent UI, OAuth redirects, secure device storage and
cross-tab serialization stay in the application. MCP makes one request per call,
without provider fallback, retries, credential persistence or account linking.

## Errors and limits

All paths require the project API key. Validation errors are 400; incorrect key
or credentials can be 401; unavailable/unverified users can be 403; missing users
404; conflicts 409. Verification/reset tokens are max 256 characters; refresh
tokens max 512; session tokens max 256. Password-recovery email accepts max 254
characters, while signup/signin email is limited to 40.

429 requires honoring `Retry-After` and the relevant tool's retry rules. Guest
signin has additional configurable project/IP and project/token limits, alongside
the shared account limit. Defaults are 30/IP and 5/token per 60 seconds; operators
can change them. Do not hard-code those defaults as a client contract. An uncertain
signup, OAuth exchange, email send or refresh must not be automatically retried.

Contract checked against Live App OpenAPI and Server 1.78.1 auth source on
2026-11-17. The generated OpenAPI currently advertises signout as 200, while the
released controller returns 204. SDK observations describe the checked source,
not a claim that every installed SDK release has the same behavior.
