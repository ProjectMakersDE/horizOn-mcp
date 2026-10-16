# Hosted Chat

Chat is a hosted-only text feature. simpleServer returns 501 NOT_SUPPORTED for every
chat method. Never emulate it with polling. All app tools require the current matching
player session and project key. Admin tools require CHAT scope and the owned project.

Direct channels require active mutual friends without a bilateral block. Group channels
require current membership. Project channels require an active player. Group/project
snapshots hide blocked and inactive authors. Text is immutable plain Unicode, at most 500
scalars/2000 UTF-8 bytes, nonblank, no controls except LF/TAB. Render it as text.

Open returns a deterministic channel ID and fresh epoch on allocation/reopen. Subscribe to
`chat:<channelId>` using the existing realtime manager before initial sync. Metadata-only
resync/events trigger one incremental HTTP sync. Cache project/player/channel/epoch/session/
generation separately, with one in-flight sync and one dirty bit. No periodic network timer.
Disconnect/permission changes hide the cache until a fresh authorized subscription+sync.

Sync carries the exact cached epoch or null and up to 100 unique known IDs. It returns the
entire ordered visibleMessageIds list and only unknown text. An epoch change returns all
visible text. Apply atomically only when every ID has matching cached/returned text, remove
absent IDs, and expire local content without HTTP. Known IDs never grant authorization.

Before sending, durably store project+player, operationId, canonical millisecond issuedAt,
channel ID and exact full text. Host is not part of persistent intent identity. One HTTP
attempt. After timeout/503/lost ACK, call horizon_get_chat_operation, then only explicitly
replay the same original send. Missing receipt is not proof of no commit. Never invent a
new UUID/time/text to bypass uncertainty or OPERATION_EXPIRED. The server retains up to 100 receipts and a
monotone issuedAt floor. Receipt replay returns metadata even after deletion/expiry/ban/
FREE downgrade, without recreating text. Matching identity remains required.

Reports preserve original channel/message/reason. At most 32 reporter receipts survive,
with a message-created-at floor. Matching replay can return status removed after moderation
deletion or expiry. It never opens a replacement report. REPORT_EXPIRED requires explicit
reconciliation. Reports retain the original text snapshot for 14 days and count until
transactional removal, including after resolution. Full capacity rejects before writes.

| Bound | FREE | BASIC | PLUS | PRO | ENTERPRISE |
|---|---:|---:|---:|---:|---:|
| Authored retained messages/player |0|20|35|50|100|
| Channels/account |0|100|200|500|2000|
| Sends/account/fixed UTC minute |0|20|30|60|120|
| Retained reports/project |0|50|100|150|200|

Read current limits from the server. Channel retention is 100 messages/seven days. Minimum
send gaps are 3 seconds/player and 2 seconds/channel. Allocation gates are 5/player/hour and
20/account/minute. Report gate is one new report/player/minute. 429 never schedules a new
send. Lowered tiers do not silently discard retained data or grow excess.

Moderation uses exact original If-Match revisions. A wordlist has up to 100 literal terms
with NFKC+lowercase matching, no regex or silent rewrite. Mute blocks sending, ban blocks
chat read/open/send/report/subscription; own capabilities/receipts remain available. Null
clears a deadline, nonnull is within 30 days of server time. Removing existing text is a
separate deliberate action. Resolving reports neither deletes messages nor mutes authors.

Report list cursors bind project/status and continue from the last examined candidate.
At most limit+1 candidates are read; expired text is hidden, so an empty page may have a
nextCursor. Follow it explicitly, never restart or automatically traverse. Channel pages
use after UUID. Cleanup processes at most 20 due rows with fair 10+10 reservations and
persistent continuation, including past failures. Repeated cleanup advances another batch.

All nullable response fields stay explicit. Send/report first acceptance is 201, replay 200.
Every write is a single attempt. MCP sync is a read-only POST but also makes one explicit
request. These tools do not provide a WebSocket transport or background cache themselves.
