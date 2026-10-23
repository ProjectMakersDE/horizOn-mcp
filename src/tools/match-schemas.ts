import { z } from "zod/v4";
import { sharedInteger, sharedRevision, sharedText } from "./shared-object-schemas.js";
import { MATCH_STATE_BYTES } from "./feature-bounds.js";

export { sharedRevision as matchRevision };
export const matchInteger = sharedInteger.describe("Exact safe integer strength from the original search range");
export const matchId = z.string().uuid().describe("Original server match UUID in the selected project");
export const matchBytes = (max: number) => z.string().max(Math.ceil(max / 3) * 4).refine(value => {
  const bytes = Buffer.from(value, "base64"); return bytes.length <= max && bytes.toString("base64") === value;
}, `Canonical padded Base64 with at most ${max} decoded bytes`).describe("Original opaque bytes, including empty state. Never interpret or silently replace them");
export const matchIds = (max: number) => z.array(z.string().uuid()).max(max).refine(ids => new Set(ids).size === ids.length, "Unique UUIDs");
export const matchPage = { limit: z.number().int().min(1).max(50).optional().describe("One explicit page of at most fifty summaries"),
  cursor: z.string().min(1).max(256).refine(value => Buffer.from(value, "base64").toString("base64") === value, "Original canonical Base64 cursor").optional().describe("Previous consumed-only cursor; an empty page can have a continuation") };
export const matchConfig = z.string().regex(/^[a-z0-9_-]{1,64}$(?![\s\S])/).nullable().describe("Existing leaderboard key, or null to disable future ranked matches");
export const matchCreate = z.object({ name: sharedText(120).refine(v => v.trim().length > 0, "Nonblank name"), capacity: z.number().int().min(2).max(8),
  visibility: z.enum(["open", "private"]), strength: sharedInteger, turnSeconds: z.number().int().min(60).max(604800),
  timeoutPolicy: z.enum(["skip", "forfeit"]), ranked: z.boolean(), dataBase64: matchBytes(MATCH_STATE_BYTES), inviteeIds: matchIds(7),
}).strict().refine(v => v.inviteeIds.length < v.capacity, "Invitees must fit the lobby after the creator").describe("Complete immutable lobby settings; current tier state cap also applies");
export const matchQuery = (value: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(Object.entries(value).filter(([,v]) => v !== undefined).map(([k,v]) => [k,String(v)]));
