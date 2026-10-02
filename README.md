# horizOn MCP Server

[![npm version](https://img.shields.io/npm/v/horizon-mcp)](https://www.npmjs.com/package/horizon-mcp)
[![npm downloads](https://img.shields.io/npm/dm/horizon-mcp)](https://www.npmjs.com/package/horizon-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MCP server for horizOn Backend-as-a-Service** 

Gives AI coding assistants documentation, live API tools, and workflow prompts for game and app development.

---

## Quick Install

Add to your MCP client configuration (Claude Desktop, Cursor, etc.):

```json
{
  "mcpServers": {
    "horizOn": {
      "command": "npx",
      "args": ["-y", "horizon-mcp"],
      "env": {
        "HORIZON_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Features

### Resources (18 docs)

Documentation resources are served directly from the MCP server. No API key required.

| URI | Description |
|-----|-------------|
| `horizon://overview` | What is horizOn, core concepts (Account vs User), features, tier system, API structure, and SDKs |
| `horizon://docs/auth` | Authentication methods (Anonymous, Email, Google), endpoints, SDK code examples, and common errors |
| `horizon://docs/leaderboard` | Leaderboard score submission, top entries, user rank, entries around user, player profile per entry, validated only boards, with SDK examples |
| `horizon://docs/cloud-save` | Cloud save/load for JSON and binary data, tier size limits, SDK examples |
| `horizon://docs/remote-config` | Server-side key-value configuration: feature flags, game balance, A/B testing. SDK examples |
| `horizon://docs/localization` | Server-side localized strings across 15 languages: per-key translations, single/all fetch, available languages. SDK examples |
| `horizon://docs/news` | In-game news and announcements with language filtering. SDK examples |
| `horizon://docs/gift-codes` | Gift code validation and redemption for promotional rewards, including cosmetic unlocks via grants. SDK examples |
| `horizon://docs/player-profile` | Player avatar, frame and badges from a per-project cosmetics catalog, unlocks via gift code grants, profile in leaderboard entries. SDK examples |
| `horizon://docs/validated-actions` | Server-checked runs: single-use run tickets with a server seed, SHA-256 input log hash, server-only rules, validated only leaderboards, server-owned player state, start context, evidence upload, admin evidence review with sus packages and package export, rejection codes. SDK examples |
| `horizon://docs/feedback` | Bug reports, feature requests, and general feedback submission. SDK examples |
| `horizon://docs/user-logs` | Server-side event and error tracking. Requires BASIC tier or higher. SDK examples |
| `horizon://docs/crash-reporting` | Crash report submission, session tracking, fingerprinting, breadcrumbs, and auto-regression detection. SDK examples |
| `horizon://docs/email-sending` | Transactional and event-based email delivery to registered users. Templates, scheduling, status tracking, and SMTP integration. SDK examples |
| `horizon://api/reference` | Complete API reference for all horizOn App API endpoints with request/response schemas |
| `horizon://quickstart/godot` | Step-by-step guide to integrate horizOn in Godot with GDScript examples |
| `horizon://quickstart/unity` | Step-by-step guide to integrate horizOn in Unity with C# examples |
| `horizon://quickstart/unreal` | Step-by-step guide to integrate horizOn in Unreal Engine 5.5+ with the official horizOn SDK plugin. C++ and Blueprint examples |

### Tools (34 tools)

Live API tools that call the horizOn backend. Requires a valid API key.

`horizon_submit_score`, `horizon_save_cloud_data`, `horizon_load_cloud_data`, `horizon_redeem_gift_code`, `horizon_get_profile`, `horizon_set_profile`, `horizon_start_run`, `horizon_submit_validated`, `horizon_get_state` and `horizon_upload_evidence` also need the player's session: sign in first and pass the returned `accessToken` as `sessionToken`.

Every tool declares MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), so clients can tell reads from writes. Destructive tools are `horizon_save_cloud_data` (replaces the save), `horizon_set_profile` (replaces the whole profile), `horizon_submit_validated` (consumes the ticket, can spend balances) and `horizon_cancel_email`. The read tools that return an object also declare an `outputSchema` and return `structuredContent` next to the JSON text. Each description names when to use the tool, which sibling to use instead, what it returns and how to recover from its errors.

| Tool | Description |
|------|-------------|
| `horizon_test_connection` | Test connection to the horizOn API (health check) |
| `horizon_signup_anonymous` | Create a new anonymous user account |
| `horizon_signup_email` | Create a new user account with email and password |
| `horizon_signin_email` | Sign in with email and password |
| `horizon_signin_anonymous` | Sign in with an anonymous token |
| `horizon_check_auth` | Check whether a user session is still valid |
| `horizon_list_leaderboards` | List available leaderboard boards for multi-board calls |
| `horizon_submit_score` | Submit a score to the leaderboard (403 `VALIDATED_SUBMIT_REQUIRED` on validated only boards) |
| `horizon_get_leaderboard_top` | Get the top leaderboard entries with each player's profile, optionally by board key |
| `horizon_get_user_rank` | Get a user's leaderboard rank, optionally by board key |
| `horizon_get_leaderboard_around` | Get leaderboard entries around a user's position, optionally by board key |
| `horizon_save_cloud_data` | Save cloud data for a user |
| `horizon_load_cloud_data` | Load cloud save data for a user |
| `horizon_get_remote_config` | Get a single remote config value by key |
| `horizon_get_all_remote_configs` | Get all remote config values |
| `horizon_get_localization` | Get a single localized string by key, optionally for a specific language |
| `horizon_get_all_localizations` | Get all localized strings, optionally for a specific language |
| `horizon_get_localization_languages` | List the languages that have localizations for the app |
| `horizon_get_news` | Get news articles with optional language filtering |
| `horizon_validate_gift_code` | Validate a gift code without redeeming it |
| `horizon_redeem_gift_code` | Redeem a gift code for a user (returns `grantedUnlocks` for codes with cosmetic grants) |
| `horizon_get_profile` | Get a player's profile (avatar, frame, badges), unlocks and the cosmetics catalog |
| `horizon_set_profile` | Replace a player's whole profile (avatar, frame, up to 3 badges) |
| `horizon_start_run` | Start a server-checked run: single-use ticket with a server seed, optionally bound to a board and with a start context (game, content, simulation and replay format versions, content digest, initial state as base64) |
| `horizon_submit_validated` | Submit a run result with the ticket and the SHA-256 input log hash (given, or computed locally from base64 bytes or text), optionally with `earned` server-owned values; returns `sus` (accepted but over a soft threshold); rejections name their `code` |
| `horizon_get_state` | Read the player's server-owned values (balance, earned today, daily cap per value key); read only |
| `horizon_upload_evidence` | Upload the input log (text or base64, encoded locally) of a run whose submit result asked for evidence; rejections name their `code` |
| `horizon_submit_feedback` | Submit user feedback (bug reports, feature requests) |
| `horizon_create_log` | Create a server-side log entry (INFO, WARN, ERROR) |
| `horizon_create_crash_report` | Submit a crash report (grouped by fingerprint, with regression detection) |
| `horizon_create_crash_session` | Register a game session for the crash-free rate |
| `horizon_send_email` | Send a transactional email to a registered user from a template |
| `horizon_cancel_email` | Cancel a pending or scheduled email |
| `horizon_get_email_status` | Get the status of a sent or scheduled email |

### Prompts (4 prompts)

Workflow prompts that guide AI assistants through common horizOn tasks.

| Prompt | Description |
|--------|-------------|
| `integrate-feature` | Generate integration code for a specific horizOn feature in your game engine |
| `setup-auth` | Step-by-step guide to set up horizOn authentication in your project |
| `debug-connection` | Diagnose and fix horizOn connection issues |
| `explain-feature` | Get a detailed explanation of any horizOn feature |

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `HORIZON_API_KEY` | Yes (for tools) | Your horizOn API key. Get one at [horizon.pm](https://horizon.pm) |
| `HORIZON_BASE_URL` | No | API base URL. Defaults to `https://horizon.pm` |

Resources (documentation) work without an API key. Only the live API tools require authentication.

## Admin Tools (v1.2+)

With an **Account Key** (creatable in your horizOn Dashboard -> API Keys -> Create -> **Account Key**), the MCP server exposes additional tools that let Claude manage your dashboard -- projects, remote config, news, email templates, gift codes, users, leaderboards, cloud-save data, crash reports, feedback, user logs, SMTP, and Validated Actions (rules, runs, player values and the evidence review).

### How to get your Account Key

1. Log in to your [horizOn Dashboard](https://horizon.pm/dashboard)
2. Navigate to **API Keys** in the sidebar
3. Click **Create API Key**
4. Select **Account Key** as the key type
5. Choose whether the key can access the entire account, a single Project API Key, or selected feature groups
6. Click **Create** -- your key will be shown **once**. Copy it immediately.
7. Add the key to your MCP configuration (see Setup below)

### Setup

Add both keys to your MCP client configuration:

```json
{
  "mcpServers": {
    "horizOn": {
      "command": "npx",
      "args": ["-y", "horizon-mcp"],
      "env": {
        "HORIZON_API_KEY": "your-project-key (for player-facing tools)",
        "HORIZON_ACCOUNT_API_KEY": "your-account-key (for dashboard tools)"
      }
    }
  }
}
```

Both can be set together or individually. Admin tools only register when the account key is set -- otherwise the server exposes only the original player-facing tools.

### Scope

Account Keys inherit your account's tier (FREE/BASIC/PRO/ENTERPRISE) -- they grant no extra privileges. A key can be full-account, limited to a single Project API Key, limited to selected feature groups, or both. Platform-admin-only endpoints (Blog, Banner, System-Config) are automatically unreachable. A handful of ultra-sensitive endpoints (account deletion, credentials change, key management itself, subscription cancel) require a dashboard session and cannot be called via an Account Key.

When a key is project-scoped, the backend enforces that scope on direct HTTP calls too. Account-wide endpoints or ID-only endpoints that cannot prove project context are rejected for project-scoped keys.

### Tool Groups

Admin tools carry the same annotations as the player tools: list, get and statistics tools are read only, update and delete tools are marked destructive.

| Prefix | Description |
|--------|-------------|
| `horizon_admin_projects_*` | Project API key management (create/update/regenerate/revoke/delete) |
| `horizon_admin_remoteconfig_*` | Remote config CRUD |
| `horizon_admin_news_*` | Multilingual news (titles/messages as `{lang: content}`) |
| `horizon_admin_emailtemplates_*` | Multilingual email templates with variables |
| `horizon_admin_giftcodes_*` | Gift code CRUD + revoke |
| `horizon_admin_users_*` | User management + statistics (no full-list needed) |
| `horizon_admin_leaderboard_*` | Leaderboard entries + statistics |
| `horizon_admin_cloudsave_*` | Cloud save data + statistics |
| `horizon_admin_crashes_*` | Crash groups, reports, statistics |
| `horizon_admin_feedback_*` | Read user feedback |
| `horizon_admin_userlogs_*` | Read user logs |
| `horizon_admin_smtp_*` | Account SMTP configuration (password always returned masked) |
| `horizon_admin_validated_evidence_*` | Validated Actions evidence review: list (top N records or, with `sus: true`, sus packages), quota, metadata (with `susPackage`), log download (base64 or hashes only), package export (ZIP written to a local file, with the integrity headers), delete |
| `horizon_admin_validated_rules_*`, `_usage_get`, `_runs_list`, `_state_*` | Validated Actions configuration: rule set per Project API key (get, replace, delete), run capacity of the hour, recent runs with rejection codes (filter `sus`), server-owned player values (read, support correction) |

## What is horizOn?

horizOn is a multi-tenant Backend-as-a-Service platform built for game and app developers. It provides a managed backend so developers can focus on building their game or app instead of server infrastructure.

Core features:

- Authentication (Anonymous, Email, Google, Apple)
- Leaderboards
- Cloud Save
- Remote Config
- Localization
- News and Announcements
- Gift Codes
- Player Profile (avatar, frame, badges)
- Validated Actions (server-checked runs, validated only leaderboards, server-owned currency)
- User Feedback
- User Logs
- Crash Reporting
- Email Sending

Learn more at [horizon.pm](https://horizon.pm). Install this MCP server via [npm](https://www.npmjs.com/package/horizon-mcp).

## Supported Engines

- **Godot 4.5+** -- GDScript SDK
- **Unity 6** -- C# SDK
- **Unreal Engine 5.5+** -- C++ and Blueprint SDK

## Development

```bash
# Clone the repository
git clone https://github.com/ProjectMakersDE/horizOn-mcp.git
cd horizOn-mcp

# Install dependencies
npm install

# Start the server (development mode)
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## License

MIT
