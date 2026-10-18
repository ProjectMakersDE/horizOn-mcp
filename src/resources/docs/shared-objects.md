# Shared Objects

Store opaque bytes with explicit bounded search metadata. The server never interprets combat,
maps or game rules. A permanent collection defines read/write permissions, byte/count limits,
optional TTL, at most three typed fields and optional safe-integer grid coordinates.

## Player tools

Every tool requires `userId` plus `sessionToken` matching the current project/player. The token
travels only in Authorization Bearer. One call makes one HTTP attempt, including writes and query.

| Tool | Route beneath /api/v1/app/shared-objects | Additional input |
|---|---|---|
| horizon_get_shared_collections | GET /collections | optional afterKey, limit, catalogRevision |
| horizon_get_shared_usage | GET /{collection}/usage | collection |
| horizon_get_shared_object | GET /{collection}/objects/{objectId} | collection, objectId |
| horizon_query_shared_objects | POST /{collection}/query | collection, query object |
| horizon_create_shared_object | POST /{collection}/objects | collection, expectedRevision, dataBase64, search, optional position/groupId |
| horizon_update_shared_object | PUT /{collection}/objects/{objectId} | collection, objectId, expectedRevision, dataBase64, search, optional position |
| horizon_delete_shared_object | DELETE /{collection}/objects/{objectId} | collection, objectId, expectedRevision |

`expectedRevision` is sent as If-Match. Create uses the reviewed **owner usage** revision. Update
and delete use the reviewed **object** revision. IDs are server-generated. Never replace a failed
revision or create a replacement ID automatically. A repeated creation with the original usage
revision cannot duplicate an uncertain create. Reconcile by explicitly reading the owner's objects
and usage. Deleted owner-usage anchors remain at count zero until player deletion.

Catalog returns `{revision,definitions,nextAfterKey,limits,serverTime}`. Keep the first revision
on later explicit pages. Usage returns `{userId,collection,revision,count,limits,pollAfterSeconds,
serverTime}`. GET returns `{object,pollAfterSeconds,serverTime}`. Create/update add `usage` to that
envelope. Delete returns `{objectId,deleted,usage,pollAfterSeconds,serverTime}`. An object contains
id,collection,ownerId,groupId,revision,dataBase64,search,position,createdAt,updatedAt,expiresAt.

## Permissions, queries and lifecycle

Read policies are owner/friends/group/all/dashboard. Write policies are owner/group/dashboard.
Friends/public reads never confer writes. Dashboard-only reads require dashboard-only writes.
Group writes require current membership. Friends reads require bilateral friendship without a
block. Public reads hide inactive/deleted owners. Read rights and bytes use one snapshot.

`query` has mode and optional limit 1..50, cursor, ownerId/groupId. Owner/friends partitions use
one explicit owner, group partitions one explicit group. List has no extra fields. Owner mode
requires ownerId. Field mode uses field plus equal OR min/max. Rectangle uses minX/maxX/minY/maxY.
Random uses integer field/min/max, no cursor, at most two pivoted indexed seeks and nonuniform
sampling. There is no whole-project/friend-list fanout or total count.

Returns `{objects,nextCursor,pollAfterSeconds,serverTime}`. At most 256 metadata candidates,
50 objects and 1 MiB decoded bytes. Empty results with nextCursor are valid. Continue explicitly
with that cursor and identical query. Explicit next-page requests need not wait; refreshing honors
pollAfterSeconds (default 120). No background polling or automatic page traversal.

Keys match `[a-z][a-z0-9_]{0,63}`. Names are nonblank, at most 120 UTF-8 bytes. Search has exactly
the configured fields, safe integers in ±9007199254740991 or strings of at most 96 UTF-8 bytes.
Positions use safe integer x/y. Data is canonical padded Base64 with no whitespace. Empty bytes
are allowed. Reject unknown fields, unsafe/coerced numbers and invalid Unicode. Retain returned
bytes unchanged. Never parse them to infer server-validated game outcomes.

Policy/schema/TTL lock on first creation. Archive retains read/delete and blocks create/update.
TTL is null or 60..2592000 seconds from creation, never extended by updates. Owners may recover
their group objects after leave with mode=owner, ownerId=self and the original groupId, and delete
them unless writePolicy=dashboard. Other group members still need current permission. Scoped
admin cleanup remains available after owner/group deletion. Quota failures preserve all data.

| Installation defaults | Permanent collections/project | Account storage charge | Decoded object bytes |
|---|---:|---:|---:|
| FREE | 2 | 5 MiB | 2048 |
| BASIC | 10 | 50 MiB | 8192 |
| PLUS | 15 | 125 MiB | 16384 |
| PRO | 25 | 250 MiB | 32768 |
| ENTERPRISE | 100 | 2 GiB | 65536 |

All three tier policies are administrator configurable; the table does not cap higher values.
maxObjectsPerOwner is a positive Int32 collection setting, independent of the default100.
Configured object bytes may reach1048576, the existing1 MiB decoded query envelope. Create/update
transport frames are1402200 encoded UTF-8 bytes, including Base64/JSON metadata. Three search
fields,120-byte names,96-byte search strings and TTL60..2592000 seconds are technical contracts.
Reductions preserve existing reads/deletes. Charges include decoded bytes plus8192 per object and
512 per retained owner ledger; these are quota allowances, not measured BSON/index/disk bytes or
a cluster-capacity guarantee. Read returned limits as authority.

## Trusted administration and ordinary notices

Ten `horizon_admin_shared_*` tools mirror catalog get/set, limits, usage, object get/query/create/
update/delete and one cleanup batch. They require SHARED_OBJECTS scope plus matching owned project.
`projectApiKeyId` becomes apiKeyId. Admin create explicitly supplies ownerId. Collection set accepts
the complete definition and original catalog If-Match. Cleanup removes at most twenty expired
objects with atomic charge refund. It does not loop automatically.

`horizon_admin_inbox_send_ordinary` uses **INBOX** scope at POST /api/v1/admin/inbox/messages.
It sends plain `freeText` under the original player Inbox `expectedRevision`, not a copied
localization/source payload. Persist project, user, operation UUID, original revision,
issuedAt, expiresAt and freeText before sending. See `horizon://docs/inbox` for current
operator limits and uncertain-response handling. This endpoint does not verify combat or
grant rewards. Never replace an uncertain original with a fresh revision or ID.

## Integration state and recipes

Inspect the installed Unity/Godot/Unreal version and exact native method signatures before using
these contracts. simpleServer supports REST within its documented ENV/SQL frames. Hosted admin routes are
not simpleServer APIs; its operator uses a local trusted CLI. Realtime/chat remain hosted-only.

World map: owner-write/all-read grid collection, explicit marker create/update and bounded rectangle
pages. Async PvP: owner-write/all-read defense with integer power, nonuniform power-range opponent
selection, existing validated-action run start/submit, then a trusted backend's durable ordinary
notice intent bound to the original defense object/revision and run. Missing/unconfirmed outcomes
are never automatic wins. No Account Key belongs in a game build.
