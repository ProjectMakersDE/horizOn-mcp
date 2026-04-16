/**
 * Admin-tool registration entry point.
 *
 * Returns true when HORIZON_ACCOUNT_API_KEY is configured and admin tools
 * were registered. Returns false otherwise so the server can stay quiet
 * about an unconfigured admin surface.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createAdminApiClientFromEnv } from "../admin-api-client.js";
import { registerAdminProjectsTools } from "./projects.js";
import { registerAdminRemoteConfigTools } from "./remote-config.js";
import { registerAdminNewsTools } from "./news.js";
import { registerAdminEmailTemplatesTools } from "./email-templates.js";
import { registerAdminGiftCodesTools } from "./gift-codes.js";
import { registerAdminUsersTools } from "./users.js";
import { registerAdminLeaderboardTools } from "./leaderboard.js";
import { registerAdminCloudSaveTools } from "./cloud-save.js";
import { registerAdminFeedbackTools } from "./feedback.js";
import { registerAdminUserLogsTools } from "./user-logs.js";

export function registerAllAdminTools(server: McpServer): boolean {
  const client = createAdminApiClientFromEnv();
  if (!client) {
    return false;
  }

  registerAdminProjectsTools(server);
  registerAdminRemoteConfigTools(server);
  registerAdminNewsTools(server);
  registerAdminEmailTemplatesTools(server);
  registerAdminGiftCodesTools(server);
  registerAdminUsersTools(server);
  registerAdminLeaderboardTools(server);
  registerAdminCloudSaveTools(server);
  registerAdminFeedbackTools(server);
  registerAdminUserLogsTools(server);

  return true;
}
