# Dashboard, API keys and SDK configuration

The [horizOn Dashboard](https://horizon.pm/dashboard) administers the studio account
and its projects. A player session is separate from the studio's Dashboard session.

## Choose the right credential

| Credential | Use | MCP configuration |
| --- | --- | --- |
| Project API Key | Game SDKs and App API (`X-API-Key`). Session-bound routes also require the matching player Bearer token | `HORIZON_API_KEY` |
| Account Key | Trusted admin automation (`X-Account-API-Key`) within the owning account's role and scope | `HORIZON_ACCOUNT_API_KEY` |
| Dashboard account session | Interactive account management and session-only operations | Use the Dashboard, never place its session in a game |

Create and manage these keys in **API Keys**. Keep Account Keys in trusted developer
or server configuration, never in a distributed SDK config or game build. A project
UUID (`apiKeyId`) selects a project for administration. It is not the Project API
Key secret. An Account Key inherits the account's plan and does not grant a higher
role or bypass quota checks.

Account Keys can be unrestricted, limited to one Project API Key, limited to feature
groups, or both. For scoped calls, pass the selected project using the exact query,
path or body field that the tool documents. Adding a random `apiKeyId` to an
unsupported endpoint does not make it project-scoped. Some ID-only endpoints cannot
prove project scope and are refused. `ACCOUNT_KEY_SCOPE_FORBIDDEN` requires checking
the key and route, not switching automatically to an unrestricted key.

Project-scoped Account Keys cannot change Project API Keys or access account-wide
SMTP settings. Feature scopes are coarse groups, not read-only permissions. A key
allowed a group can reach the writes the server permits in that group.

## MCP tools and Dashboard operations

MCP exposes named player and admin tools. A Dashboard page does not imply that the
MCP server has a tool for all of its actions. Check the tool list and its schema.

- **Session-only account actions:** Account Key creation/management, account deletion,
  credential changes and subscription cancellation require a Dashboard session.
- **Platform administration:** banners, blog, system configuration and other internal
  admin pages require the platform role. A customer's Account Key does not grant it.
- **No dedicated MCP admin tools:** SDK Settings, cosmetics catalog/unlock administration,
  project migration export and Item Gifts configuration/recovery/cleanup use the
  Dashboard. Player Profile tools only read/update the player's selected profile.

The last group is an MCP coverage boundary, not a claim that every underlying HTTP
route is session-only. Released Server v1.78.1 accepts an unrestricted Account Key on
some of these admin routes. Their paths have no matching Account Key feature group,
so project- or feature-scoped Account Keys fail closed. Do not invent MCP tool names
or expand a key's permissions as a workaround.

## SDK Settings and the two JSON files

**SDK Settings** provides SDK links and backend host configuration. Its
`horizOn_config.json` download contains `backendDomains` and a placeholder
`apiKey: "horizon_..."`. Replace that placeholder with your **Project API Key**
before importing it. Do not insert an Account Key. Backend-domain/link edits are
platform-admin settings, not per-game balancing controls. Use Remote Config for
runtime game settings.

Import the SDK config with the Unity Config Importer, Godot's horizOn Import Config
tool, or Unreal's horizOn Import Config tool. Check the imported hosts and Project
API Key. Native engine settings also contain runtime options such as timeout and
logging. Their availability and retry policy come from the installed SDK version.
An SDK config download transfers connection settings only, not project content,
players, sessions or saved games.

**API Keys → project migration** downloads `horizon-migration.json`, a different
versioned content export for simpleServer. Read `horizon://docs/self-hosting` before
moving a project. Do not feed the migration file into an SDK importer.

## Cosmetics and player profile

Use the Player Profile Dashboard page to maintain the project's avatar/frame/badge
catalog and grant or revoke player unlocks. The game uses catalog IDs and the player
profile API to select unlocked cosmetics. Creating or displaying a profile does not
create catalog entries or grant unlocks. Gift Codes can grant configured cosmetics,
subject to their own session and prepared-intent contract.

## Verification basis

Checked against Dashboard v1.115.1 and Server v1.78.1 source on 2026-11-17:
[SDK config download](https://github.com/ProjectMakersDE/horizOn-Dashboard/blob/v1.115.1/src/app/features/sdk-settings/services/sdk-settings.service.ts),
[SDK settings permissions](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/src/main/kotlin/com/projectmakers/horizonserver/features/sdksettings/controller/AdminSdkSettingsController.kt),
[Account Key scope enforcement](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/src/main/kotlin/com/projectmakers/horizonserver/core/security/AccountApiKeyScopeFilter.kt).
