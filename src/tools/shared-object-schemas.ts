import { z } from "zod/v4";
import { INT32_MAX, SHARED_OBJECT_BYTES } from "./feature-bounds.js";

export const sharedKey = z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$(?![\s\S])/).describe("Permanent collection or configured field key, lowercase ASCII");
export const sharedInteger = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
export const sharedRevision = sharedInteger.min(0).describe("Original reviewed revision; never substitute a newer revision after an uncertain write");
export const sharedText = (bytes: number) => z.string().max(bytes).refine(value => !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)
  && Buffer.byteLength(value, "utf8") <= bytes, `Valid Unicode, at most ${bytes} UTF-8 bytes`);
export const sharedData = {
  dataBase64: z.string().max(Math.ceil(SHARED_OBJECT_BYTES / 3) * 4).refine(value => { const bytes = Buffer.from(value, "base64"); return bytes.length <= SHARED_OBJECT_BYTES && bytes.toString("base64") === value; }, "Canonical padded Base64, at most1 MiB technical query envelope; current collection/System Config cap also applies").describe("Opaque canonical padded Base64 bytes; never interpret or replace them implicitly"),
  search: z.record(sharedKey, z.union([sharedInteger, sharedText(96)])).refine(value => Object.keys(value).length <= 3, "At most three configured typed fields").describe("Complete configured search fields; safe integers or bounded UTF-8 strings"),
  position: z.object({ x: sharedInteger, y: sharedInteger }).strict().nullable().optional().describe("Complete safe-integer grid position when enabled, otherwise null or omitted"),
};
export const sharedDefinition = z.object({
  name: sharedText(120).refine(value => value.trim().length > 0, "Nonblank name"), active: z.boolean(),
  readPolicy: z.enum(["owner", "friends", "group", "all", "dashboard"]), writePolicy: z.enum(["owner", "group", "dashboard"]),
  maxObjectBytes: z.number().int().min(1).max(SHARED_OBJECT_BYTES).describe("Configured collection bytes, within the current advertised objectBytes and1 MiB technical envelope"), maxObjectsPerOwner: z.number().int().min(1).max(INT32_MAX).describe("Positive Int32 collection policy, independent of the default100"),
  ttlSeconds: z.number().int().min(60).max(2592000).nullable(),
  searchFields: z.array(z.object({ key: sharedKey, type: z.enum(["integer", "string"]) }).strict()).max(3), positionEnabled: z.boolean(),
}).strict().refine(value => new Set(value.searchFields.map(field => field.key)).size === value.searchFields.length &&
  (value.readPolicy !== "dashboard" || value.writePolicy === "dashboard"), "Unique field keys; dashboard-only reads require dashboard-only writes").describe("Complete collection definition without server-owned key, used or revision");
const scalar = z.union([sharedInteger, sharedText(96)]);
export const sharedQuery = z.object({
  ownerId: z.string().uuid().optional(), groupId: z.string().uuid().optional(), mode: z.enum(["list", "owner", "field", "rectangle", "random"]),
  limit: z.number().int().min(1).max(50).optional(), cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$(?![\s\S])/).optional(),
  field: sharedKey.optional(), equal: scalar.optional(), min: scalar.optional(), max: scalar.optional(),
  minX: sharedInteger.optional(), maxX: sharedInteger.optional(), minY: sharedInteger.optional(), maxY: sharedInteger.optional(),
}).strict().refine(value => {
  const extra = Object.keys(value).filter(key => !["ownerId", "groupId", "mode", "limit", "cursor"].includes(key));
  if (value.mode === "list" || value.mode === "owner") return extra.length === 0 && (value.mode !== "owner" || value.ownerId !== undefined);
  if (value.mode === "rectangle") return extra.every(key => ["minX", "maxX", "minY", "maxY"].includes(key)) &&
    value.minX !== undefined && value.maxX !== undefined && value.minY !== undefined && value.maxY !== undefined && value.minX <= value.maxX && value.minY <= value.maxY;
  if (extra.some(key => !["field", "equal", "min", "max"].includes(key)) || value.field === undefined) return false;
  if (value.mode === "random") return value.cursor === undefined && value.equal === undefined && typeof value.min === "number" && typeof value.max === "number" && value.min <= value.max;
  return value.equal !== undefined ? value.min === undefined && value.max === undefined :
    value.min !== undefined && value.max !== undefined && typeof value.min === typeof value.max &&
    (typeof value.min === "number" ? value.min <= (value.max as number) : Buffer.compare(Buffer.from(value.min), Buffer.from(value.max as string)) <= 0);
}, "Use only fields for the selected query mode; explicit bounded range or equality, never both").describe("Explicit bounded query and original cursor; one permission partition only");
export const sharedPage = { afterKey: sharedKey.optional().describe("Previous nextAfterKey, omitted on the first catalog page"), limit: z.number().int().min(1).max(50).optional().describe("Explicit page size from one to fifty; no automatic page traversal"), catalogRevision: sharedRevision.optional().describe("Original first-page catalog revision retained across later pages") };
export function sharedPageQuery(page: { afterKey?: string; limit?: number; catalogRevision?: number }): Record<string, string> {
  return Object.fromEntries(Object.entries(page).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]));
}
