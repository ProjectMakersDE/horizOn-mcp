/**
 * Admin-tool registration entry point.
 *
 * Returns true when HORIZON_ACCOUNT_API_KEY is configured and admin tools
 * were registered. Returns false otherwise so the server can stay quiet
 * about an unconfigured admin surface.
 *
 * Further register*Tools() calls (remote-config, news, gift-codes,
 * feedback, user-logs, crashes, SMTP, ...) will be added in M5-M15.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAdminApiClientFromEnv } from "../admin-api-client.js";
import { registerAdminProjectsTools } from "./projects.js";

export function registerAllAdminTools(server: McpServer): boolean {
  const client = createAdminApiClientFromEnv();
  if (!client) {
    return false;
  }

  registerAdminProjectsTools(server);

  return true;
}
