# User Feedback

## Overview

The User Feedback feature lets players submit bug reports, feature requests, and general feedback directly from your app. All submissions are visible in the horizOn Dashboard. Optional device information can be attached to help with debugging.

## Endpoints

### Submit Feedback

**`POST /api/v1/app/user-feedback/submit`**

Submits a feedback entry.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `title` | string | Yes | Feedback title (1-100 characters) |
| `message` | string | Yes | Feedback message (1-2048 characters) |
| `userId` | string | Yes | The user's ID |
| `email` | string | No | Contact email for follow-up |
| `category` | string | No | Category: `BUG`, `FEATURE`, or `GENERAL` |
| `deviceInfo` | string | No | Device information (max 500 characters) |

**Response (200):**

```
"ok"
```

## Code Examples

### Godot (GDScript)

```gdscript
# Submit general feedback
await Horizon.feedback.submit("Great Game!", "I love the new features.", "GENERAL")

# Submit bug report with auto device info
await Horizon.feedback.submitBugReport("Crash on Level 5", "Game crashes when opening inventory")

# Submit feature request
await Horizon.feedback.submitFeatureRequest("Dark Mode", "Please add a dark mode option")

# Full submit with all options
await Horizon.feedback.submit(
    "Bug Title",
    "Detailed description of the bug...",
    "BUG",
    "user@example.com",  # optional email
    true                  # include device info
)

# Listen for events
Horizon.feedback.feedback_submitted.connect(func(): print("Feedback sent!"))
Horizon.feedback.feedback_submit_failed.connect(func(error): print("Failed: %s" % error))
```

**Automatic device info includes:** OS, model, Godot version, screen resolution, renderer, and memory usage.

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Bug report with auto device info
await FeedbackManager.Instance.ReportBug(
    title: "Crash on level 5",
    message: "Game crashes when opening inventory"
);

// Feature request
await FeedbackManager.Instance.RequestFeature(
    title: "Dark mode",
    message: "Please add dark mode option"
);

// General feedback
await FeedbackManager.Instance.SendGeneral(
    title: "Great game!",
    message: "Really enjoying the new update"
);

// Full submit with all options
await FeedbackManager.Instance.Submit(
    title: "Bug Title",
    category: "BUG",
    message: "Detailed description...",
    email: "user@example.com",
    includeDeviceInfo: true
);
```

**Automatic device info includes:** Unity version, OS, device model, and graphics device.

### REST (cURL)

```bash
curl -X POST https://horizon.pm/api/v1/app/user-feedback/submit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Bug Report",
    "message": "Game crashes on level 5",
    "userId": "user123",
    "email": "user@example.com",
    "category": "BUG",
    "deviceInfo": "Windows 11 | RTX 3080 | 16GB RAM"
  }'
```

## Best Practices

- **Include device info for bug reports** — Both SDKs auto-collect device info; enable it for bug reports.
- **Use categories** — Categorize feedback as `BUG`, `FEATURE`, or `GENERAL` for easier triage in the Dashboard.
- **Add contact email** — Include the user's email if they want to receive follow-up responses.
- **Rate limit awareness** — Feedback submission counts toward the 10 req/min limit.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 400 | Missing required fields | Ensure `title`, `message`, and `userId` are provided |
| 401 | Invalid API key | Check `X-API-Key` header |
| 429 | Rate limit exceeded | Limit feedback submissions per session |
