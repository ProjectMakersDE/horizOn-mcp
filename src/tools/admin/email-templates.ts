/**
 * Admin tools for managing multilingual email templates.
 *
 * Email templates are per-project, identified by a unique slug, and hold
 * multilingual subject/body maps (e.g. {"en": "Welcome", "de":
 * "Willkommen"}). Templates can be previewed with sample variables
 * without actually sending mail.
 *
 * All tools require HORIZON_ACCOUNT_API_KEY.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import {
  getAdminClient,
  noAdminClientResponse,
  jsonResponse,
  errorResponse,
} from "./_utils.js";

const translationsSchema = z
  .record(z.string().min(2).max(5), z.string())
  .describe(
    'Translations as {lang: content}, e.g. {"en":"Welcome","de":"Willkommen"}',
  );

export function registerAdminEmailTemplatesTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_emailtemplates_list",
    {
      title: "List Email Templates",
      description:
        "Lists all email templates for a specific project API key. The response omits the body to keep the payload small — use the get tool for full details.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key to list templates for"),
      },
    },
    async ({ projectApiKeyId }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/email-sending/templates",
          { apiKeyId: projectApiKeyId },
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_emailtemplates_get",
    {
      title: "Get Email Template",
      description:
        "Fetches a single email template by UUID, including all language variants for subject and body.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the email template"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          `/api/v1/admin/email-sending/templates/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_emailtemplates_create",
    {
      title: "Create Email Template",
      description:
        "Creates a new email template for a project API key. Slug must be unique per project and match /^_?[a-z0-9][a-z0-9_-]*$/ (optional leading underscore is reserved for system templates like _user_password_reset). Subject and body are multilingual maps.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key this template belongs to"),
        slug: z
          .string()
          .regex(/^_?[a-z0-9][a-z0-9_-]*$/)
          .describe(
            "Unique slug per project (lowercase alphanumeric with - and _; optional leading _ reserved for system templates)",
          ),
        name: z.string().min(1).describe("Human-readable template name"),
        subject: translationsSchema,
        body: translationsSchema,
        variables: z
          .array(z.string())
          .optional()
          .describe(
            "Declared variable names used in subject/body (e.g. ['userName','code']). Defaults to empty list.",
          ),
        fromEmail: z
          .string()
          .email()
          .optional()
          .describe("Optional override for the sender email address"),
        fromName: z
          .string()
          .optional()
          .describe("Optional override for the sender display name"),
      },
    },
    async ({
      projectApiKeyId,
      slug,
      name,
      subject,
      body,
      variables,
      fromEmail,
      fromName,
    }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const requestBody: Record<string, unknown> = {
          apiKeyId: projectApiKeyId,
          slug,
          name,
          subject,
          body,
        };
        if (variables !== undefined) requestBody.variables = variables;
        if (fromEmail !== undefined) requestBody.fromEmail = fromEmail;
        if (fromName !== undefined) requestBody.fromName = fromName;
        const result = await client.post(
          "/api/v1/admin/email-sending/templates",
          requestBody,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_emailtemplates_update",
    {
      title: "Update Email Template",
      description:
        "Updates an email template. All fields are optional — only provided fields are overwritten.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the email template to update"),
        slug: z
          .string()
          .regex(/^_?[a-z0-9][a-z0-9_-]*$/)
          .optional()
          .describe("New slug (lowercase alphanumeric with - and _; optional leading _ reserved for system templates)"),
        name: z.string().min(1).optional(),
        subject: translationsSchema.optional(),
        body: translationsSchema.optional(),
        variables: z.array(z.string()).optional(),
        fromEmail: z.string().email().optional(),
        fromName: z.string().optional(),
      },
    },
    async ({
      id,
      slug,
      name,
      subject,
      body,
      variables,
      fromEmail,
      fromName,
    }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const requestBody: Record<string, unknown> = {};
        if (slug !== undefined) requestBody.slug = slug;
        if (name !== undefined) requestBody.name = name;
        if (subject !== undefined) requestBody.subject = subject;
        if (body !== undefined) requestBody.body = body;
        if (variables !== undefined) requestBody.variables = variables;
        if (fromEmail !== undefined) requestBody.fromEmail = fromEmail;
        if (fromName !== undefined) requestBody.fromName = fromName;
        const result = await client.put(
          `/api/v1/admin/email-sending/templates/${id}`,
          requestBody,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_emailtemplates_delete",
    {
      title: "Delete Email Template",
      description:
        "Soft-deletes an email template. Any pending emails that reference this template will fail on delivery.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the email template to delete"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          `/api/v1/admin/email-sending/templates/${id}`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_emailtemplates_preview",
    {
      title: "Preview Email Template",
      description:
        "Renders a template preview with sample variable values. Does not send any email. The backend parameter name is 'language' (not 'lang').",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the email template to preview"),
        language: z
          .string()
          .min(2)
          .max(5)
          .describe("Language code to render (must exist in subject/body)"),
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Sample variable values as {name: value}. Defaults to empty object.",
          ),
      },
    },
    async ({ id, language, variables }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = { language };
        if (variables !== undefined) body.variables = variables;
        const result = await client.post(
          `/api/v1/admin/email-sending/templates/${id}/preview`,
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
