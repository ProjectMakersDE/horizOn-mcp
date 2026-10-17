# Gift Codes: compact protocol V2

Prepare once, persist the original identity, then consume or explicitly retry that same identity. A timeout, restart, changed configuration or returned current count must never trigger automatic preparation of a replacement. Two devices holding the same campaign/player/expectedCount address one logical sequence slot.

## MCP tools

- `horizon_validate_gift_code({code,userId})`: public read-only validity check, no Bearer and no reservation.
- `horizon_prepare_gift_code({code,userId,sessionToken})`: authenticated read-only prepare. Returns `{valid,intent}`. A valid intent has exactly seven fields: `protocolVersion:2`, `projectScope`, `userId`, `code`, immutable `campaignId`, `expectedCount`, `configRevision`. Persist every field before the first consume. The MCP host/project fingerprint contains no raw key; it is local recovery data, not authorization. Keep intents separate by host/project/player, and never store the session token with them.
- `horizon_redeem_gift_code({intent,sessionToken})`: explicit consume or retry of that saved object. It sends the six original wire fields and the current Bearer header, never `projectScope` or the token in JSON. It does not prepare, increment or retry behind the caller's back. A different local host/project rejects before HTTP.

Keep one unresolved intent per UI action. Disable overlapping prepare/persist/consume calls. On restart, display the saved action and offer explicit retry; do not consume automatically. Preserve old V1/corrupt/foreign records for reconciliation instead of overwriting them. Clear only the exact confirmed record; retain it after errors or malformed replies. Re-authentication may replace the Bearer token for the same original user.

A fresh response includes `success:true,campaignId,count,configRevision,alreadyApplied:false,replayed:false,giftData,grantedValues,grantedUnlocks,playerValues`. The count must equal original expectedCount+1 and revision must equal the original revision. A replay returns current count/revision/state, both flags true, `giftData:null,grantedValues:[],grantedUnlocks:[]`. It confirms that the sequence slot is consumed, without reconstructing any historical reward. Replace balances from `playerValues`; never add `grantedValues` locally. Treat opaque giftData as game-defined data, not authoritative server balances or item ownership. Invalidate/reload cosmetic state after a replay.

## Wire API

All calls require the Project API key. `POST /api/v1/app/gift-codes/validate` accepts `{code,userId}` for public valid-only checks. With `includeIntent:true`, it additionally requires `Authorization: Bearer <accessToken>` and returns `{valid:true,protocolVersion:2,campaignId:"UUID",expectedCount:"0",configRevision:"1"}` when valid. It stores/reserves nothing.

`POST /api/v1/app/gift-codes/redeem` requires Bearer and this complete body:

```json
{
  "protocolVersion": 2,
  "userId": "550e8400-e29b-41d4-a716-446655440000",
  "code": "PROMO2024",
  "campaignId": "750e8400-e29b-41d4-a716-446655440002",
  "expectedCount": "0",
  "configRevision": "1"
}
```

Count/revision are canonical nonnegative Int64 decimal strings, `0..9223372036854775807`, without signs, whitespace, fractions, leading zeroes or numeric JSON coercion. Keep them as strings; JavaScript Number is not lossless. BigInt arithmetic must serialize back to decimal strings. The campaign UUID is authoritative even when its visible code is deleted and recreated. Fresh consumption checks current validity/limits/revision and atomically commits the counter, value and cosmetic grants. Replay precedes current validity/revision checks after authorization. No counter expires or rewinds after cleanup, revocation or deletion.

## Errors and uncertain outcomes

| Error | Caller action |
| --- | --- |
| `UPGRADE_REQUIRED` (409) | V1 fresh writes and replay are closed. Old arbitrary idempotencyId is never translated into a counter. Resolve old uncertainty before explicitly starting V2. |
| `MIGRATION_REQUIRED` (409) | Existing campaign/source needs verified operator migration; preserve the original intent. |
| `COUNT_AHEAD` (409) | Expected count is ahead of current state; reconcile, never fill gaps automatically. |
| `CAMPAIGN_CHANGED` (409) | Fresh original revision is stale; do not silently accept current rewards. |
| `COUNTER_EXHAUSTED` (409) | Int64 increment/revision cannot proceed; no wrap or replacement count. |
| `STATE_CONFLICT`, connection loss or malformed reply | Outcome may be uncertain; explicitly retry the same saved identity. |
| `MAX_BALANCE_REACHED`, `UNLOCK_LIMIT_REACHED` | Reward transaction is not consumed; keep the original identity and resolve the domain condition. |
| `INVALID_REQUEST` (400) | Missing/malformed V2 identity or mixed V1/V2 fields; preserve the original for inspection. |
| `PROJECT_SCOPE_CHANGED` (local MCP) | Restore the original host/project context; do not retarget the saved identity. |
| 401 / 403 | Sign in as the original user; a new user's session cannot claim the old user's intent. |

No error or returned count authorizes an automatic new slot. The MCP keeps no hidden pending store; the calling application owns durable persistence.

## Native SDK consumers

Unity uses `PrepareRedemption(code)` and `RedeemPrepared(intent)`. Godot uses `prepareRedemption(code)`, `redeemPrepared(intent)` or `redeemPreparedParsed(intent)`. Unreal uses `PrepareRedemption`/`RedeemPrepared` (`FHorizonGiftCodeIntent`, `FHorizonGiftCodeRedeemResult`) and matching Blueprint nodes. All three example packages include scoped durable pending storage and explicit retry. Their local fingerprints belong to their SDK; keep an intent in its originating client context.

```csharp
var intent = await GiftCodeManager.Instance.PrepareRedemption("PROMO2024");
// Persist the whole intent durably before RedeemPrepared. Refuse to overwrite an unresolved record.
var result = intent == null ? null : await GiftCodeManager.Instance.RedeemPrepared(intent);
// On uncertainty retain intent; after restart load it and explicitly call RedeemPrepared again.
```

```gdscript
var intent = await Horizon.giftCodes.prepareRedemption("PROMO2024")
# Persist all fields durably before redeemPrepared; retain unresolved records.
if not intent.is_empty():
    var result = await Horizon.giftCodes.redeemPrepared(intent)
```

For Unreal C++/Blueprint and the actual SaveGame/pending store, use the GiftCodes feature sample. V1 `Redeem` overloads return `UPGRADE_REQUIRED` without silently preparing anything. No startup callback consumes a pending action.

## Admin rewards and exact counters

Admin create/update supports `values:[{key,amount}]` separately from giftData: at most eight distinct configured positive safe-integer amounts within definition maxima. Omission on update preserves; `[]` clears. Cosmetic grants remain server-owned and commit atomically with values and the source count. Existing plan/SystemConfig limits continue to apply.

Use `exactCurrentTotalRedemptions` and `exactRemainingRedemptions` on admin records. Both are decimal strings; only remaining may be null, meaning unlimited. Finite exhausted/lowered capacity is `"0"`; `-1` is never an unlimited sentinel. Per-campaign strings are nonnegative Int64. Account statistics provide `exactTotalRedemptions`, an arbitrary-size decimal sum which may exceed Int64. Existing numeric fields are compatibility views, never lossless counters. Configured redemption limits retain their nullable positive Int32 API contract.

New campaigns begin V2. Existing unresolved histories remain protected until an explicit verified backup/restore and source-guard migration completes; migration never pays historical rewards again. There is no permanent V1 response/history fallback. Do not claim server migration or live acceptance from SDK/fixture tests.
