/**
 * Admin tools for SMTP settings.
 *
 * Account-wide configuration — there is no projectApiKeyId here. These
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
} from "./_utils.js";

export function registerAdminSmtpTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_smtp_get",
    {
      title: "Get SMTP Settings",
      description:
        "Fetches the current SMTP configuration for the authenticated account. The password is masked by the backend and never returned in cleartext.",
      inputSchema: {},
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
      description:
        "Saves (creates or overwrites) the SMTP configuration for the authenticated account. The backend masks the password in the response so the cleartext never round-trips.",
      inputSchema: {
        host: z.string().min(1).describe("SMTP server hostname"),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .describe("SMTP server port (1-65535)"),
        username: z.string().min(1).describe("SMTP auth username"),
        password: z
          .string()
          .describe(
            "SMTP auth password. An empty string means 'keep existing password' on update.",
          ),
        fromEmail: z
          .string()
          .email()
          .describe("Sender address used as the envelope From"),
        fromName: z
          .string()
          .optional()
          .describe("Optional display name shown next to the sender address"),
      },
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
      description:
        "Sends a test email to the authenticated account owner's email address using the currently saved SMTP configuration. Optionally pass a full SMTP payload (host/port/username/password/fromEmail/fromName) to test an unsaved configuration without persisting it. The backend does not accept an arbitrary recipient — the test email always goes to the account owner.",
      inputSchema: {
        host: z
          .string()
          .min(1)
          .optional()
          .describe("Optional SMTP hostname to test without saving"),
        port: z
          .number()
          .int()
          .min(1)
          .max(65535)
          .optional()
          .describe("Optional SMTP port to test without saving (1-65535)"),
        username: z
          .string()
          .min(1)
          .optional()
          .describe("Optional SMTP username to test without saving"),
        password: z
          .string()
          .optional()
          .describe("Optional SMTP password to test without saving"),
        fromEmail: z
          .string()
          .email()
          .optional()
          .describe("Optional sender address to test without saving"),
        fromName: z
          .string()
          .optional()
          .describe("Optional display name to test without saving"),
      },
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
      description:
        "Removes the account's SMTP configuration. After deletion, all end-user emails fall back to horizOn's system SMTP.",
      inputSchema: {},
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
