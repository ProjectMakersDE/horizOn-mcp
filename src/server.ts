import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "horizon-mcp",
    version: "0.1.0",
  });

  return server;
}
