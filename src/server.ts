import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { readFileSync } from "node:fs";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllPrompts } from "./prompts/index.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: "horizon-mcp",
    version: JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version,
  });

  registerAllResources(server);
  registerAllTools(server);
  registerAllPrompts(server);

  return server;
}
