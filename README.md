# horizOn MCP Server

[![npm version](https://img.shields.io/npm/v/horizon-mcp)](https://www.npmjs.com/package/horizon-mcp)
[![npm downloads](https://img.shields.io/npm/dm/horizon-mcp)](https://www.npmjs.com/package/horizon-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MCP server for horizOn Backend-as-a-Service** -- gives AI coding assistants documentation, live API tools, and workflow prompts for game and app development.

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

### Resources (13 docs)

Documentation resources are served directly from the MCP server. No API key required.

| URI | Description |
|-----|-------------|
| `horizon://overview` | What is horizOn, core concepts (Account vs User), features, tier system, API structure, and SDKs |
| `horizon://docs/auth` | Authentication methods (Anonymous, Email, Google), endpoints, SDK code examples, and common errors |
| `horizon://docs/leaderboard` | Leaderboard score submission, top entries, user rank, entries around user, with SDK examples |
| `horizon://docs/cloud-save` | Cloud save/load for JSON and binary data, tier size limits, SDK examples |
| `horizon://docs/remote-config` | Server-side key-value configuration: feature flags, game balance, A/B testing. SDK examples |
| `horizon://docs/news` | In-game news and announcements with language filtering. SDK examples |
| `horizon://docs/gift-codes` | Gift code validation and redemption for promotional rewards. SDK examples |
| `horizon://docs/feedback` | Bug reports, feature requests, and general feedback submission. SDK examples |
| `horizon://docs/user-logs` | Server-side event and error tracking. Requires BASIC tier or higher. SDK examples |
| `horizon://api/reference` | Complete API reference for all horizOn App API endpoints with request/response schemas |
| `horizon://quickstart/godot` | Step-by-step guide to integrate horizOn in Godot with GDScript examples |
| `horizon://quickstart/unity` | Step-by-step guide to integrate horizOn in Unity with C# examples |
| `horizon://quickstart/unreal` | Guide to integrate horizOn in Unreal Engine using REST API. C++ and cURL examples |

### Tools (19 tools)

Live API tools that call the horizOn backend. Requires a valid API key.

| Tool | Description |
|------|-------------|
| `horizon_test_connection` | Test connection to the horizOn API (health check) |
| `horizon_signup_anonymous` | Create a new anonymous user account |
| `horizon_signup_email` | Create a new user account with email and password |
| `horizon_signin_email` | Sign in with email and password |
| `horizon_signin_anonymous` | Sign in with an anonymous token |
| `horizon_check_auth` | Check whether a user session is still valid |
| `horizon_submit_score` | Submit a score to the leaderboard |
| `horizon_get_leaderboard_top` | Get the top leaderboard entries |
| `horizon_get_user_rank` | Get a user's leaderboard rank |
| `horizon_get_leaderboard_around` | Get leaderboard entries around a user's position |
| `horizon_save_cloud_data` | Save cloud data for a user |
| `horizon_load_cloud_data` | Load cloud save data for a user |
| `horizon_get_remote_config` | Get a single remote config value by key |
| `horizon_get_all_remote_configs` | Get all remote config values |
| `horizon_get_news` | Get news articles with optional language filtering |
| `horizon_validate_gift_code` | Validate a gift code without redeeming it |
| `horizon_redeem_gift_code` | Redeem a gift code for a user |
| `horizon_submit_feedback` | Submit user feedback (bug reports, feature requests) |
| `horizon_create_log` | Create a server-side log entry (INFO, WARN, ERROR) |

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

## What is horizOn?

horizOn is a multi-tenant Backend-as-a-Service platform built for game and app developers. It provides a managed backend so developers can focus on building their game or app instead of server infrastructure.

Core features:

- Authentication (Anonymous, Email, Google)
- Leaderboards
- Cloud Save
- Remote Config
- News and Announcements
- Gift Codes
- User Feedback
- User Logs

Learn more at [horizon.pm](https://horizon.pm). Install this MCP server via [npm](https://www.npmjs.com/package/horizon-mcp).

## Supported Engines

- **Godot 4.5+** -- GDScript SDK
- **Unity 6** -- C# SDK
- **Unreal Engine** -- REST API (no official SDK)

## Development

```bash
# Clone the repository
git clone https://github.com/nicokimmel/horizOn-mcp.git
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
