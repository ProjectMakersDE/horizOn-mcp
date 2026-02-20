import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerIntegrateFeaturePrompt } from "./integrate-feature.js";
import { registerSetupAuthPrompt } from "./setup-auth.js";
import { registerDebugConnectionPrompt } from "./debug-connection.js";
import { registerExplainFeaturePrompt } from "./explain-feature.js";

/**
 * Registers all horizOn MCP prompts on the given server.
 */
export function registerAllPrompts(server: McpServer): void {
  registerIntegrateFeaturePrompt(server);
  registerSetupAuthPrompt(server);
  registerDebugConnectionPrompt(server);
  registerExplainFeaturePrompt(server);
}
