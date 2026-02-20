# Authentication

## Overview

horizOn supports three authentication methods:

| Method | Type Value | Description |
|--------|-----------|-------------|
| **Anonymous** | `ANONYMOUS` | Token-based, no credentials needed. Ideal for frictionless onboarding. |
| **Email** | `EMAIL` | Traditional email/password. Supports verification and password reset. |
| **Google** | `GOOGLE` | OAuth-based. Requires Google authorization code from OAuth flow. |

## Endpoints

### Sign Up

**`POST /api/v1/app/user-management/signup`**

Creates a new user account.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `ANONYMOUS`, `EMAIL`, or `GOOGLE` |
| `username` | string | No | Display name (1-50 chars) |
| `email` | string | Email only | User's email address |
| `password` | string | Email only | Password (4-32 chars) |
| `anonymousToken` | string | Anonymous only | Unique token (max 32 chars). Auto-generated if omitted. |
| `googleAuthorizationCode` | string | Google only | OAuth authorization code |
| `googleRedirectUri` | string | No | Redirect URI used in OAuth flow |

**Response (200):**

```json
{
  "userId": "abc123",
  "username": "Player1",
  "email": "user@example.com",
  "isAnonymous": false,
  "isVerified": true,
  "anonymousToken": null,
  "createdAt": "2025-01-15T10:30:00Z"
}
```

**Error Codes:** `401` invalid API key, `409` user already exists.

---

### Sign In

**`POST /api/v1/app/user-management/signin`**

Authenticates an existing user.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `EMAIL`, `ANONYMOUS`, or `GOOGLE` |
| `email` | string | Email only | User's email |
| `password` | string | Email only | User's password |
| `anonymousToken` | string | Anonymous only | The token from signup |
| `googleAuthorizationCode` | string | Google only | OAuth code |
| `googleRedirectUri` | string | No | Redirect URI |

**Response (200):**

```json
{
  "userId": "abc123",
  "username": "Player1",
  "email": "user@example.com",
  "accessToken": "session-token-here",
  "authStatus": "AUTHENTICATED",
  "message": null
}
```

`authStatus` values: `AUTHENTICATED` (success), `FAILED`, `NOT_VERIFIED`.

**Error Codes:** `401` invalid API key, `403` user not verified, `404` user not found.

---

### Check Auth

**`POST /api/v1/app/user-management/check-auth`**

Validates whether a session token is still active.

**Request Body:**

```json
{
  "userId": "abc123",
  "sessionToken": "session-token-here"
}
```

**Response (200):**

```json
{
  "userId": "abc123",
  "isAuthenticated": true,
  "authStatus": "AUTHENTICATED",
  "message": null
}
```

---

### Change Name

**`POST /api/v1/app/user-management/change-name`**

Changes the display name of an authenticated user.

**Request Body:**

```json
{
  "userId": "abc123",
  "sessionToken": "session-token-here",
  "newName": "NewDisplayName"
}
```

**Response (200):**

```json
{
  "isAuthenticated": true,
  "authStatus": "AUTHENTICATED"
}
```

---

### Verify Email

**`POST /api/v1/app/user-management/verify-email`**

Verifies a user's email address using a token sent via email.

**Request Body:**

```json
{
  "token": "verification-token-from-email"
}
```

---

### Forgot Password

**`POST /api/v1/app/user-management/forgot-password`**

Sends a password reset email to the user.

**Request Body:**

```json
{
  "email": "user@example.com"
}
```

---

### Reset Password

**`POST /api/v1/app/user-management/reset-password`**

Resets the user's password using a reset token.

**Request Body:**

```json
{
  "token": "reset-token-from-email",
  "newPassword": "newSecurePassword"
}
```

## Code Examples

### Godot (GDScript)

```gdscript
# Anonymous sign-up
await Horizon.auth.signUpAnonymous("PlayerName")

# Email sign-up
await Horizon.auth.signUpEmail("user@example.com", "password", "Username")

# Email sign-in
await Horizon.auth.signInEmail("user@example.com", "password")

# Restore anonymous session from cached token
await Horizon.auth.restoreAnonymousSession()

# Quick anonymous sign-in (restores or creates new)
await Horizon.quickSignInAnonymous("Player1")

# Check if signed in
if Horizon.isSignedIn():
    var user = Horizon.getCurrentUser()
    print("Welcome, %s!" % user.displayName)

# Change display name
await Horizon.auth.changeName("NewName")

# Sign out (preserves anonymous token by default)
Horizon.auth.signOut()

# Listen for auth events
Horizon.auth.signin_completed.connect(func(user): print("Signed in: %s" % user.userId))
Horizon.auth.signin_failed.connect(func(error): print("Error: %s" % error))
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Anonymous sign-up
await UserManager.Instance.SignUpAnonymous("PlayerName");

// Email sign-up
await UserManager.Instance.SignUpEmail("user@example.com", "password", "DisplayName");

// Email sign-in
await UserManager.Instance.SignInEmail("user@example.com", "password");

// Restore anonymous session
await UserManager.Instance.RestoreAnonymousSession();

// Check if signed in
if (UserManager.Instance.IsSignedIn)
{
    var user = UserManager.Instance.CurrentUser;
    Debug.Log($"Welcome, {user.DisplayName}!");
}

// Change name
await UserManager.Instance.ChangeName("NewName");

// Sign out
UserManager.Instance.SignOut();
```

### REST (cURL)

```bash
# Anonymous signup
curl -X POST https://horizon.pm/api/v1/app/user-management/signup \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "ANONYMOUS", "username": "Player1"}'

# Email signin
curl -X POST https://horizon.pm/api/v1/app/user-management/signin \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "EMAIL", "email": "user@example.com", "password": "pass123"}'
```

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 401 | Invalid API key | Check `X-API-Key` header |
| 403 | User not verified | Complete email verification first |
| 404 | User not found | User may not exist, try signup |
| 409 | User already exists | Use signin instead of signup |
| 429 | Rate limit exceeded | Wait before retrying (10 req/min limit) |
