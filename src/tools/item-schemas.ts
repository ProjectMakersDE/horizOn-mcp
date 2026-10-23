import { z } from "zod/v4";

export const itemKey = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$(?![\s\S])/).describe("Permanent lowercase key, letters/digits/underscore, starting with a letter");
export const itemInteger = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const itemRevision = itemInteger.min(0).describe("Exact reviewed revision; never refresh and substitute automatically");
const unicode = z.string().refine(value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value), "Unpaired Unicode surrogate");

/** Literal Unicode, sorted ASCII keys, short JSON escapes: the server/PHP byte contract. */
export function canonicalItemJson(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalItemJson).join(",") + "]";
  if (value !== null && typeof value === "object") return "{" + Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, entry]) => JSON.stringify(key) + ":" + canonicalItemJson(entry)).join(",") + "}";
  return JSON.stringify(value);
}
const properties = z.record(itemKey, z.union([unicode, z.boolean(), itemInteger])).refine(value =>
  Object.keys(value).length <= 16 && Buffer.byteLength(canonicalItemJson(value), "utf8") <= 256, "At most 16 properties and 256 canonical UTF-8 bytes");
export const itemTemplate = z.object({
  name: unicode.min(1).refine(value => value.trim().length > 0 && Buffer.byteLength(value, "utf8") <= 120, "Nonblank name, at most 120 UTF-8 bytes"),
  type: itemKey, rarity: itemKey, active: z.boolean(), baseProperties: properties,
  propertyRules: z.array(z.object({ key: itemKey, min: itemInteger, max: itemInteger, maxChangePerCall: itemInteger.min(1) }).strict()).max(16),
}).strict().refine(value => new Set(value.propertyRules.map(rule => rule.key)).size === value.propertyRules.length && value.propertyRules.every(rule => {
  const initial = value.baseProperties[rule.key];
  return typeof initial === "number" && rule.min <= rule.max && initial >= rule.min && initial <= rule.max;
}), "Unique rules require an existing integer base property within min/max");
export const itemChanges = z.array(z.object({ key: itemKey, amount: itemInteger.refine(value => value !== 0, "Delta must be nonzero") }).strict())
  .min(1).max(8).refine(rows => new Set(rows.map(row => row.key)).size === rows.length, "Duplicate property delta").describe("Up to eight distinct nonzero deltas; current server rules and final 256-byte size still apply");
export const itemRewards = z.array(z.object({ itemKey, quantity: z.number().int().min(1).max(4) }).strict()).max(4)
  .refine(rows => new Set(rows.map(row => row.itemKey)).size === rows.length && rows.reduce((sum, row) => sum + row.quantity, 0) <= 4,
    "Distinct item keys and at most four granted instances per purchase");
export const itemPage = {
  afterKey: itemKey.optional().describe("Previous nextAfterKey, or omit for the first page"),
  limit: z.number().int().min(1).max(50).optional().describe("Explicit page size, default 50; never automatically fetch all pages"),
  catalogRevision: itemRevision.optional().describe("First page revision, retained unchanged on later pages; conflict requires restarting the catalog read"),
};
export function itemPageQuery(page: { afterKey?: string; limit?: number; catalogRevision?: number }): Record<string, string> {
  return { ...(page.afterKey === undefined ? {} : { afterKey: page.afterKey }), ...(page.limit === undefined ? {} : { limit: String(page.limit) }),
    ...(page.catalogRevision === undefined ? {} : { catalogRevision: String(page.catalogRevision) }) };
}
