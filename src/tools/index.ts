import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConnectionTools } from "./connection.js";
import { registerAuthTools } from "./auth.js";
import { registerLeaderboardTools } from "./leaderboard.js";
import { registerCloudSaveTools } from "./cloud-save.js";
import { registerRemoteConfigTools } from "./remote-config.js";
import { registerNewsTools } from "./news.js";
import { registerGiftCodeTools } from "./gift-codes.js";
import { registerFeedbackTools } from "./feedback.js";
import { registerUserLogTools } from "./user-logs.js";
import { registerCrashReportingTools } from "./crash-reporting.js";
import { registerEmailSendingTools } from "./email-sending.js";

/**
 * Registers all horizOn MCP tools on the given server.
 */
export function registerAllTools(server: McpServer): void {
  registerConnectionTools(server);
  registerAuthTools(server);
  registerLeaderboardTools(server);
  registerCloudSaveTools(server);
  registerRemoteConfigTools(server);
  registerNewsTools(server);
  registerGiftCodeTools(server);
  registerFeedbackTools(server);
  registerUserLogTools(server);
  registerCrashReportingTools(server);
  registerEmailSendingTools(server);
}
