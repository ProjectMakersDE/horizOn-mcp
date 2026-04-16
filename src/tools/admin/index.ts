/**
 * Admin-tool registration entry point.
 *
 * Returns true when HORIZON_ACCOUNT_API_KEY is configured and admin tools
 * were registered. Returns false otherwise so the server can stay quiet
 * about an unconfigured admin surface.
 *
 * Further register*Tools() calls (projects, remote-config, news, gift-codes,
 * feedback, user-logs, crashes, SMTP, ...) will be added in M4-M15.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAdminApiClientFromEnv } from "../admin-api-client.js";

export function registerAllAdminTools(server: McpServer): boolean {
  const client = createAdminApiClientFromEnv();
  if (!client) {
    return false;
  }

  // Placeholder — real admin tool modules register here in M4-M15.
  // Intentionally unused client reference so the linter does not flag
  // the parameter and future maintainers see the wiring point.
  void server;
  void client;

  return true;
}
