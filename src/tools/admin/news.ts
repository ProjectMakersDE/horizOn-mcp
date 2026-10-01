/**
 * Admin tools for managing news entries.
 *
 * News entries are multilingual announcements exposed to the runtime app
 * via the app API. Titles and messages are stored inline as
 * {langCode: text} maps (e.g. {"en": "Hello", "de": "Hallo"}). The tier
 * caps the number of languages per entry (FREE: one).
 *
 * The server maps the prefix to the account-key feature group NEWS.
 * Project-scoped Account Keys reach list (with their projectApiKeyId),
 * create, and the item calls get, update, publish and unpublish (news of
 * another project answers 404); delete and statistics are denied for them.
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
  IDEMPOTENT_WRITE,
  DESTRUCTIVE_WRITE,
} from "./_utils.js";

const translationsSchema = z
  .record(z.string().min(2).max(5), z.string())
  .describe(
    'Translations as {lang: content}, e.g. {"en":"Title","de":"Titel"}',
  );

const TITLES_HINT =
  'Titles as {language code: title}, e.g. {"en":"Update 1.2","de":"Update 1.2"}; codes 2 to 5 characters, texts not blank. Must use the same language codes as messages; the tier caps the number of languages (FREE: 1) and the title length';

const MESSAGES_HINT =
  'Message bodies as {language code: text}, e.g. {"en":"New levels","de":"Neue Level"}; codes 2 to 5 characters, texts not blank. Must use the same language codes as titles; the tier caps the number of languages (FREE: 1) and the message length';

const SCOPE_WITH_PROJECT =
  "an Account Key with full-account access or the NEWS feature group; a project-scoped Account Key only for its own projectApiKeyId.";

const SCOPE_ITEM =
  "an Account Key with full-account access or the NEWS feature group; a project-scoped Account Key only for news of its own Project API key (other news answers 404).";

const SCOPE_ACCOUNT_WIDE =
  "an Account Key with full-account access or the NEWS feature group; project-scoped Account Keys are denied (403).";

const NEWS_FIELDS =
  "id, accountId, apiKeyId, titles, messages, releaseDate, isPublished, isScheduled, publishedAt, isActive, languageCount, createdAt, updatedAt";

const VISIBILITY =
  "Games (horizon_get_news) only see news that is published, active, not deleted and whose releaseDate has passed.";

const NOT_FOUND = "404 for an unknown or deleted id: list the ids with horizon_admin_news_list.";

const newsIdSchema = (purpose: string) =>
  z.string().uuid().describe(`id (UUID) of the news entry ${purpose}, from horizon_admin_news_list or horizon_admin_news_create`);

export function registerAdminNewsTools(server: McpServer): void {
  server.registerTool(
    "horizon_admin_news_list",
    {
      title: "List News Entries",
      description: describeTool(
        {
          summary:
            "Lists the account's news entries (all languages), newest releaseDate first, with filters for project, published state, active state and text; deleted news is never listed.",
          use: "reviewing announcements or finding a news id for the get, update, publish, unpublish and delete tools.",
          avoid: "one known entry (use horizon_admin_news_get), counts only (use horizon_admin_news_getStats) or the news a game receives (use the player tool horizon_get_news).",
          requires: SCOPE_WITH_PROJECT,
          effects: "None (read only).",
          returns:
            `{news, totalElements, totalPages, currentPage, pageSize}; each entry has ${NEWS_FIELDS}. ` +
            "An empty news array means nothing matches the filters.",
          errors: "403 for a project-scoped Account Key without its own projectApiKeyId: pass it.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .optional()
          .describe("id (UUID) of the Project API key to filter by, from horizon_admin_projects_list (sent as apiKeyId). Omit for all projects; required for a project-scoped Account Key"),
        isPublished: z
          .boolean()
          .optional()
          .describe("true: only published news; false: only unpublished (drafts and scheduled). Omit for both"),
        isActive: z
          .boolean()
          .optional()
          .describe("true: only active news; false: only news hidden with isActive false (deleted news is never listed). Omit for both"),
        search: z
          .string()
          .optional()
          .describe("Case-insensitive pattern matched against titles and messages (treated as a regular expression). Optional"),
        page: z.number().int().min(0).default(0).describe("0-based page index (default 0)"),
        size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("Items per page, 1 to 100 (default 20)"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary: "Returns one news entry by id with all language variants and its publication state.",
          use: "reading the current titles and messages before horizon_admin_news_update, or checking whether an entry is published or scheduled.",
          avoid: "browsing entries (use horizon_admin_news_list).",
          requires: "id from horizon_admin_news_list; " + SCOPE_ITEM,
          effects: "None (read only).",
          returns: `{${NEWS_FIELDS}}.`,
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: newsIdSchema("to fetch"),
      },
      annotations: READ_ONLY,
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
      description: describeTool(
        {
          summary:
            "Creates a new news entry for a Project API key with titles and messages per language, as a draft, published at once, or scheduled for its releaseDate.",
          use: "announcing an update, event or maintenance to players of one game.",
          avoid: "changing an existing entry (use horizon_admin_news_update) or only publishing a draft (use horizon_admin_news_publish).",
          requires: "projectApiKeyId from horizon_admin_projects_list; " + SCOPE_WITH_PROJECT,
          effects:
            "Creates a new entry on every call (a repeat creates a duplicate). isScheduled lets the server publish it automatically once releaseDate is due. " + VISIBILITY,
          returns: `The created entry: {${NEWS_FIELDS}}.`,
          errors:
            "400 INVALID_LANGUAGE_COUNT when titles and messages use different language codes, exceed the tier's language count or a title or message is too long: fix the maps. " +
            "400 INVALID_NEWS_PUBLICATION_STATE when isPublished and isScheduled are both true (this tool rejects that before calling). " +
            "An error saying the news entry limit is reached when the tier's news count is used up: delete old entries with horizon_admin_news_delete.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        projectApiKeyId: z
          .string()
          .uuid()
          .describe("id (UUID) of the Project API key whose players see this news, from horizon_admin_projects_list"),
        titles: translationsSchema.describe(TITLES_HINT),
        messages: translationsSchema.describe(MESSAGES_HINT),
        releaseDate: z
          .string()
          .datetime({ local: true })
          .describe(
            "Release date and time as ISO 8601 without timezone, e.g. 2026-04-16T12:00:00. Games see the entry only after this time; a scheduled entry is published at this time",
          ),
        isPublished: z
          .boolean()
          .optional()
          .describe("true publishes on creation (default false: draft). Cannot be combined with isScheduled true"),
        isScheduled: z
          .boolean()
          .optional()
          .describe("true publishes automatically when releaseDate is due (default false). Cannot be combined with isPublished true"),
      },
      annotations: ADDITIVE_WRITE,
    },
    async ({
      projectApiKeyId,
      titles,
      messages,
      releaseDate,
      isPublished,
      isScheduled,
    }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        if (isPublished && isScheduled) {
          return errorResponse(new Error("isPublished and isScheduled cannot both be true"));
        }
        const body: Record<string, unknown> = {
          apiKeyId: projectApiKeyId,
          titles,
          messages,
          releaseDate,
        };
        if (isPublished !== undefined) body.isPublished = isPublished;
        if (isScheduled !== undefined) body.isScheduled = isScheduled;
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
      description: describeTool(
        {
          summary:
            "Overwrites the given fields of a news entry (texts, releaseDate, publication, schedule, active flag); omitted fields keep their value.",
          use: "fixing texts, adding a language, moving the release date, or hiding an entry with isActive false.",
          avoid: "only publishing or unpublishing (use horizon_admin_news_publish or horizon_admin_news_unpublish) or removing the entry (use horizon_admin_news_delete).",
          requires: "id from horizon_admin_news_list; " + SCOPE_ITEM,
          effects:
            "titles and messages each replace the whole map (languages left out are removed). isPublished true publishes now, isPublished false unpublishes, isScheduled true schedules for releaseDate, isScheduled false cancels a schedule. " +
            "Repeating the same call changes nothing more. " + VISIBILITY,
          returns: `The updated entry: {${NEWS_FIELDS}}.`,
          errors:
            NOT_FOUND +
            " 400 INVALID_LANGUAGE_COUNT when the resulting titles and messages use different language codes, exceed the tier's language count or a text is too long: send both maps together. " +
            "400 INVALID_NEWS_PUBLICATION_STATE for published plus scheduled.",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: newsIdSchema("to update"),
        titles: translationsSchema.optional().describe(TITLES_HINT + ". Replaces all titles. Omit to keep them"),
        messages: translationsSchema.optional().describe(MESSAGES_HINT + ". Replaces all messages. Omit to keep them"),
        releaseDate: z
          .string()
          .datetime({ local: true })
          .optional()
          .describe("New release date and time as ISO 8601 without timezone, e.g. 2026-04-16T12:00:00. Omit to keep it"),
        isPublished: z
          .boolean()
          .optional()
          .describe("true publishes now, false unpublishes (also cancels a schedule). Omit to keep the state. Cannot be combined with isScheduled true"),
        isScheduled: z
          .boolean()
          .optional()
          .describe("true schedules publication for releaseDate, false cancels the schedule. Omit to keep it. Cannot be combined with isPublished true"),
        isActive: z
          .boolean()
          .optional()
          .describe("false hides the entry from games without deleting it, true shows it again. Omit to keep it"),
      },
      annotations: DESTRUCTIVE_WRITE,
    },
    async ({ id, titles, messages, releaseDate, isPublished, isScheduled, isActive }) => {
      const client = getAdminClient();
      if (!client) return noAdminClientResponse();
      try {
        if (isPublished && isScheduled) {
          return errorResponse(new Error("isPublished and isScheduled cannot both be true"));
        }
        const body: Record<string, unknown> = {};
        if (titles !== undefined) body.titles = titles;
        if (messages !== undefined) body.messages = messages;
        if (releaseDate !== undefined) body.releaseDate = releaseDate;
        if (isPublished !== undefined) body.isPublished = isPublished;
        if (isScheduled !== undefined) body.isScheduled = isScheduled;
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
      description: describeTool(
        {
          summary: "Deletes a news entry (soft delete): games stop receiving it and it disappears from the admin list for good.",
          use: "an announcement is obsolete, or to free a slot of the tier's news limit.",
          avoid: "hiding it temporarily (use horizon_admin_news_unpublish or horizon_admin_news_update with isActive false).",
          requires: "id from horizon_admin_news_list; " + SCOPE_ACCOUNT_WIDE,
          effects: "Marks the entry deleted; no MCP tool restores it.",
          returns: "null (the server answers HTTP 204 without a body).",
          errors: "404 for an unknown or already deleted id (nothing left to do).",
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: newsIdSchema("to delete"),
      },
      annotations: DESTRUCTIVE_WRITE,
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
      description: describeTool(
        {
          summary: "Publishes a news entry now: sets isPublished, cancels any schedule and stamps publishedAt.",
          use: "a draft or scheduled entry should go live immediately.",
          avoid: "publishing later at releaseDate (use horizon_admin_news_update with isScheduled true) or changing texts (use horizon_admin_news_update).",
          requires: "id from horizon_admin_news_list; " + SCOPE_ITEM,
          effects: "Changes only the publication state; a repeat keeps it published and refreshes publishedAt. " + VISIBILITY,
          returns: `The updated entry: {${NEWS_FIELDS}}.`,
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: newsIdSchema("to publish"),
      },
      annotations: IDEMPOTENT_WRITE,
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
      description: describeTool(
        {
          summary: "Unpublishes a news entry so games stop receiving it: clears isPublished, isScheduled and publishedAt; texts stay.",
          use: "taking an announcement offline or cancelling a scheduled publication while keeping it as a draft.",
          avoid: "removing it for good (use horizon_admin_news_delete).",
          requires: "id from horizon_admin_news_list; " + SCOPE_ITEM,
          effects: "Changes only the publication state; publish it again with horizon_admin_news_publish. Repeating the call changes nothing more.",
          returns: `The updated entry: {${NEWS_FIELDS}}.`,
          errors: NOT_FOUND,
        },
        ADMIN_AUTH,
      ),
      inputSchema: {
        id: newsIdSchema("to unpublish"),
      },
      annotations: IDEMPOTENT_WRITE,
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
      description: describeTool(
        {
          summary: "Returns account-wide news counts by state (published, active, scheduled, overdue); it cannot be filtered by project.",
          use: "a quick overview before cleaning up, or checking for scheduled entries that are overdue.",
          avoid: "per-project numbers or the entries themselves (use horizon_admin_news_list with projectApiKeyId).",
          requires: SCOPE_ACCOUNT_WIDE,
          effects: "None (read only).",
          returns: "{total, published, unpublished, active, inactive, scheduled, overdue}, counted over all non deleted news of the account. scheduled counts entries waiting for a future releaseDate, overdue those whose releaseDate passed but are not published yet.",
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
        const result = await client.get("/api/v1/admin/news/statistics");
        return jsonResponse(result);
      } catch (e) {
        return errorResponse(e);
      }
    },
  );
}
