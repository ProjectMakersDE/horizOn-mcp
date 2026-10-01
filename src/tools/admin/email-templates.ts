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
  describeTool,
  ADMIN_AUTH,
  READ_ONLY,
  ADDITIVE_WRITE,
  DESTRUCTIVE_WRITE,
} from "./_utils.js";

const translationsSchema = z
  .record(z.string().min(2).max(5), z.string())
  .describe(
    'Translations as {lang: content} with 2 to 5 character language codes, e.g. {"en":"Welcome","de":"Willkommen"}. "en" is required. ' +
      "Placeholders are written as {{variableName}}. Subject max 200 characters, body max 50 KB per language",
  );

const templateIdSchema = (purpose: string) =>
  z
    .string()
    .uuid()
    .describe(`UUID of the email template ${purpose} (id from horizon_admin_emailtemplates_list or _create)`);

const PLAN_NOTE =
  "Email templates are not available on the FREE plan (403 Feature Not Available): upgrade the account plan.";

const SCOPE_BY_ID =
  "an Account Key with full-account access or the EMAIL_TEMPLATES feature group; project-scoped keys are denied (403) for this ID-based call.";

export function registerAdminEmailTemplatesTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_emailtemplates_list",
    {
      title: "List Email Templates",
      description: describeTool(
        {
          summary:
            "Lists all email templates of one Project API key without their bodies (slug, name, subject per language, declared variables, sender override).",
          use: "finding a template id or slug, or checking which languages and variables a template declares.",
          avoid: "reading the full body (use horizon_admin_emailtemplates_get) or rendering it (use horizon_admin_emailtemplates_preview).",
          requires:
            "projectApiKeyId from horizon_admin_projects_list; an Account Key with full-account access or the EMAIL_TEMPLATES feature group (a project-scoped key may list its own project).",
          effects: "None (read only).",
          returns:
            "{templates}; each item has id, slug, name, subject ({lang: text}), variables, fromEmail, fromName, createdAt, updatedAt. No body field. " +
            "An empty templates array means the key has no templates; system templates (slug starting with _) appear only after they were created.",
          errors: PLAN_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the Project API key whose templates to list (from horizon_admin_projects_list; sent as apiKeyId)"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary:
            "Fetches one email template by UUID with every language variant of subject and body, the declared variables and the sender override.",
          use: "reading the full content before editing it with horizon_admin_emailtemplates_update.",
          avoid: "browsing templates (use horizon_admin_emailtemplates_list) or seeing the rendered output (use horizon_admin_emailtemplates_preview).",
          requires: `template id from horizon_admin_emailtemplates_list; ${SCOPE_BY_ID}`,
          effects: "None (read only).",
          returns:
            "{id, slug, name, subject, body, variables, fromEmail, fromName, createdAt, updatedAt}; subject and body are {lang: text} maps with {{variable}} placeholders.",
          errors:
            "404 Template Not Found for an unknown or deleted id: list the ids with horizon_admin_emailtemplates_list. " + PLAN_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: templateIdSchema("to fetch"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary:
            "Creates a new multilingual email template for one Project API key, identified by a slug that is unique within that key; players receive it via horizon_send_email.",
          use: "adding a new template, or overriding a system email by creating _user_verification or _user_password_reset.",
          avoid: "changing an existing template (use horizon_admin_emailtemplates_update); a repeat call with the same slug fails.",
          requires:
            "projectApiKeyId from horizon_admin_projects_list; an Account Key with full-account access or the EMAIL_TEMPLATES feature group (a project-scoped key may create for its own project). " +
            "A slug starting with _ must be a known system slug: _user_verification needs the variables verificationToken, username and apiKey; _user_password_reset needs resetToken and username.",
          effects: "Stores a new template; it is usable immediately by slug. The number of templates per key is capped by the account plan.",
          returns: "The created template: {id, slug, name, subject, body, variables, fromEmail, fromName, createdAt, updatedAt}.",
          errors:
            "400 Duplicate Slug when the slug exists for this key: use horizon_admin_emailtemplates_update. 400 Template Limit Exceeded: delete an unused template or upgrade the plan. " +
            "400 Validation Error for a missing en subject or body, a subject over 200 characters, a body over 50 KB, too many variables for the plan, a variable name over 50 characters or an unknown or incomplete system slug: fix the input. " +
            "400 for an unknown projectApiKeyId or one of another account: check horizon_admin_projects_list. " +
            PLAN_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the Project API key this template belongs to (from horizon_admin_projects_list; sent as apiKeyId)"),
        slug: z
          .string()
          .regex(/^_?[a-z0-9][a-z0-9_-]*$/)
          .describe(
            "Slug, unique per Project API key: lowercase letters, digits, - and _, starting with a letter or digit, e.g. welcome_mail. " +
              "A leading _ is reserved for the system slugs _user_verification and _user_password_reset",
          ),
        name: z.string().min(1).describe("Human-readable template name shown in the dashboard (at least 1 character)"),
        subject: translationsSchema,
        body: translationsSchema,
        variables: z
          .array(z.string())
          .optional()
          .describe(
            "Names of the {{placeholders}} used in subject and body, e.g. ['userName','code'] (each max 50 characters; the maximum count depends on the plan). " +
              "Every declared variable must be supplied when sending or previewing. Default: empty list",
          ),
        fromEmail: z
          .string()
          .email()
          .optional()
          .describe("Sender address for this template, overriding the SMTP fromEmail (horizon_admin_smtp_get). Omit to use the SMTP default"),
        fromName: z
          .string()
          .optional()
          .describe("Sender display name for this template, overriding the SMTP fromName. Omit to use the SMTP default"),
      },
      annotations: ADDITIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Updates an existing email template: each field you pass replaces the stored value, omitted fields stay unchanged.",
          use: "editing text, languages, variables, slug or sender of a template, including system templates (slug starting with _).",
          avoid:
            "creating a template (use horizon_admin_emailtemplates_create). Passing subject or body replaces the whole language map, so include every language you want to keep (read them first with horizon_admin_emailtemplates_get).",
          requires: `template id from horizon_admin_emailtemplates_list; ${SCOPE_BY_ID}`,
          effects:
            "Overwrites the passed fields immediately; emails sent afterwards use the new content. fromEmail and fromName can be changed but not cleared.",
          returns: "The updated template: {id, slug, name, subject, body, variables, fromEmail, fromName, createdAt, updatedAt}.",
          errors:
            "404 Template Not Found for an unknown or deleted id: list the ids with horizon_admin_emailtemplates_list. " +
            "400 Duplicate Slug when another template of the key uses the new slug: pick another slug. " +
            "400 Validation Error when the merged content breaks a rule (en subject and body required, subject max 200 characters, body max 50 KB, variable limits) or when renaming a system template: fix the input. " +
            PLAN_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: templateIdSchema("to update"),
        slug: z
          .string()
          .regex(/^_?[a-z0-9][a-z0-9_-]*$/)
          .optional()
          .describe(
            "New slug, unique per Project API key: lowercase letters, digits, - and _; a leading _ is reserved for system slugs. System templates cannot be renamed. Omit to keep",
          ),
        name: z.string().min(1).optional().describe("New human-readable name (at least 1 character). Omit to keep"),
        subject: translationsSchema
          .optional()
          .describe(
            'New subject as {lang: text}, e.g. {"en":"Welcome","de":"Willkommen"}; replaces the whole stored map, so include every language to keep ("en" required, max 200 characters each). Omit to keep',
          ),
        body: translationsSchema
          .optional()
          .describe(
            "New body as {lang: text} with {{variableName}} placeholders; replaces the whole stored map, so include every language to keep (\"en\" required, max 50 KB each). Omit to keep",
          ),
        variables: z
          .array(z.string())
          .optional()
          .describe("New list of declared {{placeholder}} names; replaces the stored list. System templates must keep their required variables. Omit to keep"),
        fromEmail: z.string().email().optional().describe("New sender address override for this template. Omit to keep"),
        fromName: z.string().optional().describe("New sender display name override for this template. Omit to keep"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Deletes an email template by UUID (soft delete: it disappears from lists and can no longer be sent or restored through this API).",
          use: "removing a custom template that is no longer used.",
          avoid:
            "system templates (slug starting with _), which cannot be deleted: edit them with horizon_admin_emailtemplates_update. To change content, update instead of delete and recreate.",
          requires: `template id from horizon_admin_emailtemplates_list; ${SCOPE_BY_ID}`,
          effects:
            "The template is marked deleted and inactive; queued emails that reference it fail on delivery. Its slug becomes free for a new template.",
          returns: '{message: "Template deleted"}.',
          errors:
            "404 Template Not Found for an unknown or already deleted id: nothing left to do. 400 Validation Error for a system template. " + PLAN_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: templateIdSchema("to delete"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary:
            "Renders one language of an email template with sample variable values and returns the resulting subject and body; no email is sent.",
          use: "checking placeholders and wording before sending, or after an update.",
          avoid: "reading the raw template (use horizon_admin_emailtemplates_get) or sending a real email to a player (use horizon_send_email).",
          requires: `template id from horizon_admin_emailtemplates_list; ${SCOPE_BY_ID}`,
          effects: "None (read only; nothing is stored or sent).",
          returns: "{subject, body} with every {{name}} placeholder replaced by the supplied value.",
          errors:
            "404 Template Not Found for an unknown or deleted id: list the ids with horizon_admin_emailtemplates_list. " +
            "400 Validation Error when the language is missing in subject or body: use a language the template has. " +
            "400 Variable Validation Error (Missing required variable) when a declared variable has no value: pass every name from the template's variables. " +
            PLAN_NOTE,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: templateIdSchema("to preview"),
        language: z
          .string()
          .min(2)
          .max(5)
          .describe("Language code to render, e.g. en or de; it must exist in both subject and body of the template"),
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Sample values as {name: value}, e.g. {\"userName\":\"Alex\"}; must cover every variable the template declares. Default: {}",
          ),
      },
      annotations: READ_ONLY,
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
