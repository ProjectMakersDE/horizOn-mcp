import { z } from "zod/v4";
export const chatId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).describe("Original canonical lowercase UUID");
export const chatRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).describe("Exact original safe-integer revision; never refresh-and-retry a mutation");
export const chatTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/).refine(value => {
  const date = new Date(value); return Number.isFinite(date.getTime()) && date.toISOString() === value;
}, "Canonical UTC millisecond timestamp").describe("Original canonical timestamp including .SSSZ; never replace issuedAt on retry");
export function chatText(characters: number, bytes: number, nonblank = true) {
  return z.string().max(characters * 2).refine(value => {
    const scalars = [...value];
    return (!nonblank || value.trim().length > 0) && scalars.length <= characters && Buffer.byteLength(value, "utf8") <= bytes &&
      scalars.every(c => { const cp = c.codePointAt(0)!; return !(cp >= 0xd800 && cp <= 0xdfff) && !(cp <= 0x1f && cp !== 9 && cp !== 10) && !(cp >= 0x7f && cp <= 0x9f); });
  }, `Valid plain Unicode, at most ${characters} scalars/${bytes} UTF-8 bytes, no controls except LF/TAB`).describe(`Original plain Unicode text, at most ${characters} scalars and ${bytes} UTF-8 bytes`);
}
export const chatIds = z.array(chatId).max(20).refine(ids => new Set(ids).size === ids.length, "Unique known message IDs").describe("Known cached message IDs for the exact original epoch; fixed current wire bound20 matches the largest channel window");
export const chatPage = { limit: z.number().int().min(1).max(50).optional().describe("One explicit bounded page, never automatic traversal") };
export const chatCursor = z.string().min(1).max(256).refine(value => Buffer.from(value, "base64url").toString("base64url") === value,
  "Original canonical base64url cursor").optional().describe("Opaque original cursor; empty result pages may still have continuation");
export const chatQuery = (value: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k,String(v)]));
