import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

export function registerSetupAuthPrompt(server: McpServer): void {
  server.registerPrompt("setup-auth", {
    title: "Setup Authentication",
    description:
      "Step-by-step guide to set up horizOn authentication in your project.",
    argsSchema: {
      engine: z
        .enum(["godot", "unity", "unreal"])
        .describe("Your game engine"),
      method: z
        .enum(["anonymous", "email", "google"])
        .describe("Authentication method"),
    },
  }, ({ engine, method }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Set up horizOn ${method} authentication in my ${engine} project.\n\nPlease:\n1. Read the auth documentation (resource: horizon://docs/auth)\n2. Read the ${engine} quickstart (resource: horizon://quickstart/${engine})\n3. Walk me through the setup step by step\n4. Provide complete code for signup AND signin flows\n5. Include token storage/caching\n6. Show error handling for common issues (invalid credentials, network errors, rate limits)\n7. Test the flow using horizOn MCP tools`,
        },
      },
    ],
  }));
}
