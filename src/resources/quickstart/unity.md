# Unity Quickstart Guide

## Requirements

- **Unity 6** (package minimum 6000.0)
- horizOn **Project API Key** (create one in the [Dashboard](https://horizon.pm/dashboard)). Never put an Account Key in a game.
- Namespace: `PM.horizOn.Cloud`

## Step 1: Import the SDK

1. Download the horizOn Cloud SDK package
2. Import into your project: `Assets/Plugins/ProjectMakers/horizOn/`
3. The SDK is ready to use once imported (no plugin activation needed)

## Step 2: Import Configuration

1. Go to the [horizOn Dashboard](https://horizon.pm) and navigate to SDK Settings
2. Download your `horizOn_config.json` file
3. Replace the downloaded `apiKey: "horizon_..."` placeholder with your Project API Key
4. In Unity, go to **Window > horizOn > Config Importer**
5. Select your downloaded JSON file
6. The config is saved as a ScriptableObject in the SDK's Resources folder

## Step 3: Initialize and Connect

```csharp
using PM.horizOn.Cloud.Core;
using PM.horizOn.Cloud.Manager;

public class GameManager : MonoBehaviour
{
    async void Start()
    {
        // Initialize the SDK (creates services, loads config)
        HorizonApp.Initialize();

        // Connect to the best available server
        var server = new HorizonServer();
        await server.Connect();

        Debug.Log("Connected to horizOn!");
    }
}
```

## Step 4: Authenticate

```csharp
// Anonymous sign-up (auto-generates and caches token)
await UserManager.Instance.SignUpAnonymous("PlayerName");

// Check if signed in
if (UserManager.Instance.IsSignedIn)
{
    var user = UserManager.Instance.CurrentUser;
    Debug.Log($"Welcome, {user.DisplayName}! (ID: {user.UserId})");
}
```

### Other Authentication Methods

```csharp
// Email sign-up
await UserManager.Instance.SignUpEmail("user@example.com", "password123", "DisplayName");

// Email sign-in
await UserManager.Instance.SignInEmail("user@example.com", "password123");

// Anonymous sign-in (restore cached session)
await UserManager.Instance.RestoreAnonymousSession();

// Google sign-in
await UserManager.Instance.SignInGoogle("google-authorization-code");

// Change display name
await UserManager.Instance.ChangeName("NewName");

// Sign out (preserves anonymous token by default)
UserManager.Instance.SignOut();
```

## Step 5: Use Features

### Leaderboards

```csharp
using PM.horizOn.Cloud.Manager;

// Submit score (only updates if higher than previous best)
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

// Get entries around your position
var around = await LeaderboardManager.Instance.GetAround(5);
```

### Cloud Saves

```csharp
using PM.horizOn.Cloud.Manager;

// Define your save structure
[System.Serializable]
public class GameData
{
    public int Level;
    public int Coins;
    public string[] Inventory;
}

// Save a typed object
var saveData = new GameData { Level = 5, Coins = 1000, Inventory = new[] { "sword" } };
await CloudSaveManager.Instance.SaveObject(saveData);

// Load a typed object
var loaded = await CloudSaveManager.Instance.LoadObject<GameData>();
if (loaded != null)
{
    Debug.Log($"Level: {loaded.Level}, Coins: {loaded.Coins}");
}

// Save/load raw strings
await CloudSaveManager.Instance.Save("{\"level\": 5}");
string json = await CloudSaveManager.Instance.Load();

// Binary data
byte[] data = GetBinaryData();
await CloudSaveManager.Instance.SaveBytes(data);
byte[] loadedBytes = await CloudSaveManager.Instance.LoadBytes();
```

### Remote Config

```csharp
using PM.horizOn.Cloud.Manager;

// Type-safe getters with defaults
int maxLives = await RemoteConfigManager.Instance.GetInt("max_lives", 3);
float difficulty = await RemoteConfigManager.Instance.GetFloat("difficulty", 1.0f);
bool eventActive = await RemoteConfigManager.Instance.GetBool("holiday_event", false);
string version = await RemoteConfigManager.Instance.GetString("game_version", "1.0.0");

// Get all configs at once (recommended at startup)
var configs = await RemoteConfigManager.Instance.GetAllConfigs();
```

### Localization

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

### News

```csharp
using PM.horizOn.Cloud.Manager;

// Load news entries
var news = await NewsManager.Instance.LoadNews(limit: 10);
foreach (var item in news)
{
    Debug.Log($"{item.title}: {item.message}");
}

// Filter by language
var germanNews = await NewsManager.Instance.LoadNews(limit: 10, languageCode: "de");

// Get cached entry by ID
var entry = NewsManager.Instance.GetNewsById("news-001");
```

### Gift Codes V2

```csharp
var intent = await GiftCodeManager.Instance.PrepareRedemption("PROMO2024");
// Save the complete intent durably first; never overwrite an unresolved one.
var result = intent == null ? null : await GiftCodeManager.Instance.RedeemPrepared(intent);
// A timeout/restart retries the saved original with RedeemPrepared, never PrepareRedemption.
```

Counts/revisions are exact strings. Replay returns current state with empty gifts/grants. V1 is closed with UPGRADE_REQUIRED; MIGRATION_REQUIRED requires operator reconciliation. Do not automatically consume on startup or replace unresolved originals. See `horizon://docs/gift-codes`.

### Player Profile

```csharp
// Profile, unlocks and the cosmetics catalog with an "available" flag per entry
var profile = await PlayerProfileManager.Instance.GetProfile();
var avatars = profile?.GetCosmetics("avatar");

// Replace the whole profile (null or "" clears a slot, max 3 badges)
var updated = await PlayerProfileManager.Instance.SetProfile("avatar.zombie_07", null, new[] { "badge.supporter" });
if (updated == null)
{
    Debug.LogWarning(PlayerProfileManager.Instance.LastErrorCode); // e.g. COSMETIC_LOCKED
}
```

Leaderboard entries carry `profile` (`avatarId`, `frameId`, `badges`).

### Validated Actions

```csharp
// Server-checked run: single-use ticket with a server seed (cloud only)
var run = await ValidatedActionsManager.Instance.StartRun("weekly");
if (run != null)
{
    Random.InitState(run.seed);
    // ... play, record the inputs into byte[] inputLog ...
    var result = await ValidatedActionsManager.Instance.SubmitValidated(18250, inputLog);
    if (result == null)
    {
        Debug.LogWarning(ValidatedActionsManager.Instance.LastErrorCode); // e.g. DURATION_TOO_SHORT
    }
}
```

Boards with `validatedOnly` reject `SubmitScore` with `VALIDATED_SUBMIT_REQUIRED`. See `horizon://docs/validated-actions`.

### Feedback

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

// General feedback with email
await FeedbackManager.Instance.SendGeneral(
    title: "Great game!",
    message: "Really enjoying the new update",
    email: "user@example.com"
);
```

### User Logs

```csharp
using PM.horizOn.Cloud.Manager;

// Availability follows the current configured userLogs quota
await UserLogManager.Instance.Info("Tutorial completed");
await UserLogManager.Instance.Warn("Low memory detected");
await UserLogManager.Instance.Error("Save failed", errorCode: "SAVE_001");
```

## Event System

Subscribe to SDK events for reactive patterns:

```csharp
using PM.horizOn.Cloud.Core;
using PM.horizOn.Cloud.Enums;
using PM.horizOn.Cloud.Objects.Data;

// Subscribe to auth events
HorizonApp.Events.Subscribe<UserData>(EventKeys.UserSignInSuccess, OnUserSignedIn);
HorizonApp.Events.Subscribe<string>(EventKeys.UserSignInFailed, OnSignInFailed);

void OnUserSignedIn(UserData user)
{
    Debug.Log($"Welcome back, {user.DisplayName}!");
}

void OnSignInFailed(string error)
{
    Debug.Log($"Sign-in failed: {error}");
}
```

## Error Handling

```csharp
// Check return values
bool success = await UserManager.Instance.SignInEmail(email, password);
if (!success)
{
    Debug.Log("Sign-in failed. Check credentials.");
}

// Cloud save with fallback
var data = await CloudSaveManager.Instance.LoadObject<GameData>();
if (data == null)
{
    data = new GameData(); // Use defaults on first load
}
```

## Item Gifts

For private one-item gifts, use the released native manager and durable sample flow
in `horizon://docs/item-gifts`. It includes exact package links and read/review/send,
original-intent recovery, Inbox claims and return handling. Read config and inventory,
show the recipient, original item and sender fee, and send only from the player's
confirmation. A scene startup must not send a gift automatically.

## Plans and current limits

Plans are FREE, BASIC, PLUS, PRO and ENTERPRISE. Read `horizon://docs/limits` and
explicitly read `horizon://api/feature-limits` for current quotas. Check
`cloudSaveBytes` against the serialized save size before uploading. Account request
budgets have separate soft and hard thresholds. User Logs availability follows its configured quota.
Do not hardcode numeric plan tables into the game.

## Efficient Startup Pattern

Plan your API calls to stay within the rate limit:

```csharp
async void Start()
{
    // Initialize and connect
    HorizonApp.Initialize();
    await new HorizonServer().Connect();

    // Startup loads (3 requests)
    await UserManager.Instance.CheckAuth();
    await RemoteConfigManager.Instance.GetAllConfigs();
    await NewsManager.Instance.LoadNews();

    // Keep gameplay calls within current account and feature budgets
}
```

## Project Structure

```
Assets/Plugins/ProjectMakers/horizOn/
├── CloudSDK/
│   ├── Core/        # HorizonApp, HorizonServer, HorizonConfig
│   ├── Manager/     # Feature managers (UserManager, LeaderboardManager, etc.)
│   ├── Service/     # EventService, NetworkService, LogService
│   ├── Objects/     # Data models, requests, responses
│   └── Resources/   # HorizonConfig.asset
```

## Common Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 400 | Bad Request | Check parameters |
| 401 | Unauthorized | Verify API key |
| 403 | Forbidden | Check tier/permissions |
| 429 | Rate Limited | Implement caching, wait and retry |

## Dashboard and self-hosting

Read `horizon://docs/dashboard` for key scopes, SDK configuration and cosmetics
administration. `horizOn_config.json` is connection configuration, not a content or
player-data export. Read `horizon://docs/self-hosting` before changing to simpleServer.
