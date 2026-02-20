# Gift Codes

## Overview

Gift Codes allow you to create promotional codes that players can redeem for in-game rewards. Codes are created in the horizOn Dashboard with associated reward data. Each code can be single-use or multi-use, and can optionally have an expiration date.

The typical flow is:

1. **Validate** (optional) — Check if a code is valid before redeeming
2. **Redeem** — Redeem the code to receive the reward data

## Endpoints

### Validate Gift Code

**`POST /api/v1/app/gift-codes/validate`**

Checks if a gift code is valid and can be redeemed by the user, without consuming it.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | The gift code to validate |
| `userId` | string | Yes | The user's ID |

**Response (200):**

```json
{
  "valid": true
}
```

`valid` is `false` if the code does not exist, is expired, or has already been redeemed by this user.

---

### Redeem Gift Code

**`POST /api/v1/app/gift-codes/redeem`**

Redeems a gift code and returns the associated reward data.

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | The gift code to redeem |
| `userId` | string | Yes | The user's ID |

**Response (200):**

```json
{
  "success": true,
  "message": "Gift code redeemed successfully",
  "giftData": "{\"coins\": 500, \"gems\": 10}"
}
```

`giftData` is a JSON string set by the developer in the Dashboard. Your app must parse and apply the rewards.

**Failed redemption:**

```json
{
  "success": false,
  "message": "Gift code already redeemed by this user",
  "giftData": null
}
```

## Code Examples

### Godot (GDScript)

```gdscript
# Validate a code first (optional)
var is_valid = await Horizon.giftCodes.validate("ABCD-1234")
if is_valid:
    print("Code is valid!")

# Redeem a code
var result = await Horizon.giftCodes.redeem("ABCD-1234")
if result.get("success", false):
    var gift_data = result.get("giftData", "")
    print("Rewards: %s" % gift_data)

# Redeem and auto-parse rewards as Dictionary
var parsed = await Horizon.giftCodes.redeemParsed("ABCD-1234")
if parsed.get("success", false):
    var rewards: Dictionary = parsed.get("rewards", {})
    var coins = rewards.get("coins", 0)
    var gems = rewards.get("gems", 0)

# Listen for events
Horizon.giftCodes.code_validated.connect(func(code, valid): print("%s: %s" % [code, "valid" if valid else "invalid"]))
Horizon.giftCodes.code_redeemed.connect(func(code, data): print("Redeemed %s: %s" % [code, data]))
Horizon.giftCodes.code_redeem_failed.connect(func(code, error): print("Failed: %s" % error))
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Validate (optional)
bool? valid = await GiftCodeManager.Instance.Validate("PROMO2024");
if (valid == true)
{
    Debug.Log("Code is valid!");
}

// Redeem
var result = await GiftCodeManager.Instance.Redeem("PROMO2024");
if (result != null && result.success)
{
    // Parse giftData JSON for rewards
    string giftData = result.giftData;
    Debug.Log($"Rewards: {giftData}");
}
```

### REST (cURL)

```bash
# Validate
curl -X POST https://horizon.pm/api/v1/app/gift-codes/validate \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code": "ABCD-1234", "userId": "user123"}'

# Redeem
curl -X POST https://horizon.pm/api/v1/app/gift-codes/redeem \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code": "ABCD-1234", "userId": "user123"}'
```

## Best Practices

- **Validate before redeeming** — Show the user whether their code is valid before consuming it.
- **Parse giftData in your app** — The reward structure is defined by you in the Dashboard. Parse the JSON string and apply rewards accordingly.
- **Handle already-redeemed codes** — Check the `success` field and display the `message` to the user.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 401 | Invalid API key | Check `X-API-Key` header |
| 404 | Code does not exist | Verify the code spelling |
| 429 | Rate limit exceeded | Avoid rapid repeated redemption attempts |
