# Email Sending

## Overview

Email Sending lets you send transactional and event-based emails to your registered end-users through their horizOn user ID. Emails are rendered from reusable templates with variable substitution and multi-language support. All emails are sent through the developer's own SMTP server — horizOn never sends on behalf of developers.

This feature is designed for notifications, reminders, confirmations, and event-based communication. It is **not** a newsletter or marketing automation tool.

**Requires:** BASIC tier or higher. SMTP credentials must be configured in the horizOn Dashboard.

## Key Concepts

- **Templates** are created and managed in the Dashboard (not via SDK/API). Each template has a slug, subject, HTML body, and variable definitions — all with multi-language support.
- **Variables** are placeholders in templates (e.g., `{{username}}`). The app provides values when sending.
- **Immediate emails** are processed on the next ticker run (~5 minutes).
- **Scheduled emails** are stored with a future timestamp and sent when the time arrives.
- **Email lifecycle:** `pending` -> `processing` -> `sent` or `failed`. Cancelled emails are deleted immediately.

## Endpoints

### Send Email

**`POST /api/v1/app/email-sending/send`**

Sends an email to a registered user. Optionally schedule for later delivery.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | UUID | Yes | horizOn user ID of the recipient |
| `templateSlug` | string | Yes | Template slug (e.g., `welcome`, `reminder`) |
| `variables` | object | Yes | Variable values as key-value pairs. Can be `{}`. |
| `language` | string | Yes | Language code (e.g., `en`, `de`) |
| `scheduledAt` | string | No | ISO 8601 timestamp. Omit for immediate delivery. |

**Response (201):**

```json
{
  "id": "uuid",
  "status": "pending",
  "scheduledAt": "2026-04-12T09:00:00Z"
}
```

### Cancel Email

**`DELETE /api/v1/app/email-sending/{emailId}`**

Cancels a pending email. Only emails with status `pending` can be cancelled.

**Response (200):**

```json
{
  "message": "Email cancelled"
}
```

### Get Email Status

**`GET /api/v1/app/email-sending/{emailId}`**

Returns the current status of an email.

**Response (200):**

```json
{
  "id": "uuid",
  "status": "sent",
  "templateSlug": "reminder",
  "userId": "uuid",
  "language": "en",
  "scheduledAt": null,
  "processedAt": "2026-04-11T10:05:00Z",
  "errorReason": null,
  "createdAt": "2026-04-11T10:00:00Z"
}
```

## Code Examples

### Godot (GDScript)

```gdscript
# Send an immediate email
var result = await Horizon.emailSending.sendEmail(
    user_id, "welcome", {"username": "John"}, "en"
)
print("Email queued: %s" % result.id)

# Schedule an email for tomorrow
var result = await Horizon.emailSending.sendEmail(
    user_id, "reminder", {"appointmentTime": "14:00"}, "en",
    "2026-04-12T09:00:00Z"
)

# Cancel a scheduled email
await Horizon.emailSending.cancelEmail(result.id)

# Check status
var status = await Horizon.emailSending.getEmailStatus(result.id)
print("Status: %s" % status.status)
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Send immediately
var result = await EmailSendingManager.Instance.SendEmail(
    userId, "welcome",
    new Dictionary<string, string> { { "username", "John" } },
    "en"
);
Debug.Log($"Email queued: {result.Id}");

// Schedule for later
var scheduled = await EmailSendingManager.Instance.SendEmail(
    userId, "reminder",
    new Dictionary<string, string> { { "appointmentTime", "14:00" } },
    "en", scheduledAt: "2026-04-12T09:00:00Z"
);

// Cancel
await EmailSendingManager.Instance.CancelEmail(scheduled.Id);

// Check status
var status = await EmailSendingManager.Instance.GetEmailStatus(scheduled.Id);
Debug.Log($"Status: {status.Status}");
```

### REST (cURL)

```bash
# Send email
curl -X POST "https://horizon.pm/api/v1/app/email-sending/send" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId":"USER_UUID","templateSlug":"welcome","variables":{"username":"John"},"language":"en"}'

# Cancel email
curl -X DELETE "https://horizon.pm/api/v1/app/email-sending/EMAIL_UUID" \
  -H "X-API-Key: YOUR_API_KEY"

# Get status
curl "https://horizon.pm/api/v1/app/email-sending/EMAIL_UUID" \
  -H "X-API-Key: YOUR_API_KEY"
```

## Best Practices

- **Use meaningful template slugs** like `welcome`, `reminder`, `purchase_confirm` for self-documenting API calls.
- **Check email status** after sending to confirm delivery, especially for critical notifications.
- **Schedule one email at a time** — don't schedule weeks ahead. Schedule the next relevant one and plan the following when the user returns.
- **Handle errors gracefully** — if SMTP is misconfigured or the user has no verified email, the API returns clear error messages.
- **Monitor the Dashboard** — regularly check the failed emails section to catch SMTP issues early.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 400 | SMTP not configured | Configure SMTP credentials in the Dashboard |
| 400 | Template not found | Verify the template slug exists for this API key |
| 400 | User has no verified email | Ensure the user has verified their email address |
| 400 | Missing required variable | Provide all variables the template expects |
| 403 | Feature not available | Upgrade from FREE tier to BASIC or higher |
| 404 | Email not found | Verify the email ID and API key ownership |
| 429 | Rate limit exceeded | Reduce request frequency |
