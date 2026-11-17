import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerExplainFeaturePrompt(server: McpServer): void {
  server.registerPrompt("explain-feature", {
    title: "Explain horizOn Feature",
    description: "Get a detailed explanation of any horizOn feature.",
    argsSchema: {
      feature: z
        .enum([
          "auth",
          "leaderboard",
          "cloud-save",
          "remote-config",
          "localization",
          "news",
          "gift-codes",
          "player-profile",
          "player-values",
          "validated-actions",
          "statistics",
          "achievements",
          "friends",
          "groups",
          "items",
          "shared-objects",
          "matches",
          "realtime",
          "chat",
          "marketplace",
          "item-gifts",
          "inbox",
          "feedback",
          "user-logs",
          "crash-reporting",
          "email-sending",
        ])
        .describe("The feature to explain"),
    },
  }, ({ feature }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Explain the horizOn "${feature}" feature in detail.\n\nPlease:\n1. Read the documentation (resource: horizon://docs/${feature})\n2. Explain what it does and when to use it\n3. Show the API endpoints and their parameters\n4. Provide code examples matching verified Godot, Unity, Unreal and REST contracts\n5. List current limits and restrictions\n6. Share best practices and common pitfalls\n\n${["realtime", "chat", "matches"].includes(feature) ? "Also read horizon://docs/realtime. Explain both HTTP preflight/authorization routes and the separate WebSocket protocol, with only chat/matches topics, pushed content versus missing-payload fallback, subscription snapshots, socket sends and exact SDK version limitations. MCP tools are explicit HTTP calls and do not test socket delivery. Do not describe all SDK callbacks as payload-aware or add duplicate sync beside built-in Chat watchers." : ""}${["inbox", "friends", "groups", "marketplace", "achievements", "player-profile"].includes(feature) ? "This feature uses HTTP and has no subscribable WebSocket topic. Group Chat has a separate chat topic." : ""}`,
        },
      },
    ],
  }));
}
