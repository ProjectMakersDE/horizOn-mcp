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

Five tiers FREE/BASIC/PLUS/PRO/ENTERPRISE: open gifts per player 3/5/10/20/50, retained
gifts per project 50/500/1000/2500/10000, sends per project minute 10/30/45/60/120. Read
the current limits instead of hardcoding them. Lowering a limit never removes open gifts.
`received` lists at most `receivedPageSize` open offers, `sent` the open gifts and pending
returns, `history` the last terminal gifts kept for seven days. The state has no cursor.

Configuration and support (retry return, recover a deleted owner's return, cleanup) are
Dashboard only and have no Account Key tools. This MCP adapter performs explicit HTTP calls,
never retries, polls or opens a WebSocket. Confirm the matching SDK source before using
native examples. See horizon://docs/inbox, horizon://docs/items and horizon://docs/friends.
