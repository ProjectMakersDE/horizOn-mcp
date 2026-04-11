import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolves the docs base directory. When running from src/ the markdown files
 * sit next to this module. When running from dist/ we look in src/resources/.
 */
function getDocsBase(): string {
  // Check if MD files live alongside the compiled module (dev / src)
  if (existsSync(join(__dirname, "docs", "overview.md"))) {
    return __dirname;
  }
  // Fallback: resolve from project root into src/resources (production / dist)
  return join(__dirname, "..", "..", "src", "resources");
}

const docsBase = getDocsBase();

function loadDoc(relativePath: string): string {
  return readFileSync(join(docsBase, relativePath), "utf-8");
}

/**
 * Registers all horizOn documentation resources on the given server.
 */
export function registerAllResources(server: McpServer): void {
  // Overview
  server.registerResource(
    "overview",
    "horizon://overview",
    {
      title: "horizOn Overview",
      description:
        "What is horizOn, core concepts (Account vs User), features, tier system, API structure, and SDKs.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://overview",
          mimeType: "text/markdown",
          text: loadDoc("docs/overview.md"),
        },
      ],
    }),
  );

  // Authentication
  server.registerResource(
    "docs-auth",
    "horizon://docs/auth",
    {
      title: "Authentication",
      description:
        "Authentication methods (Anonymous, Email, Google), endpoints, SDK code examples, and common errors.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/auth",
          mimeType: "text/markdown",
          text: loadDoc("docs/auth.md"),
        },
      ],
    }),
  );

  // Leaderboards
  server.registerResource(
    "docs-leaderboard",
    "horizon://docs/leaderboard",
    {
      title: "Leaderboards",
      description:
        "Leaderboard score submission, top entries, user rank, entries around user, with SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/leaderboard",
          mimeType: "text/markdown",
          text: loadDoc("docs/leaderboard.md"),
        },
      ],
    }),
  );

  // Cloud Save
  server.registerResource(
    "docs-cloud-save",
    "horizon://docs/cloud-save",
    {
      title: "Cloud Save",
      description:
        "Cloud save/load for JSON and binary data, tier size limits, SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/cloud-save",
          mimeType: "text/markdown",
          text: loadDoc("docs/cloud-save.md"),
        },
      ],
    }),
  );

  // Remote Config
  server.registerResource(
    "docs-remote-config",
    "horizon://docs/remote-config",
    {
      title: "Remote Config",
      description:
        "Server-side key-value configuration: feature flags, game balance, A/B testing. SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/remote-config",
          mimeType: "text/markdown",
          text: loadDoc("docs/remote-config.md"),
        },
      ],
    }),
  );

  // News
  server.registerResource(
    "docs-news",
    "horizon://docs/news",
    {
      title: "News",
      description:
        "In-game news and announcements with language filtering. SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/news",
          mimeType: "text/markdown",
          text: loadDoc("docs/news.md"),
        },
      ],
    }),
  );

  // Gift Codes
  server.registerResource(
    "docs-gift-codes",
    "horizon://docs/gift-codes",
    {
      title: "Gift Codes",
      description:
        "Gift code validation and redemption for promotional rewards. SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/gift-codes",
          mimeType: "text/markdown",
          text: loadDoc("docs/gift-codes.md"),
        },
      ],
    }),
  );

  // Feedback
  server.registerResource(
    "docs-feedback",
    "horizon://docs/feedback",
    {
      title: "User Feedback",
      description:
        "Bug reports, feature requests, and general feedback submission. SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/feedback",
          mimeType: "text/markdown",
          text: loadDoc("docs/feedback.md"),
        },
      ],
    }),
  );

  // User Logs
  server.registerResource(
    "docs-user-logs",
    "horizon://docs/user-logs",
    {
      title: "User Logs",
      description:
        "Server-side event and error tracking. Requires BASIC tier or higher. SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/user-logs",
          mimeType: "text/markdown",
          text: loadDoc("docs/user-logs.md"),
        },
      ],
    }),
  );

  // Crash Reporting
  server.registerResource(
    "docs-crash-reporting",
    "horizon://docs/crash-reporting",
    {
      title: "Crash Reporting",
      description:
        "Crash report submission, session tracking, fingerprinting, breadcrumbs, and auto-regression detection. SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/crash-reporting",
          mimeType: "text/markdown",
          text: loadDoc("docs/crash-reporting.md"),
        },
      ],
    }),
  );

  // API Reference
  server.registerResource(
    "api-reference",
    "horizon://api/reference",
    {
      title: "App API Reference",
      description:
        "Complete API reference for all horizOn App API endpoints with request/response schemas.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://api/reference",
          mimeType: "text/markdown",
          text: loadDoc("api/app-api.md"),
        },
      ],
    }),
  );

  // Quickstart: Godot
  server.registerResource(
    "quickstart-godot",
    "horizon://quickstart/godot",
    {
      title: "Godot Quickstart",
      description:
        "Step-by-step guide to integrate horizOn in Godot with GDScript examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://quickstart/godot",
          mimeType: "text/markdown",
          text: loadDoc("quickstart/godot.md"),
        },
      ],
    }),
  );

  // Quickstart: Unity
  server.registerResource(
    "quickstart-unity",
    "horizon://quickstart/unity",
    {
      title: "Unity Quickstart",
      description:
        "Step-by-step guide to integrate horizOn in Unity with C# examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://quickstart/unity",
          mimeType: "text/markdown",
          text: loadDoc("quickstart/unity.md"),
        },
      ],
    }),
  );

  // Email Sending
  server.registerResource(
    "docs-email-sending",
    "horizon://docs/email-sending",
    {
      title: "Email Sending",
      description:
        "Transactional and event-based email delivery to registered users. Templates, scheduling, status tracking, and SMTP integration. SDK examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://docs/email-sending",
          mimeType: "text/markdown",
          text: loadDoc("docs/email-sending.md"),
        },
      ],
    }),
  );

  // Quickstart: Unreal
  server.registerResource(
    "quickstart-unreal",
    "horizon://quickstart/unreal",
    {
      title: "Unreal Engine Quickstart",
      description:
        "Guide to integrate horizOn in Unreal Engine using REST API (no official SDK). C++ and cURL examples.",
      mimeType: "text/markdown",
    },
    () => ({
      contents: [
        {
          uri: "horizon://quickstart/unreal",
          mimeType: "text/markdown",
          text: loadDoc("quickstart/unreal.md"),
        },
      ],
    }),
  );
}
