import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnectionTools } from "./connection.js";
import { registerAuthTools } from "./auth.js";
import { registerLeaderboardTools } from "./leaderboard.js";
import { registerCloudSaveTools } from "./cloud-save.js";
import { registerRemoteConfigTools } from "./remote-config.js";
import { registerLocalizationTools } from "./localization.js";
import { registerNewsTools } from "./news.js";
import { registerGiftCodeTools } from "./gift-codes.js";
import { registerPlayerProfileTools } from "./player-profile.js";
import { registerValidatedActionsTools } from "./validated-actions.js";
import { registerFeedbackTools } from "./feedback.js";
import { registerUserLogTools } from "./user-logs.js";
import { registerCrashReportingTools } from "./crash-reporting.js";
import { registerEmailSendingTools } from "./email-sending.js";
import { registerAllAdminTools } from "./admin/index.js";

/**
 * Registers all horizOn MCP tools on the given server.
 */
export function registerAllTools(server: McpServer): void {
  registerConnectionTools(server);
  registerAuthTools(server);
  registerLeaderboardTools(server);
  registerCloudSaveTools(server);
  registerRemoteConfigTools(server);
  registerLocalizationTools(server);
  registerNewsTools(server);
  registerGiftCodeTools(server);
  registerPlayerProfileTools(server);
  registerValidatedActionsTools(server);
  registerFeedbackTools(server);
  registerUserLogTools(server);
  registerCrashReportingTools(server);
  registerEmailSendingTools(server);

  const adminEnabled = registerAllAdminTools(server);
  if (adminEnabled) {
    console.error(
      "[horizon-mcp] Admin tools enabled (HORIZON_ACCOUNT_API_KEY set)",
    );
  }
}
