# Player marketplace

Trading transfers exact original item instances through durable escrow. It is disabled until
an operator chooses a saved Player Values currency, explicit fee (0..10000 basis points) and
active item price rules. The fee is floor(price*feeBps/10000); seller net is price minus fee.
Currency keys follow `^[a-z0-9][a-z0-9._-]{0,23}$`, item keys `^[a-z][a-z0-9_]{0,63}$`.
No legacy validation-rule fallback creates a currency implicitly.

## Player tools

All ten tools require the matching active userId/sessionToken and project key.

| Tool suffix after horizon_ | HTTP under /api/v1/app/marketplace |
| --- | --- |
| get_marketplace_limits | GET /limits |
| get_marketplace_rules | GET /rules; after itemKey, limit, catalogRevision optional |
| get_marketplace | GET base, own state |
| query_marketplace_listings | GET /listings; itemKey,minPrice,maxPrice,cursor,limit optional |
| get_marketplace_listing | GET /listings/{listingId} |
| create_marketplace_listing | POST /listings |
| buy_marketplace_listing | POST /listings/{listingId}/buy |
| cancel_marketplace_listing | POST /listings/{listingId}/cancel |
| get_marketplace_operation | GET /operations/{operationId} |
| retry_marketplace_return | POST /listings/{listingId}/retry-return |

Persist each create/buy/cancel intent before HTTP under project/player/feature, never host.
Keep original operationId, canonical UTC millisecond issuedAt, exact instance/listing IDs,
revisions, price, currency and duration. Create binds expectedInventoryRevision and
expectedConfigRevision, price and durationSeconds (300..604800). Buy binds
expectedListingRevision, expectedPrice and expectedCurrencyKey. Cancel binds original
expectedListingRevision. These tools send one attempt and never generate replacement IDs.
GetOperation reconciles an uncertain result; missing/expired proof cannot establish that
a write never happened. A retained replay may have listing:null after terminal audit purge.
Explicit identical replay never repeats a debit, credit or original item transfer.

Reads return bounded pages with serverTime. Preserve cursors and identical filters across
explicit subsequent pages, including an empty page with nextCursor. At most256 candidates
and50 results are examined/returned. No polling and no automatic traversal. Query snapshots
do not reserve a listing. The server checks the confirmed quote, active rules, balances,
daily limits, inventory capacity, users and catalog again atomically at buy time.

## Returns and loss protection

A cancellation/expiry leaves the original in return_pending escrow. Delivery through Inbox
sets return_delivered. A full Inbox keeps pending; a full inventory keeps the message
unclaimed. Valuable messages do not disappear on expiry. Claim restores the exact original
instance and sets returned. `horizon_claim_inbox` retains playerValues and adds item
references in items[]. Treat references as receipts, never mint or apply deltas from them.
Replay after claim/resale/discard does not regrant. Only sold/returned audit rows expire
after7days. Nonterminal escrow and its open-listing charge stay until safely resolved.

Deleted-owner escrow remains recoverable. Operator recovery requires a truly deleted old
owner, active same-project recipient, free open-listing slot, original listing revision and
nonblank support note. It invalidates the old Inbox binding and records at most8 recovery
audit records. Delivery still goes through Inbox. No automatic recipient choice.

## Operator tools

Fourteen `horizon_admin_marketplace_*` tools require a MARKETPLACE-scoped Account Key
for the exact owned project: config_get/config_set, limits_get, rules_list/rule_set,
listings_list/listing_get, listing_cancel/return_retry/listing_recover, player_get,
moderation_get/moderation_set and cleanup. Admin paths are under
`/api/v1/admin/features/marketplace/{projectApiKeyId}`. Config/rule writes use the original
config revision, cancellation/recovery the original listing revision, moderation the
original player revision, all as If-Match. Null clears currency/fee only when disabled
and zero escrow. Null clears a ban. Ban deadlines are at most30days ahead with a reason.
Cleanup explicitly processes one fair bounded20-candidate batch; another call advances
work. Return retry sends an empty object, never arbitrary attachments.

## Limits, realtime and adapters

Five tiers FREE/BASIC/PLUS/PRO/ENTERPRISE: open listings1/3/5/10/25, retained project
rows50/500/1000/2500/10000, receipts/history20/30/40/50/100, project writes per
minute10/30/45/60/120, minimum player write interval1000ms. Read current limits instead
of hardcoding them. Currency changes are refused while escrow exists. Disabled trading
or player bans do not erase returns or replay proofs.

Hosted realtime invalidates only the current player's `marketplace:userId` and Inbox
metadata. It does not stream global prices or item/value payloads. An explicit invalidation
may trigger one authorized REST reconciliation, never periodic price polling. This MCP
adapter performs explicit HTTP calls and does not create background WebSockets. simpleServer
implements the same REST transactions with realtime:false. Native engine signatures and
actual deployment completion are separate acceptance gates; confirm the matching SDK source
before using examples. See horizon://docs/inbox and horizon://docs/items.
