# Godot Quickstart Guide

## Requirements

- **Godot 4.5** or later
- horizOn API key (get one at [horizon.pm](https://horizon.pm))

## Step 1: Install the SDK

### Option A: GitHub Release ZIP (Recommended)

1. Download `horizOn-SDK-vX.Y.Z.zip` from the [latest release](https://github.com/ProjectMakersDE/horizOn-SDK-Godot/releases/latest)
2. Unzip it and move the `horizon_sdk` folder into your project's `addons/` directory, so the plugin lives at `res://addons/horizon_sdk/`
3. Enable the plugin: **Project > Project Settings > Plugins > horizOn SDK**

### Option B: Manual Copy from the Repository

1. Clone or download the [horizOn-SDK-Godot repository](https://github.com/ProjectMakersDE/horizOn-SDK-Godot)
2. Copy the `addons/horizon_sdk` folder to your project's `addons/` directory
3. Enable the plugin: **Project > Project Settings > Plugins > horizOn SDK**

The SDK is not listed in the Godot Asset Library at the moment. Install it with one of the options above.

## Step 2: Import Configuration

1. Go to the [horizOn Dashboard](https://horizon.pm) and navigate to SDK Settings
2. Download your `horizOn_config.json` file
3. In Godot, go to **Project > Tools > horizOn: Import Config...**
4. Select your downloaded JSON file

This creates a config resource at `res://addons/horizon_sdk/horizon_config.tres` with your API key and server hosts.

## Step 3: Connect to Server

The SDK is accessed through the `Horizon` singleton (auto-registered when the plugin is enabled).

```gdscript
extends Node

func _ready():
    # Connect to the best available server (auto-selects lowest latency)
    var connected = await Horizon.connect_to_server()
    if not connected:
        print("Failed to connect to horizOn!")
        return

    print("Connected to %s" % Horizon.getActiveHost())
```

## Step 4: Authenticate

```gdscript
# Quick anonymous sign-in (creates new user or restores cached session)
var signed_in = await Horizon.quickSignInAnonymous("Player1")
if signed_in:
    var user = Horizon.getCurrentUser()
    print("Welcome, %s! (ID: %s)" % [user.displayName, user.userId])
```

### Other Authentication Methods

```gdscript
# Email sign-up
await Horizon.auth.signUpEmail("user@example.com", "password123", "MyUsername")

# Email sign-in
await Horizon.auth.signInEmail("user@example.com", "password123")

# Anonymous sign-up with explicit token
await Horizon.auth.signUpAnonymous("DisplayName")

# Restore anonymous session from cache
await Horizon.auth.restoreAnonymousSession()

# Sign out
Horizon.auth.signOut()
```

## Step 5: Use Features

### Leaderboards

```gdscript
# Submit a score (only updates if higher than previous best)
await Horizon.leaderboard.submitScore(1000)

# Get top 10 players
var top: Array[HorizonLeaderboardEntry] = await Horizon.leaderboard.getTop(10)
for entry in top:
    print("#%d %s: %d" % [entry.position, entry.username, entry.score])

# Get your rank
var rank: HorizonLeaderboardEntry = await Horizon.leaderboard.getRank()

# Get entries around your position
var around: Array[HorizonLeaderboardEntry] = await Horizon.leaderboard.getAround(5)
```

### Cloud Saves

```gdscript
# Save a Dictionary (recommended)
await Horizon.cloudSave.saveObject({"level": 5, "coins": 1000})

# Load as Dictionary
var data: Dictionary = await Horizon.cloudSave.loadObject()
if not data.is_empty():
    var level = data.get("level", 1)

# Save/load raw strings
await Horizon.cloudSave.saveData('{"custom": "json"}')
var json: String = await Horizon.cloudSave.loadData()

# Binary data
await Horizon.cloudSave.saveBytes(my_bytes)
var bytes: PackedByteArray = await Horizon.cloudSave.loadBytes()
```

### Remote Config

```gdscript
# Typed getters with defaults
var max_level: int = await Horizon.remoteConfig.getInt("max_level", 100)
var difficulty: float = await Horizon.remoteConfig.getFloat("difficulty", 1.0)
var maintenance: bool = await Horizon.remoteConfig.getBool("maintenance_mode", false)

# Get all configs at once (recommended at startup)
var all_configs: Dictionary = await Horizon.remoteConfig.getAllConfigs()
```

### Localization

```gdscript
# Set the active language (en, de, es, fr, it, pt, nl, pl, ru, ja, zh, ar, ko, tr, id)
Horizon.localization.setLanguage("de")

# Get a single localized string in the active language
var label: String = await Horizon.localization.getLocalization("ui.play_button")

# Get a string for a specific language
var en_label: String = await Horizon.localization.getLocalization("ui.play_button", "en")

# Get all localizations at once (recommended at startup)
var all_translations: Dictionary = await Horizon.localization.getAllLocalizations()
```

### News

```gdscript
var news: Array[HorizonNewsEntry] = await Horizon.news.loadNews(20, "en")
for entry in news:
    print("%s: %s" % [entry.title, entry.message])
```

### Gift Codes

```gdscript
var is_valid = await Horizon.giftCodes.validate("ABCD-1234")
if is_valid:
    var result = await Horizon.giftCodes.redeem("ABCD-1234")
    if result.get("success", false):
        print("Rewards: %s" % result.get("giftData", ""))
        print("Unlocked: %s" % result.get("grantedUnlocks", []))
```

### Player Profile

```gdscript
# Profile, unlocks and the cosmetics catalog with an "available" flag per entry
var data: Dictionary = await Horizon.playerProfile.getProfile()
var avatars: Array = Horizon.playerProfile.getCosmetics("avatar")

# Replace the whole profile ("" clears a slot, [] clears the badges, max 3)
var updated: Dictionary = await Horizon.playerProfile.setProfile("avatar.zombie_07", "", ["badge.supporter"])
if updated.is_empty():
    print(Horizon.playerProfile.getLastErrorCode())  # e.g. COSMETIC_LOCKED
```

Leaderboard entries carry `entry.profile` (`avatarId`, `frameId`, `badges`).

### Validated Actions

```gdscript
# Server-checked run: single-use ticket with a server seed (cloud only)
var run: Dictionary = await Horizon.validatedActions.startRun("weekly")
if not run.is_empty():
    seed(int(run.seed))
    # ... play, record the inputs into input_log (PackedByteArray) ...
    var result: Dictionary = await Horizon.validatedActions.submitValidated(18250, input_log)
    if result.is_empty():
        print(Horizon.validatedActions.getLastErrorCode())  # e.g. DURATION_TOO_SHORT
```

Boards with `validatedOnly` reject `submitScore` with `VALIDATED_SUBMIT_REQUIRED`. See `horizon://docs/validated-actions`.

### Feedback

```gdscript
await Horizon.feedback.submitBugReport("Crash on Level 5", "Game crashes when...")
await Horizon.feedback.submitFeatureRequest("Dark Mode", "Add dark mode option")
```

### User Logs

```gdscript
# Requires BASIC tier or higher
await Horizon.userLogs.info("Player completed tutorial")
await Horizon.userLogs.warn("Low memory detected")
await Horizon.userLogs.error("Failed to load asset", "ERR_001")
await Horizon.userLogs.logEvent("level_complete", "Level 5")
```

## Signals (Event-Driven)

All operations emit signals for reactive programming:

```gdscript
# SDK lifecycle
Horizon.sdk_initialized.connect(func(): print("SDK ready"))
Horizon.sdk_connected.connect(func(host): print("Connected to %s" % host))

# Authentication
Horizon.auth.signin_completed.connect(func(user): print("Signed in: %s" % user.userId))
Horizon.auth.signin_failed.connect(func(error): print("Auth error: %s" % error))

# Features
Horizon.leaderboard.score_submitted.connect(func(score): print("Score: %d" % score))
Horizon.cloudSave.data_saved.connect(func(size): print("Saved %d bytes" % size))
Horizon.news.news_loaded.connect(func(entries): print("Loaded %d news" % entries.size()))
```

## Configuration Options

Edit your config resource at `addons/horizon_sdk/horizon_config.tres`:

| Option | Default | Description |
|--------|---------|-------------|
| `api_key` | - | Your horizOn API key |
| `hosts` | - | Array of backend server URLs |
| `connection_timeout_seconds` | 10 | HTTP request timeout |
| `max_retry_attempts` | 3 | Retry count for failed requests |
| `retry_delay_seconds` | 1.0 | Delay between retries |
| `log_level` | INFO | DEBUG, INFO, WARNING, ERROR, NONE |

## Rate Limit Best Practices

The rate limit is **10 requests per minute per client** (all tiers). Plan your API calls:

```gdscript
func _ready():
    var connected = await Horizon.connect_to_server()
    if not connected:
        return

    # Authenticate (1 request)
    await Horizon.quickSignInAnonymous("Player")

    # Startup batch (3 requests)
    await Horizon.remoteConfig.getAllConfigs()
    await Horizon.news.loadNews()
    await Horizon.leaderboard.getTop(10)

    # 6 requests remaining for gameplay actions
```

## Example Project

The SDK includes a test scene demonstrating all features:

```
res://addons/horizon_sdk/examples/horizon_test_scene.tscn
```
