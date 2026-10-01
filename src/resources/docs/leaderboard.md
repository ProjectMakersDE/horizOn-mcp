# Leaderboards

## Overview

horizOn leaderboards provide global rankings for your app. Scores are submitted per user and **only update if the new score is higher** than the user's previous best. This ensures leaderboards always reflect each player's best achievement.

## Endpoints

The legacy singular endpoints target the default board. For multiple boards, first list available boards and pass the returned board `key` to the V2 endpoints.

### List Boards

**`GET /api/v1/app/leaderboards`**

Returns the leaderboard boards configured for the app API key.

**Response (200):**

```json
{
  "boards": [
    {
      "key": "weekly",
      "name": "Weekly",
      "sortOrder": "DESC",
      "isActive": true,
      "scoreCount": 10,
      "validatedOnly": false
    }
  ],
  "totalElements": 1
}
```

`validatedOnly: true` marks a board that only accepts server-checked runs (see [Validated only boards](#validated-only-boards)).

### Multi-Board Endpoints

Use these endpoints with a board key from `GET /api/v1/app/leaderboards`:

| Operation | Endpoint |
|-----------|----------|
| Submit score | `POST /api/v1/app/leaderboards/{boardKey}/submit` |
| Top entries | `GET /api/v1/app/leaderboards/{boardKey}/top?userId={userId}&limit={limit}` |
| User rank | `GET /api/v1/app/leaderboards/{boardKey}/rank?userId={userId}` |
| Around user | `GET /api/v1/app/leaderboards/{boardKey}/around?userId={userId}&range={range}` |

### Submit Score

**`POST /api/v1/app/leaderboard/submit`**

Submits a score for the authenticated user. Only updates if the score is higher than the previous best.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | The user's ID |
| `score` | number | Yes | Score value (positive integer) |
| `leaderboardKey` | string | No | Optional named board key for V2 calls |

**Headers:** `X-API-Key` and `Authorization: Bearer <accessToken>` of the signed-in player.

A score has no `metadata` field; the server ignores unknown fields. Per-player display data (avatar, frame, badges) lives in the player profile instead.

**Response (200):**

```json
{
  "success": true
}
```

On a board with `validatedOnly: true` this call answers `403` with `"code": "VALIDATED_SUBMIT_REQUIRED"` and writes nothing. Do not retry; submit through Validated Actions instead.

A player a moderator banned from the board gets `403` with `"code": "PLAYER_BANNED"` (from this submit and from the validated submit). Rows hidden by a ban or a shadow ban stay visible to their own player only: top, around and rank skip them for everyone else and count only the rows the caller sees.

### Validated only boards

A board can be switched to **validated only** in the Dashboard. It then accepts scores only from a server-checked run: the game starts a run (`POST /api/v1/app/validated-actions/runs`, single-use ticket with a server seed), plays, and submits score plus the SHA-256 of its input log (`POST /api/v1/app/validated-actions/submit`). The server checks its rules (score limits, minimum duration, score per second, stage rules) before it writes. The normal submit answers `403 VALIDATED_SUBMIT_REQUIRED`. Details: `horizon://docs/validated-actions`. MCP tools: `horizon_start_run`, `horizon_submit_validated`.

---

### Get Top Entries

**`GET /api/v1/app/leaderboard/top?userId={userId}&limit={limit}`**

Returns the top entries on the leaderboard.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | The requesting user's ID |
| `limit` | number | No | Number of entries (default 10, max 100) |

**Response (200):**

```json
{
  "entries": [
    {
      "position": 1,
      "username": "TopPlayer",
      "score": 50000,
      "profile": { "avatarId": "avatar.zombie_07", "frameId": "frame.gold", "badges": ["badge.supporter"] }
    },
    {
      "position": 2,
      "username": "Runner-Up",
      "score": 45000,
      "profile": { "avatarId": null, "frameId": null, "badges": [] }
    }
  ]
}
```

Every entry carries `profile` (always present): the player's avatar, frame and up to three badges, as cosmetic IDs from the project's catalog (`null` or `[]` when not set). Treat IDs your game does not know as "not set". See `horizon://docs/player-profile`.

---

### Get User Rank

**`GET /api/v1/app/leaderboard/rank?userId={userId}`**

Returns the current user's position on the leaderboard.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | The user's ID |

**Response (200):**

```json
{
  "position": 42,
  "username": "MyPlayer",
  "score": 12500,
  "profile": { "avatarId": "avatar.zombie_07", "frameId": null, "badges": [] }
}
```

---

### Get Entries Around User

**`GET /api/v1/app/leaderboard/around?userId={userId}&range={range}`**

Returns entries around the user's position (players ranked near them).

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | The user's ID |
| `range` | number | No | Number of entries before and after (default 10) |

**Response (200):**

```json
{
  "entries": [
    { "position": 41, "username": "NearbyPlayer", "score": 12800, "profile": { "avatarId": null, "frameId": null, "badges": [] } },
    { "position": 42, "username": "MyPlayer", "score": 12500, "profile": { "avatarId": "avatar.zombie_07", "frameId": null, "badges": [] } },
    { "position": 43, "username": "NearbyPlayer2", "score": 12200, "profile": { "avatarId": null, "frameId": null, "badges": [] } }
  ]
}
```

## Code Examples

### Godot (GDScript)

```gdscript
# Submit a score (only updates if higher than previous best)
await Horizon.leaderboard.submitScore(1000)

# Submit to a named board
await Horizon.leaderboard.submitScore(1000, "weekly")

# Get top 10 players
var top: Array[HorizonLeaderboardEntry] = await Horizon.leaderboard.getTop(10)
for entry in top:
    print("#%d %s: %d" % [entry.position, entry.username, entry.score])
    # entry.profile.avatarId, entry.profile.frameId, entry.profile.badges ("" / [] when not set)

# Get current user's rank
var myRank: HorizonLeaderboardEntry = await Horizon.leaderboard.getRank()
print("My rank: #%d (Score: %d)" % [myRank.position, myRank.score])

# Get entries around the user's position
var around: Array[HorizonLeaderboardEntry] = await Horizon.leaderboard.getAround(5)

# List boards
var boards: Array[Dictionary] = await Horizon.leaderboard.listBoards()

# Use caching (enabled by default)
var cached_top = await Horizon.leaderboard.getTop(10, true)  # uses cache
var fresh_top = await Horizon.leaderboard.getTop(10, false)  # forces refresh

# Clear cache manually
Horizon.leaderboard.clearCache()

# Listen for events
Horizon.leaderboard.score_submitted.connect(func(score): print("Submitted: %d" % score))
Horizon.leaderboard.top_entries_loaded.connect(func(entries): print("Loaded %d entries" % entries.size()))
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Submit score
await LeaderboardManager.Instance.SubmitScore(12500);

// Submit to a named board
await LeaderboardManager.Instance.SubmitScore(12500, boardKey: "weekly");

// Get top 10 players
var top = await LeaderboardManager.Instance.GetTop(10);
foreach (var entry in top)
{
    Debug.Log($"#{entry.position} {entry.username}: {entry.score}");
    // entry.profile.avatarId, entry.profile.frameId, entry.profile.badges (check entry.profile.HasAvatar)
}

// Get your rank
var rank = await LeaderboardManager.Instance.GetRank();
Debug.Log($"My rank: #{rank.position} (Score: {rank.score})");

// Get entries around user
var around = await LeaderboardManager.Instance.GetAround(5);

// List boards
var boards = await LeaderboardManager.Instance.ListBoards();

// Clear cache
LeaderboardManager.Instance.ClearCache();
```

### REST (cURL)

```bash
# Submit score
curl -X POST https://horizon.pm/api/v1/app/leaderboard/submit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_SIGNIN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "score": 12500}'

# Submit to a named board
curl -X POST https://horizon.pm/api/v1/app/leaderboards/weekly/submit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_SIGNIN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "score": 12500, "leaderboardKey": "weekly"}'

# Get top 10
curl "https://horizon.pm/api/v1/app/leaderboard/top?userId=user123&limit=10" \
  -H "X-API-Key: YOUR_API_KEY"

# Get rank
curl "https://horizon.pm/api/v1/app/leaderboard/rank?userId=user123" \
  -H "X-API-Key: YOUR_API_KEY"

# Get around
curl "https://horizon.pm/api/v1/app/leaderboard/around?userId=user123&range=5" \
  -H "X-API-Key: YOUR_API_KEY"
```

## Best Practices

- **Only submit on new high score** — The server already enforces "highest wins," but avoiding unnecessary requests saves your rate limit quota.
- **Cache leaderboard data** — Both SDKs cache by default. Use cached data for display and refresh periodically.
- **Limit query size** — Request only as many entries as you display (e.g., top 10, not top 100).

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 401 | Invalid API key | Check `X-API-Key` header |
| 403 | `VALIDATED_SUBMIT_REQUIRED` | The board is validated only: use Validated Actions (`horizon://docs/validated-actions`) |
| 403 | `PLAYER_BANNED` | A moderator banned the player from this board; do not retry |
| 404 | User not found on leaderboard | User may not have submitted a score yet |
| 429 | Rate limit exceeded | Cache data and reduce API calls |
