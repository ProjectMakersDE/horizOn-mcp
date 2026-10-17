import { describe, it, expect, vi, afterEach } from "vitest";
import { giftCount, giftIntent, preparedGift, checkedGift, giftProjectScope, checkedGiftAdmin } from "../gift-v2.js";
const userId = "550e8400-e29b-41d4-a716-446655440000";
const campaignId = "750e8400-e29b-41d4-a716-446655440002";
const saved = () => ({ protocolVersion: 2 as const, projectScope: giftProjectScope(), userId, code: "REWARD", campaignId, expectedCount: "9007199254740993", configRevision: "7" });
const fresh = () => ({ success: true, campaignId, count: "9007199254740994", configRevision: "7", alreadyApplied: false, replayed: false, giftData: "{}", grantedValues: [], grantedUnlocks: [], playerValues: null });
afterEach(() => { vi.unstubAllEnvs(); });
describe("gift V2 exact identities and confirmation", () => {
  it.each(["0", "1", "9007199254740993", "9223372036854775807"])("keeps %s exact", value => {
    expect(giftCount.parse(value)).toBe(value);
  });
  it.each([0, 9007199254740992, null, "", "00", "01", "-1", "+1", "1.0", "1e3", " 1", "9223372036854775808", "1".repeat(100)])("rejects malformed counter %s", value => {
    expect(giftCount.safeParse(value).success).toBe(false);
  });
  it("returns a complete seven-field recovery object only for valid V2 prepare", () => {
    const result = preparedGift({ valid: true, protocolVersion: 2, campaignId, expectedCount: "9007199254740993", configRevision: "7" }, "REWARD", userId);
    expect(result.intent).toEqual(saved());
    expect(preparedGift({ valid: false }, "REWARD", userId).intent).toBeNull();
    expect(() => preparedGift({ valid: true, campaignId }, "REWARD", userId)).toThrow();
    expect(giftIntent.safeParse({ ...saved(), idempotencyId: "old" }).success).toBe(false);
  });
  it("binds host and project without including their credentials", () => {
    vi.stubEnv("HORIZON_API_KEY", "fixture-project"); vi.stubEnv("HORIZON_BASE_URL", "http://localhost:12345/"); const original = giftProjectScope();
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    vi.stubEnv("HORIZON_BASE_URL", "http://localhost:12345"); expect(giftProjectScope()).toBe(original);
    vi.stubEnv("HORIZON_API_KEY", "another-project"); expect(giftProjectScope()).not.toBe(original);
  });
  it("confirms fresh once, and current-state replay even after configuration changes", () => {
    expect(checkedGift(fresh(), saved())).toEqual(fresh());
    const replay = { ...fresh(), count: "9223372036854775807", configRevision: "8", alreadyApplied: true, replayed: true, giftData: null };
    expect(checkedGift(replay, saved())).toEqual(replay);
  });
  it.each([{ count: "9007199254740995" }, { configRevision: "8" }, { campaignId: userId }, { alreadyApplied: true }, { count: 9007199254740994 }, { count: "01" }])("never confirms a foreign/malformed fresh reply %j", change => {
    expect(() => checkedGift({ ...fresh(), ...change }, saved())).toThrow();
  });
  it.each([{ giftData: "{}" }, { grantedValues: [{ key: "gold", amount: 1 }] }, { grantedUnlocks: ["x"] }, { count: "9007199254740993" }, { replayed: false }])("never confirms a historical or impossible replay %j", change => {
    expect(() => checkedGift({ ...fresh(), alreadyApplied: true, replayed: true, giftData: null, ...change }, saved())).toThrow();
  });
});

describe("exact admin counters", () => {
  it("never reconstructs missing exact strings from rounded numbers", () => {
    const legacy = { currentTotalRedemptions: 9223372036854776000 };
    expect(checkedGiftAdmin(legacy, "record")).toEqual(legacy);
    expect(checkedGiftAdmin({ giftCodes: [{ exactCurrentTotalRedemptions: "9223372036854775807", exactRemainingRedemptions: "0" }] }, "list")).toEqual({ giftCodes: [{ exactCurrentTotalRedemptions: "9223372036854775807", exactRemainingRedemptions: "0" }] });
    expect(checkedGiftAdmin({ exactRemainingRedemptions: null }, "record")).toEqual({ exactRemainingRedemptions: null });
    expect(checkedGiftAdmin({ exactTotalRedemptions: "18446744073709551614" }, "statistics")).toEqual({ exactTotalRedemptions: "18446744073709551614" });
  });
  it.each([1, "-1", "01", "9223372036854775808"])("rejects invalid exact per-campaign counter %s", value => {
    expect(() => checkedGiftAdmin({ exactCurrentTotalRedemptions: value }, "record")).toThrow();
    expect(() => checkedGiftAdmin({ exactRemainingRedemptions: value }, "record")).toThrow();
  });
});
