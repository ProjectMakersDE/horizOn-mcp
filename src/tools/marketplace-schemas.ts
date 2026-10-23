import { z } from "zod/v4";
export { chatId as marketId, chatTime as marketTime, chatRevision as marketRevision, chatText as marketText, chatPage as marketPage, chatQuery as marketQuery } from "./chat-schemas.js";
export const marketKey = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).describe("Exact Items template key");
export const marketCurrency = z.string().regex(/^[a-z0-9][a-z0-9._-]{0,23}$/).describe("Exact currency key from the saved Player Values configuration");
export const marketPrice = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER).describe("Original positive safe-integer price in the configured currency");
export const marketCursor = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/).refine(v => Buffer.from(v, "base64url").toString("base64url") === v,
  "Canonical opaque cursor").optional().describe("Original cursor with identical filters; an empty page may still have continuation");
export const marketStatus = z.enum(["active", "return_pending", "return_delivered", "sold", "returned"]).describe("Exact listing lifecycle status");
