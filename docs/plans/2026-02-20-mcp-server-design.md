# horizOn MCP Server - Design Document

**Date:** 2026-02-20
**Status:** Approved

## 1. Purpose

Build an MCP (Model Context Protocol) server for horizOn, a multi-tenant Backend-as-a-Service platform for game and app developers. The MCP server enables Vibe Coders and AI-first developers to integrate horizOn into their projects without leaving their IDE (Claude Code, Cursor, etc.).

## 2. Target Audience

- **Vibe Coders / AI-First developers** who use AI tools (Claude Code, Cursor, Windsurf) and want to integrate horizOn by describing what they need in natural language
- **Game Engine support:** Godot 4.5+, Unity 6, Unreal Engine (REST-based, no SDK)

## 3. Architecture: Hybrid Approach

The MCP server combines three pillars:

1. **Resources** - Curated documentation and API reference (works offline, no API key needed)
2. **Tools** - Live API interaction via the horizOn App API (requires API key)
3. **Prompts** - Pre-built workflow templates for common tasks

### 3.1 Project Structure

```
horizOn-mcp/
├── src/
│   ├── index.ts                 # Entry point (stdio transport)
│   ├── server.ts                # MCP Server setup & registration
│   ├── resources/               # MCP Resources (Documentation)
│   │   ├── docs/                # Feature documentation (Markdown)
│   │   │   ├── auth.md
│   │   │   ├── leaderboard.md
│   │   │   ├── cloud-save.md
│   │   │   ├── remote-config.md
│   │   │   ├── news.md
│   │   │   ├── gift-codes.md
│   │   │   ├── feedback.md
│   │   │   └── user-logs.md
│   │   ├── api/
│   │   │   └── app-api.md       # Full App API reference
│   │   ├── quickstart/
│   │   │   ├── godot.md
│   │   │   ├── unity.md
│   │   │   └── unreal.md        # REST-based (no SDK)
│   │   ├── overview.md          # What is horizOn
│   │   └── index.ts             # Resource registration
│   ├── tools/                   # MCP Tools (Live API)
│   │   ├── connection.ts        # test_connection
│   │   ├── auth.ts              # signup, signin, check_auth
│   │   ├── leaderboard.ts       # submit_score, get_top, get_rank
│   │   ├── cloud-save.ts        # save, load
│   │   ├── remote-config.ts     # get_config, get_all_configs
│   │   ├── news.ts              # get_news
│   │   ├── gift-codes.ts        # validate, redeem
│   │   ├── feedback.ts          # submit_feedback
│   │   ├── user-logs.ts         # create_log
│   │   ├── api-client.ts        # Shared HTTP client
│   │   └── index.ts             # Tool registration
│   └── prompts/                 # MCP Prompts (Workflows)
│       ├── integrate-feature.ts
│       ├── setup-auth.ts
│       ├── debug-connection.ts
│       └── index.ts
├── package.json
├── tsconfig.json
└── README.md
```

## 4. Resources (Documentation)

Resources provide curated knowledge the AI can access. They work without an API key.

| URI | Description |
|-----|-------------|
| `horizon://overview` | What is horizOn, features, concepts (Account vs User), tier limits |
| `horizon://docs/auth` | Authentication: Anonymous, Email, Google. Token handling. Code examples (Godot, Unity, REST) |
| `horizon://docs/leaderboard` | Score submission, top lists, rank queries, best practices |
| `horizon://docs/cloud-save` | Save/load patterns, size limits per tier, data formats |
| `horizon://docs/remote-config` | Key-value concept, feature flags, type-safe access |
| `horizon://docs/news` | Loading announcements, language filters, pagination |
| `horizon://docs/gift-codes` | Validation, redemption, reward parsing |
| `horizon://docs/feedback` | Bug reports, feature requests, categories |
| `horizon://docs/user-logs` | Log levels (INFO/WARN/ERROR), event tracking, error codes |
| `horizon://api/reference` | Complete App API reference with request/response schemas |
| `horizon://quickstart/godot` | Godot SDK installation, config import, first integration |
| `horizon://quickstart/unity` | Unity SDK installation, config import, first integration |
| `horizon://quickstart/unreal` | REST API usage in Unreal (no SDK), HTTP plugin setup |

Each feature doc contains:
1. What it does (1-2 sentences)
2. Key concepts (e.g., tier limits)
3. API endpoints (request/response examples)
4. Code examples for Godot (GDScript), Unity (C#), and REST (cURL/HTTP)
5. Common errors and solutions

## 5. Tools (Live API)

All tools use the **App API** (`/api/v1/app/`) with API key authentication (`X-API-Key` header).

### 5.1 Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `HORIZON_API_KEY` | For tools | - | API key from horizOn dashboard |
| `HORIZON_BASE_URL` | No | `https://horizon.pm` | Backend URL |

### 5.2 Tool List

| Tool | Parameters | Description |
|------|-----------|-------------|
| `horizon_test_connection` | - | Check server reachability and API key validity |
| `horizon_signup_anonymous` | `displayName` | Create anonymous user |
| `horizon_signup_email` | `email, password, displayName` | Create email user |
| `horizon_signin_email` | `email, password` | Sign in user, returns token |
| `horizon_check_auth` | `token` | Validate auth token |
| `horizon_submit_score` | `userId, score` | Submit score to leaderboard |
| `horizon_get_leaderboard_top` | `limit?` (default 10) | Get top leaderboard entries |
| `horizon_get_user_rank` | `userId` | Get user's rank |
| `horizon_save_cloud_data` | `userId, data` | Save JSON data |
| `horizon_load_cloud_data` | `userId` | Load saved data |
| `horizon_get_remote_config` | `key` | Get single config value |
| `horizon_get_all_remote_configs` | - | Get all config values |
| `horizon_get_news` | `limit?, languageCode?` | Load news/announcements |
| `horizon_validate_gift_code` | `code` | Check if gift code is valid |
| `horizon_redeem_gift_code` | `code, userId` | Redeem a gift code |
| `horizon_submit_feedback` | `userId, title, message, type?` | Submit user feedback |
| `horizon_create_log` | `userId, message, type, errorCode?` | Create log entry |

### 5.3 API Client

Central HTTP client handling:
- API key injection via `X-API-Key` header
- JSON content type
- Structured error responses with HTTP status and horizOn error details
- Graceful degradation when no API key is configured

### 5.4 Error Handling

- **Success**: Returns API response data as JSON
- **Error**: Clear error message with HTTP status code and horizOn error details
- **No API Key**: Returns message that `HORIZON_API_KEY` env var must be set
- **Network Error**: Returns connectivity troubleshooting guidance

## 6. Prompts (Workflows)

Pre-built prompt templates for common developer tasks:

| Prompt | Parameters | Purpose |
|--------|-----------|---------|
| `integrate-feature` | `feature`, `engine` | Reads feature docs + quickstart, generates integration code |
| `setup-auth` | `engine`, `method` | Step-by-step auth setup with code |
| `debug-connection` | - | Diagnostic workflow: tests connection, checks API key, suggests fixes |
| `explain-feature` | `feature` | Explains a feature with examples and best practices |

## 7. Technical Setup

- **Package name:** `horizon-mcp` (npm)
- **Binary:** `horizon-mcp` (via `bin` in package.json)
- **Runtime:** Node.js 18+
- **Transport:** stdio
- **Dependencies:**
  - `@modelcontextprotocol/sdk` - MCP TypeScript SDK
  - `zod` - Input validation for tool parameters

### 7.1 End-User Installation

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

### 7.2 Graceful Degradation

- **No API Key**: All Resources (docs) work. Tools return a helpful message asking to set `HORIZON_API_KEY`.
- **No Internet**: Resources still work (embedded). Tools return connection error guidance.

## 8. horizOn Context Summary

horizOn is a multi-tenant BaaS with:
- **8 core features**: Auth, Cloud Save, Leaderboards, Remote Config, News, Gift Codes, Feedback, User Logs
- **3 API groups**: Public (no auth), Admin (session auth), App (API key auth) - MCP uses App API
- **Key concept**: Account (developer) vs User (end-user of developer's app)
- **Tier system**: FREE, BASIC, PRO, ENTERPRISE - different limits per feature
- **SDKs**: Godot (GDScript), Unity (C#) - Unreal via REST
- **Base URL**: `https://horizon.pm`
- **App API path**: `/api/v1/app/{feature}/{action}`
