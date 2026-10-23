# Asynchronous Matches

Matches hold opaque state for2..8 accepted players. The server enforces current membership,
turn ownership, exact revisions and deadlines. It never simulates the game or invents a winner.
Use a project key and the matching player's Bearer session. Scoped admin tools need MATCHES
and the owned project. Never put Account Keys in clients.

Read `horizon_get_matches` for the original player-ledger revision, then explicitly create with
`horizon_create_match`. Settings include name(120 UTF-8 bytes), capacity, visibility(open/private),
safe-integer strength, turnSeconds60..604800, timeoutPolicy(skip/forfeit), ranked, canonical
dataBase64 and at most capacity-1 invitee UUIDs. The server generates the match ID. A lost create
response is reconciled by reading the ledger. Keep the original intent and If-Match, never create
again with a fresh revision merely because the response was lost.

The14 player tools are `horizon_get_matches`, `horizon_get_match_limits`,
`horizon_find_open_matches`, `horizon_get_match`, `horizon_create_match`, `horizon_join_match`,
`horizon_decline_match_invite`, `horizon_start_match`, `horizon_submit_match_turn`,
`horizon_advance_match_timeout`, `horizon_leave_match`, `horizon_cancel_match`,
`horizon_report_match_result`, `horizon_start_match_ranked_run`.

Invited players can read lobby metadata with dataBase64=null. Accepted players can read the
original bytes, including empty bytes represented by an empty string. A private foreign ID is404.
Open search returns at most50 summaries from256 metadata candidates with current bilateral blocks
and owner status. An empty page can have nextCursor. Explicit next pages are immediate, refresh
honors pollAfterSeconds. No tool polls or follows cursors automatically.

Create/join reserve active and separate settlement capacity early; completed detail history is
independent. A creator explicitly starts with every accepted player
in turnOrder. Start removes outstanding invitations. Normal moves replace bytes once under the
original match If-Match. Timeout advances one overdue turn; leave during play forfeits. Creator
lobby leave/cancel closes the lobby. Other lobby leave removes seat/history/access. Departing lobby
ACKs contain metadata only. No remaining-player count determines a winner.

finish=true freezes the final state and finalStateRevision, releases active slots and opens24h
for reports. Each accepted player, including forfeited players, submits immutable resultBase64
(at most256 decoded bytes) and sorted unique winnerIds. Empty winners means draw. The exact report
can be replayed, changed reports return RESULT_CONFLICT. Complete agreement confirms, complete
disagreement disputes, missing reports become unconfirmed. Agreement is not proof of honest play.

Optional ranked matches snapshot an existing configured board. Only complete consensus unlocks
one bound validated run per participant. `horizon_start_match_ranked_run` with the original
finalStateRevision recovers the exact original runId/seed/expiry after uncertainty. It never
extends or replaces expired/consumed tickets. `get_matches.pendingResults` independently retains
only matchId,finalStateRevision,ownRankedRunId,expiresAt for authorized open result/run settlement.
Retain the minimal original match/final-revision→run binding until the authentication context
changes; never infer a fresh run from missing detail history. Submit through existing validated-actions tools.
This is a short post-match rule validation, not retrospective simulation of a30-day match.
There are no automatic match rewards. simpleServer supports ordinary REST and explicitly returns
501 FEATURE_NOT_SUPPORTED for ranked creation/run start. Its realtime and matchesRanked capabilities
are false. Check capabilities before offering ranked controls.

Every write uses one HTTP attempt. 409 STATE_CONFLICT/REVISION_CONFLICT or a lost response requires
explicit reconciliation. Do not silently replace the original revision or repeat a move.
Turn notices are ordinary Inbox messages with durable per-turn identities. A full mailbox leaves
the latest notice pending without undoing the committed move. A newer turn supersedes it and
the original deadline ends delivery. Realtime topic matches:<UUID> carries participant-only
metadata, no payload. Completed detail duration/count are current administrator policies; FREE
defaults to zero completed details. Minimal source fields needed by an outstanding valuable result
or original run remain independently protected. After completion/expiry a detail read may return
MATCH_NOT_FOUND and never authorizes a new action/reward. Lobbies last24h and active matches at
most30days. Explicit bounded maintenance follows separate due/source/history continuations.

Read all seven current policies: activeMatches,stateBytes,retainedMatches,pendingInvites,
settlementMatches,historyRetentionSeconds,rankedSettlementSeconds. Tier defaults are not maxima;
retainedMatches/historyRetentionSeconds may be zero. Retained reads stay complete after reductions.
The technical state maximum is14999552 decoded bytes (14648KiB), whose canonical Base64 fits the
20003500-byte create/turn HTTP frame. Result bytes remain a separate fixed256-byte contract.
simpleServer's portable BLOB subset is65535 decoded bytes; higher ENV is rejected explicitly,
while existing larger SQLite originals remain readable/shrinkable. Never treat these frames as quotas.

The7 admin tools are `horizon_admin_match_config_get`, `horizon_admin_match_config_set`,
`horizon_admin_match_limits`, `horizon_admin_matches_list`, `horizon_admin_match_get`,
`horizon_admin_match_cancel`, `horizon_admin_matches_cleanup`. Configuration uses the original
If-Match and an existing rankedLeaderboardKey or null. Cancelling a running/reporting match
marks it unconfirmed without altering reports or granting rewards. Cleanup processes one batch
with a durable cursor that advances past full mailboxes and failed rows; repeating is not idempotent.

Unity MatchesManager, Godot Horizon.matches and Unreal UHorizonMatchesManager use the same
contract. Confirm native signatures against the current SDK before copying code. Minimal samples
must persist original intents under project/player (and feature) identity. Host, session and
generation are request/response fences only, never a separate pending-file namespace. A regional
host change cannot unblock an unresolved intent or permit a fresh create with a newer revision.
Block overwriting unresolved intents, preserve nullable/false/empty values, and demonstrate two players, disagreement and
original ranked-run recovery without client admin credentials.
