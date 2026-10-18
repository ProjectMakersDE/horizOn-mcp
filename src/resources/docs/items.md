# Items

Unique instances belong to one player. Templates and grant quantities belong to the server. Never
copy inventory into Cloud Save, generate instance IDs on the client, or use property changes to mint
items. An uninitialized inventory returns revision 0 and an empty array without a database write.

## Tools and HTTP contract

All player tools require `userId` and `sessionToken`. The token is sent only as Bearer authorization,
with the configured project API key. Account Keys cannot impersonate a player session.

| Tool | HTTP route beneath /api/v1/app/items | Additional input |
|---|---|---|
| horizon_get_items | GET / | none |
| horizon_get_item_catalog | GET /catalog | optional afterKey, limit 1..50, catalogRevision |
| horizon_adjust_item | POST /adjust | instanceId, expectedRevision, changes:[{key,amount}] |
| horizon_equip_item | POST /equip | instanceId, expectedRevision, equipped:boolean |
| horizon_discard_item | POST /discard | instanceId, expectedRevision |

Inventory reads and edits return `{userId,revision,instances,limits,serverTime}`. Each instance is
`{instanceId,itemKey,properties,equipped,createdAt}`. Replace only the matching host/project/player
snapshot, guarded against logout and session A→B→A changes. No background polling.

Catalog pages return `{revision,definitions,nextAfterKey,total,limits,serverTime}`. Request each page
explicitly with the first page's `catalogRevision` and previous `nextAfterKey`. A null cursor ends
the catalog. On revision conflict, restart the read instead of mixing pages. Inactive definitions
remain visible so retained instances can still be understood.

Every mutation sends exactly the reviewed inventory revision and instance UUID. Each MCP call makes
one HTTP attempt. After timeout, 429, 503, `REVISION_CONFLICT` or `STATE_CONFLICT`, read the inventory
explicitly and reconcile the player's intent. Never silently replace a revision to repeat a mutation.
Discard permanently removes one instance; a replay of its old purchase must not recreate it.

## Catalog and property rules

An Account Key needs `ITEMS` and access to the selected project. Four admin tools expose
`horizon_admin_items_catalog_get`, `horizon_admin_items_catalog_set`,
`horizon_admin_items_player_get` and `horizon_admin_items_limits`.
Catalog set writes one template at `/api/v1/admin/items/catalog/{key}?apiKeyId=...`, with the reviewed
catalog revision in `If-Match`. Its `definition` contains name, type, rarity, active, baseProperties
and propertyRules. It returns `{revision,definition,limits,serverTime}`. Player inspection returns
`{inventory,receipts}`; new source-owned grants create no recipient receipt copy. Legacy originals
remain migration-owned until source protection is transferred atomically. There is no admin tool to mint or delete a player's items.

Keys/type/rarity/property keys match `[a-z][a-z0-9_]{0,63}`. Names are nonblank and at most 120 UTF-8
bytes. Properties are a flat object with at most 16 fields and 256 canonical UTF-8 bytes. Values are
strings, booleans or safe integers in ±9007199254740991. No nulls, floats or nested containers.
Canonical JSON sorts ASCII keys, retains literal Unicode and slashes, uses compact separators and
short JSON escapes, and rejects unpaired Unicode surrogates. A whole template including its key is
at most 2048 canonical UTF-8 bytes.

Up to 16 distinct property rules specify `{key,min,max,maxChangePerCall}`. The existing base value
must be an integer within the rule's bounds. An adjustment supplies one to eight distinct nonzero
integer deltas, obeys current rules and rechecks the final 256-byte size. An archived template rejects
grants and property edits. Its existing instances can still be equipped and discarded. Template
edits do not rewrite existing instance properties. `equipped` is a boolean, not a game-specific slot
system. Set `active:false` to archive a permanent key; there is no hard delete or key reuse.

| Installation defaults | Lifetime catalog keys | Inventory instances | Legacy receipt policy |
|---|---:|---:|---:|
| FREE | 20 | 10 | 10 |
| BASIC | 200 | 25 | 20 |
| PLUS | 500 | 50 | 25 |
| PRO | 1000 | 75 | 30 |
| ENTERPRISE | 5000 | 150 | 50 |

All three policies are administrator configurable; defaults are not maxima. Source-owned grants
use the source's original consume guard, without a personal invoice/receipt history. Technical
catalog slots are UInt16; the property/template/delta/grant format bounds above remain separate.
Use returned limits as authority. Downgrades preserve existing items and keys. New grants or keys
need capacity; existing definitions remain editable. These conservative limits are not a cluster
throughput guarantee.

## Atomic purchases

`horizon_admin_player_values_config_set` accepts `itemRewards:[{itemKey,quantity}]` on each offer.
Positive costs remain required. Offers need nonempty value rewards or item rewards. Item keys must
be distinct, each quantity is 1..4 and their total is at most four instances. Value-only offers remain
supported. Catalog entries must already exist and be active when the purchase executes.

Use `horizon_purchase_player_value_offer` with the original persisted timestamp:UUID operation ID
and existing player-value contract. The server grants items and debits values in one transaction.
`INVENTORY_FULL` or another rejected grant leaves balances, receipts, daily counts and inventory
unchanged. Fresh purchase responses include committed `items:[{instanceId,itemKey}]` references. Old
responses can omit that field and mean an empty list. After success, refresh inventory explicitly.
After uncertainty, retry only the original purchase intent. Never buy again merely to recover a lost
inventory refresh. Replay returns current state with empty applied/items and alreadyApplied=true;
it never recreates a discarded/transferred item. The source's original guard/expiry rules apply.

## Integration sequence

For Unity, Godot and Unreal, use the installed SDK's Items manager when available and verify its
actual method signatures. This resource does not imply that a published SDK already includes
the current contracts. REST and MCP use the contract above with current server policies.

1. Sign in, read inventory and one catalog page.
2. Review the configured offer and persist its original purchase intent before any send.
3. Explicitly purchase once, then refresh inventory using returned references.
4. On the player's action, equip or adjust using that current revision. Replace the confirmed snapshot.
5. Discard only on explicit intent using its exact instance UUID and reviewed revision.

simpleServer REST parity is part of TASK-1011 and must be verified against the installed version;
hosted admin routes are not part of its API. Operators use the local CLI. Items add no realtime or
chat transport. Both remain hosted-only features.
