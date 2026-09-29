# horizOn Overview

## What is horizOn?

horizOn is a **multi-tenant Backend-as-a-Service (BaaS)** designed for game and app developers. It provides ready-to-use backend features so developers can focus on building their games instead of managing servers.

**Base URL:** `https://horizon.pm`

## Key Concept: Account vs User

This distinction is critical when working with horizOn:

- **Account** — The developer or company using horizOn. An account owns one or more apps, manages API keys, and configures features via the horizOn Dashboard.
- **User** — The end-user of the developer's app (a player). Users sign up, sign in, save data, submit scores, etc.

The App API (used by SDKs and this MCP server) operates on behalf of **Users** within a developer's **Account**. The `X-API-Key` header identifies which Account/App the request belongs to.

## Core Features

horizOn provides 13 core features:

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Authentication** | Anonymous, email/password, Google OAuth, and Apple sign-in/sign-up |
| 2 | **Cloud Save** | Persist player data across devices (JSON or binary) |
| 3 | **Leaderboards** | Global rankings with score submission and queries |
| 4 | **Remote Config** | Server-side key-value configuration (feature flags, balancing) |
| 5 | **Localization** | Server-side localized strings in 15 languages |
| 6 | **News** | In-game news and announcements with language filtering |
| 7 | **Gift Codes** | Promotional code validation and redemption |
| 8 | **User Feedback** | Bug reports, feature requests, and general feedback |
| 9 | **User Logs** | Server-side event and error tracking per user |
| 10 | **Crash Reporting** | Crash reports grouped by fingerprint, sessions, breadcrumbs, and regression detection |
| 11 | **Email Sending** | Transactional emails to registered users from templates, immediate or scheduled |
| 12 | **Player Profile** | Avatar, frame and badges from a per-project cosmetics catalog, unlocks via gift codes, shown in leaderboards |
| 13 | **Validated Actions** | Server-checked runs: single-use run tickets, server-only rules, validated only leaderboards, server-owned player state such as currency with daily caps (cloud only) |

## Tier System

horizOn offers four pricing tiers with different limits:

| Feature | FREE | BASIC | PRO | ENTERPRISE |
|---------|------|-------|-----|------------|
| **Cloud Save Size** | 1 KB | 5 KB | 20 KB | 250 KB |
| **User Logs** | Not available | Available | Available | Available |
| **Rate Limit** | 10 req/min | 10 req/min | 10 req/min | 10 req/min |
| **All other features** | Available | Available | Available | Available |

**Rate Limit:** All tiers are limited to **10 requests per minute per client**. Plan API calls carefully and use caching.

## API Structure

All App API endpoints follow the pattern:

```
{METHOD} /api/v1/app/{feature}/{action}
```

Every request requires the `X-API-Key` header:

```
X-API-Key: your-api-key-here
Content-Type: application/json
```

## SDKs

| Engine | SDK | Language |
|--------|-----|----------|
| **Godot** | [horizOn SDK for Godot](https://github.com/ProjectMakersDE/horizOn-SDK-Godot) | GDScript |
| **Unity** | [horizOn Cloud SDK for Unity](https://github.com/ProjectMakersDE/horizOn-SDK-Unity) | C# |
| **Unreal Engine** | [horizOn SDK for Unreal Engine](https://github.com/ProjectMakersDE/horizOn-SDK-Unreal) | C++ and Blueprints (Unreal Engine 5.5+) |

## Common HTTP Status Codes

| Code | Meaning | Action |
|------|---------|--------|
| 200 | Success | Request completed successfully |
| 400 | Bad Request | Check request parameters |
| 401 | Unauthorized | Invalid or missing API key |
| 403 | Forbidden | Feature not available for tier, or user not verified |
| 404 | Not Found | Resource does not exist |
| 409 | Conflict | User already exists (signup) |
| 429 | Too Many Requests | Rate limit exceeded, wait and retry |
| 500 | Server Error | Internal server error, retry later |
