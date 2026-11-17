# horizOn Overview

horizOn is a multi-tenant Backend-as-a-Service for games and apps. The managed service
runs in EU, US and Asia. Base URL: `https://horizon.pm`.

## Account, project and player

- **Account:** the studio or developer, owning the subscription and projects.
- **Project:** selected by a Project API Key. Project UUIDs used by admin tools are
  identifiers, not the secret key value.
- **User:** an app player inside that project, with a separate player session.

Game SDKs and MCP player tools use a Project API Key (`X-API-Key`) for `/api/v1/app/**`.
Player-session routes also need the matching player's Bearer token. Account Keys
(`X-Account-API-Key`) are for trusted administration under `/api/v1/admin/**` and
never belong in a game build. See `horizon://docs/dashboard` for key scopes and
Dashboard-only operations.

## Feature map

Read the matching resource before implementing a feature. A configured quota is not
a substitute for its authentication, permission or hosting requirements.

| Feature | Resource | Purpose |
| --- | --- | --- |
| Authentication | `horizon://docs/auth` | Anonymous, email, Google and Apple player identity |
| Cloud Save | `horizon://docs/cloud-save` | Player saves |
| Leaderboards | `horizon://docs/leaderboard` | Scores, ranks and public profile display |
| Remote Config | `horizon://docs/remote-config` | Balancing and feature flags |
| Localization | `horizon://docs/localization` | Localized UI strings |
| News | `horizon://docs/news` | Published in-game announcements |
| Gift Codes | `horizon://docs/gift-codes` | Promotional rewards with original prepared intents |
| Player Profile | `horizon://docs/player-profile` | Avatar, frame, badges and cosmetic unlocks |
| Feedback | `horizon://docs/feedback` | Bug reports and player suggestions |
| User Logs | `horizon://docs/user-logs` | Player events and errors |
| Crash Reporting | `horizon://docs/crash-reporting` | Sessions, breadcrumbs, reports and groups |
| Email Sending | `horizon://docs/email-sending` | Template-based immediate and scheduled mail |
| Validated Actions | `horizon://docs/validated-actions` | Server-checked runs, rules and state |
| Player Values | `horizon://docs/player-values` | Server-owned balances and atomic offers |
| Statistics | `horizon://docs/statistics` | Atomic counters and UTC reset periods |
| Achievements | `horizon://docs/achievements` | Permanent unlocks and atomic rewards |
| Inbox | `horizon://docs/inbox` | Notices and authoritative reward/return claims |
| Friends | `horizon://docs/friends` | Friend requests, lookup and blocks |
| Groups | `horizon://docs/groups` | Guilds, roles and membership |
| Items | `horizon://docs/items` | Unique inventories and catalog templates |
| Shared Objects | `horizon://docs/shared-objects` | Opaque bytes and scoped queries |
| Matches | `horizon://docs/matches` | Asynchronous multiplayer state and settlement |
| Chat | `horizon://docs/chat` | Hosted direct, group and project messages |
| Marketplace | `horizon://docs/marketplace` | Original-item escrow and atomic settlement |
| Item Gifts | `horizon://docs/item-gifts` | Private one-item offers and protected Inbox returns |

Realtime is a hosted notification transport. Feature contents are still fetched with
the feature's HTTP reads. MCP tools make explicit HTTP calls and do not open a
WebSocket or poll for the game. See the realtime guidance in the relevant feature resource.

## Plans and current limits

The five plans are **FREE, BASIC, PLUS, PRO and ENTERPRISE**. Limits are configurable.
Read `horizon://docs/limits` and the public
[current feature limits](https://horizon.pm/api/v1/public/system/feature-limits)
instead of copying a numeric table into game code. The response has `free`, `basic`,
`plus`, `pro` and `enterprise` objects. Feature-specific limit/config reads provide
additional policies and the current caller context.

Account-wide minute budgets have separate soft and hard thresholds. Feature write
budgets, storage, player counts and per-player capacities have their own scopes.
Handle HTTP 429 using `Retry-After` when present. An uncertain mutation must retain
its original identity as described by that feature.

## Administration and self-hosting

`horizon://docs/dashboard` covers Project/Account Keys, SDK configuration, cosmetics
and operations that require the Dashboard or have no MCP tool.
`horizon://docs/self-hosting` covers simpleServer parity and migration. Changing the
backend URL does not migrate players or saves. SDK config JSON and project content
export JSON are different files.

## SDK quickstarts

| Engine | Resource | Official source |
| --- | --- | --- |
| Unity | `horizon://quickstart/unity` | [Unity SDK](https://github.com/ProjectMakersDE/horizOn-SDK-Unity) |
| Godot | `horizon://quickstart/godot` | [Godot SDK](https://github.com/ProjectMakersDE/horizOn-SDK-Godot) |
| Unreal | `horizon://quickstart/unreal` | [Unreal SDK](https://github.com/ProjectMakersDE/horizOn-SDK-Unreal) |

Use released packages and their included examples. A GitHub release, an engine Store
listing and a running game's installed package can be at different versions.

## Common HTTP status codes

| Code | Meaning | Action |
| --- | --- | --- |
| 400 | Invalid request | Check the feature schema and exact values |
| 401 | Authentication required | Check the key and required player session |
| 403 | Forbidden | Check project, player, scopes and configured access |
| 404 | Missing or hidden resource | Check identity and feature availability |
| 409 | Conflict | Read the feature error and preserve pending intent |
| 422 | Feature rule or capacity refusal | Handle the named error without inventing a new operation |
| 429 | Rate limited | Respect `Retry-After` when present |
| 500 | Server error | Preserve uncertain mutations for explicit recovery |

REST request and response shapes are in `horizon://api/reference`.
