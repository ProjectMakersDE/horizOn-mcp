# Achievements

Achievements unlock through a configured statistic threshold or an explicit manual game event.
The server records each key once per player. Optional value rewards first move to Inbox, where
the player claims them. An unlock is not an immediate balance credit.

## Tools and authentication

Player tools require `HORIZON_API_KEY`, the signed-in `userId` and its `sessionToken`:

| Tool | Purpose |
|---|---|
| `horizon_get_achievements` | Read definitions, progress and original pending reward values |
| `horizon_unlock_achievement` | Unlock the same manual key once, safely retrying that key |
| `horizon_deliver_achievement_rewards` | Retry delivery for one to eight distinct pending keys |

The session token travels only as the Bearer header. A foreign player is rejected. Admin tools
require `HORIZON_ACCOUNT_API_KEY` with ACHIEVEMENTS and matching project scope, or full access:
`horizon_admin_achievements_definitions_get`, `horizon_admin_achievements_definitions_set`,
`horizon_admin_achievements_player_get` and `horizon_admin_achievements_limits`.

Read the complete catalog before replacing it. Pass its `revision` as `expectedRevision`.
Omitted keys are archived and remain reserved. Restoring the same key preserves unlocks.
An empty replacement archives all definitions. Conflicting revisions require a fresh read and
deliberate reconciliation. The tools never overwrite a concurrent edit automatically.

## Definitions and limits

A definition contains `key`, `name`, `description`, optional HTTP(S) `imageUrl`, `hidden`,
`active`, `mode`, optional `condition` and `rewards:{values:[{key,amount}]}`.
Statistic mode requires `{statisticKey,threshold}` referencing an existing statistic. Manual mode
has no condition. Amounts are positive safe integers for at most eight distinct configured values.
Names and descriptions are limited to 120 and 512 UTF-8 bytes. The server also bounds the complete
frozen Inbox message to 1024 bytes and the catalog to 1 MiB.

Active limits are FREE 20, BASIC 50, PLUS 75, PRO 100 and ENTERPRISE 250. Up to 500 lifetime keys
are retained per project, including archived keys. This permanent identity prevents accidental
regrant after delete/recreate. Check the current account limits before editing.

## Read and cache

`GET /api/v1/app/achievements?userId=...&definitionVersion=...` returns
`{userId,revision,definitionVersion,definitions,progress,limits,serverTime}`.
`definitionVersion` is an opaque 64-character string, not the numeric admin revision. It includes
player-visible progress changes, so unlocking a hidden achievement invalidates the cache too.
Pass it only with the matching host/project/player/session cache. `definitions:null` means keep
that cache. `definitions:[]` means replace it with an empty list. Signout and configuration changes
invalidate the cache. Suppress late results from old sessions. The MCP tool itself keeps no cache.

Locked hidden metadata is absent. Unlocked progress remains visible even when its definition is
archived. `pendingReward:{issuedAt,values}` contains the original accepted promise, not today's
catalog reward. Never replace it from a later definition edit.

## Unlock, delivery and claim

`POST /api/v1/app/achievements/unlock` accepts `{userId,key}` and returns
`{achievements,newlyUnlocked,replayed,deliveryResults}`. Retry the same key after an uncertain
response. The server owns the permanent identity. No client timestamp or new random operation ID
is needed. A replay has an empty `newlyUnlocked` list and creates no second reward.

Statistic achievements are evaluated only for affected statistics during the same atomic report.
`horizon_update_statistics` returns their keys in `newlyUnlocked`. Preserve that report's original
operation ID and batch on retry. Refresh achievements to display the resulting progress.

`POST /api/v1/app/achievements/rewards/deliver` accepts `{userId,keys:[...]}` and returns
`{achievements,results}`. Each result has `key`, `state`, optional `inboxEntryId` and optional `code`.
States are `none`, `pending` and `delivered`. Delivery is bounded and each key has its own outcome.
`INBOX_FULL` leaves the accepted reward pending. Claim and remove eligible Inbox entries, then
retry the same pending keys. Delivery failures do not undo an already committed statistic report.
Pending rewards survive expiry and archival. A delivered reward may be overdue but remains claimable.

Use `horizon_get_inbox` and `horizon_claim_inbox` for the actual credit. Replace the local balance
cache with the returned `playerValues`; never apply an unlock, delivery or replay delta locally.

## Engines and self-hosting

The integration flow is the same in Unity, Godot and Unreal: load progress after sign-in, cache
visible definitions by version, refresh after `newlyUnlocked`, render pending/delivered states,
and claim through Inbox. Use the installed SDK's typed manager callbacks rather than fabricating
callback signatures. Session changes must cancel or suppress old requests. No polling loop is needed.

simpleServer supports the REST flow with its local operator CLI for definitions. Hosted Account
Key admin routes and realtime are not simpleServer features. On hosted horizOn,
`achievements:<userId>` is an own-player metadata topic. Reconnect still refreshes HTTP snapshots.

## Recovery

- `STATE_CONFLICT`: refresh and retry the same key or pending keys.
- `ACHIEVEMENT_NOT_MANUAL`: report its configured statistic instead.
- `REVISION_CONFLICT`: reread and reconcile the catalog.
- `ACHIEVEMENT_LIMIT_REACHED`: reduce active definitions to the current tier.
- `ACHIEVEMENT_LIFETIME_LIMIT_REACHED`: restore existing keys instead of creating replacements.
- `UNKNOWN_STATISTIC` / `UNKNOWN_VALUE`: configure references and value maxima first.
- Session `401` / `403`: sign in again with the correct player. `429`: honor Retry-After.

No tool retries automatically or silently credits a pending reward.
