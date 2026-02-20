import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { createApiClientFromEnv } from "./api-client.js";
import { noApiKeyResponse, errorResponse, jsonResponse } from "./tool-helpers.js";

export function registerAuthTools(server: McpServer): void {
  // --- Sign up anonymously ---
  server.registerTool("horizon_signup_anonymous", {
    title: "Sign Up Anonymously",
    description:
      "Creates a new anonymous user account on horizOn with a display name.",
    inputSchema: {
      displayName: z.string().max(30).describe("Display name for the anonymous user (max 30 characters)"),
    },
  }, async ({ displayName }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signup", {
        type: "ANONYMOUS",
        username: displayName,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Sign up with email ---
  server.registerTool("horizon_signup_email", {
    title: "Sign Up with Email",
    description:
      "Creates a new user account on horizOn with email and password.",
    inputSchema: {
      email: z.string().email().max(40).describe("Email address (max 40 characters)"),
      password: z.string().min(4).max(32).describe("Password (4-32 characters)"),
      displayName: z.string().max(30).describe("Display name (max 30 characters)"),
    },
  }, async ({ email, password, displayName }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signup", {
        type: "EMAIL",
        email,
        password,
        username: displayName,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Sign in with email ---
  server.registerTool("horizon_signin_email", {
    title: "Sign In with Email",
    description:
      "Signs in an existing user on horizOn using email and password.",
    inputSchema: {
      email: z.string().email().describe("Email address"),
      password: z.string().describe("Password"),
    },
  }, async ({ email, password }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signin", {
        type: "EMAIL",
        email,
        password,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Sign in anonymously ---
  server.registerTool("horizon_signin_anonymous", {
    title: "Sign In Anonymously",
    description:
      "Signs in an anonymous user on horizOn using their anonymous token.",
    inputSchema: {
      anonymousToken: z.string().max(32).describe("Anonymous token (max 32 characters)"),
    },
  }, async ({ anonymousToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/signin", {
        type: "ANONYMOUS",
        anonymousToken,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });

  // --- Check auth ---
  server.registerTool("horizon_check_auth", {
    title: "Check Authentication",
    description:
      "Checks whether a user session is still valid on horizOn.",
    inputSchema: {
      userId: z.string().uuid().describe("User ID (UUID)"),
      sessionToken: z.string().max(256).describe("Session token (max 256 characters)"),
    },
  }, async ({ userId, sessionToken }) => {
    const client = createApiClientFromEnv();
    if (!client) return noApiKeyResponse();

    try {
      const result = await client.post("/api/v1/app/user-management/check-auth", {
        userId,
        sessionToken,
      });
      return jsonResponse(result);
    } catch (error) {
      return errorResponse(error);
    }
  });
}
