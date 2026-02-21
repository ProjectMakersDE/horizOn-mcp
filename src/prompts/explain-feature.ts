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
          "news",
          "gift-codes",
          "feedback",
          "user-logs",
          "crash-reporting",
        ])
        .describe("The feature to explain"),
    },
  }, ({ feature }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Explain the horizOn "${feature}" feature in detail.\n\nPlease:\n1. Read the documentation (resource: horizon://docs/${feature})\n2. Explain what it does and when to use it\n3. Show the API endpoints and their parameters\n4. Provide code examples for Godot, Unity, and REST\n5. List tier limits and restrictions\n6. Share best practices and common pitfalls`,
        },
      },
    ],
  }));
}
