import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import {
  noApiKeyResponse,
  errorResponse,
  jsonResponse,
  structuredResponse,
  describeTool,
  READ_ONLY,
  ADDITIVE_WRITE,
  DESTRUCTIVE_WRITE,
} from "./tool-helpers.js";
import { EMAIL_STATUS_OUTPUT } from "./output-schemas.js";

export function registerEmailSendingTools(server: McpServer): void {
  server.registerTool("horizon_send_email", {
    title: "Send Email",
    description: describeTool({
      summary: "Queues a transactional email from a dashboard template to one registered player, sent now or at a scheduled time through the developer's own SMTP server.",
      use: "the game triggers a message to a player, such as a welcome mail or a reminder.",
      avoid: "checking delivery (use horizon_get_email_status) or stopping a queued email (use horizon_cancel_email).",
      requires: "an SMTP configuration and the template in the horizOn dashboard, and a recipient with a verified email address.",
      effects: "queues one new email per call; repeating the call sends the email again, so never repeat it to retry a status check.",
      returns: "{id, status: 'pending', scheduledAt}; pass id to horizon_get_email_status to follow delivery or to horizon_cancel_email to stop it.",
      errors: "400 for an unknown templateSlug or a recipient without a verified email address: check the slug in the dashboard or pick another user.",
    }),
    inputSchema: {
      userId: z.string().uuid().describe("Player user ID (UUID) of the recipient; the player needs a verified email address"),
      templateSlug: z.string().min(1).describe("Slug of an email template defined in the dashboard, for example 'welcome' or 'reminder'"),
      variables: z.record(z.string(), z.string()).describe("Values for the template's variables as a string map, for example {\"username\": \"John\"}; pass {} when the template has none"),
      language: z.string().length(2).describe("ISO 639-1 code (2 lowercase letters) of the template translation to render, for example 'en' or 'de'"),
      scheduledAt: z.string().optional().describe("ISO 8601 timestamp for delayed delivery, at most 30 days ahead, for example 2026-10-01T09:00:00Z. Omit to send immediately"),
    },
    annotations: ADDITIVE_WRITE,
  }, async ({ userId, templateSlug, variables, language, scheduledAt }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const body: Record<string, unknown> = { userId, templateSlug, variables, language };
      if (scheduledAt !== undefined) body.scheduledAt = scheduledAt;

      const result = await client.post("/api/v1/app/email-sending/send", body);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  server.registerTool("horizon_cancel_email", {
    title: "Cancel Email",
    description: describeTool({
      summary: "Cancels a queued email that is still pending (sent now or scheduled) so it is never delivered.",
      use: "a scheduled email is no longer wanted, for example the player already came back.",
      avoid: "emails that are already processing or sent (they cannot be recalled); check with horizon_get_email_status first when unsure.",
      requires: "the emailId from horizon_send_email, sent with the same API key.",
      effects: "the email is never sent and cannot be restored; to send it later, call horizon_send_email again.",
      returns: "{message: 'Email cancelled'}.",
      errors: "An email that is not pending (already processing, sent, failed or cancelled) or belongs to another API key is rejected: read its state with horizon_get_email_status.",
    }),
    inputSchema: {
      emailId: z.string().uuid().describe("Email ID (UUID) returned by horizon_send_email"),
    },
    annotations: DESTRUCTIVE_WRITE,
  }, async ({ emailId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.delete(`/api/v1/app/email-sending/${emailId}`);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  server.registerTool("horizon_get_email_status", {
    title: "Get Email Status",
    description: describeTool({
      summary: "Returns the delivery status (pending, processing, sent or failed) and details of one email queued with horizon_send_email.",
      use: "checking whether a sent or scheduled email was delivered, or why it failed.",
      avoid: "sending again (use horizon_send_email only for a new email) or stopping delivery (use horizon_cancel_email).",
      requires: "the emailId from horizon_send_email.",
      effects: "None (read only).",
      returns: "{id, status, templateSlug, userId, language, scheduledAt, processedAt, errorReason, createdAt}; errorReason explains a failed email (for example SMTP rejected it).",
      errors: "An unknown emailId or one of another API key is rejected: pass the id returned by horizon_send_email.",
    }),
    inputSchema: {
      emailId: z.string().uuid().describe("Email ID (UUID) returned by horizon_send_email"),
    },
    outputSchema: EMAIL_STATUS_OUTPUT,
    annotations: READ_ONLY,
  }, async ({ emailId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get(`/api/v1/app/email-sending/${emailId}`);
      return structuredResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
