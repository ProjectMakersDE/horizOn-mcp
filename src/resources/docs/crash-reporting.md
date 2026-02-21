# Crash Reporting

## Overview

Crash Reporting lets you track fatal crashes, non-fatal exceptions, and ANR (Application Not Responding) events from your game. Reports are automatically grouped by fingerprint, and the system detects regressions when a previously resolved crash reappears in a newer version.

**Workflow:**
1. Register a session at app start (`POST /session`)
2. If a crash occurs, submit a crash report (`POST /create`)
3. The backend groups reports by fingerprint and tracks affected versions
4. View and manage crash groups in the horizOn Dashboard

## Endpoints

### Create Crash Session

**`POST /api/v1/app/crash-reports/session`**

Registers a game session. Used to calculate crash-free rate. Call once at app startup.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sessionId` | string | Yes | Unique session identifier (1-100 characters) |
| `appVersion` | string | Yes | App version (e.g. "1.2.3") |
| `platform` | string | Yes | Platform (e.g. "Android", "iOS", "Windows") |
| `userId` | string | No | User ID (UUID) |

**Response (201):**

```json
{ "status": "ok" }
```

### Create Crash Report

**`POST /api/v1/app/crash-reports/create`**

Submits a crash report. The backend groups it by fingerprint.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | `CRASH`, `NON_FATAL`, or `ANR` |
| `message` | string | Yes | Error message (1-5000 characters) |
| `stackTrace` | string | No | Full stack trace (max 20000 characters) |
| `fingerprint` | string | Yes | Grouping key (1-128 characters) |
| `appVersion` | string | Yes | App version |
| `sdkVersion` | string | Yes | horizOn SDK version |
| `platform` | string | Yes | Platform |
| `os` | string | Yes | OS details (e.g. "Android 14") |
| `deviceModel` | string | Yes | Device model (e.g. "Pixel 8") |
| `deviceMemoryMb` | number | No | Device RAM in MB |
| `sessionId` | string | Yes | Session ID from session registration |
| `userId` | string | No | User ID (UUID) |
| `breadcrumbs` | array | No | Activity trail before crash (max 50 items) |
| `customKeys` | object | No | Key-value metadata (max 10 entries) |

**Breadcrumb item:**

| Field | Type | Description |
|-------|------|-------------|
| `timestamp` | string | When the event occurred |
| `type` | string | Event type: `navigation`, `http`, `user`, `error`, `warning` |
| `message` | string | Event description (max 500 characters) |

**Response (201):**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "groupId": "660e8400-e29b-41d4-a716-446655440001",
  "createdAt": "2025-01-15T10:30:00"
}
```

## Crash Types

| Type | Description |
|------|-------------|
| `CRASH` | Fatal crash — the app terminated unexpectedly |
| `NON_FATAL` | Non-fatal exception — caught but worth tracking |
| `ANR` | Application Not Responding — the app froze/hung |

## Fingerprinting

The `fingerprint` field determines how crashes are grouped. Crashes with the same fingerprint belong to the same group. Typical fingerprint strategies:

- **Stack trace hash** — Hash the top N frames of the stack trace
- **Error class + location** — Combine exception class name with file/line
- **Manual grouping** — Use a custom identifier for known crash patterns

## Auto-Regression Detection

When a crash group is marked as **RESOLVED** (with a `resolvedInVersion`), and a new crash arrives with a higher app version, the group automatically transitions to **REGRESSED** status. This helps catch bugs that were thought to be fixed.

## Code Examples

### Godot (GDScript)

```gdscript
# Register session at app start
await Horizon.crashReporting.createSession()

# Report a crash with breadcrumbs
var breadcrumbs = [
    {"timestamp": "2025-01-15T10:29:55Z", "type": "navigation", "message": "Entered level 5"},
    {"timestamp": "2025-01-15T10:29:58Z", "type": "user", "message": "Used power-up"},
    {"timestamp": "2025-01-15T10:30:00Z", "type": "error", "message": "Null reference"}
]
await Horizon.crashReporting.createCrashReport(
    HorizonCrashReporting.CrashType.CRASH,
    "NullReferenceException in CombatSystem.gd",
    stack_trace,
    "combat_null_ref_line42",
    breadcrumbs
)

# Report a non-fatal exception
await Horizon.crashReporting.createCrashReport(
    HorizonCrashReporting.CrashType.NON_FATAL,
    "Failed to load texture: res://assets/missing.png",
    "",
    "texture_load_fail"
)
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;
using PM.horizOn.Cloud.Enums;

// Register session at app start
await CrashReportingManager.Instance.CreateSession();

// Report a crash
await CrashReportingManager.Instance.CreateCrashReport(
    CrashType.CRASH,
    "NullReferenceException: Object reference not set",
    exception.StackTrace,
    "combat_null_ref",
    breadcrumbs: new List<Breadcrumb>
    {
        new("2025-01-15T10:30:00Z", "error", "Null ref in CombatSystem")
    },
    customKeys: new Dictionary<string, string>
    {
        { "scene", "Level5" },
        { "player_level", "12" }
    }
);

# Report a non-fatal exception
await CrashReportingManager.Instance.CreateCrashReport(
    CrashType.NON_FATAL,
    "Texture load failed",
    fingerprint: "texture_load_fail"
);
```

### REST (cURL)

```bash
# Register session
curl -X POST https://horizon.pm/api/v1/app/crash-reports/session \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "sess-abc123",
    "appVersion": "1.2.3",
    "platform": "Android"
  }'

# Submit crash report
curl -X POST https://horizon.pm/api/v1/app/crash-reports/create \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CRASH",
    "message": "NullReferenceException in CombatSystem",
    "stackTrace": "at CombatSystem.Update() line 42...",
    "fingerprint": "combat_null_ref_line42",
    "appVersion": "1.2.3",
    "sdkVersion": "0.5.0",
    "platform": "Android",
    "os": "Android 14",
    "deviceModel": "Pixel 8",
    "deviceMemoryMb": 8192,
    "sessionId": "sess-abc123",
    "breadcrumbs": [
      {"timestamp": "2025-01-15T10:30:00Z", "type": "error", "message": "Null ref in combat"}
    ],
    "customKeys": {"scene": "Level5", "player_level": "12"}
  }'
```

## Best Practices

- **Register sessions early** — Call `createSession` at app launch so crash-free rate is accurate.
- **Use consistent fingerprints** — Same crash should always produce the same fingerprint for proper grouping.
- **Add breadcrumbs** — They provide context for what the user did before the crash, making debugging easier.
- **Include custom keys** — Add scene name, player state, or other context that helps reproduce the issue.
- **Keep stack traces** — Always include the full stack trace when available.

## Tier Requirements

All tiers can use crash reporting, but with different limits:

| Tier | Report Limit | Retention |
|------|-------------|-----------|
| FREE | Configured per tier | Configured per tier |
| BASIC | Higher limit | Longer retention |
| PRO | Higher limit | Longer retention |
| ENTERPRISE | Highest limit | Longest retention |

Exact limits are configured via system configuration and may change.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 400 | Missing required fields | Ensure all required fields are provided |
| 401 | Invalid API key | Check `X-API-Key` header |
| 403 | Crash report limit reached | Upgrade tier or wait for retention cleanup |
| 429 | Rate limit exceeded | Throttle crash report submissions |
