import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerIntegrateFeaturePrompt(server: McpServer): void {
  server.registerPrompt("integrate-feature", {
    title: "Integrate horizOn Feature",
    description:
      "Generate integration code for a specific horizOn feature in your game engine.",
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
        .describe("The horizOn feature to integrate"),
      engine: z
        .enum(["godot", "unity", "unreal"])
        .describe("The game engine"),
    },
  }, ({ feature, engine }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `I want to integrate the horizOn "${feature}" feature into my ${engine} project.\n\nPlease:\n1. Read the horizOn documentation for this feature (resource: horizon://docs/${feature})\n2. Read the ${engine} quickstart guide (resource: horizon://quickstart/${engine}) and verify the installed SDK version/signatures\n3. Generate complete integration code using that SDK\n4. Include error handling and preserve original operation IDs, bodies and revisions across uncertainty\n5. Show fixture-based verification and the matching explicit HTTP MCP tools where available. Do not perform live writes without authorization.\n\n${["realtime", "chat", "matches"].includes(feature) ? "Also read horizon://docs/realtime. Only chat:<channelId> and matches:<matchId> are subscribable. Explain authenticate, ready, sequential subscription acknowledgements, snapshots, pushed content, resync and reconnect. Use the verified engine APIs and document their payload limitations; do not invent a Unity payload field. Do not add duplicate event-driven HTTP sync beside a built-in Chat watcher. Realtime has no MCP socket tool: verify game WebSocket delivery with a local fixture, separately from HTTP tools. Native Chat/Matches calls can choose socket sends and resolve an unknown result over HTTP using the exact original intent.\n\n" : ""}${["inbox", "friends", "groups", "marketplace", "achievements", "player-profile"].includes(feature) ? "This feature uses HTTP, with no subscribable WebSocket topic. Refresh on open, explicit action or the feature response cadence. Group Chat uses a separate chat topic.\n\n" : ""}${feature === "gift-codes" ? "Gift V2: persist the original seven-field intent before consume, serialize UI actions, provide explicit retry of the original after uncertainty/restart, never automatically advance/reprepare. V1 is closed; surface migration errors. Use fixtures for tests, with no live reward mutation unless explicitly authorized.\n\n" : ""}Use the horizOn SDK for ${engine === "godot" ? "Godot (GDScript)" : engine === "unity" ? "Unity (C#)" : "Unreal Engine (C++ and Blueprints)"}`,
        },
      },
    ],
  }));
}
