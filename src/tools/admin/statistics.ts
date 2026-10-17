import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getAdminClient, noAdminClientResponse, jsonResponse, errorResponse, describeTool, ADMIN_AUTH, READ_ONLY, DESTRUCTIVE_WRITE } from "./_utils.js";
import { statisticDefinition, statisticVersion } from "../statistics.js";

const PATH = "/api/v1/admin/statistics";
const project = { projectApiKeyId: z.string().uuid().describe("Project API key UUID (sent as apiKeyId)") };
const requires = "An Account Key with full-account access or STATISTICS feature scope. A project-scoped key can read and replace the catalog only for its matching project; project and feature restrictions both apply.";
const errors = "404 API_KEY_NOT_FOUND/PLAYER_NOT_FOUND: choose an owned project/player with horizon_admin_projects_list. 409 REVISION_CONFLICT: use horizon_admin_statistics_definitions_get and reconcile; never overwrite another edit blindly. 403 STATISTIC_LIMIT_REACHED: reduce new definitions to the currently configured limit; existing reads are not truncated.";

export function registerAdminStatisticsTools(server: McpServer): void {
  for (const [name, title, suffix, returns] of [
    ["horizon_admin_statistics_definitions_get", "Get Statistics Catalog", "/definitions", "{apiKeyId,definitionVersion,definitions,limits,updatedAt}"],
    ["horizon_admin_statistics_limits", "Get Statistics Limits", "/limits", "The account's current System Config limits for statistics keys"],
  ]) {
    server.registerTool(name, {
      title, description: describeTool({ summary: suffix === "/definitions" ? "Reads the full statistics catalog of one owned project." : "Reads the statistics key limits of one owned project.", use: "reviewing configuration before editing or checking the currently configured capacity.", avoid: "changing definitions; use horizon_admin_statistics_definitions_set.", requires, effects: "None (read only).", returns, errors }, ADMIN_AUTH),
      inputSchema: project, annotations: READ_ONLY,
    }, async ({ projectApiKeyId }) => {
      const client = getAdminClient(); if (!client) return noAdminClientResponse();
      try { return jsonResponse(await client.get(PATH + suffix, { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
    });
  }
  server.registerTool("horizon_admin_statistics_definitions_set", {
    title: "Replace Statistics Catalog",
    description: describeTool({ summary: "Replaces the full statistics catalog using its expected revision.", use: "after reading the existing definitions and keeping every counter that should remain.", avoid: "inspection only; use horizon_admin_statistics_definitions_get.", requires, effects: "Replaces definitions. Mode/reset changes and delete/recreate create a new counter generation; rename and report-bound changes preserve counters. Concurrent edits fail without writing.", returns: "The new catalog with its incremented definitionVersion.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, expectedVersion: statisticVersion.describe("Catalog definitionVersion read before editing; sent as numeric If-Match"), definitions: z.array(statisticDefinition).max(2147483647).refine(items => new Set(items.map(item => item.key)).size === items.length, "Duplicate statistic key").describe("Complete replacement catalog under the current server System Config limit; preserve every existing key that should remain") }, annotations: DESTRUCTIVE_WRITE,
  }, async ({ projectApiKeyId, expectedVersion, definitions }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.put(`${PATH}/definitions?apiKeyId=${encodeURIComponent(projectApiKeyId)}`, { definitions }, { "If-Match": String(expectedVersion) })); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_admin_statistics_player_get", {
    title: "Inspect Player Statistics",
    description: describeTool({ summary: "Reads one owned player's statistics snapshot.", use: "support inspection without changing counters.", avoid: "editing definitions; use horizon_admin_statistics_definitions_get to inspect the catalog.", requires, effects: "None (read only).", returns: "The statistics snapshot with definitions, values, revision and operationWindow.", errors }, ADMIN_AUTH),
    inputSchema: { ...project, userId: z.string().uuid().describe("Player UUID belonging to the selected project API key") }, annotations: READ_ONLY,
  }, async ({ projectApiKeyId, userId }) => {
    const client = getAdminClient(); if (!client) return noAdminClientResponse();
    try { return jsonResponse(await client.get(`${PATH}/players/${encodeURIComponent(userId)}`, { apiKeyId: projectApiKeyId })); } catch (error) { return errorResponse(error); }
  });
}
