import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, errorResponse, noApiKeyResponse, structuredResponse, READ_ONLY, DESTRUCTIVE_WRITE, SESSION_REQUIRED } from "./tool-helpers.js";

export const STATISTICS_PATH = "/api/v1/app/statistics";
export const statisticInteger = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const statisticKey = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,23}$(?![\s\S])/);
export const statisticOperation = z.string().regex(/^[0-9]{13}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$(?![\s\S])/).describe("Original durable <13-digit Unix milliseconds>:<UUID> operation ID; reuse unchanged on retry");
export const statisticDefinition = z.object({
  key: statisticKey,
  name: z.string().min(1).max(80).refine(value => Buffer.byteLength(value, "utf8") <= 80, "Name exceeds 80 UTF-8 bytes"),
  mode: z.enum(["sum", "max", "min", "last"]),
  reset: z.enum(["none", "daily", "weekly"]),
  maxPerUpdate: statisticInteger.refine(value => value > 0).optional(),
});
export const statisticUpdates = z.array(z.object({ key: statisticKey, value: statisticInteger })).min(1).max(100)
  .refine(updates => new Set(updates.map(update => update.key)).size === updates.length, "Duplicate statistic key").describe("Original immutable batch of 1 to 100 distinct statistic keys with safe integer values");
export const statisticVersion = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const statisticsCatalogOutput = {
  definitionVersion: statisticVersion,
  definitions: z.array(statisticDefinition).nullable(),
};
export const statisticsSnapshotOutput = {
  ...statisticsCatalogOutput,
  userId: z.string().uuid(), revision: statisticVersion,
  values: z.array(z.object({ key: statisticKey, value: statisticInteger, hasValue: z.boolean(), period: z.string().nullable() })),
  operationWindow: z.object({ serverTimeUnixMillis: statisticVersion, maxAgeSeconds: statisticVersion, maxFutureSkewSeconds: statisticVersion }),
  operationId: z.string().nullable().optional(), replayed: z.boolean().optional(), newlyUnlocked: z.array(z.string()),
};
const session = { userId: z.string().uuid().describe("Signed-in player UUID matching the supplied session token"), sessionToken: z.string().min(1).max(256).describe("Player accessToken from horizon_signin_anonymous or horizon_signin_email; sent as Bearer") };
const optionalVersion = statisticVersion.optional().describe("Last cached definitionVersion; omit to load the full catalog");
const errors = "401 SESSION_REQUIRED: sign in again; 403 SESSION_FORBIDDEN: use the matching player. 409 OPERATION_CONFLICT means the ID was already used for a different payload. 410 OPERATION_EXPIRED rejects an expired/evicted unknown ID. Never replace an uncertain ID automatically. 422 UNKNOWN_STATISTIC/UPDATE_ABOVE_LIMIT/VALUE_OVERFLOW rejects the whole batch.";

export function registerStatisticsTools(server: McpServer): void {
  server.registerTool("horizon_get_statistics", {
    title: "Get Player Statistics",
    description: describeTool({ summary: "Reads a player's statistics snapshot and server operation window.", use: "explicit loading, reconnect recovery or checking an uncertain batch before retrying its original ID.", avoid: "writing counters; use horizon_update_statistics with the original durable ID.", requires: SESSION_REQUIRED, effects: "None (read only).", returns: "{userId, definitionVersion, definitions, revision, values, operationWindow, operationId?, replayed?, newlyUnlocked}. definitions null means unchanged since definitionVersion; keep the cached definitions.", errors }),
    inputSchema: { ...session, definitionVersion: optionalVersion }, outputSchema: statisticsSnapshotOutput, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, definitionVersion }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return structuredResponse(await client.get(STATISTICS_PATH, { userId, ...(definitionVersion === undefined ? {} : { definitionVersion: String(definitionVersion) }) }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_get_statistics_definitions", {
    title: "Get Statistics Definitions",
    description: describeTool({ summary: "Reads the project's statistics catalog conditionally by version.", use: "showing counter labels, modes, reset policies and optional report bounds.", avoid: "loading player counter values; use horizon_get_statistics.", requires: SESSION_REQUIRED, effects: "None (read only).", returns: "{definitionVersion, definitions}; definitions null means unchanged, an empty array means an empty catalog.", errors }),
    inputSchema: { sessionToken: session.sessionToken, definitionVersion: optionalVersion }, outputSchema: statisticsCatalogOutput, annotations: READ_ONLY,
  }, async ({ sessionToken, definitionVersion }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return structuredResponse(await client.get(`${STATISTICS_PATH}/definitions`, definitionVersion === undefined ? {} : { definitionVersion: String(definitionVersion) }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
  server.registerTool("horizon_update_statistics", {
    title: "Update Player Statistics Batch",
    description: describeTool({ summary: "Applies one explicit atomic session batch with a caller-persisted operation ID.", use: "reporting completed session counters, or retrying exactly the same durable ID and payload after an uncertain timeout.", avoid: "automatically generating another ID for a failed/unknown outcome, or one HTTP call per counter.", requires: SESSION_REQUIRED + " Persist the original operationId and unchanged updates before sending. ID is <13-digit Unix milliseconds>:<UUID>; use the snapshot server operation time for clock alignment.", effects: "Updates all counters atomically. A retained same-ID same-payload receipt replays; changed payload conflicts. Eight receipts and a persistent eviction floor can reject delayed out-of-order unknown IDs even within 24 hours; nothing is rebooked.", returns: "The current statistics snapshot with operationId and replayed.", errors }),
    inputSchema: { ...session, operationId: statisticOperation, updates: statisticUpdates }, outputSchema: statisticsSnapshotOutput, annotations: DESTRUCTIVE_WRITE,
  }, async ({ userId, sessionToken, operationId, updates }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return structuredResponse(await client.post(STATISTICS_PATH, { userId, operationId, updates }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
}
