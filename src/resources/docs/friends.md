# Friends

Friend requests, friendships and blocks belong to one project. Each mutation changes both sides
atomically where needed. Exact UUID or public `H-` friend-code lookup exposes only display name
and selected avatar, frame and badges. A friend code is a public identifier, not a credential.
Unknown, inactive, deleted, foreign and blocked lookup targets share `PLAYER_NOT_FOUND`.
There is no name/email search and no online-presence flag.

## Player flow

All app calls require the project key and the matching player session as `Authorization: Bearer`.

1. Call `horizon_get_friends` with `userId` and `sessionToken`.
2. Find a deliberately shared UUID or code with `horizon_find_player` and `query`.
3. Call `horizon_send_friend_request` with `targetUserId` and the reviewed `expectedRevision`.
4. The recipient reads their own snapshot and explicitly accepts or declines its exact `requestId`.
5. Replace the complete local snapshot only if host, project, user and session still match.

The snapshot is `{userId,revision,friendCode,friends,incoming,outgoing,blocked,limits,serverTime}`.
Friends include `userId`, `since`, public `display` and `lastActiveAt`. The latter is the latest
retained login timestamp, not recent HTTP traffic or live presence. `null` means unknown.
Requests include `userId`, `requestId`, `createdAt` and public display. Block entries expose only
`userId` and `blockedAt` to their owning player or authorized account support.

## Explicit identity and recovery

Every mutation requires the exact nonnegative safe-integer `expectedRevision` from the reviewed
snapshot. Accept, decline and cancel additionally require the exact pending `requestId`.
Missing, fractional, string or unsafe revisions are rejected. A timeout or lost response is an
uncertain outcome, never a reason to substitute the newest revision and submit again automatically.

After an uncertain response or `409 REVISION_CONFLICT`, fetch the snapshot and reconcile the
player's intent. The original action might already have succeeded. A new request between the same
two players has a different ID and must not be accepted or removed by an old action.
These MCP tools do not retry, change revisions, accept requests or perform compensating writes
on their own. A `429` is returned as an API error. The MCP response does not expose response headers.
Any later retry must preserve the original operation input and must not run immediately in a loop.

## Actions

| MCP tool | REST action | Result |
|---|---|---|
| `horizon_send_friend_request` | `request` | Both pending records and recipient Inbox notice commit together. |
| `horizon_accept_friend_request` | `accept` | Exact request and crossed request consumed, friendship on both sides, sender Inbox confirmation. |
| `horizon_decline_friend_request` | `decline` | Exact incoming request and matching outgoing counterpart removed. |
| `horizon_cancel_friend_request` | `cancel` | Exact outgoing request and matching incoming counterpart removed. |
| `horizon_remove_friend` | `remove` | Friendship removed on both sides. |
| `horizon_block_player` | `block` | Adds your block and removes friendship and both request directions without a block notification. |
| `horizon_unblock_player` | `unblock` | Removes only your block. No previous relationship is restored. |

Routes are `POST /api/v1/app/friends/{action}`. Body is
`{userId,targetUserId,expectedRevision}` plus `requestId` for accept, decline and cancel.
Every success returns the complete actor snapshot. Crossing requests need explicit acceptance.
A full recipient Inbox rejects an entire send or accept without partial social state.
Stale Inbox notices never authorize accepting a request that is no longer in the current snapshot.

Read routes are `GET /api/v1/app/friends?userId=...` and
`GET /api/v1/app/friends/find?userId=...&query=...`.

## Limits and integrations

Default friends per player: FREE 20, BASIC 50, PLUS 75, PRO 100, ENTERPRISE 200. Each tier permits
20 incoming and 20 outgoing requests and 100 blocks. Read the current snapshot's limits.
Downgrades retain existing data, while additions above the new cap fail. Removal remains available.
Deleted or unavailable peers do not prevent clearing a local request or block.

In Unity, Godot and Unreal, keep the server revision and request ID together with the displayed
snapshot. Disable duplicate submits while a request is pending. Ignore late responses after session
or project changes. Reconcile uncertainty via a fresh snapshot and an explicit player action.
Use the typed SDK manager for the installed version rather than creating a second auth client.

Hosted own-player topic `friends:<userId>` carries invalidation metadata only. Refresh authorized
HTTP state after reconnect. simpleServer supports the REST contract and explicitly does not support
realtime or Chat. No polling heartbeat is needed to maintain friendships.

## Account support

`horizon_admin_friends_player_get` and `horizon_admin_friends_limits` require an Account Key with
`FRIENDS` and matching project scope, or full-account access. They take `projectApiKeyId`; player
inspection also takes `userId`. They are read-only. Routes:

- `GET /api/v1/admin/friends/players/{userId}?apiKeyId=...`
- `GET /api/v1/admin/friends/limits?apiKeyId=...`

Never use Account Key credentials in a shipped game. simpleServer operators inspect local state
through its operator CLI, not the hosted admin API.
