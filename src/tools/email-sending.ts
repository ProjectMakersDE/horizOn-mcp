import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse, READ_ONLY, ADDITIVE_WRITE, API_ERRORS } from "./tool-helpers.js";

export function registerEmailSendingTools(server: McpServer): void {
  server.registerTool("horizon_send_email", {
    title: "Send Email",
    description:
      "Sends a transactional email to a registered horizOn user using a pre-configured template. " +
      "The email is sent through the developer's own SMTP server. " +
      "Optionally schedule delivery for a future time (up to 30 days ahead). " +
      "Each call queues a new email, so do not repeat it to retry a status check. " +
      "An unknown templateSlug, or a user without a verified email address, gives 400. " +
      "Returns {id, status: 'pending', scheduledAt}; pass id to horizon_get_email_status to follow delivery or to horizon_cancel_email to stop it. " +
      API_ERRORS,
    inputSchema: {
      userId: z.string().uuid().describe("horizOn user ID of the recipient"),
      templateSlug: z.string().min(1).describe("Slug of the email template (e.g. 'welcome', 'reminder')"),
      variables: z.record(z.string(), z.string()).describe("Template variable values as key-value pairs (e.g. {\"username\": \"John\"})"),
      language: z.string().length(2).describe("ISO 639-1 language code for template rendering (e.g. 'en', 'de')"),
      scheduledAt: z.string().optional().describe("ISO 8601 timestamp for scheduled delivery. Omit to send immediately."),
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
    description:
      "Cancels a pending or scheduled email. Only emails with status 'pending' can be cancelled. " +
      "The email must belong to the same API key. The cancelled email is never sent and cannot be restored; to send it later, call horizon_send_email again. " +
      "If unsure whether it is still pending, check it first with horizon_get_email_status. " +
      "Returns {message: 'Email cancelled'}. " +
      API_ERRORS,
    inputSchema: {
      emailId: z.string().uuid().describe("ID of the email to cancel (returned by send_email)"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
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
    description:
      "Gets the current status of a specific email (pending, processing, sent, or failed). " +
      "Use this to check whether a sent or scheduled email has been delivered. " +
      "Returns {id, status, templateSlug, userId, language, scheduledAt, processedAt, errorReason, createdAt}; errorReason explains a failed email. " +
      API_ERRORS,
    inputSchema: {
      emailId: z.string().uuid().describe("ID of the email to check (returned by send_email)"),
    },
    annotations: READ_ONLY,
  }, async ({ emailId }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.get(`/api/v1/app/email-sending/${emailId}`);
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
