# Remote Config

## Overview

Remote Config lets you store key-value pairs on the server that your app can fetch at runtime. This is useful for:

- **Feature flags** — Enable/disable features without an app update
- **Game balance** — Tweak difficulty, rewards, or economy values
- **A/B testing** — Serve different values to different users
- **Maintenance mode** — Toggle server maintenance messages
- **Version gating** — Enforce minimum app versions

Config values are set in the horizOn Dashboard and are read-only from the app side.

## Endpoints

### Get Single Config

**`GET /api/v1/app/remote-config/{configKey}`**

Retrieves a single configuration value by its key.

**Path Parameters:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `configKey` | string | Yes | The configuration key |

**Response (200):**

```json
{
  "configKey": "max_level",
  "configValue": "50",
  "found": true
}
```

If the key does not exist:

```json
{
  "configKey": "unknown_key",
  "configValue": null,
  "found": false
}
```

---

### Get All Configs

**`GET /api/v1/app/remote-config/all`**

Retrieves all configuration values for the app.

**Response (200):**

```json
{
  "configs": {
    "max_level": "50",
    "difficulty": "1.5",
    "maintenance_mode": "false",
    "welcome_message": "Hello, Player!"
  },
  "total": 4
}
```

## Code Examples

### Godot (GDScript)

```gdscript
# Get a single config value
var version: String = await Horizon.remoteConfig.getConfig("game_version")

# Typed getters with defaults
var maxLevel: int = await Horizon.remoteConfig.getInt("max_level", 100)
var difficulty: float = await Horizon.remoteConfig.getFloat("difficulty", 1.0)
var maintenance: bool = await Horizon.remoteConfig.getBool("maintenance_mode", false)

# Parse JSON config values
var jsonData = await Horizon.remoteConfig.getJson("event_config")

# Get all configs at once (recommended at startup)
var all: Dictionary = await Horizon.remoteConfig.getAllConfigs()

# Caching (enabled by default)
var cached = await Horizon.remoteConfig.getConfig("key", true)   # uses cache
var fresh = await Horizon.remoteConfig.getConfig("key", false)   # forces refresh

# Check if a key exists
var exists: bool = await Horizon.remoteConfig.hasKey("some_key")

# Clear cache
Horizon.remoteConfig.clearCache()

# Listen for events
Horizon.remoteConfig.config_loaded.connect(func(key, value): print("%s = %s" % [key, value]))
Horizon.remoteConfig.all_configs_loaded.connect(func(configs): print("Loaded %d configs" % configs.size()))
```

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

// Get a single config
string value = await RemoteConfigManager.Instance.GetConfig("game_version");

// Type-safe getters with defaults
int maxLives = await RemoteConfigManager.Instance.GetInt("max_lives", 3);
float difficulty = await RemoteConfigManager.Instance.GetFloat("difficulty", 1.0f);
bool eventActive = await RemoteConfigManager.Instance.GetBool("holiday_event", false);

// Get all configs at once (recommended at startup)
var configs = await RemoteConfigManager.Instance.GetAllConfigs();

// Clear cache
RemoteConfigManager.Instance.ClearCache();
```

### REST (cURL)

```bash
# Get single config
curl "https://horizon.pm/api/v1/app/remote-config/max_level" \
  -H "X-API-Key: YOUR_API_KEY"

# Get all configs
curl "https://horizon.pm/api/v1/app/remote-config/all" \
  -H "X-API-Key: YOUR_API_KEY"
```

## Best Practices

- **Fetch all configs at startup** — Use `getAllConfigs()` once on app launch and rely on the cache.
- **Provide sensible defaults** — Always pass default values in typed getters in case the config key is missing.
- **Cache aggressively** — Config values rarely change during a session.
- **Avoid frequent polling** — Config changes take effect when users restart the app or you explicitly refresh.

## Common Errors

| Status | Cause | Solution |
|--------|-------|----------|
| 401 | Invalid API key | Check `X-API-Key` header |
| 429 | Rate limit exceeded | Cache config values, fetch once at startup |
