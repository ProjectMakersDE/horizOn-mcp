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
          "news",
          "gift-codes",
          "feedback",
          "user-logs",
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
          text: `I want to integrate the horizOn "${feature}" feature into my ${engine} project.\n\nPlease:\n1. Read the horizOn documentation for this feature (resource: horizon://docs/${feature})\n2. Read the ${engine} quickstart guide (resource: horizon://quickstart/${engine})\n3. Generate complete, production-ready integration code\n4. Include error handling and best practices\n5. Show how to test it works using the horizOn MCP tools\n\nUse the horizOn SDK for ${engine === "godot" ? "Godot (GDScript)" : engine === "unity" ? "Unity (C#)" : "Unreal Engine (REST/HTTP, no SDK)"}`,
        },
      },
    ],
  }));
}
