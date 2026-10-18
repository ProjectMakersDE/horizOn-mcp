# Achievements

Achievements use permanent per-key completion bits. A manual unlock, or an affected statistic
batch, commits its completion bits and configured Player Values rewards immediately in the same
transaction. New unlocks create no personal Inbox reward or copied grant history. A repeated key
never credits twice, including after archival or a later catalog edit.

## Configure

Hosted admin tools require ACHIEVEMENTS scope and the matching owned project:
`horizon_admin_achievements_definitions_get`, `horizon_admin_achievements_definitions_set`,
`horizon_admin_achievements_limits`, `horizon_admin_achievements_player_get`.
GET definitions returns apiKeyId/revision/definitions/archivedKeys/limits/serverTime. Replace the
complete catalog using its original expectedRevision (If-Match); never refresh and overwrite after
an uncertain result. Omitted keys are archived and remain permanently reserved.

Definitions have key/name/description/optional HTTP(S) imageUrl/hidden/active/rewards and mode.
Manual mode has no condition; statistic mode requires {statisticKey,threshold}. Rewards contain
up to eight distinct configured values with positive safe-integer amounts. Keys use the shared
1..24 value-key format; name/description use120/512 UTF-8 bytes and imageUrl at most2048 characters.
Those format bounds remain separate from current maxDefinitions/maxLifetimeKeys in System Config.
Defaults20/50/75/100/250 active and500 lifetime are not ceilings. The catalog has a technical1 MiB
frame. Existing progress and reserved identities remain after reductions.

## Read and cache

`horizon_get_achievements` calls GET /api/v1/app/achievements with userId and optional definitionVersion.
Every player tool requires the matching sessionToken, sent only as Authorization Bearer.
The snapshot is {userId,revision,definitionVersion,definitions,progress,limits,serverTime}.
The version is opaque64-character text, scoped to host/project/player/session. definitions:null
retains matching cached definitions; [] clears them. Suppress late results after authentication
changes. Locked hidden metadata is absent; unlocked progress remains visible after archival.

Compact progress has rewardState=complete, nullable unknown unlockedAt, and no pendingReward or
inboxEntryId copy. Legacy pending originals remain visible until verified cold settlement; never
replace their amounts from current definitions or invent a new claim.

## Unlock and original retry

`horizon_unlock_achievement` calls POST /api/v1/app/achievements/unlock with {userId,key}.
It returns {achievements,newlyUnlocked,replayed,deliveryResults:[]}. Persist the selected key as the
original intent before sending. On an uncertain result, reconcile and retry that exact key; no
client timestamp or new operation UUID is needed. A replay has empty newlyUnlocked and no new credit.
After success explicitly refresh Player Values and replace the balance cache. Do not claim an Inbox
entry or add a local reward delta.

Statistic achievements are evaluated only for affected keys during the same atomic statistic
report. Preserve the original timestamp:UUID and complete batch on retry. newlyUnlocked identifies
the new completion bits; refresh achievements and balances afterward. Replayed statistics never
repeat completion or reward credit.

`horizon_deliver_achievement_rewards` preserves the compatibility route
POST /api/v1/app/achievements/rewards/deliver with one to eight distinct original keys. It is a
read-only status operation: {achievements,results:[{key,state,inboxEntryId,code}]}. New compact
keys are complete without an Inbox ID. Legacy pending status returns MIGRATION_REQUIRED for the
explicit backup-verified cold operator. It performs no delivery/grant. Old valuable Inbox/source
originals are protected and settled by that migration; an app must not create replacements.

## Engines, self-hosting and errors

Use the installed Unity/Godot/Unreal typed manager signatures. Cache completion state per current
identity; suppress old-session replies and refresh after newlyUnlocked. No polling loop is needed.
simpleServer supports REST within its documented SQL/ENV bounds and local operator CLI; hosted
Account-Key admin routes and realtime are separate. Hosted achievements:<userId> is own-player
metadata invalidation; reconnect still refreshes HTTP snapshots.

STATE_CONFLICT preserves the exact original key/batch. ACHIEVEMENT_NOT_MANUAL requires the configured
statistic flow. REVISION_CONFLICT requires explicit catalog reconciliation. Definition/lifetime
limits come from current configuration. UNKNOWN_STATISTIC/UNKNOWN_VALUE requires valid catalog
references. MIGRATION_REQUIRED preserves legacy data for verified settlement. Session401/403 and429
never trigger automatic tool retries or replacement identities.
