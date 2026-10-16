# Player inbox

The inbox combines targeted messages and immutable project broadcasts. Read it with
`horizon_get_inbox` using the active player's userId and accessToken. Account keys
cannot replace a player session. Retain the returned cursor only for that player,
project and session. Serialize refreshes and discard responses from old sessions.

`unchanged=true` contains no entries: keep the previous complete snapshot. Otherwise
replace it, including removals and expiry. Respect `pollAfterSeconds` (at least 120
seconds). Hosted realtime invalidations request a new HTTP snapshot; they never
carry inbox content or grant a reward. simpleServer supports REST, not realtime.

## Player actions

| Tool | HTTP contract |
| --- | --- |
| `horizon_get_inbox` | GET `/api/v1/app/inbox?userId=UUID&since=CURSOR` (since optional) |
| `horizon_mark_inbox_read` | POST `/api/v1/app/inbox/read` |
| `horizon_claim_inbox` | POST `/api/v1/app/inbox/claim` |
| `horizon_remove_inbox` | POST `/api/v1/app/inbox/remove` |

All three POST bodies are `{userId,entryId}`. Copy the full entry ID, including
`message:` or `broadcast:`, from the snapshot. The API key and Bearer session stay
in headers. Marking read does not claim. Claim returns
`{entryId,replayed,inbox,playerValues,items}` and grants configured values atomically once.
Replace the value cache from the response, never apply its reward as a second delta.
Retry an uncertain claim with the same entry ID; these tools do not retry for you.

Unclaimed valuable attachments remain visible and claimable after expiry. Removal
fails with `UNCLAIMED_REWARD` until claimed. Balance/cap failures leave the reward
pending. `STATE_CONFLICT` permits the same-entry retry. `ENTRY_NOT_FOUND` after
removal or cleanup does not create another claim opportunity. A full targeted inbox
rejects new delivery; source features retain their pending reward or roll back.

## Operator broadcasts and support

An Account Key needs `INBOX` and access to the selected project. Read
`horizon_admin_inbox_broadcasts_get` before publication. Its result contains
`{apiKeyId,revision,serverTime,entries,limits}`. Anchor new operation timestamps and
expiry to this serverTime plus elapsed local time, not an uncorrected client clock.

Persist the publication intent before invoking `horizon_admin_inbox_publish`:
projectApiKeyId, expectedRevision, operationId (`epochMilliseconds:UUID`), type,
reference, textKey, parameters, expiresAt and optional attachment. The attachment
is `{values:[{key,amount}]}` with at most eight distinct configured keys and positive
safe integer amounts. Expiry must be in the next 30 days. The complete stored
message, including reserved source fields, is limited to 1024 UTF-8 bytes.

Publication sends the expected revision as `If-Match`. The response adds
`operation:{operationId,entryId,replayed}` and a fresh serverTime. A successful
lost-response retry accepts the original ID, body and revision even after catalogue
changes. Never replace the ID after uncertainty. `OPERATION_CONFLICT` means its
body changed; `OPERATION_EXPIRED` requires reconciliation. A new publication with
`REVISION_CONFLICT` must be reviewed against the current catalogue.

Broadcasts are available to currently active players registered no later than
publication, including later-reactivated eligible accounts. They require one
catalogue write, with no per-player fanout. Reward broadcasts cannot be removed:
they remain claimable and consume capacity after expiry. Ordinary broadcasts can
be removed with `horizon_admin_inbox_broadcast_remove`, their full ID and expected
revision. `horizon_admin_inbox_player_get` is read-only support inspection, not an
operator claim on behalf of a player. simpleServer exposes operator operations
through its local CLI, not hosted Account Key endpoints.

SDK method names are documented with their respective SDK release. The REST
contract above is authoritative; never invent native engine calls from tool names.

## Protected original-item returns

Trusted Marketplace messages can add `attachment.itemReturn:{listingId,instanceId,itemKey}`
while retaining `values:[]`. Only the source feature creates these attachments. Operator
compose/broadcast rejects them. Claim restores the exact escrowed original instance atomically,
including original properties and creation time. `items:[{instanceId,itemKey}]` in the claim
response is a receipt, including on replay after resale/discard, never a request to mint items.
Refresh inventory explicitly. `INVENTORY_FULL` preserves the unclaimed return, even after expiry.
Full Inbox preserves the listing as pending until an explicit return delivery or maintenance.
