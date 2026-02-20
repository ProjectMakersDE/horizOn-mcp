# Leaderboards

## Overview

horizOn leaderboards provide global rankings for your app. Scores are submitted per user and **only update if the new score is higher** than the user's previous best. This ensures leaderboards always reflect each player's best achievement.

## Endpoints

### Submit Score

**`POST /api/v1/app/leaderboard/submit`**

Submits a score for the authenticated user. Only updates if the score is higher than the previous best.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string | Yes | The user's ID |
| `score` | number | Yes | Score value (positive integer) |

**Response (200):**

```json
{
  "success": true
}
```

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
    { "position": 1, "username": "TopPlayer", "score": 50000 },
    { "position": 2, "username": "Runner-Up", "score": 45000 },
    { "position": 3, "username": "ThirdPlace", "score": 40000 }
  ]
}
```

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
  "score": 12500
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
    { "position": 40, "username": "NearbyPlayer1", "score": 13000 },
    { "position": 41, "username": "NearbyPlayer2", "score": 12800 },
    { "position": 42, "username": "MyPlayer", "score": 12500 },
    { "position": 43, "username": "NearbyPlayer3", "score": 12200 }
  ]
}
```

## Code Examples

### Godot (GDScript)

```gdscript
# Submit a score (only updates if higher than previous best)
await Horizon.leaderboard.submitScore(1000)

# Get top 10 players
var top: Array[HorizonLeaderboardEntry] = await Horizon.leaderboard.getTop(10)
for entry in top:
    print("#%d %s: %d" % [entry.position, entry.username, entry.score])

# Get current user's rank
var myRank: HorizonLeaderboardEntry = await Horizon.leaderboard.getRank()
print("My rank: #%d (Score: %d)" % [myRank.position, myRank.score])

# Get entries around the user's position
var around: Array[HorizonLeaderboardEntry] = await Horizon.leaderboard.getAround(5)

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

// Get top 10 players
var top = await LeaderboardManager.Instance.GetTop(10);
foreach (var entry in top)
{
    Debug.Log($"#{entry.position} {entry.username}: {entry.score}");
}

// Get your rank
var rank = await LeaderboardManager.Instance.GetRank();
Debug.Log($"My rank: #{rank.position} (Score: {rank.score})");

// Get entries around user
var around = await LeaderboardManager.Instance.GetAround(5);

// Clear cache
LeaderboardManager.Instance.ClearCache();
```

### REST (cURL)

```bash
# Submit score
curl -X POST https://horizon.pm/api/v1/app/leaderboard/submit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "score": 12500}'

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
| 404 | User not found on leaderboard | User may not have submitted a score yet |
| 429 | Rate limit exceeded | Cache data and reduce API calls |
