/**
 * Admin tools for managing news entries.
 *
 * News entries are multilingual announcements exposed to the runtime app
 * via the app API. Titles and messages are stored inline as
 * {langCode: text} maps (e.g. {"en": "Hello", "de": "Hallo"}). FREE
 * accounts may only ship one language per entry; higher tiers support
 * up to 15 languages.
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
    'Translations as {lang: content}, e.g. {"en":"Title","de":"Titel"}',
  );

export function registerAdminNewsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_news_list",
    {
      title: "List News Entries",
      description:
        "Lists news entries for the authenticated account with optional filters for project, publish status, active state, and search.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe("Optional UUID of the project API key to filter by"),
        isPublished: z
          .boolean()
          .optional()
          .describe("Filter by publish state"),
        isActive: z
          .boolean()
          .optional()
          .describe("Filter by active/soft-deleted state"),
        search: z
          .string()
          .optional()
          .describe("Optional case-insensitive search across titles/messages"),
        page: z.number().int().min(0).default(0).describe("0-based page index"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("items per page (1-100)"),
      },
    },
    async ({ projectApiKeyId, isPublished, isActive, search, page, size }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const params: Record<string, string> = {
          page: String(page),
          size: String(size),
        };
        if (projectApiKeyId !== undefined) params.apiKeyId = projectApiKeyId;
        if (isPublished !== undefined)
          params.isPublished = String(isPublished);
        if (isActive !== undefined) params.isActive = String(isActive);
        if (search !== undefined) params.search = search;
        const result = await client.get("/api/v1/admin/news", params);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_news_get",
    {
      title: "Get News Entry",
      description:
        "Fetches a single news entry by its UUID, including all language variants.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the news entry"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get(`/api/v1/admin/news/${id}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_news_create",
    {
      title: "Create News Entry",
      description:
        "Creates a new news entry. Requires at least one language in both titles and messages; FREE plans are limited to one language.",
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("UUID of the project API key this news belongs to"),
        titles: translationsSchema,
        messages: translationsSchema,
        releaseDate: z
          .string()
          .datetime({ local: true })
          .describe(
            "Release date/time as ISO-8601 LocalDateTime (no timezone), e.g. 2026-04-16T12:00:00",
          ),
        isPublished: z
          .boolean()
          .optional()
          .describe("Whether to publish on creation (default false)"),
      },
    },
    async ({
      projectApiKeyId,
      titles,
      messages,
      releaseDate,
      isPublished,
    }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = {
          apiKeyId: projectApiKeyId,
          titles,
          messages,
          releaseDate,
        };
        if (isPublished !== undefined) body.isPublished = isPublished;
        const result = await client.post("/api/v1/admin/news", body);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_news_update",
    {
      title: "Update News Entry",
      description:
        "Updates an existing news entry. All fields are optional — only provided fields are overwritten.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the news entry to update"),
        titles: translationsSchema.optional(),
        messages: translationsSchema.optional(),
        releaseDate: z
          .string()
          .datetime({ local: true })
          .optional()
          .describe("New release date as ISO-8601 LocalDateTime"),
        isPublished: z.boolean().optional(),
        isActive: z.boolean().optional(),
      },
    },
    async ({ id, titles, messages, releaseDate, isPublished, isActive }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const body: Record<string, unknown> = {};
        if (titles !== undefined) body.titles = titles;
        if (messages !== undefined) body.messages = messages;
        if (releaseDate !== undefined) body.releaseDate = releaseDate;
        if (isPublished !== undefined) body.isPublished = isPublished;
        if (isActive !== undefined) body.isActive = isActive;
        const result = await client.put(`/api/v1/admin/news/${id}`, body);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_news_delete",
    {
      title: "Delete News Entry",
      description:
        "Soft-deletes a news entry. After deletion the entry is no longer exposed to the runtime app.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the news entry to delete"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.delete(`/api/v1/admin/news/${id}`);
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_news_publish",
    {
      title: "Publish News Entry",
      description:
        "Marks a news entry as published so the runtime app can see it (subject to releaseDate).",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the news entry"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.post(
          `/api/v1/admin/news/${id}/publish`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_news_unpublish",
    {
      title: "Unpublish News Entry",
      description:
        "Marks a news entry as unpublished so the runtime app stops serving it.",
      inputSchema: {
        id: z.string().uuid().describe("UUID of the news entry"),
      },
    },
    async ({ id }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.post(
          `/api/v1/admin/news/${id}/unpublish`,
        );
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );

  server.registerTool(
    "horizon_admin_news_getStats",
    {
      title: "Get News Statistics",
      description:
        "Returns account-wide news statistics (totals, published counts, per-language breakdown). This endpoint is account-scoped; per-project filtering is not supported by the backend.",
      inputSchema: {},
    },
    async () => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        const result = await client.get("/api/v1/admin/news/statistics");
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
