import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerDebugConnectionPrompt(server: McpServer): void {
  server.registerPrompt("debug-connection", {
    title: "Debug horizOn Connection",
    description: "Diagnose and fix horizOn connection issues.",
  }, () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `My horizOn integration isn't working. Please help me debug the connection.\n\nSteps:\n1. Use the horizon_test_connection tool to check server reachability and API key validity\n2. If the connection fails, diagnose the issue:\n   - Is HORIZON_API_KEY set correctly?\n   - Is the server URL correct (default: https://horizon.pm)?\n   - Is there a network/firewall issue?\n3. If the connection succeeds but features fail, check:\n   - Is the user authenticated? (try horizon_check_auth)\n   - Are tier limits being hit? (check the feature docs for limits)\n   - Is rate limiting active? (10 requests/minute per client)\n4. Provide specific fixes for any issues found`,
        },
      },
    ],
  }));
}
