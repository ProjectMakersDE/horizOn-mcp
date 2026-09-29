/**
 * Admin tools for SMTP settings.
 *
 * Account-wide configuration: there is no projectApiKeyId here. These
 * tools wrap the /api/v1/admin/account-settings/smtp endpoints:
 *   - GET    → read current settings (password is masked by the backend)
 *   - PUT    → save/overwrite settings
 *   - POST /test → send a test email to the account owner's email address
 *   - DELETE → remove settings (fall back to horizOn system SMTP)
 *
 * Security: the backend masks the password in every GET response
 * (`\u2022\u2022...`) and the PUT response uses the same response DTO,
 * so the cleartext password never round-trips. This module still
 * avoids any additional logging of the `password` field.
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

const SCOPE =
  "an Account Key with full-account access or the SMTP feature group; project-scoped keys are always denied (403) because SMTP is account-wide.";

const TLS_NOTE = "Port 465 uses implicit TLS, every other port requires STARTTLS; connect and send time out after 10 seconds.";

export function registerAdminSmtpTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_smtp_get",
    {
      title: "Get SMTP Settings",
      description: describeTool(
        {
          summary:
            "Fetches the account's own SMTP server configuration used for all player emails; the password is always masked, never returned in cleartext.",
          use: "checking whether a custom SMTP server is set and which host, port and sender it uses.",
          avoid: "checking that the server actually works (use horizon_admin_smtp_test).",
          requires: `no parameters; ${SCOPE}`,
          effects: "None (read only).",
          returns:
            "{host, port, username, password, fromEmail, fromName, isConfigured}; password is the fixed mask of 8 bullet characters (U+2022). " +
            "isConfigured false (other fields empty) means no custom SMTP is set and horizOn's system SMTP is used.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(
          "/api/v1/admin/account-settings/smtp",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_smtp_save",
    {
      title: "Save SMTP Settings",
      description: describeTool(
        {
          summary:
            "Saves the account's SMTP server configuration, creating it or replacing every stored field; all player emails of every Project API key are then sent through it.",
          use: "setting up or changing the custom mail server. Check the values first with horizon_admin_smtp_test and the same fields.",
          avoid: "going back to horizOn's system SMTP (use horizon_admin_smtp_delete).",
          requires: `${SCOPE} The saved connection is not tested on save.`,
          effects:
            "Overwrites the stored configuration immediately; verification, password reset and template emails use it from then on. " +
            "An empty password (or the masked value from horizon_admin_smtp_get) keeps the stored password.",
          returns: "{host, port, username, password (masked), fromEmail, fromName, isConfigured: true}.",
          errors:
            "400 for a blank host or username, a port outside 1 to 65535 or an invalid fromEmail: fix the field. " +
            "400 Password is required for initial SMTP configuration when no password is stored yet: pass the password.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        host: z.string().min(1).describe("SMTP server hostname, e.g. smtp.example.com"),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .describe("SMTP server port, 1 to 65535. 465 means implicit TLS, any other port (usually 587) uses STARTTLS"),
        username: z.string().min(1).describe("SMTP login username"),
        password: z
          .string()
          .describe(
            "SMTP login password in cleartext; stored server side and never returned. Pass an empty string to keep the stored password (required on the first save)",
          ),
        fromEmail: z
          .string()
          .email()
          .describe("Default sender address of player emails, e.g. noreply@example.com; a template's fromEmail overrides it"),
        fromName: z
          .string()
          .optional()
          .describe("Default sender display name shown next to fromEmail. Optional; omitting it removes a stored name"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ host, port, username, password, fromEmail, fromName }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = {
          host,
          port,
          username,
          password,
          fromEmail,
        };
        if (fromName !== undefined) body.fromName = fromName;
        const result = await client.put(
          "/api/v1/admin/account-settings/smtp",
          body,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_smtp_test",
    {
      title: "Test SMTP Connection",
      description: describeTool(
        {
          summary:
            "Sends one real test email to the horizOn account owner's address through the saved SMTP configuration, or through an unsaved one passed as parameters.",
          use: "verifying a mail server before horizon_admin_smtp_save (pass all fields) or after it (pass no fields).",
          avoid:
            "reading the configuration (use horizon_admin_smtp_get) or rendering a template (use horizon_admin_emailtemplates_preview). The recipient cannot be chosen.",
          requires:
            `${SCOPE} Either no fields (tests the saved configuration) or all of host, port, username, password and fromEmail (fromName optional); a partial set is rejected by this tool before any request. ` +
            "An empty password in the override uses the stored password.",
          effects: `Sends one email with the subject "horizOn SMTP Test" per call; nothing is saved. ${TLS_NOTE}`,
          returns: '{message: "Test email sent successfully"}.',
          errors:
            "400 SMTP Not Configured when testing without fields and nothing is saved, or with an empty password and none stored: pass the full configuration. " +
            "400 SMTP Connection Failed when the server cannot be reached, rejects the login or refuses the sender: check host, port, TLS mode, credentials and fromEmail.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        host: z
          .string()
          .min(1)
          .optional()
          .describe("SMTP hostname to test without saving. Omit all fields to test the saved configuration"),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .optional()
          .describe("SMTP port to test, 1 to 65535 (465 implicit TLS, others STARTTLS). Required when host is given"),
        username: z
          .string()
          .min(1)
          .optional()
          .describe("SMTP login username to test. Required when host is given"),
        password: z
          .string()
          .optional()
          .describe("SMTP login password to test; an empty string uses the stored password. Required when host is given"),
        fromEmail: z
          .string()
          .email()
          .optional()
          .describe("Sender address to test. Required when host is given"),
        fromName: z
          .string()
          .optional()
          .describe("Sender display name to test. Optional"),
      },
      annotations: ADDITIVE_WRITE,
    },
    async ({ host, port, username, password, fromEmail, fromName }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        // Decide whether the caller supplied an override payload.
        const overrideFieldsProvided =
          host !== undefined ||
          port !== undefined ||
          username !== undefined ||
          password !== undefined ||
          fromEmail !== undefined ||
          fromName !== undefined;

        let result: unknown;
        if (!overrideFieldsProvided) {
          // Empty-body test uses the currently saved SMTP configuration.
          result = await client.post(
            "/api/v1/admin/account-settings/smtp/test",
          );
        } else {
          // Ad-hoc test: the backend requires all five core SMTP fields
          // when a body is supplied. Missing fields surface as a 400.
          if (
            host === undefined ||
            port === undefined ||
            username === undefined ||
            password === undefined ||
            fromEmail === undefined
          ) {
            return errorResponse(
              new Error(
                "Override test requires host, port, username, password, fromEmail. Omit all of them to test the saved configuration instead.",
              ),
            );
          }
          const body: Record<string, unknown> = {
            host,
            port,
            username,
            password,
            fromEmail,
          };
          if (fromName !== undefined) body.fromName = fromName;
          result = await client.post(
            "/api/v1/admin/account-settings/smtp/test",
            body,
          );
        }
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_smtp_delete",
    {
      title: "Delete SMTP Settings",
      description: describeTool(
        {
          summary:
            "Removes the account's custom SMTP configuration so all player emails fall back to horizOn's system SMTP.",
          use: "stopping the use of your own mail server.",
          avoid: "changing host, credentials or sender (use horizon_admin_smtp_save, which overwrites in place).",
          requires: `no parameters; ${SCOPE}`,
          effects:
            "Marks the stored configuration deleted; it cannot be restored through the API, so using a custom server again means saving it anew, password included, with horizon_admin_smtp_save.",
          returns: '{message: "SMTP configuration removed"}.',
          errors: "404 SMTP settings not found when nothing is configured: nothing left to do.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {},
      annotations: DESTRUCTIVE_WRITE,
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(
          "/api/v1/admin/account-settings/smtp",
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
