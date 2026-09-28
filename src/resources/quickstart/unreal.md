# Unreal Engine Quickstart Guide

## Overview

horizOn has an **official Unreal Engine SDK**: the horizOn SDK plugin ([ProjectMakersDE/horizOn-SDK-Unreal](https://github.com/ProjectMakersDE/horizOn-SDK-Unreal)). It covers authentication, leaderboards, cloud save, remote config, localization, news, gift codes, feedback, user logs, crash reporting and email sending.

- **C++:** all features are reached through `UHorizonSubsystem`, a Game Instance Subsystem that owns one manager per feature (`Auth`, `Leaderboard`, `CloudSave`, `RemoteConfig`, `Localization`, `News`, `GiftCodes`, `Feedback`, `UserLogs`, `Crashes`, `EmailSending`).
- **Blueprints:** every call is also available as an async node with **On Success** and **On Failure** pins.

## Requirements

- **Unreal Engine 5.5** or later
- horizOn API key (get one at [horizon.pm](https://horizon.pm))
- Target platforms declared by the plugin: Win64, Mac, Linux, Android, iOS

## Step 1: Install the Plugin

1. Download `horizOn-SDK-vX.Y.Z.zip` from [GitHub Releases](https://github.com/ProjectMakersDE/horizOn-SDK-Unreal/releases)
2. Extract the `HorizonSDK/` folder into your project's `Plugins/` directory
3. Open the project in Unreal Editor
4. Go to **Edit > Plugins**, search for "horizOn SDK" and enable it
5. Restart the editor when prompted

To call the SDK from C++, add `"HorizonSDK"` to the dependency module names in your game module's `.Build.cs`.

## Step 2: Configure

Open **Project Settings > Plugins > horizOn SDK**:

| Option | Default | Description |
|--------|---------|-------------|
| API Key | (empty) | Your horizOn API key |
| Backend Hosts | (empty) | Backend URL(s), for example `https://horizon.pm`. One host connects directly, several hosts use ping-based selection. |
| Connection Timeout | 10 | HTTP request timeout in seconds |
| Max Retries | 3 | Retry count for failed requests |
| Retry Delay | 1.0 | Delay between retries in seconds |
| Log Level | Info | SDK log verbosity |

Alternatively, use **Tools > horizOn > Import Config...** to import the JSON config file from the horizOn dashboard. The importer reads `apiKey` plus either `backendDomains` (list) or `backendUrl` (single host). `ConnectToServer()` fails with "No hosts configured" if Backend Hosts is empty.

## Step 3: Connect to Server

```cpp
// MyActor.h: connection handlers are bound to dynamic delegates, so declare them as UFUNCTION()
UFUNCTION()
void HandleConnected();

UFUNCTION()
void HandleConnectionFailed(const FString& ErrorMessage);
```

```cpp
// MyActor.cpp
#include "HorizonSubsystem.h"

void AMyActor::BeginPlay()
{
    Super::BeginPlay();

    UHorizonSubsystem* Horizon = GetGameInstance()->GetSubsystem<UHorizonSubsystem>();
    Horizon->OnConnected.AddUniqueDynamic(this, &AMyActor::HandleConnected);
    Horizon->OnConnectionFailed.AddUniqueDynamic(this, &AMyActor::HandleConnectionFailed);
    Horizon->ConnectToServer();
}
```

Other connection calls: `Horizon->IsConnected()`, `Horizon->GetConnectionStatus()`, `Horizon->Disconnect()`.

## Step 4: Authenticate

```cpp
#include "Managers/HorizonAuthManager.h"

void AMyActor::HandleConnected()
{
    UHorizonSubsystem* Horizon = GetGameInstance()->GetSubsystem<UHorizonSubsystem>();

    // Anonymous sign-up (guest account)
    Horizon->Auth->SignUpAnonymous(TEXT("Player1"), FOnAuthComplete::CreateLambda([Horizon](bool bSuccess)
    {
        if (bSuccess)
        {
            FHorizonUserData User = Horizon->Auth->GetCurrentUser();
            UE_LOG(LogTemp, Log, TEXT("Signed in as %s (%s)"), *User.DisplayName, *User.UserId);
        }
    }));
}
```

### Other Authentication Methods

```cpp
// Email sign-up and sign-in
Horizon->Auth->SignUpEmail(TEXT("user@example.com"), TEXT("password"), TEXT("Username"), FOnAuthComplete::CreateLambda([](bool bSuccess) { }));
Horizon->Auth->SignInEmail(TEXT("user@example.com"), TEXT("password"), FOnAuthComplete::CreateLambda([](bool bSuccess) { }));

// Restore the cached anonymous session on the next launch
Horizon->Auth->RestoreAnonymousSession(FOnAuthComplete::CreateLambda([](bool bSuccess) { }));

// Sign in with Apple (native sheet on iOS, system browser elsewhere)
Horizon->Auth->SignInWithApple(FOnAuthComplete::CreateLambda([](bool bSuccess) { }));

// Session state
bool bSignedIn = Horizon->Auth->IsSignedIn();
Horizon->Auth->SignOut();
```

Google sign-in is available through `SignUpGoogle(AuthCode, RedirectUri, Username, OnComplete)` and `SignInGoogle(AuthCode, RedirectUri, OnComplete)`.

## Step 5: Use Features

Each manager lives in `Managers/Horizon<Feature>Manager.h`. Include the header of the manager you call.

### Leaderboards

```cpp
// Submit a score (optional Metadata and BoardKey parameters follow the callback)
Horizon->Leaderboard->SubmitScore(12500, FOnRequestComplete::CreateLambda([](bool bSuccess, const FString& Error) { }));

// Top 10 entries (second argument: use the local cache)
Horizon->Leaderboard->GetTop(10, false, FOnLeaderboardEntriesComplete::CreateLambda(
    [](bool bSuccess, const TArray<FHorizonLeaderboardEntry>& Entries)
    {
        for (const FHorizonLeaderboardEntry& Entry : Entries)
        {
            UE_LOG(LogTemp, Log, TEXT("#%d %s: %lld"), Entry.Position, *Entry.Username, Entry.Score);
        }
    }));

// Own rank and the entries around it
Horizon->Leaderboard->GetRank(false, FOnLeaderboardRankComplete::CreateLambda([](bool bSuccess, const FHorizonLeaderboardEntry& Entry) { }));
Horizon->Leaderboard->GetAround(5, false, FOnLeaderboardEntriesComplete::CreateLambda([](bool bSuccess, const TArray<FHorizonLeaderboardEntry>& Entries) { }));
```

### Cloud Saves

```cpp
Horizon->CloudSave->Save(TEXT("{\"level\": 5, \"coins\": 1000}"), FOnRequestComplete::CreateLambda([](bool bSuccess, const FString& Error) { }));
Horizon->CloudSave->Load(FOnStringComplete::CreateLambda([](bool bSuccess, const FString& Data) { }));

// Binary data
Horizon->CloudSave->SaveBytes(Bytes, FOnRequestComplete::CreateLambda([](bool bSuccess, const FString& Error) { }));
Horizon->CloudSave->LoadBytes(FOnBinaryComplete::CreateLambda([](bool bSuccess, const TArray<uint8>& Data) { }));
```

### Remote Config

```cpp
// Typed getters with defaults (Key, Default, bUseCache, callback)
Horizon->RemoteConfig->GetString(TEXT("welcome_message"), TEXT("Welcome!"), true, FOnConfigComplete::CreateLambda([](bool bSuccess, const FString& Value) { }));
Horizon->RemoteConfig->GetInt(TEXT("max_level"), 100, true, TDelegate<void(bool, int32)>::CreateLambda([](bool bSuccess, int32 Value) { }));

// All configs at once (recommended at startup)
Horizon->RemoteConfig->GetAllConfigs(true, FOnAllConfigsComplete::CreateLambda([](bool bSuccess, const TMap<FString, FString>& Configs) { }));
```

`GetFloat`, `GetBool`, `GetJson` and `HasKey` follow the same pattern.

### Localization

```cpp
// Active language: en, de, es, fr, it, pt, nl, pl, ru, ja, zh, ar, ko, tr, id
Horizon->Localization->SetLanguage(TEXT("de"));

// Empty language uses the active language
Horizon->Localization->GetLocalization(TEXT("welcome_message"), TEXT(""), FOnLocalizationComplete::CreateLambda([](bool bSuccess, const FString& Value) { }));
Horizon->Localization->GetAllLocalizations(TEXT("de"), FOnAllLocalizationsComplete::CreateLambda([](bool bSuccess, const TMap<FString, FString>& Translations) { }));
Horizon->Localization->GetAvailableLanguages(FOnLanguagesComplete::CreateLambda([](bool bSuccess, const TArray<FString>& Languages) { }));
```

### News

```cpp
// Limit, language code, bUseCache, callback
Horizon->News->LoadNews(20, TEXT("en"), true, FOnNewsComplete::CreateLambda(
    [](bool bSuccess, const TArray<FHorizonNewsEntry>& Entries)
    {
        for (const FHorizonNewsEntry& Entry : Entries)
        {
            UE_LOG(LogTemp, Log, TEXT("%s: %s"), *Entry.Title, *Entry.Message);
        }
    }));
```

### Gift Codes

```cpp
Horizon->GiftCodes->Validate(TEXT("ABCD-1234"), FOnGiftCodeValidateComplete::CreateLambda([](bool bRequestSuccess, bool bValid) { }));
Horizon->GiftCodes->Redeem(TEXT("ABCD-1234"), FOnGiftCodeRedeemComplete::CreateLambda([](bool bSuccess, const FString& GiftData, const FString& Message) { }));
```

### Feedback

```cpp
Horizon->Feedback->ReportBug(TEXT("Crash on level 5"), TEXT("Game crashes when opening the inventory"), FOnRequestComplete::CreateLambda([](bool bSuccess, const FString& Error) { }));
Horizon->Feedback->RequestFeature(TEXT("Dark mode"), TEXT("Please add a dark mode option"), FOnRequestComplete::CreateLambda([](bool bSuccess, const FString& Error) { }));
```

### User Logs

```cpp
// Requires BASIC tier or higher
Horizon->UserLogs->Info(TEXT("Tutorial completed"), FOnUserLogComplete::CreateLambda([](bool bSuccess, const FString& LogId, const FString& CreatedAt) { }));
```

`Warn` and `Error` take the same arguments. An optional error code can follow the callback.

### Crash Reporting

```cpp
// Automatic capture of engine errors (call once at game start)
Horizon->Crashes->StartCapture();

// Context for later reports
Horizon->Crashes->RecordBreadcrumb(TEXT("navigation"), TEXT("Entered level 5"));
Horizon->Crashes->SetCustomKey(TEXT("level"), TEXT("5"));

// Non-fatal exception
Horizon->Crashes->RecordException(TEXT("Failed to load texture"), TEXT("stack trace"));
```

### Email Sending

```cpp
TMap<FString, FString> Variables;
Variables.Add(TEXT("username"), TEXT("John"));

// UserId, template slug, variables, language, callback (an overload takes an ISO 8601 ScheduledAt before the callback)
Horizon->EmailSending->SendEmail(TEXT("user-uuid"), TEXT("welcome"), Variables, TEXT("en"),
    FOnSendEmailComplete::CreateLambda([](bool bSuccess, const FSendEmailResponse& Response) { }));
```

`CancelEmail(EmailId, ...)` and `GetEmailStatus(EmailId, ...)` manage emails that were already sent or scheduled.

## Blueprints

Get the subsystem with the **Get HorizonSubsystem** node or use the async nodes directly. Examples of node names:

- **Connect to horizOn Server**
- **Sign Up Anonymous**, **Sign In Email**, **Restore Anonymous Session**, **Sign In With Apple (Native)**
- **Submit Leaderboard Score**, **Get Top Scores**, **Get Leaderboard Rank**
- **Cloud Save Data**, **Cloud Load Data**
- **Get Remote Config**, **Get All Remote Configs**, **Get Localization**, **Load News**
- **Validate Gift Code**, **Redeem Gift Code**, **Report Bug**, **Submit Feedback**
- **Record Exception**, **Report Crash**, **Send Email**

## Hello horizOn Example

The plugin ships `AHelloHorizonActor`. Set the API key and Backend Hosts in Project Settings, drop the actor into a level and press Play. It connects, signs up anonymously, submits a leaderboard score and logs the result. Per-feature example actors (`AHorizonAuthExample`, `AHorizonLeaderboardExample`, `AHorizonCloudSaveExample` and others) live in `Source/HorizonSDK/Public/Examples/`.

## Rate Limit Best Practices

All tiers are limited to **10 requests per minute per client**. The SDK retries HTTP 429 responses automatically.

- Load all remote configs and localizations once at startup
- Use the `bUseCache` parameters for leaderboards, remote config and news
- Submit scores only on improvement, not every frame
- Start crash capture once, not repeatedly

## Without the Plugin

The SDK is the recommended path. If you cannot use the plugin, the App API can be called directly over HTTP with the `X-API-Key` header. See the `horizon://api/reference` resource for all endpoints.
