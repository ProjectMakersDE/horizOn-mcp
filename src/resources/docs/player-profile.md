# Player Profile

## Overview

Leaderboards show a small player profile next to name and score: an **avatar**, an optional **frame** and up to **three badges** (for example "Supporter"). Every project (one API key) defines its own **cosmetics catalog** in the horizOn Dashboard. Each catalog entry is an ID with a type (`avatar`, `frame`, `badge`) and a `locked` flag:

- **Free** entries (`locked: false`) can be picked by every player.
- **Locked** entries (`locked: true`) can only be picked by players who own an **unlock**.

Unlocks are written by the server only: by redeeming a gift code whose `giftData` contains `grants`, or by the developer in the Dashboard (support cases, season rewards). There is no app endpoint that writes unlocks.

The server never stores images. IDs are references into the game's own assets: the game maps `avatar.zombie_07` to a sprite, the server only checks that the player may use it. Treat IDs you do not know as "not set".

## Rules

| Rule | Value |
|------|-------|
| Cosmetic ID | 1 to 32 characters, `^[a-z0-9][a-z0-9._-]{0,31}$` |
| Types | `avatar`, `frame`, `badge` |
| Badges shown per player | 3 (distinct, order kept) |
| Unlocks per player | 25 |
| Grants per gift code | 10 |
| Catalog entries per API key | FREE 50, BASIC 200, PRO 500, ENTERPRISE 1000 |

A type prefix such as `avatar.` is a recommended convention; the explicit `type` field is the truth.

## Endpoints

Both endpoints need `X-API-Key` **and** the player's session `Authorization: Bearer <accessToken>` from sign-in. The session must belong to `userId`.

### Get Profile

**`GET /api/v1/app/player-profile?userId={userId}`**

Returns the player's profile, unlocks and the full catalog of the API key with an `available` flag per entry, so a game builds its picker from one call.

**Response (200):**

```json
{
  "userId": "0d7e...",
  "profile": { "avatarId": "avatar.zombie_07", "frameId": null, "badges": ["badge.supporter"] },
  "unlocks": ["badge.supporter"],
  "cosmetics": [
    { "id": "avatar.zombie_07", "type": "avatar", "locked": false, "available": true },
    { "id": "badge.supporter", "type": "badge", "locked": true, "available": true },
    { "id": "frame.gold", "type": "frame", "locked": true, "available": false }
  ],
  "limits": { "maxBadges": 3, "maxUnlocks": 25 }
}
```

`cosmetics` is sorted by `id`. `available = !locked || id in unlocks`. `unlocks` may contain IDs that were deleted from the catalog.

---

### Set Profile

**`PUT /api/v1/app/player-profile`**

Replaces the **whole** visible profile. A missing, `null` or `""` slot is cleared, a missing or empty `badges` clears all badges. Pass the current values for slots you do not want to change. Returns the same body as GET.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string (UUID) | Yes | Must match the session |
| `avatarId` | string or null | No | Cosmetic of type `avatar` |
| `frameId` | string or null | No | Cosmetic of type `frame` |
| `badges` | string[] | No | 0 to 3 distinct cosmetics of type `badge` |

Checks per ID, in this order: pattern, in the catalog, matching type, free or unlocked. Badge count and duplicates are checked first.

---

### Profile in leaderboards

Every entry of leaderboard top, around and rank carries `profile` (always present):

```json
{ "position": 1, "username": "Gravedigger", "score": 15000,
  "profile": { "avatarId": "avatar.zombie_07", "frameId": "frame.gold", "badges": ["badge.supporter"] } }
```

Profile changes can take up to 10 minutes to show in leaderboards on every server node, like name changes.

---

### Unlocks from gift codes

A gift code whose `giftData` is a JSON object with a `grants` array unlocks those cosmetics on redeem:

```json
{ "giftData": "{\"gold\": 500, \"grants\": [\"badge.supporter\"]}" }
```

The redeem response gets `grantedUnlocks` (the grant IDs the player owns after the redemption, `[]` without grants). A code with grants needs the player's session; more than 25 unlocks gives 409 `UNLOCK_LIMIT_REACHED` and the code is not used up. See `horizon://docs/gift-codes`.

## Code Examples

### Godot (GDScript)

```gdscript
# Load profile, unlocks and catalog of the signed-in player
var data: Dictionary = await Horizon.playerProfile.getProfile()
for cosmetic in Horizon.playerProfile.getCosmetics("avatar"):
    print("%s available: %s" % [cosmetic["id"], cosmetic["available"]])

# Replace the whole profile ("" clears a slot, [] clears the badges)
var updated: Dictionary = await Horizon.playerProfile.setProfile("avatar.zombie_07", "", ["badge.supporter"])
if updated.is_empty():
    print("Failed: %s" % Horizon.playerProfile.getLastErrorCode())
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

var profile = await PlayerProfileManager.Instance.GetProfile();
foreach (var cosmetic in profile.GetCosmetics("badge"))
{
    Debug.Log($"{cosmetic.id} available: {cosmetic.available}");
}

// Replace the whole profile (null or "" clears a slot)
var updated = await PlayerProfileManager.Instance.SetProfile("avatar.zombie_07", null, new[] { "badge.supporter" });
if (updated == null)
{
    Debug.LogWarning($"Failed: {PlayerProfileManager.Instance.LastErrorCode}");
}
```

### Unreal (C++)

```cpp
Horizon->PlayerProfile->GetProfile(FOnPlayerProfileComplete::CreateLambda(
    [](bool bSuccess, const FHorizonPlayerProfileResult& Result, const FString& ErrorCode, const FString& ErrorMessage)
    {
        if (bSuccess && Result.IsAvailable(TEXT("frame.gold"))) { /* show it */ }
    }));

Horizon->PlayerProfile->SetProfile(TEXT("avatar.zombie_07"), TEXT(""), { TEXT("badge.supporter") },
    FOnPlayerProfileComplete::CreateLambda([](bool bSuccess, const FHorizonPlayerProfileResult& Result,
        const FString& ErrorCode, const FString& ErrorMessage) { /* ErrorCode e.g. COSMETIC_LOCKED */ }));
```

### REST (cURL)

```bash
# Get
curl "https://horizon.pm/api/v1/app/player-profile?userId=USER_ID" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_SIGNIN"

# Set (replaces the whole profile)
curl -X PUT https://horizon.pm/api/v1/app/player-profile \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_SIGNIN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID", "avatarId": "avatar.zombie_07", "frameId": null, "badges": ["badge.supporter"]}'
```

### MCP tools

`horizon_get_profile` and `horizon_set_profile` take `userId` and `sessionToken` (the `accessToken` of a `horizon_signin_*` tool). `horizon_set_profile` replaces the whole profile.

## Best Practices

- **Prefix IDs with their type** (`avatar.`, `frame.`, `badge.`); it keeps catalogs readable.
- **Keep IDs short**: they are stored on every player that selects them.
- **Build the picker from `GET /player-profile`**: it returns the catalog with `available`, no second call needed.
- **Treat unknown IDs as "not set"** and fall back to a default avatar.
- **Reload the profile after a gift code** with a non-empty `grantedUnlocks`.

## Common Errors

Errors of this feature carry a stable `code` in the JSON body. Switch on `code`, never on `message`.

| Status | Code | Cause |
|--------|------|-------|
| 400 | `INVALID_BADGES` | More than 3 badges, or a badge listed twice |
| 400 | `INVALID_COSMETIC_ID` | ID does not match the pattern |
| 400 | `COSMETIC_NOT_FOUND` | ID is not in the catalog of the API key |
| 400 | `COSMETIC_TYPE_MISMATCH` | ID exists with another type than the slot |
| 401 | `SESSION_REQUIRED` | Missing, invalid or expired session |
| 403 | `COSMETIC_LOCKED` | Locked cosmetic and the player has no unlock |
| 403 | `SESSION_FORBIDDEN` | Session of another player |
| 404 | `PLAYER_NOT_FOUND` | Player missing, deleted, inactive or of another API key |
| 409 | `UNLOCK_LIMIT_REACHED` | Gift code redeem would exceed 25 unlocks |
| 429 | (none) | Rate limit, retry after `Retry-After` seconds |

## Self-hosted simpleServer

horizOn simpleServer offers the same app endpoints, caps and error codes. It has no dashboard: the catalog is the SQL table `cosmetics`, unlocks for single players are set by SQL on `users.unlocks`, and there is no catalog size limit.
