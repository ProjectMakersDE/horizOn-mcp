# Groups

Groups provide guilds/clans with leader, officer and member roles inside one project. Defaults for
FREE/BASIC/PLUS/PRO/ENTERPRISE: 20/50/75/100/500 members per group and 1/1/2/3/5 groups per player.
These are installation defaults. All eleven policies are administrator configurable:
maxMembers,maxGroupsPerPlayer,maxInvitations,maxJoinRequests,maxPlayerInvitations,
maxPlayerRequests,maxNameBytes,maxDescriptionBytes,maxDataBytes,maxDataDepth,memberPageSize.
Read the current view/admin limits; defaults never cap higher configured values. Reductions retain
complete existing state and permit removal/cancellation. A pending request never reserves capacity.

Leader/officer can edit metadata, invite and decide requests. Officers can remove only ordinary
members. Only leaders change roles/transfer leadership. A leader must transfer before leaving,
unless sole member with no pending state. Group deletion has the same guard. Bilateral blocks
are checked against the deciding player/original issuer and current leader. Existing memberships
are not silently removed by a later block.

Name/description UTF-8 byte limits come from current configuration (defaults120/1024). Private data stays private to members
and owned-project administrators. Invitations, requests and accepts create ordinary Inbox notices
atomically with group state; INBOX_FULL leaves the complete operation uncommitted. Decline, cancel,
leave, removal and role changes do not need Inbox space. No notice fanout or profile copying.

## Tools

Reads: horizon_get_groups, horizon_get_group, horizon_get_group_members, horizon_get_group_pending.
Metadata: horizon_create_group and horizon_update_group.
Actions: horizon_join_group, horizon_request_group_join, horizon_invite_group_player,
horizon_accept_group_invite, horizon_decline_group_invite, horizon_cancel_group_invite,
horizon_accept_group_request, horizon_decline_group_request, horizon_cancel_group_request,
horizon_leave_group, horizon_remove_group_member, horizon_set_group_member_role,
horizon_transfer_group_leadership, horizon_delete_group.
Admin: horizon_admin_groups_list/get/members/pending/player_get/limits (six read-only tools).
All player tools require sessionToken/userId. Session tokens are sent only in Authorization.
MCP performs one HTTP request, never refreshes a revision or retries a write. 429 is returned as an
error; the caller decides when to retry the unchanged original intent.

## Engine integration

Unity GroupsManager, Godot Horizon.groups and Unreal UHorizonGroupsManager mirror this REST
contract. Follow the installed SDK's typed API and runnable minimal example; never invent Unreal
callback signatures. Verify the installed version against the current REST contract.
Only replace a cache matching the same host/project/player and session generation. Never re-sign
in as a new guest to recover authorization. Pagination is explicit under current memberPageSize, and revision
changes across pages require reconciliation rather than an unbounded automatic restart.
simpleServer supports REST within its documented ENV/SQL frames. Hosted groups:<groupId> realtime is metadata
invalidation only, requires membership and is explicitly unsupported by simpleServer. Reconnect
requires a REST refresh. Removed members cannot retain subscriptions.

## REST contract

All app paths begin `/api/v1/app/groups`, require project API key plus the authenticated player's
Bearer session and matching `userId`. Public group IDs never authorize mutation. ISO UTC timestamps
and safe integer revisions are used consistently with Friends. Known chronology may be omitted/null
when unknown. Data is a finite JSON object under current maxDataBytes/maxDataDepth (defaults2048/16).
The technical storage ceiling is the complete16 MiB BSON document, including metadata; Groups
create/update HTTP inputs allow100663296 UTF-8 bytes for necessary JSON escaping. These frames
are separate from policy. MCP adds no default byte/depth clamp and does not truncate retained reads.

## Reads

- `GET ?userId=UUID`: `MyGroupsView {userId,revision,groups,incomingInvites,outgoingRequests,limits,serverTime}`.
  `groups` contains all retained private GroupView objects for memberships. Pending entries contain
  groupId, requestId, issuerId, createdAt and public group metadata, never private data.
- `GET /{groupId}?userId=UUID`: `GroupView {id,revision,name,description,joinMode,leaderId,memberCount,
  data?,myRole?,createdAt,updatedAt}`. `data` is absent to nonmembers. A foreign/deleted group is 404.
- `GET /{groupId}/members?userId=UUID&afterUserId=UUID&limit=50`: members only.
  `{groupId,revision,members:[{userId,role,joinedAt,display}],nextAfterUserId?,serverTime}`. Stable UUID
  keyset order, limit1..current memberPageSize, no skip scans. MCP defaults to1 without an extra
  limits fetch so a policy lowered to1 remains usable. Explicit pages can exceed50; the technical
  limit is2147483646 because the server reserves one continuation row. `display` uses the existing public profile shape.
- `GET /{groupId}/pending?userId=UUID`: leader/officer only,
  `{groupId,revision,invitations,joinRequests,serverTime}`. Existing lists remain complete after reductions.

## Creation and metadata

`POST /` body `{userId,expectedPlayerRevision,name,description,joinMode,data}`.
Creates the group and leader membership atomically with a fresh server-generated UUID. Clients
cannot choose a group ID, including an earlier deleted ID. Retain expectedPlayerRevision across
uncertain responses; player state revisions survive group leave/delete. Never refresh and retry
creation automatically. Read MyGroupsView to reconcile an uncertain create. Returns `GroupMutationView {groups:MyGroupsView,group:GroupView?}`.

`PUT /{groupId}` body `{userId,expectedRevision,name,description,joinMode,data}`.
All metadata fields are supplied, validated before effects; omitted/null data is invalid. Leader or
officer. Returns GroupMutationView. No mutation endpoint uses a GET to trigger state changes.

## Actions

`POST /{groupId}/{action}` body `{userId,expectedRevision,targetUserId?,requestId?,role?}`.
Returns GroupMutationView. Mutations that remove/delete the group for the actor return `group:null`.
The `groups` snapshot is always the acting player's, never a target's private membership list.

| action | Additional input | Meaning |
|---|---|---|
| join | none | Join an open group |
| request | none | Request entry to a request group |
| invite | targetUserId | Leader/officer invites an active player |
| accept-invite | requestId | Invite recipient accepts own invitation |
| decline-invite | requestId | Invite recipient declines own invitation |
| cancel-invite | targetUserId, requestId | Leader/officer cancels this exact invitation |
| accept-request | targetUserId, requestId | Leader/officer admits requester |
| decline-request | targetUserId, requestId | Leader/officer declines requester |
| cancel-request | requestId | Requester cancels own request |
| leave | none | Leave, or delete if sole leader and no pending state |
| remove | targetUserId | Remove a lower-ranked member |
| role | targetUserId, role=officer/member | Leader changes a nonleader's role |
| transfer | targetUserId | Leader transfers leadership to a current member |
| delete | none | Sole leader deletes an empty-of-pending group |

Already-member join, absent removal and identical role/metadata are safe no-ops only after matching
revision and authorization. Missing/replaced pending identity is 404 REQUEST_NOT_FOUND. Revision is
checked before interpreting no-ops, so uncertain actions cannot affect a new relationship.

## Errors and admin

400 INVALID_GROUP / INVALID_REVISION / INVALID_GROUP_ACTION / INVALID_PAGE; 401 SESSION_REQUIRED;
403 SESSION_FORBIDDEN / GROUP_PERMISSION_DENIED / GROUP_RELATION_BLOCKED; 404 GROUP_NOT_FOUND /
PLAYER_NOT_FOUND / REQUEST_NOT_FOUND; 409 REVISION_CONFLICT / GROUP_MEMBER_LIMIT /
PLAYER_GROUP_LIMIT / GROUP_PENDING_LIMIT / PLAYER_PENDING_LIMIT / GROUP_PENDING_EXISTS /
LEADERSHIP_TRANSFER_REQUIRED / GROUP_NOT_EMPTY; 409 INBOX_FULL propagates atomically.
429 respects the transport retry policy without refreshing action identity/revision.

Admin GET `/api/v1/admin/groups?apiKeyId&afterGroupId&limit` is an owned-project keyset list under current memberPageSize.
GET `/api/v1/admin/groups/{groupId}?apiKeyId`, `/{groupId}/members?apiKeyId&afterUserId&limit`,
`/{groupId}/pending?apiKeyId`, `/players/{userId}?apiKeyId`, `/limits?apiKeyId` are read-only and
require GROUPS Account Key scope or dashboard session. No admin app impersonation or hidden writes.
Public system config exposes `groups` (memberships/player) and `groupMembers` limits. Group realtime metadata is membership-authorized
`groups:{groupId}`. Removed members lose authorization; events never contain data or member lists.
