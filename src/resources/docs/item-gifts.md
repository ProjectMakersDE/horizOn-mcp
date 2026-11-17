# Item gifts

A player sends one exact original item instance privately to another player through the
Inbox. The project enables gifting and may set a fixed sender fee in a saved Player Values
currency. The fee is charged on send and never refunded. `currencyKey` is null for a free
gift. The recipient claims the offer through the existing Inbox claim or declines it. An
offer expires seven days after the send in server time. A declined or expired gift returns
the original item to the sender as a protected Inbox return entry that the sender claims.

## Player tools

All six tools require the matching active userId/sessionToken and project key.

| Tool suffix after horizon_ | HTTP under /api/v1/app/item-gifts |
| --- | --- |
| get_item_gift_config | GET /config: `{config:{revision,enabled,currencyKey,fee},limits,serverTime}` |
| get_item_gifts | GET base, own `{state:{userId,revision,sent,history,received,operationWindow,limits},serverTime}` |
| send_item_gift | POST base: `{receipt,gift,replayed,serverTime}`, 201 new, 200 replay |
| get_item_gift_operation | GET /operations/{operationId}: `{receipt,serverTime}` |
| get_item_gift | GET /{giftId}: `{gift,serverTime}` for sender, recipient or return owner |
| decline_item_gift | POST /{giftId}/decline: `{gift,replayed,returnDelivery,serverTime}` |

Claiming is not a gift route. The recipient claims an offer, and the sender claims a return,
with `horizon_claim_inbox` and the original entry ID. The claim response lists the received
original in `items[]` as a receipt. Refresh inventory and Player Values with their own reads
after a send or claim. Never build an item locally from an Inbox attachment.

The recipient is addressed by player ID. Resolve a shared friend code with
`horizon_find_player` first, which also returns the public profile to show before the
player confirms the send.

## Original send intent

Persist all seven fields before the first call under project/player/feature, never host:
userId, operationId, canonical UTC millisecond issuedAt, recipientId, instanceId,
expectedInventoryRevision and expectedConfigRevision. The config revision binds the fee and
currency the player confirmed. After a timeout, restart or `STATE_CONFLICT`, call
`horizon_get_item_gift_operation` or resend the identical body. Never generate a new
operationId or new expected revision for the same intent. A replay returns the original
receipt with `replayed: true` and never withdraws or charges again. The receipt is the fee
proof. After the terminal gift is removed, the acceptance floor refuses the old intent with
`OPERATION_EXPIRED`. A missing receipt never proves that a send did not happen.

Decline binds the original `expectedGiftRevision`. A replayed decline returns the item once.

## Gift view and statuses

`{id,revision,senderId,recipientId,returnOwnerId,itemReference:{instanceId,itemKey},
currencyKey,fee,configRevision,status,createdAt,expiresAt,terminalAt,declinedAt,
offerEntryId,returnEntryId,ownerUnavailable}`. Status is one of `offered`, `claimed`,
`return_pending`, `return_delivered` or `returned`. Timestamps carry three fraction digits.

## Inbox entries

| Entry type | textKey | parameters | attachment.itemGift.direction |
| --- | --- | --- | --- |
| `item_gift` | `horizon.item_gifts.offer` | `senderId` | `offer` |
| `item_gift_return` | `horizon.item_gifts.return` | `recipientId`, `reason` (`declined` or `expired`) | `return` |

`attachment.itemGift` is `{giftId,instanceId,itemKey,direction}` and counts as a claimable
attachment. The offer entry disappears when the gift is declined, expires or its recipient
is deleted. It never claims after `expiresAt`, even before maintenance ran. A return entry
stays until claimed and has no deleting expiry. `INVENTORY_FULL` keeps it unclaimed.

## Errors

400 `INVALID_REQUEST` for malformed or unknown body fields. 403 `ITEM_GIFTS_DISABLED`.
404 `PLAYER_NOT_FOUND`, `RECIPIENT_NOT_FOUND` (unknown, inactive or blocked in either
direction look the same), `ITEM_NOT_FOUND`, `GIFT_NOT_FOUND`, `OPERATION_NOT_FOUND`.
409 `REVISION_CONFLICT`, `OPERATION_CONFLICT`, `OPERATION_EXPIRED`, `RECIPIENT_INBOX_FULL`
(nothing withdrawn or charged), `GIFT_EXPIRED`, `GIFT_DECLINED`, `GIFT_ALREADY_CLAIMED`,
`GIFT_UNAVAILABLE` and `STATE_CONFLICT` (retry the same operation). 422 `SELF_GIFT`,
`ITEM_EQUIPPED`, `OPEN_GIFT_LIMIT_REACHED`, `GIFT_LIMIT_REACHED`, `INVENTORY_FULL`,
`INSUFFICIENT_BALANCE`. 429 `ITEM_GIFTS_RATE_LIMITED` with `Retry-After` in seconds.

## Limits and adapters

Plans are FREE/BASIC/PLUS/PRO/ENTERPRISE. Read current open-gift, retained-gift,
write-rate and page policies from the `limits` returned by the config/state reads.
The public plan-comparison JSON does not include every Item Gifts policy. See
`horizon://docs/limits`. Never hardcode a numeric tier table. Lowering a limit never
removes open gifts.
`received` lists at most `receivedPageSize` open offers, `sent` the open gifts and pending
returns, `history` the last terminal gifts kept for seven days. The state has no cursor.

Configuration and support (retry return, recover a deleted owner's return, cleanup) use
the Dashboard and have no MCP admin tools. This is a tool-coverage boundary, not a
claim that all raw admin HTTP routes require a session. See `horizon://docs/dashboard`
for Account Key scope restrictions. This MCP adapter performs explicit HTTP calls,
never retries, polls or opens a WebSocket. See `horizon://docs/inbox`,
`horizon://docs/items` and `horizon://docs/friends`.

## Released native SDK integration

The following release tags contain the Item Gifts manager, Inbox attachment support,
Quickstart and durable example flow. Tag contents and remote tag identities were
checked on 2026-11-17. Use those examples with the installed package. A release tag
is separate from Unity Asset Store, Godot Asset Library or Fab availability.

| Engine / release | Native manager | Released example and Quickstart |
| --- | --- | --- |
| Unity v1.13.0 | `ItemGiftsManager.Instance` | [ItemGiftsExample.cs](https://github.com/ProjectMakersDE/horizOn-SDK-Unity/blob/v1.13.0/Samples~/Examples/Features/ItemGiftsExample.cs), [ItemGiftsQuickstart.cs](https://github.com/ProjectMakersDE/horizOn-SDK-Unity/blob/v1.13.0/Samples~/Examples/Features/ItemGiftsQuickstart.cs) |
| Godot v1.12.0 | `Horizon.itemGifts` | [item_gifts_example.gd](https://github.com/ProjectMakersDE/horizOn-SDK-Godot/blob/v1.12.0/addons/horizon_sdk/examples/features/item_gifts_example.gd), [item_gifts_quickstart.gd](https://github.com/ProjectMakersDE/horizOn-SDK-Godot/blob/v1.12.0/addons/horizon_sdk/examples/features/item_gifts_quickstart.gd) |
| Unreal v1.11.0 | `UHorizonSubsystem::ItemGifts` | [UHorizonItemGiftsExample](https://github.com/ProjectMakersDE/horizOn-SDK-Unreal/blob/v1.11.0/Plugins/HorizonSDK/Source/HorizonSDK/Public/Examples/HorizonItemGiftsExample.h), [UHorizonItemGiftsQuickstart](https://github.com/ProjectMakersDE/horizOn-SDK-Unreal/blob/v1.11.0/Plugins/HorizonSDK/Source/HorizonSDK/Public/Examples/HorizonItemGiftsQuickstart.h) |

All three example flows keep one original pending send per stable project UUID and
player. Use the project UUID for durable scope, not the selected region/host. They
fence stale responses when player/session/request context changes. After confirmed
send recovery they refresh Inventory, Player Values and Item Gifts before removing
the pending record. Import the feature samples and their journal helpers together.
Unity's supplied file journal is for native builds. WebGL needs a game-owned durable
browser journal before enabling writes.

### Unity

Use `PM.horizOn.Cloud.Examples.Features.ItemGiftsExample` on an active GameObject.
Configure its serialized `projectId` with the stable project UUID and retain its
journal directory. The following are separate UI actions on an already authenticated
`screen`, not a startup auto-send:

```csharp
// Read and review. Resolve/show the recipient profile first (FindRecipient can do this).
if (!await ItemGiftsQuickstart.ReadRulesAndInventory(screen)) return;
if (!screen.ReviewSend(recipientId, instanceId)) return;
// Display the item, recipient, screen.ReviewedFee, screen.ReviewedCurrencyKey and expiry.
```

```csharp
// Later, in the player's Send confirmation handler, using the same reviewed screen:
bool sent = await screen.ConfirmReviewedSend();
// On uncertainty keep the pending original. An explicit recovery handler uses:
// await screen.RetryPending();  OR  await screen.RecoverOriginalOperation();
```

For a received offer call `ReadGift(giftId)` or `ReadGifts()` before the player's
`DeclineGift(giftId)` confirmation. Both recipient offers and sender returns use
`ClaimGiftEntry(originalEntryId)`, followed by current inventory refresh.

### Godot

Instantiate the released `item_gifts_example.gd` as a Node and set `project_id` to
the stable project UUID. On that authenticated `screen`, read before showing terms:

```gdscript
var config: Dictionary = await screen.read_config()
var inventory: Dictionary = await screen.read_inventory()
if not config.success or not inventory.success:
    return
var review: Dictionary = screen.review_send(recipient_id, instance_id)
if not review.success:
    return
# Show review.data (item, recipientId, currencyKey, fee) and seven-day expiry.
```

```gdscript
# Later, in the player's Send confirmation handler:
var result: Dictionary = await screen.confirm_reviewed_send()
# Explicit recovery handlers use screen.retry_pending() or
# screen.recover_original_operation(), preserving the original send.
```

Read an offer with `read_gift(gift_id)`, then `review_decline(gift_id)` before the
player's `confirm_reviewed_decline()`. Claim offers and returns through
`claim_gift_entry(original_entry_id)`, then refresh inventory.

### Unreal C++ and Blueprint

Keep a `UHorizonItemGiftsExample` UObject referenced by the owning screen (for
example a `UPROPERTY`) and bind it to the authenticated subsystem and stable project
UUID. `ReadConfig` and `ReadInventory` are asynchronous. Wait for Item Gifts
`OnResult` and Items `OnInventoryResult` to succeed before review. Resolve and
display the recipient profile.

```cpp
// Screen is the retained UHorizonItemGiftsExample, Horizon the authenticated subsystem.
if (!Screen->Bind(Horizon, ProjectId)) return;
Screen->ReadConfig();
Screen->ReadInventory();
```

```cpp
// In a later UI handler after BOTH reads completed successfully:
if (!Screen->ReviewSend(RecipientId, InstanceId)) return;
// Display the original item/recipient, Screen->ReviewedFee and ReviewedCurrencyKey.
```

```cpp
// Later, in the player's confirmation handler:
Screen->ConfirmReviewedSend();
```

`OnAction` reports completion and `LastErrorCode` carries a refusal. Explicit recovery
uses `RetryPending()` or `RecoverOriginalOperation()`. `ReadGift` precedes
`DeclineGift`; `ClaimGiftEntry(originalEntryId)` accepts offers or returns through
Inbox. Blueprint can use the same example actions and the released Quickstart's
`ReadOneGift`, `SendReviewedGift` and `ClaimGift` nodes. Do not put Send in BeginPlay.

These are source-verified integration pointers. Engine/store/platform validation and
a hosted two-player acceptance run are separate evidence and are not established
by this documentation check.
