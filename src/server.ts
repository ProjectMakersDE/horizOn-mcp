import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllPrompts } from "./prompts/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "horizon-mcp",
    version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
  }, {
    instructions: process.env.HORIZON_ACCOUNT_API_KEY
      ? "For admin work on a named horizOn project, first call horizon_admin_projects_list with the project's entityName. " +
        "Use the returned id as projectApiKeyId or keyId in the requested tool. Ask the user for clarification only if the lookup cannot identify one project."
      : undefined,
  });

  registerAllResources(server);
  registerAllTools(server);
  registerAllPrompts(server);

  return server;
}
