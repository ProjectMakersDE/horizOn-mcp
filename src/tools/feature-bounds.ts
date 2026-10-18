/** Technical representation bounds from the Server114 contract, not tier defaults. */
export const INT32_MAX = 2_147_483_647;
export const BSON_DOCUMENT_BYTES = 16 * 1024 * 1024;
export const SHARED_OBJECT_BYTES = 1024 * 1024;
// Server MatchLimitService:14,648 KiB. Its Base64 fits the20,003,500-byte write frame.
export const MATCH_STATE_BYTES = 14_648 * 1024;
// Group queries reserve one extra row for continuation; Int.MAX_VALUE is rejected.
export const GROUP_PAGE_MAX = INT32_MAX - 1;

/** Group data is JSON with a configurable depth. No default-depth16 policy here. */
export function groupJsonBytes(value: Record<string, unknown>): number | null {
  const pending: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length) {
    const next = pending.pop();
    if (next === null || typeof next === "string" || typeof next === "boolean") continue;
    if (typeof next === "number") { if (!Number.isFinite(next)) return null; continue; }
    if (typeof next !== "object") return null;
    if (seen.has(next)) return null;
    seen.add(next);
    if (!Array.isArray(next) && Object.getPrototypeOf(next) !== Object.prototype && Object.getPrototypeOf(next) !== null) return null;
    for (const child of Object.values(next)) pending.push(child);
  }
  try { return Buffer.byteLength(JSON.stringify(value), "utf8"); } catch { return null; }
}
