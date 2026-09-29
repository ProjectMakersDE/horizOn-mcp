# horizOn App API Reference

## Base URL

```
https://horizon.pm
```

## Authentication

All requests require the `X-API-Key` header:

```
X-API-Key: your-api-key-here
Content-Type: application/json
```

Leaderboard submit, cloud save, gift code redeem and the player profile also need the player's session from sign-in:

```
Authorization: Bearer <accessToken>
```

## Rate Limit

Per account, per minute: **FREE 20, BASIC 120, PRO 600, ENTERPRISE 2,000** (defaults). Above the limit the API returns `429` with a `Retry-After` header. Anonymous sign-in has an extra limit of 30 requests per IP address and 5 per token per minute.

---

## User Management (Authentication)

### POST /api/v1/app/user-management/signup

Create a new user account.

**Request:**
```json
{
  "type": "ANONYMOUS | EMAIL | GOOGLE",
  "username": "string (optional, 1-50 chars)",
  "email": "string (required for EMAIL)",
  "password": "string (required for EMAIL, 4-32 chars)",
  "anonymousToken": "string (required for ANONYMOUS, max 32 chars)",
  "googleAuthorizationCode": "string (required for GOOGLE)",
  "googleRedirectUri": "string (optional)"
}
```

**Response (200):**
```json
{
  "userId": "string",
  "username": "string",
  "email": "string | null",
  "isAnonymous": "boolean",
  "isVerified": "boolean",
  "anonymousToken": "string | null",
  "createdAt": "ISO 8601 datetime"
}
```

**Status Codes:** `200` success, `401` invalid API key, `409` user already exists.

---

### POST /api/v1/app/user-management/signin

Authenticate an existing user.

**Request:**
```json
{
  "type": "EMAIL | ANONYMOUS | GOOGLE",
  "email": "string (EMAIL only)",
  "password": "string (EMAIL only)",
  "anonymousToken": "string (ANONYMOUS only)",
  "googleAuthorizationCode": "string (GOOGLE only)",
  "googleRedirectUri": "string (optional)"
}
```

**Response (200):**
```json
{
  "userId": "string | null",
  "username": "string | null",
  "email": "string | null",
  "accessToken": "string | null",
  "authStatus": "AUTHENTICATED | FAILED | NOT_VERIFIED",
  "message": "string | null"
}
```

**Status Codes:** `200` success, `401` invalid API key, `403` not verified, `404` user not found.

---

### POST /api/v1/app/user-management/check-auth

Validate a session token.

**Request:**
```json
{
  "userId": "string",
  "sessionToken": "string"
}
```

**Response (200):**
```json
{
  "userId": "string | null",
  "isAuthenticated": "boolean",
  "authStatus": "AUTHENTICATED | FAILED",
  "message": "string | null"
}
```

---

### POST /api/v1/app/user-management/change-name

Change a user's display name.

**Request:**
```json
{
  "userId": "string",
  "sessionToken": "string",
  "newName": "string (1-50 chars)"
}
```

**Response (200):**
```json
{
  "isAuthenticated": "boolean",
  "authStatus": "string"
}
```

---

### POST /api/v1/app/user-management/verify-email

Verify a user's email with a verification token.

**Request:**
```json
{
  "token": "string"
}
```

**Response (200):** Success message.

**Status Codes:** `200` success, `400` invalid token.

---

### POST /api/v1/app/user-management/forgot-password

Request a password reset email.

**Request:**
```json
{
  "email": "string"
}
```

**Response (200):** Success message (always succeeds to prevent email enumeration).

---

### POST /api/v1/app/user-management/reset-password

Reset password with a reset token.

**Request:**
```json
{
  "token": "string",
  "newPassword": "string (4-128 chars)"
}
```

**Response (200):** Success message.

**Status Codes:** `200` success, `400` invalid token or password.

---

## Leaderboard

### GET /api/v1/app/leaderboards

List the leaderboard boards configured for the app API key.

**Response (200):**
```json
{
  "boards": [
    {
      "key": "weekly",
      "name": "Weekly",
      "sortOrder": "DESC",
      "isActive": true,
      "scoreCount": 10
    }
  ],
  "totalElements": 1
}
```

Use the returned `key` with the V2 board endpoints:

- `POST /api/v1/app/leaderboards/{boardKey}/submit`
- `GET /api/v1/app/leaderboards/{boardKey}/top?userId={userId}&limit={limit}`
- `GET /api/v1/app/leaderboards/{boardKey}/rank?userId={userId}`
- `GET /api/v1/app/leaderboards/{boardKey}/around?userId={userId}&range={range}`

Omit `boardKey` and use the legacy singular endpoints below for the default board.

---

### POST /api/v1/app/leaderboard/submit

Submit a score. Only the player's best score is kept (higher wins on DESC boards, lower on ASC boards). Requires `Authorization: Bearer <accessToken>` of the same user.

**Request:**
```json
{
  "userId": "string",
  "score": "number (positive integer)",
  "leaderboardKey": "string (optional)"
}
```

**Response (200):** empty body. `401` without a valid session, `403` when the session belongs to another user.

---

### GET /api/v1/app/leaderboard/top?userId={userId}&limit={limit}

Get top leaderboard entries.

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `userId` | string | Yes | - |
| `limit` | number | No | 10 (max 100) |

**Response (200):**
```json
{
  "entries": [
    {
      "position": 1,
      "username": "string",
      "score": "number",
      "profile": { "avatarId": "string | null", "frameId": "string | null", "badges": ["string"] }
    }
  ]
}
```

---

### GET /api/v1/app/leaderboard/rank?userId={userId}

Get a user's rank.

| Param | Type | Required |
|-------|------|----------|
| `userId` | string | Yes |

**Response (200):**
```json
{
  "position": "number",
  "username": "string",
  "score": "number",
  "profile": { "avatarId": "string | null", "frameId": "string | null", "badges": ["string"] }
}
```

---

### GET /api/v1/app/leaderboard/around?userId={userId}&range={range}

Get entries around a user's rank.

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `userId` | string | Yes | - |
| `range` | number | No | 10 |

**Response (200):**
```json
{
  "entries": [
    {
      "position": "number",
      "username": "string",
      "score": "number",
      "profile": { "avatarId": "string | null", "frameId": "string | null", "badges": ["string"] }
    }
  ]
}
```

`profile` is present in every entry of top, rank and around (player avatar, frame and badges, see Player Profile below).

---

## Cloud Save

### POST /api/v1/app/cloud-save/save

Save data to the cloud (JSON mode). Replaces the previous save. Requires `Authorization: Bearer <accessToken>` of the same user.

**Request:**
```json
{
  "userId": "string",
  "saveData": "string (JSON)"
}
```

**Response (200):**
```json
{
  "success": true,
  "dataSizeBytes": "number"
}
```

**Binary mode:** `POST /api/v1/app/cloud-save/save?userId={userId}` with `Content-Type: application/octet-stream`.

**Status Codes:** `200` success, `403` exceeds tier size limit.

**Tier limits (defaults):** FREE=1KB, BASIC=5KB, PRO=20KB, ENTERPRISE=250KB.

---

### POST /api/v1/app/cloud-save/load

Load data from the cloud (JSON mode). Requires `Authorization: Bearer <accessToken>` of the same user.

**Request:**
```json
{
  "userId": "string"
}
```

**Response (200):**
```json
{
  "found": "boolean",
  "saveData": "string | null"
}
```

**Binary mode:** `GET /api/v1/app/cloud-save/load?userId={userId}` with `Accept: application/octet-stream`.

---

## Remote Config

### GET /api/v1/app/remote-config/{configKey}

Get a single configuration value.

| Param | Type | Required |
|-------|------|----------|
| `configKey` | string (path) | Yes |

**Response (200):**
```json
{
  "configKey": "string",
  "configValue": "string | null",
  "found": "boolean"
}
```

---

### GET /api/v1/app/remote-config/all

Get all configuration values.

**Response (200):**
```json
{
  "configs": { "key": "value" },
  "total": "number"
}
```

---

## News

### GET /api/v1/app/news?limit={limit}&languageCode={languageCode}

Get news entries.

| Param | Type | Required | Default |
|-------|------|----------|---------|
| `limit` | number | No | 20 (max 100) |
| `languageCode` | string | No | all languages |

**Response (200):**
```json
[
  {
    "id": "string",
    "title": "string",
    "message": "string",
    "releaseDate": "ISO 8601 datetime",
    "languageCode": "string"
  }
]
```

---

## Gift Codes

### POST /api/v1/app/gift-codes/validate

Validate a gift code without redeeming it.

**Request:**
```json
{
  "code": "string",
  "userId": "string"
}
```

**Response (200):**
```json
{
  "valid": "boolean"
}
```

---

### POST /api/v1/app/gift-codes/redeem

Redeem a gift code. Needs `Authorization: Bearer <accessToken>`; `userId` must be the session user.
Requests without any session are only accepted during a transition window for older SDKs (until 1 March 2027 by default) and carry `Deprecation` and `Sunset` headers.

**Request:**
```json
{
  "code": "string",
  "userId": "string"
}
```

**Response (200):**
```json
{
  "success": "boolean",
  "message": "string",
  "giftData": "string (JSON) | null",
  "grantedUnlocks": ["string"]
}
```

`grantedUnlocks`: cosmetic IDs from `giftData.grants` the player owns after the redemption, `[]` without grants. A code with grants always needs the session.

**Status Codes:** `200` success, `400` expired, revoked or redemption limit reached, `401` invalid or expired session (or no session for a code with grants), `403` code or user of another API key or session of another user, `404` unknown code, `409` `UNLOCK_LIMIT_REACHED` (more than 25 unlocks, code not used up).

---

## Player Profile

Both endpoints need `Authorization: Bearer <accessToken>` of `userId`. Errors carry a `code`: `INVALID_BADGES`, `INVALID_COSMETIC_ID`, `COSMETIC_NOT_FOUND`, `COSMETIC_TYPE_MISMATCH` (400), `SESSION_REQUIRED` (401), `COSMETIC_LOCKED`, `SESSION_FORBIDDEN` (403), `PLAYER_NOT_FOUND` (404).

### GET /api/v1/app/player-profile?userId={userId}

Profile, unlocks and the cosmetics catalog of the API key with `available` per entry.

**Response (200):**
```json
{
  "userId": "string",
  "profile": { "avatarId": "string | null", "frameId": "string | null", "badges": ["string"] },
  "unlocks": ["string"],
  "cosmetics": [
    { "id": "string", "type": "avatar | frame | badge", "locked": "boolean", "available": "boolean" }
  ],
  "limits": { "maxBadges": 3, "maxUnlocks": 25 }
}
```

---

### PUT /api/v1/app/player-profile

Replaces the whole visible profile (a missing, `null` or `""` slot is cleared, missing or `[]` badges clears them). Returns the GET body.

**Request:**
```json
{
  "userId": "string",
  "avatarId": "string | null",
  "frameId": "string | null",
  "badges": ["string (0 to 3, distinct)"]
}
```

---

## User Feedback

### POST /api/v1/app/user-feedback/submit

Submit user feedback.

**Request:**
```json
{
  "title": "string (1-100 chars)",
  "message": "string (1-2048 chars)",
  "userId": "string",
  "email": "string (optional)",
  "category": "BUG | FEATURE | GENERAL (optional)",
  "deviceInfo": "string (optional, max 500 chars)"
}
```

**Response (200):**
```
"ok"
```

---

## User Logs

### POST /api/v1/app/user-logs/create

Create a user log entry. **Requires BASIC tier or higher.**

**Request:**
```json
{
  "message": "string (max 1000 chars)",
  "type": "INFO | WARN | ERROR",
  "userId": "string",
  "errorCode": "string (optional, max 50 chars)"
}
```

**Response (200):**
```json
{
  "id": "string",
  "createdAt": "ISO 8601 datetime"
}
```

**Status Codes:** `200` success, `403` FREE tier (not available).

---

## Common Status Codes (All Endpoints)

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request (missing/invalid parameters) |
| 401 | Unauthorized (invalid API key) |
| 403 | Forbidden (tier restriction or not verified) |
| 404 | Not Found |
| 409 | Conflict (duplicate) |
| 429 | Too Many Requests (rate limited) |
| 500 | Internal Server Error |
