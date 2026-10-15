import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv, sessionHeaders } from "./api-client.js";
import { describeTool, noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, DESTRUCTIVE_WRITE, SESSION_REQUIRED, SESSION_ERRORS } from "./tool-helpers.js";
import { valueUserId } from "./player-values.js";

export const inboxEntryId = z.string().regex(/^(message|broadcast):[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/)
  .describe("Exact stable entry ID from the inbox snapshot, including message: or broadcast: prefix");
const session = { userId: valueUserId, sessionToken: z.string().min(1).max(256).describe("Player accessToken, sent only as Authorization Bearer") };
const path = "/api/v1/app/inbox";
const errors = "409 STATE_CONFLICT: retry the same entry ID. UNCLAIMED_REWARD: claim before removal. MAX_BALANCE_REACHED/DAILY_LIMIT_REACHED leaves the reward unclaimed. ENTRY_NOT_FOUND after removal/cleanup never grants again. " + SESSION_ERRORS;

export function registerInboxTools(server: McpServer): void {
  server.registerTool("horizon_get_inbox", {
    title: "Get Player Inbox",
    description: describeTool({ summary: "Reads targeted messages and eligible project broadcasts, counters and server polling interval.",
      use: "displaying notifications or refreshing after realtime invalidation.", avoid: "choosing rewards or writing messages from the player client.", requires: SESSION_REQUIRED,
      effects: "None (read only).", returns: "{userId,cursor,revision,broadcastRevision,serverTime,pollAfterSeconds,unchanged,entries,counts,limits}. unchanged=true has empty entries: keep the cached entries. A changed snapshot replaces them completely.", errors }),
    inputSchema: { ...session, since: z.string().max(128).regex(/^[A-Za-z0-9:_-]*$/).optional().describe("Opaque cursor from this same player/project; omit for a full snapshot") }, annotations: READ_ONLY,
  }, async ({ userId, sessionToken, since }) => {
    const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
    try { return jsonResponse(await client.get(path, { userId, ...(since === undefined ? {} : { since }) }, sessionHeaders(sessionToken))); }
    catch (error) { return errorResponse(error); }
  });
  for (const [suffix, name, title, effects, returns] of [
    ["read", "horizon_mark_inbox_read", "Mark Inbox Entry Read", "Marks this entry read without claiming its reward.", "Updated complete inbox snapshot."],
    ["claim", "horizon_claim_inbox", "Claim Inbox Reward", "Atomically marks the entry claimed and grants its configured values once. No automatic retries or new action IDs. Overdue unclaimed rewards remain claimable.", "{entryId,replayed,inbox,playerValues}. Replace the value cache with playerValues; never apply the reward delta again."],
    ["remove", "horizon_remove_inbox", "Remove Inbox Entry", "Removes ordinary or already-claimed entries. Unclaimed valuable attachments are protected. Removal does not create a new claim opportunity.", "Updated complete inbox snapshot."],
  ] as const) {
    server.registerTool(name, {
      title, description: describeTool({ summary: ({ read: "Marks an inbox entry read for the authenticated player.", claim: "Claims an inbox reward once for the authenticated player.", remove: "Removes an eligible inbox entry for the authenticated player." } as const)[suffix], use: "an explicit player action on an entry returned by horizon_get_inbox.", avoid: "changing the recipient or inventing attachment amounts.", requires: SESSION_REQUIRED,
        effects, returns, errors }), inputSchema: { ...session, entryId: inboxEntryId }, annotations: DESTRUCTIVE_WRITE,
    }, async ({ userId, sessionToken, entryId }) => {
      const client = createApiClientFromEnv(); if (!client) return noApiKeyResponse();
      try { return jsonResponse(await client.post(path + "/" + suffix, { userId, entryId }, sessionHeaders(sessionToken))); }
      catch (error) { return errorResponse(error); }
    });
  }
}
