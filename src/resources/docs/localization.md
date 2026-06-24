# Localization

## Overview

Localization lets you store translated strings on the server that your app can fetch at runtime. Each localization key holds one value per language, so you can ship copy in many languages without an app update. This is useful for:

- **UI text** — Buttons, labels, menus, and dialogs in the player's language
- **In-game content** — Item names, descriptions, quest text
- **Live updates** — Fix typos or change wording without a new build
- **Market expansion** — Add a new language without touching the client

horizOn supports **15 languages**: `en`, `de`, `es`, `fr`, `it`, `pt`, `nl`, `pl`, `ru`, `ja`, `zh`, `ar`, `ko`, `tr`, `id`.

Localization values are set in the horizOn Dashboard and are read-only from the app side. When no `lang` is given, the backend resolves the value for its default language.

## Endpoints

### Get Single Localization

**`GET /api/v1/app/localization/{localizationKey}?lang=xx`**

Retrieves a single localized value by its key. The optional `lang` query parameter selects the language (ISO 639-1, 2 characters).

**Path Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `localizationKey` | string | Yes | The localization key |

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lang` | string | No | ISO 639-1 language code (e.g. `de`). Defaults to the configured default language. |

**Response (200):**

```json
{
  "localizationKey": "ui.play_button",
  "value": "Spielen",
  "language": "de",
  "found": true
}
```

If the key does not exist:

```json
{
  "localizationKey": "unknown_key",
  "value": null,
  "language": "de",
  "found": false
}
```

---

### Get All Localizations

**`GET /api/v1/app/localization/all?lang=xx`**

Retrieves all localized values for a single language as a key-value map.

**Query Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `lang` | string | No | ISO 639-1 language code (e.g. `de`). Defaults to the configured default language. |

**Response (200):**

```json
{
  "translations": {
    "ui.play_button": "Play",
    "ui.settings": "Settings",
    "ui.quit": "Quit"
  },
  "language": "en",
  "total": 3
}
```

---

### Get Available Languages

**`GET /api/v1/app/localization/languages`**

Returns the list of languages that have at least one localization available for the app.

**Response (200):**

```json
{
  "languages": ["en", "de", "es", "fr"],
  "total": 4
}
```

## Code Examples

### Godot (GDScript)

```gdscript
# Set the active language (defaults to the device language)
Horizon.localization.setLanguage("de")

# Get a single localized string in the active language
var label: String = await Horizon.localization.getLocalization("ui.play_button")

# Get a string for a specific language
var en_label: String = await Horizon.localization.getLocalization("ui.play_button", "en")

# Get all localizations at once (recommended at startup)
var all: Dictionary = await Horizon.localization.getAllLocalizations()
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Set the active language (en, de, es, fr, it, pt, nl, pl, ru, ja, zh, ar, ko, tr, id)
LocalizationManager.Instance.SetLanguage("de");

// Get a single localized string in the active language
string label = await LocalizationManager.Instance.GetLocalization("ui.play_button");

// Get a string for a specific language
string enLabel = await LocalizationManager.Instance.GetLocalization("ui.play_button", "en");

// Get all localizations at once (recommended at startup)
var translations = await LocalizationManager.Instance.GetAllLocalizations();
```

### REST (cURL)

```bash
# Get single localization (German)
curl "https://horizon.pm/api/v1/app/localization/ui.play_button?lang=de" \
  -H "X-API-Key: YOUR_API_KEY"

# Get all localizations for a language
curl "https://horizon.pm/api/v1/app/localization/all?lang=de" \
  -H "X-API-Key: YOUR_API_KEY"

# List available languages
curl "https://horizon.pm/api/v1/app/localization/languages" \
  -H "X-API-Key: YOUR_API_KEY"
```

## Best Practices

- **Fetch all localizations at startup** — Use `getAllLocalizations()` once per language on app launch and rely on the cache.
- **Set the language once** — Resolve the player's language at startup (device locale or saved preference) and call `setLanguage()` before loading UI.
- **Provide a fallback language** — Always have `en` populated; fall back to it when a key is missing in the selected language.
- **Use dot-notation keys** — Group keys like `ui.play_button` or `quest.intro.title` for maintainability.
- **Avoid frequent polling** — Translations rarely change during a session; refetch only when the language changes.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 400 | Unsupported language code | Use one of the 15 supported codes (en, de, es, fr, it, pt, nl, pl, ru, ja, zh, ar, ko, tr, id) |
| 401 | Invalid API key | Check `X-API-Key` header |
| 429 | Rate limit exceeded | Cache localizations, fetch once at startup |
