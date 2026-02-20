import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "horizon-mcp",
    version: "0.1.0",
  });

  registerAllResources(server);
  registerAllTools(server);

  return server;
}
