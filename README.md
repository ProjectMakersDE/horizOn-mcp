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

The server exposes **29 documentation resources, 120 player tools and 4 workflow prompts**. An Account Key enables additional scoped admin tools. These counts come from the registered MCP resources, tools and prompts.

### Resources

Documentation resources are served directly from the MCP server. No API key required.

| URI | Description |
|-----|-------------|
| `horizon://docs/marketplace` | Atomic original-item escrow, exact prices, protected Inbox returns and scoped recovery. |
| `horizon://docs/chat` | Direct/group/project text, metadata-only realtime, incremental snapshots, original receipts and scoped moderation. |
| `horizon://docs/matches` | Opaque turn state, exact revisions, immutable reports, bounded deadlines and original ranked-run recovery. |
| `horizon://docs/shared-objects` | Opaque bounded world data, current permissions, exact revisions and trusted ordinary game notices. |
| `horizon://docs/items` | Unique inventory, bounded item properties and atomic server-owned purchases |
| `horizon://docs/groups` | Guilds, roles, bounded member pages and revision-safe membership actions |
| `horizon://docs/friends` | Atomic social relationships, explicit revisions and exact public friend-code lookup |
| `horizon://docs/achievements` | Versioned definitions, permanent completion bits and immediate atomic value rewards |
| `horizon://docs/inbox` | Session inbox, protected rewards, immutable broadcasts, server clock and safe publication retries |
| `horizon://docs/statistics` | Atomic session counters, safe integer batches, explicit original IDs and cache/UTC recovery. SDK and admin examples |
| `horizon://docs/player-values` | Atomic balances and offers, stable operation IDs, all three SDKs, safe retries and support corrections |
| `horizon://overview` | What is horizOn, core concepts (Account vs User), features, tier system, API structure, and SDKs |
| `horizon://docs/auth` | Authentication methods (Anonymous, Email, Google), endpoints, SDK code examples, and common errors |
| `horizon://docs/leaderboard` | Leaderboard score submission, top entries, user rank, entries around user, player profile per entry, validated only boards, with SDK examples |
| `horizon://docs/cloud-save` | Cloud save/load for JSON and binary data, tier size limits, SDK examples |
| `horizon://docs/remote-config` | Server-side key-value configuration: feature flags, game balance, A/B testing. SDK examples |
| `horizon://docs/localization` | Server-side localized strings across 15 languages: per-key translations, single/all fetch, available languages. SDK examples |
| `horizon://docs/news` | In-game news and announcements with language filtering. SDK examples |
| `horizon://docs/gift-codes` | Gift code validation and redemption, cosmetic grants, server-owned value rewards, compact V2 original intents and exact counter strings. SDK examples |
| `horizon://docs/player-profile` | Player avatar, frame and badges from a per-project cosmetics catalog, unlocks via gift code grants, profile in leaderboard entries. SDK examples |
| `horizon://docs/validated-actions` | Server-checked runs: single-use run tickets with a server seed, SHA-256 input log hash, server-only rules, validated only leaderboards, server-owned player state, start context, evidence upload, admin evidence review with sus packages and package export, rejection codes. SDK examples |
| `horizon://docs/feedback` | Bug reports, feature requests, and general feedback submission. SDK examples |
| `horizon://docs/user-logs` | Server-side event and error tracking. Requires BASIC tier or higher. SDK examples |
| `horizon://docs/crash-reporting` | Crash report submission, session tracking, fingerprinting, breadcrumbs, and auto-regression detection. SDK examples |
| `horizon://api/reference` | Complete API reference for all horizOn App API endpoints with request/response schemas |
| `horizon://quickstart/godot` | Step-by-step guide to integrate horizOn in Godot with GDScript examples |
| `horizon://quickstart/unity` | Step-by-step guide to integrate horizOn in Unity with C# examples |
| `horizon://docs/email-sending` | Transactional and event-based email delivery to registered users. Templates, scheduling, status tracking, and SMTP integration. SDK examples |
| `horizon://quickstart/unreal` | Step-by-step guide to integrate horizOn in Unreal Engine 5.5+ with the official horizOn SDK plugin. C++ and Blueprint examples |

### Player tools

Live API tools that call the horizOn backend. Requires a valid API key.

`horizon_submit_score`, `horizon_save_cloud_data`, `horizon_load_cloud_data`, `horizon_prepare_gift_code`, `horizon_redeem_gift_code`, `horizon_get_profile`, `horizon_set_profile`, `horizon_start_run`, `horizon_submit_validated`, `horizon_get_state` and `horizon_upload_evidence` also need the player's session: sign in first and pass the returned `accessToken` as `sessionToken`.

The four player-value tools also require the same player session. Never generate another operation ID automatically after an uncertain result.

Every tool declares MCP annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`), so clients can tell reads from writes. Examples of destructive tools include `horizon_save_cloud_data` (replaces the save), `horizon_set_profile` (replaces the whole profile), `horizon_submit_validated` (consumes the ticket, can spend balances) and `horizon_cancel_email`, plus `horizon_purchase_player_value_offer` and `horizon_adjust_player_value` (debit or credit exactly once per persisted operation ID). Many read tools that return an object also declare an `outputSchema` and return `structuredContent` next to the JSON text. Each description names when to use the tool, which sibling to use instead, what it returns and how to recover from its errors.

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
| `horizon_save_cloud_data` | Save cloud data for a user, optionally only at an `expectedRevision` (409 on conflict) |
| `horizon_load_cloud_data` | Load cloud save data for a user, with its `revision` |
| `horizon_get_remote_config` | Get a single remote config value by key |
| `horizon_get_all_remote_configs` | Get all remote config values |
| `horizon_get_localization` | Get a single localized string by key, optionally for a specific language |
| `horizon_get_all_localizations` | Get all localized strings, optionally for a specific language |
| `horizon_get_localization_languages` | List the languages that have localizations for the app |
| `horizon_get_news` | Get news articles with optional language filtering |
| `horizon_validate_gift_code` | Validate a gift code without redeeming it |
| `horizon_prepare_gift_code` | Read-only V2 preparation; persist all seven original intent fields before consume |
| `horizon_redeem_gift_code` | Explicit consume/retry of that saved `intent`; current state on replay, no automatic replacement or V1 translation |
| `horizon_get_profile` | Get a player's profile (avatar, frame, badges), unlocks and the cosmetics catalog |
| `horizon_set_profile` | Replace a player's whole profile (avatar, frame, up to 3 badges) |
| `horizon_get_player_values` | Read balances and operation window with the active player session |
| `horizon_get_player_value_offers` | Read configured offers for the player |
| `horizon_purchase_player_value_offer` | Purchase atomically with a caller-persisted operation ID |
| `horizon_adjust_player_value` | Adjust within explicitly enabled limits with a stable ID and reason |
| `horizon_start_run` | Start a server-checked run: single-use ticket with a server seed, optionally bound to a board and with a start context (game, content, simulation and replay format versions, content digest, initial state as base64) |
| `horizon_submit_validated` | Submit a run result with the ticket and the SHA-256 input log hash (given, or computed locally from base64 bytes or text), optionally with `earned` server-owned values; returns `sus` (accepted but over a soft threshold); rejections name their `code` |
| `horizon_get_state` | Read the player's server-owned values (balance, earned today, daily cap per value key); read only |
| `horizon_upload_evidence` | Upload the input log (text or base64, encoded locally) of a run whose submit result asked for evidence; rejections name their `code` |
| `horizon_get_statistics` | Reads a player's statistics snapshot and server operation window. |
| `horizon_get_statistics_definitions` | Reads the project's statistics catalog conditionally by version. |
| `horizon_update_statistics` | Applies one explicit atomic session batch with a caller-persisted operation ID. |
| `horizon_get_achievements` | Reads visible achievement definitions and permanent completion bits. |
| `horizon_unlock_achievement` | Unlocks one configured manual achievement once for the authenticated player. |
| `horizon_deliver_achievement_rewards` | Reads compatibility reward status for up to eight original achievement keys. |
| `horizon_get_friends` | Reads friends, incoming/outgoing requests, blocks and current limits. |
| `horizon_find_player` | Finds one public player by exact UUID or canonical H- friend code in this project. |
| `horizon_send_friend_request` | Sends Friend Request using the reviewed player revision. |
| `horizon_accept_friend_request` | Accepts Friend Request using the reviewed player revision. |
| `horizon_decline_friend_request` | Declines Friend Request using the reviewed player revision. |
| `horizon_cancel_friend_request` | Cancels Friend Request using the reviewed player revision. |
| `horizon_remove_friend` | Removes Friend using the reviewed player revision. |
| `horizon_block_player` | Blocks Player using the reviewed player revision. |
| `horizon_unblock_player` | Unblocks Player using the reviewed player revision. |
| `horizon_get_groups` | Reads my groups using a matching player session. |
| `horizon_get_group` | Reads group using a matching player session. |
| `horizon_get_group_members` | Reads group members using a matching player session. |
| `horizon_get_group_pending` | Reads group pending requests using a matching player session. |
| `horizon_create_group` | Creates a fresh server-identified group and its leader atomically. |
| `horizon_update_group` | Replaces the complete group metadata and private JSON object. |
| `horizon_join_group` | Applies the explicit join group action using the reviewed group revision. |
| `horizon_request_group_join` | Applies the explicit request group join action using the reviewed group revision. |
| `horizon_invite_group_player` | Applies the explicit invite group player action using the reviewed group revision. |
| `horizon_accept_group_invite` | Applies the explicit accept group invite action using the reviewed group revision. |
| `horizon_decline_group_invite` | Applies the explicit decline group invite action using the reviewed group revision. |
| `horizon_cancel_group_invite` | Applies the explicit cancel group invite action using the reviewed group revision. |
| `horizon_accept_group_request` | Applies the explicit accept group request action using the reviewed group revision. |
| `horizon_decline_group_request` | Applies the explicit decline group request action using the reviewed group revision. |
| `horizon_cancel_group_request` | Applies the explicit cancel group request action using the reviewed group revision. |
| `horizon_leave_group` | Applies the explicit leave group action using the reviewed group revision. |
| `horizon_remove_group_member` | Applies the explicit remove group member action using the reviewed group revision. |
| `horizon_set_group_member_role` | Applies the explicit set group member role action using the reviewed group revision. |
| `horizon_transfer_group_leadership` | Applies the explicit transfer group leadership action using the reviewed group revision. |
| `horizon_delete_group` | Applies the explicit delete group action using the reviewed group revision. |
| `horizon_get_items` | Reads the player's bounded unique item inventory. |
| `horizon_get_item_catalog` | Reads one bounded item template page, including archived templates. |
| `horizon_adjust_item` | Adjusts Item Properties using the reviewed inventory revision. |
| `horizon_equip_item` | Sets Item Equipped State using the reviewed inventory revision. |
| `horizon_discard_item` | Discards Item using the reviewed inventory revision. |
| `horizon_get_shared_collections` | Reads one permanent collection catalog page. |
| `horizon_get_shared_usage` | Reads the current player's count and creation precondition for one collection. |
| `horizon_get_shared_object` | Reads one object under current permissions. |
| `horizon_query_shared_objects` | Reads one bounded metadata-selected object page. |
| `horizon_create_shared_object` | Creates one server-ID object using the original owner-usage revision. |
| `horizon_update_shared_object` | Replaces one object's opaque bytes and configured search data under its exact revision. |
| `horizon_delete_shared_object` | Deletes one exact-revision object and refunds its stored charge. |
| `horizon_get_matches` | Reads the player's bounded active, invited and recent match summaries. |
| `horizon_get_match_limits` | Reads the player's five-tier limits and project capabilities. |
| `horizon_find_open_matches` | Reads one strength-filtered open-lobby page under current blocks and active-owner checks. |
| `horizon_get_match` | Reads one currently authorized match snapshot. |
| `horizon_create_match` | Creates one server-ID lobby under the original player-ledger revision. |
| `horizon_join_match` | Executes join match under the exact original revision. |
| `horizon_decline_match_invite` | Executes decline match invitation under the exact original revision. |
| `horizon_start_match` | Executes start match under the exact original revision. |
| `horizon_submit_match_turn` | Executes submit match turn under the exact original revision. |
| `horizon_advance_match_timeout` | Executes advance match timeout under the exact original revision. |
| `horizon_leave_match` | Executes leave match under the exact original revision. |
| `horizon_cancel_match` | Executes cancel match lobby under the exact original revision. |
| `horizon_report_match_result` | Records this participant's immutable report for the frozen final state. |
| `horizon_start_match_ranked_run` | Creates or recovers one original match-bound validated run after complete consensus. |
| `horizon_get_chat_limits` | Reads five-tier bounds, current moderation and hosted capabilities. |
| `horizon_open_chat_channel` | Opens deterministic direct, group or project chat under current permissions. |
| `horizon_sync_chat_channel` | Reads an authorized incremental snapshot after subscription resync/event or explicit user action. |
| `horizon_send_chat_message` | Sends plain text once or explicitly replays the exact original operation. |
| `horizon_get_chat_operation` | Reads the current player's retained original send receipt. |
| `horizon_report_chat_message` | Reports one currently visible message with the original reason. |
| `horizon_get_marketplace_limits` | Reads current own marketplace state or configured limits. |
| `horizon_get_marketplace` | Reads current own marketplace state or configured limits. |
| `horizon_get_marketplace_rules` | Reads one revision-consistent bounded rule page. |
| `horizon_query_marketplace_listings` | Reads one bounded active-listing page by item and price. |
| `horizon_get_marketplace_listing` | Reads one authorized listing or original own operation receipt. |
| `horizon_get_marketplace_operation` | Reads one authorized listing or original own operation receipt. |
| `horizon_create_marketplace_listing` | Lists one original unequipped item at the explicitly approved price and fee configuration. |
| `horizon_buy_marketplace_listing` | Purchases the exact listing under its original revision, currency and price. |
| `horizon_cancel_marketplace_listing` | Cancels the original listing revision into a protected pending item return. |
| `horizon_retry_marketplace_return` | Attempts one explicitly requested pending return delivery for the current return owner. |
| `horizon_get_inbox` | Reads targeted messages and eligible project broadcasts, counters and server polling interval. |
| `horizon_mark_inbox_read` | Marks an inbox entry read for the authenticated player. |
| `horizon_claim_inbox` | Claims an inbox reward once for the authenticated player. |
| `horizon_remove_inbox` | Removes an eligible inbox entry for the authenticated player. |
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
| `HORIZON_ACCOUNT_API_KEY` | No | Account Key for additional scoped dashboard admin tools |

Resources (documentation) work without an API key. Only the live API tools require authentication. Session-bound tools also require the matching player session and declare `userId` and `sessionToken` in their input schemas.

Feature availability follows the selected backend and project configuration. Realtime, chat, Validated Actions and ranked match validation require hosted horizOn. The self-hosted simpleServer supports a subset of the REST APIs. MCP tools make explicit HTTP calls and do not create a background WebSocket connection, polling loop or automatic trading/retry process.

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

Account Keys inherit your account's tier (FREE/BASIC/PLUS/PRO/ENTERPRISE) -- they grant no extra privileges. A key can be full-account, limited to a single Project API Key, limited to selected feature groups, or both. Platform-admin-only endpoints (Blog, Banner, System-Config) are automatically unreachable. A handful of ultra-sensitive endpoints (account deletion, credentials change, key management itself, subscription cancel) require a dashboard session and cannot be called via an Account Key.

When a key is project-scoped, the backend enforces that scope on direct HTTP calls too. Account-wide endpoints or ID-only endpoints that cannot prove project context are rejected for project-scoped keys.

### Tool Groups

Admin tools carry the same annotations as the player tools: list, get and statistics tools are read only, update and delete tools are marked destructive.

| Prefix | Description |
|--------|-------------|
| `horizon_admin_statistics_*`, `horizon_admin_achievements_*` | Configure definitions and inspect owned player progression |
| `horizon_admin_friends_*`, `horizon_admin_groups_*` | Inspect scoped relationships, groups and configured limits |
| `horizon_admin_items_*`, `horizon_admin_shared_*` | Manage item catalogs, owned collections and explicit cleanup |
| `horizon_admin_matches_*`, `horizon_admin_chat_*` | Inspect asynchronous matches and manage hosted chat/moderation |
| `horizon_admin_marketplace_*`, `horizon_admin_inbox_*` | Manage marketplace rules, scoped operations and durable inbox notices |
| `horizon_admin_localization_*` | Manage scoped localization entries |
| `horizon_admin_player_values_*` | Read/replace catalogue with If-Match, inspect minimal guards and correct balances with an original note/hash |
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
- Player Values (atomic configured purchases, safe adjustments, minimal public replay guards)
- Statistics, inbox rewards and achievements
- Friends, blocklists and groups
- Item catalogs, unique inventory and marketplace escrow/trades
- Shared objects with scoped permissions and asynchronous matches
- Hosted chat, with realtime managers provided by the native SDKs
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

## Statistics tools

`horizon_get_statistics`, `horizon_get_statistics_definitions` and `horizon_update_statistics` expose explicit session counters. Persist the original timestamp:UUID and immutable batch before posting; after a timeout reuse that intent, never generate a replacement ID automatically. Read `horizon://docs/statistics` or use `integrate-feature` with `feature=statistics` for engine guidance. Four Account Key tools inspect/replace definitions with If-Match, inspect one owned player and read tier limits (`horizon_admin_statistics_*`). Statistics are separate from player values.

## Inbox tools

Four player tools read, mark read, claim and remove inbox entries with the active session. Four `horizon_admin_inbox_*` tools manage immutable broadcasts or inspect an owned player with an INBOX-scoped Account Key. Read `horizon://docs/inbox` before publishing: persist the exact intent, use serverTime for new timestamps, and retain the original ID after an uncertain response. Protected rewards never silently expire or disappear.

### Achievements

`horizon_get_achievements`, `horizon_unlock_achievement` and `horizon_deliver_achievement_rewards`
expose permanent completion and immediate atomic Player Values rewards. The compatibility delivery
tool only reads legacy status. Four `horizon_admin_achievements_*` tools manage
the versioned catalog and inspect owned players with ACHIEVEMENTS scope. Read
`horizon://docs/achievements` for hidden-definition caching, original-key replay and verified cold
settlement of legacy originals. New unlocks create no personal Inbox reward/history copy.
Engine prompts accept `feature=achievements`.

### Friends

`horizon_get_friends`, `horizon_find_player` and seven explicit social-action tools preserve reviewed
revisions and pending request IDs. Two read-only `horizon_admin_friends_*` tools inspect owned state
and current limits. Read `horizon://docs/friends`; both engine prompts accept `feature=friends`.
After an uncertain response, read and reconcile the snapshot before any new player-confirmed action.

### Groups

Twenty player tools cover group snapshots, bounded member pages, pending entries, creation, metadata
and fourteen explicit membership/role actions. Six read-only `horizon_admin_groups_*` tools inspect
owned projects. All writes preserve reviewed revisions and pending IDs. Read `horizon://docs/groups`;
both engine prompts accept `feature=groups`. Uncertain writes are never retried automatically.

## Items

Five player tools read inventory/catalog and explicitly adjust, equip or discard an instance. Four
`horizon_admin_items_*` tools inspect owned state, page the catalog, edit one template using If-Match
and read tier limits. Player-value offers accept bounded `itemRewards` and grant them atomically with
the debit. Read `horizon://docs/items`; both engine prompts accept `feature=items`.

## Shared Objects

Seven player tools expose bounded opaque shared objects, typed queries and exact-revision writes.
Ten `horizon_admin_shared_*` tools manage owned collections and explicit cleanup. A separate
`horizon_admin_inbox_send_ordinary` tool uses INBOX scope for a trusted backend's durable notice
intent. Read `horizon://docs/shared-objects`; both engine prompts accept `feature=shared-objects`.
Native SDK/PHP/deployment readiness must be checked against the installed version.

### Configured policies and technical frames

The new feature tools forward higher/lower current System Config policies rather than treating
tier defaults as maxima. Groups expose eleven policies; explicit pages may exceed50 and the
default page1 remains usable after lowering. PV supports256 lifetime identities, configured
offer counts above1000 and up to256 correction keys. Achievement catalogs can exceed the former
500-key default within current active/lifetime policies and their1 MiB frame. Retained responses
are passed through completely after reductions; MCP never truncates a result to a current quota.

Technical bounds stay separate: Shared has a1 MiB decoded object/query envelope and1402200-byte
write frame; Matches accepts up to14999552 decoded state bytes (14648KiB) within its20003500-byte
create/turn frame. Groups use the complete16 MiB BSON envelope and100663296-byte create/update
HTTP frame, with configured name/description/data/depth policies. Fixed item property/template/
delta/grant formats, three Shared search fields and current Chat text/window bounds remain.
Validation adds no limits fetch, pagination, retry or database request. These are representation
bounds, not a throughput, memory-use or cluster-admission guarantee.

## Asynchronous Matches

Fourteen player tools and seven scoped admin tools cover bounded lobbies, opaque turns, immutable
result reports and original match-bound ranked-run recovery. Writes keep exact revisions and
make one HTTP attempt. Consensus does not award automatic rewards. simpleServer supports ordinary
REST and explicitly excludes ranked validation/realtime. Read `horizon://docs/matches`; engine
prompts accept `feature=matches`.

### Hosted Chat (TASK-1014)

Six app tools cover capabilities, deterministic channel open, incremental sync, original send,
receipt reconciliation and reporting. Twelve CHAT-scoped admin tools expose word filters,
metadata/messages, report moderation, mute/ban and bounded cleanup. Read
`horizon://docs/chat`; engine prompts accept `feature=chat`. simpleServer explicitly returns
501 NOT_SUPPORTED for chat. These HTTP tools do not create a background WebSocket connection
or polling loop. Use the existing native realtime managers for interactive feeds.

## Marketplace

The ten player and fourteen scoped operator tools preserve original-item escrow, atomic
currency settlement, exact original intent and lossless Inbox returns. Read
`horizon://docs/marketplace` for routes, original revisions, five-tier limits and recovery.
Engine prompts accept `feature=marketplace`. No automatic trading, price polling or retries.
