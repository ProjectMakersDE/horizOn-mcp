# Unreal Engine Quickstart Guide

## Overview

There is **no official horizOn SDK for Unreal Engine**. Instead, you use the REST API directly via HTTP requests. This guide shows how to integrate horizOn using either:

- **VaRest Plugin** — Marketplace plugin for Blueprint-friendly HTTP requests
- **FHttpModule** — Unreal's built-in C++ HTTP module

## Requirements

- **Unreal Engine 5.x**
- horizOn API key (get one at [horizon.pm](https://horizon.pm))
- HTTP request capability (VaRest plugin or FHttpModule)

## API Configuration

All requests use these common settings:

| Setting | Value |
|---------|-------|
| Base URL | `https://horizon.pm` |
| API Key Header | `X-API-Key: YOUR_API_KEY` |
| Content Type | `Content-Type: application/json` |
| Rate Limit | 10 requests/minute per client |

## Option A: VaRest Plugin (Blueprint-Friendly)

Install VaRest from the Unreal Marketplace, then use it in Blueprints or C++.

### C++ Setup with VaRest

```cpp
// MyHorizonManager.h
#pragma once
#include "CoreMinimal.h"
#include "VaRestSubsystem.h"

UCLASS()
class UMyHorizonManager : public UObject
{
    GENERATED_BODY()

public:
    void SetApiKey(const FString& InApiKey) { ApiKey = InApiKey; }

    void SignUpAnonymous(const FString& Username);
    void SubmitScore(const FString& UserId, int64 Score);
    void GetRemoteConfig(const FString& Key);

private:
    FString BaseUrl = TEXT("https://horizon.pm");
    FString ApiKey;

    UVaRestJsonObject* CreateRequestWithHeaders();
};
```

## Option B: FHttpModule (Built-in C++)

No plugins required. Uses Unreal's native HTTP module.

### Base HTTP Helper

```cpp
// HorizonAPI.h
#pragma once
#include "CoreMinimal.h"
#include "Http.h"
#include "Json.h"

class FHorizonAPI
{
public:
    static FString BaseUrl;
    static FString ApiKey;

    // POST request helper
    static void Post(
        const FString& Endpoint,
        const TSharedRef<FJsonObject>& Body,
        TFunction<void(bool bSuccess, TSharedPtr<FJsonObject> Response)> Callback)
    {
        FHttpModule& Http = FHttpModule::Get();
        TSharedRef<IHttpRequest> Request = Http.CreateRequest();

        Request->SetURL(BaseUrl + Endpoint);
        Request->SetVerb(TEXT("POST"));
        Request->SetHeader(TEXT("Content-Type"), TEXT("application/json"));
        Request->SetHeader(TEXT("X-API-Key"), ApiKey);

        FString BodyString;
        TSharedRef<TJsonWriter<>> Writer = TJsonWriterFactory<>::Create(&BodyString);
        FJsonSerializer::Serialize(Body, Writer);
        Request->SetContentAsString(BodyString);

        Request->OnProcessRequestComplete().BindLambda(
            [Callback](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bConnected)
            {
                if (bConnected && Resp.IsValid() && Resp->GetResponseCode() == 200)
                {
                    TSharedPtr<FJsonObject> JsonResponse;
                    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Resp->GetContentAsString());
                    FJsonSerializer::Deserialize(Reader, JsonResponse);
                    Callback(true, JsonResponse);
                }
                else
                {
                    Callback(false, nullptr);
                }
            });

        Request->ProcessRequest();
    }

    // GET request helper
    static void Get(
        const FString& Endpoint,
        TFunction<void(bool bSuccess, TSharedPtr<FJsonObject> Response)> Callback)
    {
        FHttpModule& Http = FHttpModule::Get();
        TSharedRef<IHttpRequest> Request = Http.CreateRequest();

        Request->SetURL(BaseUrl + Endpoint);
        Request->SetVerb(TEXT("GET"));
        Request->SetHeader(TEXT("X-API-Key"), ApiKey);

        Request->OnProcessRequestComplete().BindLambda(
            [Callback](FHttpRequestPtr Req, FHttpResponsePtr Resp, bool bConnected)
            {
                if (bConnected && Resp.IsValid() && Resp->GetResponseCode() == 200)
                {
                    TSharedPtr<FJsonObject> JsonResponse;
                    TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Resp->GetContentAsString());
                    FJsonSerializer::Deserialize(Reader, JsonResponse);
                    Callback(true, JsonResponse);
                }
                else
                {
                    Callback(false, nullptr);
                }
            });

        Request->ProcessRequest();
    }
};

// HorizonAPI.cpp
FString FHorizonAPI::BaseUrl = TEXT("https://horizon.pm");
FString FHorizonAPI::ApiKey = TEXT("");
```

## Feature Examples

### Anonymous Signup

```cpp
void SignUpAnonymous(const FString& Username)
{
    TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("type"), TEXT("ANONYMOUS"));
    Body->SetStringField(TEXT("username"), Username);

    // Generate a unique anonymous token (max 32 chars)
    FString Token = FGuid::NewGuid().ToString(EGuidFormats::DigitsLower).Left(32);
    Body->SetStringField(TEXT("anonymousToken"), Token);

    FHorizonAPI::Post(TEXT("/api/v1/app/user-management/signup"), Body,
        [](bool bSuccess, TSharedPtr<FJsonObject> Response)
        {
            if (bSuccess && Response.IsValid())
            {
                FString UserId = Response->GetStringField(TEXT("userId"));
                FString Name = Response->GetStringField(TEXT("username"));
                UE_LOG(LogTemp, Log, TEXT("Signed up: %s (%s)"), *Name, *UserId);
            }
            else
            {
                UE_LOG(LogTemp, Error, TEXT("Signup failed"));
            }
        });
}
```

### Email Sign-In

```cpp
void SignInEmail(const FString& Email, const FString& Password)
{
    TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("type"), TEXT("EMAIL"));
    Body->SetStringField(TEXT("email"), Email);
    Body->SetStringField(TEXT("password"), Password);

    FHorizonAPI::Post(TEXT("/api/v1/app/user-management/signin"), Body,
        [](bool bSuccess, TSharedPtr<FJsonObject> Response)
        {
            if (bSuccess && Response.IsValid())
            {
                FString Status = Response->GetStringField(TEXT("authStatus"));
                if (Status == TEXT("AUTHENTICATED"))
                {
                    FString AccessToken = Response->GetStringField(TEXT("accessToken"));
                    UE_LOG(LogTemp, Log, TEXT("Signed in successfully"));
                }
            }
        });
}
```

### Submit Leaderboard Score

```cpp
void SubmitScore(const FString& UserId, int64 Score)
{
    TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("userId"), UserId);
    Body->SetNumberField(TEXT("score"), Score);

    FHorizonAPI::Post(TEXT("/api/v1/app/leaderboard/submit"), Body,
        [Score](bool bSuccess, TSharedPtr<FJsonObject> Response)
        {
            if (bSuccess)
            {
                UE_LOG(LogTemp, Log, TEXT("Score submitted: %lld"), Score);
            }
        });
}
```

### Get Top Leaderboard

```cpp
void GetTopLeaderboard(const FString& UserId, int32 Limit)
{
    FString Endpoint = FString::Printf(
        TEXT("/api/v1/app/leaderboard/top?userId=%s&limit=%d"),
        *UserId, Limit);

    FHorizonAPI::Get(Endpoint,
        [](bool bSuccess, TSharedPtr<FJsonObject> Response)
        {
            if (bSuccess && Response.IsValid())
            {
                const TArray<TSharedPtr<FJsonValue>>* Entries;
                if (Response->TryGetArrayField(TEXT("entries"), Entries))
                {
                    for (const auto& Entry : *Entries)
                    {
                        auto Obj = Entry->AsObject();
                        int32 Position = Obj->GetIntegerField(TEXT("position"));
                        FString Username = Obj->GetStringField(TEXT("username"));
                        int64 Score = Obj->GetIntegerField(TEXT("score"));
                        UE_LOG(LogTemp, Log, TEXT("#%d %s: %lld"), Position, *Username, Score);
                    }
                }
            }
        });
}
```

### Save and Load Cloud Data

```cpp
void SaveCloudData(const FString& UserId, const FString& SaveData)
{
    TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("userId"), UserId);
    Body->SetStringField(TEXT("saveData"), SaveData);

    FHorizonAPI::Post(TEXT("/api/v1/app/cloud-save/save"), Body,
        [](bool bSuccess, TSharedPtr<FJsonObject> Response)
        {
            if (bSuccess && Response.IsValid())
            {
                bool Success = Response->GetBoolField(TEXT("success"));
                int32 Size = Response->GetIntegerField(TEXT("dataSizeBytes"));
                UE_LOG(LogTemp, Log, TEXT("Saved: %d bytes"), Size);
            }
        });
}

void LoadCloudData(const FString& UserId)
{
    TSharedRef<FJsonObject> Body = MakeShared<FJsonObject>();
    Body->SetStringField(TEXT("userId"), UserId);

    FHorizonAPI::Post(TEXT("/api/v1/app/cloud-save/load"), Body,
        [](bool bSuccess, TSharedPtr<FJsonObject> Response)
        {
            if (bSuccess && Response.IsValid())
            {
                bool Found = Response->GetBoolField(TEXT("found"));
                if (Found)
                {
                    FString Data = Response->GetStringField(TEXT("saveData"));
                    UE_LOG(LogTemp, Log, TEXT("Loaded: %s"), *Data);
                }
            }
        });
}
```

### Get Remote Config

```cpp
void GetAllRemoteConfigs()
{
    FHorizonAPI::Get(TEXT("/api/v1/app/remote-config/all"),
        [](bool bSuccess, TSharedPtr<FJsonObject> Response)
        {
            if (bSuccess && Response.IsValid())
            {
                const TSharedPtr<FJsonObject>* Configs;
                if (Response->TryGetObjectField(TEXT("configs"), Configs))
                {
                    for (const auto& Pair : (*Configs)->Values)
                    {
                        UE_LOG(LogTemp, Log, TEXT("Config: %s = %s"),
                            *Pair.Key, *Pair.Value->AsString());
                    }
                }
            }
        });
}
```

## REST Examples (cURL)

These cURL examples show the raw HTTP requests. Translate them to your preferred Unreal HTTP method.

```bash
# Anonymous signup
curl -X POST https://horizon.pm/api/v1/app/user-management/signup \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "ANONYMOUS", "username": "Player1", "anonymousToken": "unique32chartoken"}'

# Submit score
curl -X POST https://horizon.pm/api/v1/app/leaderboard/submit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "score": 12500}'

# Get remote config
curl "https://horizon.pm/api/v1/app/remote-config/all" \
  -H "X-API-Key: YOUR_API_KEY"

# Save cloud data
curl -X POST https://horizon.pm/api/v1/app/cloud-save/save \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "saveData": "{\"level\":5}"}'

# Load cloud data
curl -X POST https://horizon.pm/api/v1/app/cloud-save/load \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123"}'

# Get news
curl "https://horizon.pm/api/v1/app/news?limit=10&languageCode=en" \
  -H "X-API-Key: YOUR_API_KEY"

# Redeem gift code
curl -X POST https://horizon.pm/api/v1/app/gift-codes/redeem \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code": "ABCD-1234", "userId": "user123"}'

# Submit feedback
curl -X POST https://horizon.pm/api/v1/app/user-feedback/submit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Bug Report", "message": "Description", "userId": "user123", "category": "BUG"}'

# Create user log
curl -X POST https://horizon.pm/api/v1/app/user-logs/create \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"message": "Level complete", "type": "INFO", "userId": "user123"}'
```

## Best Practices for Unreal

- **Cache API key** — Store the API key in a config file or game settings, not hardcoded.
- **Handle async properly** — All HTTP requests are asynchronous. Use delegates or lambdas for responses.
- **Rate limit** — 10 requests/minute. Cache responses and batch operations.
- **Error handling** — Always check HTTP status codes and handle 429 (rate limit) with exponential backoff.
- **Store session tokens** — After sign-in, cache the `accessToken` and `userId` for subsequent requests.
