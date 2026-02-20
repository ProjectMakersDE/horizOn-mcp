# User Logs

## Overview

User Logs allow you to track player events, errors, and actions on the server. This is useful for debugging, analytics, and monitoring player behavior. Log entries are viewable per-user in the horizOn Dashboard.

**Important:** User Logs require **BASIC tier or higher**. The feature is not available on the FREE tier and will return a `403` error.

## Endpoints

### Create Log

**`POST /api/v1/app/user-logs/create`**

Creates a log entry for a user.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | Yes | Log message (max 1000 characters) |
| `type` | string | Yes | Log type: `INFO`, `WARN`, or `ERROR` |
| `userId` | string | Yes | The user's ID |
| `errorCode` | string | No | Error code for categorization (max 50 characters) |

**Response (200):**

```json
{
  "id": "log-abc123",
  "createdAt": "2025-01-15T10:30:00Z"
}
```

## Log Types

| Type | Use Case |
|------|----------|
| `INFO` | General events: tutorial complete, level up, purchase |
| `WARN` | Non-critical issues: low memory, retry attempt, degraded performance |
| `ERROR` | Critical issues: crash, save failure, network error |

## Code Examples

### Godot (GDScript)

```gdscript
# Create typed log entries
await Horizon.userLogs.info("Player completed tutorial")
await Horizon.userLogs.warn("Low memory detected")
await Horizon.userLogs.error("Failed to load asset", "ERR_001")

# Log game events
await Horizon.userLogs.logEvent("level_complete", "Level 5")
await Horizon.userLogs.logEvent("purchase", "item_sword_01")

# Log errors with stack trace
await Horizon.userLogs.logError("Null reference in combat system", "Line 42: combat.gd")

# Full createLog call
var result = await Horizon.userLogs.createLog(
    HorizonUserLogs.LogType.ERROR,
    "Detailed error message here",
    "SAVE_FAILED"
)
if not result.is_empty():
    print("Log ID: %s, Created: %s" % [result.id, result.createdAt])

# Listen for events
Horizon.userLogs.log_created.connect(func(id, created_at): print("Log %s created" % id))
Horizon.userLogs.log_create_failed.connect(func(error): print("Failed: %s" % error))
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;
using PM.horizOn.Cloud.Enums;

// Convenience methods
await UserLogManager.Instance.Info("Tutorial completed");
await UserLogManager.Instance.Warn("Low memory detected");
await UserLogManager.Instance.Error("Save failed", errorCode: "SAVE_001");

// Full CreateLog call
var result = await UserLogManager.Instance.CreateLog(
    LogType.ERROR,
    "Detailed error message",
    errorCode: "CRASH_002"
);
if (result != null)
{
    Debug.Log($"Log ID: {result.id}, Created: {result.createdAt}");
}
```

### REST (cURL)

```bash
curl -X POST https://horizon.pm/api/v1/app/user-logs/create \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Player completed tutorial",
    "type": "INFO",
    "userId": "user123"
  }'

# With error code
curl -X POST https://horizon.pm/api/v1/app/user-logs/create \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Failed to save game data",
    "type": "ERROR",
    "userId": "user123",
    "errorCode": "SAVE_FAILED"
  }'
```

## Best Practices

- **Log meaningful events** — Track milestones (tutorial complete, level up), not routine actions.
- **Use error codes** — Consistent error codes make it easy to filter and analyze issues in the Dashboard.
- **Truncate long messages** — Messages are limited to 1000 characters. Both SDKs auto-truncate.
- **Be aware of rate limits** — Each log creation counts toward the 10 req/min limit. Batch or throttle logging.

## Tier Requirements

| Tier | User Logs Available |
|------|-------------------|
| FREE | No (returns 403) |
| BASIC | Yes |
| PRO | Yes |
| ENTERPRISE | Yes |

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 400 | Missing required fields | Ensure `message`, `type`, and `userId` are provided |
| 401 | Invalid API key | Check `X-API-Key` header |
| 403 | FREE tier account | Upgrade to BASIC or higher |
| 429 | Rate limit exceeded | Throttle log submissions |
