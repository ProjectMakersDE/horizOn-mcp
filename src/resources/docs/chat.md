# Hosted Chat

Chat is hosted-only; simpleServer returns501 NOT_SUPPORTED without a polling fallback. Player
tools require the matching current session/project. Admin tools require CHAT scope and project
ownership. Direct channels require active mutual friends without blocks; group channels require
membership; project channels require an active player. Group/project snapshots hide blocked or
inactive authors. Render immutable text literally: at most500 Unicode scalars/2000 UTF-8 bytes,
nonblank, no controls except LF/TAB. These are fixed format bounds.

## Open and sync

Open returns a deterministic channel ID and a fresh epoch after allocation/reopen. Subscribe to
chat:<channelId> using the existing realtime manager before initial sync. Resync/events trigger
one incremental HTTP sync. Keep host/project/player/channel/epoch/session fences, one in-flight
sync and a dirty bit. No periodic network timer. Disconnect/permission changes hide cached text
until fresh authorized subscription+sync.

Sync takes the exact epoch or null and up to20 unique known message IDs, the fixed wire bound
matching the largest current channel window. It returns the entire ordered visibleMessageIds and
unknown immutable text. An epoch change returns all visible text. Apply only a complete matching
snapshot, remove absent IDs and expire local content without HTTP. Known IDs never authorize reads.

Project channels retain20 messages/seven days. Direct/group channels retain15 messages/30seconds.
Local game history is separate and never silently re-uploaded. No authored-message copy is stored
on each player. Channel identity can outlive its text window.

## Original send and report

Before send, durably store project/player/operationId/canonical millisecond issuedAt/channelId/full
text. Host is a request fence, not a separate persistent-intent namespace. Each call makes exactly
one HTTP attempt. The live original message supplies the metadata-only operation receipt. Identical
retry can replay while that source remains; no personal historical receipt array is retained.
A monotone player issuedAt fence and30-second unknown-operation window prevent rebooking after the
source expires or is removed. Missing OPERATION_NOT_FOUND never proves nonexecution and never
authorizes a replacement UUID/time/text. After uncertainty explicitly inspect the original receipt
and reconcile; do not implicitly retry, even after a rate interval expires.

A report keeps one shared immutable snapshot for14days, under current project capacity. Identical
report identity/reason replays while that report is retained. There is no per-player report-receipt
history or permanent do-not-reopen ledger. Deleting a resolved report frees its slot; while the
original message is still visible, a later explicit report may be admitted under the current rate
and permission checks. Once the original message is gone, it cannot create a fresh report. The
client must never treat deletion, missing history or429 as permission to resubmit automatically.

## Policies and moderation

Channels/account, sends/account/minute and reports/project are current System Config policies,
including legitimate zero values. Defaults are not upper bounds. Read horizon_get_chat_limits;
reductions retain existing data/current authorized reads, while new allocations/sends obey policy.
Technical send gaps remain3seconds/player and2seconds/channel; allocation gates are5/player/hour
and20/account/minute, and a new report has a one-minute player gate. No tool waits or retries for429.

A wordlist has up to100 literal64-scalar/256-byte terms with NFKC+lowercase matching, no regex or
silent rewrite. Exact original If-Match protects admin changes. Mute blocks send; ban blocks current
chat read/open/send/report/subscription. Null clears moderation deadlines; nonnull is within30days
of serverTime. Removing existing text is a separate deliberate action; resolving a report does not
mute authors or delete messages.

Report cursor pages bind project/status and continue from the last examined row. Empty pages can
carry continuation. Channel pages use the prior UUID. Explicit maintenance processes a bounded
fair channel/report batch with persistent continuation; no automatic loop. Nullable response fields
remain explicit. Fresh send/report HTTP acceptance is201 and replay200. MCP provides tools and
metadata, not a background cache or WebSocket transport.
