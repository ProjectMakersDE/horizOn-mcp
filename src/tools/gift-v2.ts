import { createHash } from "node:crypto";
import { z } from "zod/v4";

export const giftCount = z.string().max(19).regex(/^(0|[1-9][0-9]*)$/).refine(
  value => value.length < 19 || (value.length === 19 && value <= "9223372036854775807"),
  "Expected a canonical nonnegative Int64 decimal string",
);

/** Local recovery data; projectScope and session token never enter the request body. */
export const giftIntent = z.object({
  protocolVersion: z.literal(2), projectScope: z.string().regex(/^[a-f0-9]{64}$/),
  userId: z.string().uuid(), code: z.string().min(1).max(50), campaignId: z.string().uuid(),
  expectedCount: giftCount, configRevision: giftCount,
}).strict();

export function giftProjectScope(): string {
  return createHash("sha256").update(JSON.stringify([
    (process.env.HORIZON_BASE_URL || "https://horizon.pm").replace(/\/+$/, ""),
    process.env.HORIZON_API_KEY || "",
  ])).digest("hex");
}

export function preparedGift(response: unknown, code: string, userId: string) {
  const parsed = z.object({ valid: z.boolean() }).loose().parse(response);
  if (!parsed.valid) return { ...parsed, intent: null };
  const identity = z.object({ protocolVersion: z.literal(2), campaignId: z.string().uuid(),
    expectedCount: giftCount, configRevision: giftCount }).parse(response);
  return { ...parsed, intent: giftIntent.parse({ ...identity, code, userId, projectScope: giftProjectScope() }) };
}

/** A malformed completed reply leaves the caller's original intent unresolved. */
export function checkedGift(response: unknown, intent: z.infer<typeof giftIntent>) {
  const result = z.object({ success: z.literal(true), campaignId: z.string().uuid(), count: giftCount,
    configRevision: giftCount, alreadyApplied: z.boolean(), replayed: z.boolean(),
    giftData: z.string().nullable(), grantedValues: z.array(z.unknown()), grantedUnlocks: z.array(z.string()),
    playerValues: z.record(z.string(), z.unknown()).nullable(),
  }).loose().parse(response);
  const replay = result.alreadyApplied && result.replayed;
  const valid = result.campaignId.toLowerCase() === intent.campaignId.toLowerCase() &&
    (replay ? BigInt(result.count) > BigInt(intent.expectedCount) && result.giftData === null &&
      result.grantedValues.length === 0 && result.grantedUnlocks.length === 0 :
      !result.alreadyApplied && !result.replayed && BigInt(result.count) === BigInt(intent.expectedCount) + 1n &&
      result.configRevision === intent.configRevision);
  if (!valid) throw new Error("INVALID_RESPONSE: keep the original intent; reconcile the uncertain redemption before starting another");
  return result;
}

/** Validate new exact fields without deriving them from rounded compatibility numbers. */
export function checkedGiftAdmin(response: unknown, kind: "record" | "list" | "statistics") {
  const record = z.object({ exactCurrentTotalRedemptions: giftCount.optional(),
    exactRemainingRedemptions: giftCount.nullable().optional() }).loose();
  if (kind === "list") return z.object({ giftCodes: z.array(record) }).loose().parse(response);
  if (kind === "statistics") return z.object({ exactTotalRedemptions: z.string().regex(/^(0|[1-9][0-9]*)$/).optional() }).loose().parse(response);
  return record.parse(response);
}
