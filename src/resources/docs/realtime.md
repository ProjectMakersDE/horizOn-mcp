# Realtime for Chat and Matches

Verified on 2026-11-17 against Server/gateway **1.78.1**, Unity SDK **1.13.0**, Godot SDK **1.12.0** and Unreal SDK **1.11.0**. These releases include socket sends, subscription snapshots and resume tickets. Check the installed SDK version before using these APIs.

Only `chat:<channelId>` and `matches:<matchId>` are subscribable. Inbox, friends, groups, marketplace, achievements and profile use HTTP. Refresh them on open or user action, or at the returned polling cadence. A group chat uses a `chat:` topic, never a `groups:` topic. This is shared chat/turn state, not a frame-by-frame game relay or server game simulation.

MCP's existing `horizon_*` tools make explicit HTTP requests. They do not open a socket, subscribe, poll or test WebSocket delivery. Use this resource to integrate the game's SDK or a custom client. A successful HTTP tool call alone does not verify realtime delivery.

## HTTP routes and WebSocket URL

Use the same selected regional host as the game's App API, for example `https://horizon.pm`. HTTP requests require the project `X-API-Key` and the active matching player's `Authorization: Bearer <accessToken>`. Account Keys do not replace player sessions.

| Transport | Route | Purpose |
| --- | --- | --- |
| HTTP POST | `/api/v1/app/realtime/session` | Authenticated availability/session preflight, no body required (`{}` is accepted). |
| HTTP POST | `/api/v1/app/realtime/subscriptions` | Authorize a topic and obtain its current snapshot, body `{topic,sync?}`. |
| WebSocket | `wss://<selected-host>/api/v1/app/realtime/socket` | Authenticated socket frames below. Use `ws:` only for a local HTTP Dev host. |

The public [App OpenAPI](https://horizon.pm/v3/api-docs/app) lists both HTTP routes. WebSocket frames are a separate protocol. An HTTP subscriptions call does **not** subscribe a socket. Game SDKs perform preflight and socket subscription themselves. The backend's `/realtime/frames` route is gateway-internal, not a public game endpoint.

Session success includes `version:1`, identity, expiry, current connection/burst limits and `pollAfterSeconds`. A direct subscriptions response is `{version:1,topic,hiddenUserIds,snapshot}`. Keep internal routing fields and resume tickets out of logs and persistent game data. The gateway rechecks authorization for socket subscriptions.

## Connect, authorize, then apply a snapshot

1. Sign in and retain the current player session. On the first connection, POST `/realtime/session`. A `501 NOT_SUPPORTED` ends realtime attempts for that context; supported HTTP features remain available.
2. Open the WebSocket URL with no query parameters or credentials in the URL. Authenticate in the first frame. Use a stable UUID `clientId` for this manager instance and exactly one of `sessionToken` or a previously received `ticket`:

```json
{"type":"authenticate","version":1,"apiKey":"PROJECT_API_KEY","clientId":"00000000-0000-4000-8000-000000000001","sessionToken":"PLAYER_ACCESS_TOKEN"}
```

3. Wait for `ready`. It includes `version:1,heartbeatSeconds,pollAfterSeconds,maxSubscriptions`, optional `ticket` and `sendOverSocket`. Transport open is not readiness or topic authorization. The initial topicless `resync_required` with reason `CONNECTED` invalidates old authority. Hide old private feeds until their new authorized snapshots arrive.
4. Subscribe **one topic at a time**, waiting for the matching `subscribed` or topic error before the next. Positive integer `requestId` values correlate replies. Chat catch-up takes the previous epoch and at most 20 unique known message UUIDs, or `{epoch:null,knownMessageIds:[]}`:

```json
{"type":"subscribe","requestId":1,"topic":"chat:CHANNEL_UUID","sync":{"epoch":null,"knownMessageIds":[]}}
{"type":"subscribe","requestId":2,"topic":"matches:MATCH_UUID"}
```

These are separate sequential requests. Match invitees subscribe after accepting with join; invitation alone is insufficient. Chat uses the same friendship, membership, blocking and moderation rules as HTTP reads.

5. Apply the matching `subscribed.snapshot` in the current host/project/player/session generation. Chat snapshots are incremental sync responses (`channel,visibleMessageIds,messages,serverTime`); merge against the exact epoch/known IDs sent. Match snapshots are the normal `MatchRead` envelope (`match,pollAfterSeconds,serverTime`). A valid snapshot replaces the initial/reconnect HTTP reload. If no snapshot is available, the gateway sends a topic `resync_required`; obtain current authorized HTTP state.

Up to 32 topics are admitted per connection. `SUBSCRIPTION_FORBIDDEN` rejects a denied topic without closing the socket. Other features' topics are always denied, even when an older SDK accepts their syntax. Permission changes clear topic authorization and send `resync_required` with `PERMISSIONS_CHANGED`. Hide old private state and reauthorize subscriptions. Match content reaches current participants only; Chat filters blocked authors.

## Pushed content, resync and acknowledgements

An `event` contains `version:1,eventId,topic,resourceId,revision,eventType` and, when available, `payload`:

- Chat message payload is `{channel,message}`, including immutable text. Merge into the current channel/epoch and enforce the bounded window and local expiry.
- Match payload is the participant `MatchView` itself, including `dataBase64`, not a `{match:...}` envelope. Its `ownRankedRunId` is null. It must not erase a retained original ranked-run binding or serve as a ranked-run receipt.

Apply usable pushed content without fetching the same state again. Payloads above 32,768 JSON characters and changes without a client view (for example moderation/cleanup) arrive without payload. Perform one authorized HTTP reconciliation for a missing/unusable payload or explicit `resync_required`. Duplicates and skipped intermediate revisions are legal. Reject stale revisions and old authentication contexts. A gap does not prove a write failed.

Custom clients acknowledge every `event` and `resync_required` with its exact `eventId`, including duplicates. Native managers do this automatically:

```json
{"type":"ack","eventId":"THE_64_HEX_EVENT_ID"}
{"type":"ping"}
{"type":"unsubscribe","requestId":3,"topic":"chat:CHANNEL_UUID"}
```

Ping around every 30 seconds; the gateway returns `pong` and also sends heartbeats. Bound incoming work and reconnect if frames stop for 90 seconds. Unsubscribe and unbind screen callbacks when no longer needed; close when no subscriptions remain.

## Chat sends and match actions

With `ready.sendOverSocket=true`, the socket accepts `chat.send` and `match.action`. They execute the same backend rules and return `{type:"result",version:1,requestId,status,result?,code?,retryAfter?}`. Keep at most four sends in flight. Command results and participant change events are separate.

```json
{"type":"chat.send","requestId":4,"channelId":"CHANNEL_UUID","operationId":"ORIGINAL_OPERATION_UUID","issuedAt":"2026-11-17T12:00:00.000Z","text":"Hello"}
{"type":"match.action","requestId":5,"matchId":"MATCH_UUID","action":"turn","revision":7,"input":{"dataBase64":"","finish":false}}
```

Match actions are `join,decline,start,turn,timeout,leave,cancel`. `revision` is the original HTTP If-Match revision; `input` holds that action's normal fields without authenticated user/revision. Create, result reports, ranked-run start, chat open/sync/receipt/report and other operations stay HTTP. The HTTP state maximum is not a promise about WebSocket transport frame sizes.

Use normal SDK Chat/Matches methods; they choose the ready socket or HTTP. After an unknown socket outcome (close or result timeout), these SDKs resolve through HTTP with the **same** operation ID/body or match revision. Persist the original intent before calling. Never replace it because transport changed. Returned policy/conflict/rate errors require explicit handling. MCP tools still make one explicit HTTP attempt.

## Verified engine APIs

| SDK release | Manager and lifecycle | Callbacks / readiness |
| --- | --- | --- |
| Unity 1.13.0 | `RealtimeManager.Instance.Subscribe(topic)`, `IsSubscribed(topic)`, `Unsubscribe(topic)`, `Close()`, `SetPollAfterSeconds(seconds)` | `EventReceived(RealtimeFrame)`, `SnapshotReceived(string topic,string json)`, `ResyncRequired(string topic)`, `PollingRequired(string topic,int seconds)`, `ConnectionError(string code)`; `IsReady`, `CanSendOverSocket` |
| Godot 1.12.0 | `Horizon.realtime.subscribe(topic)`, `isSubscribed(topic)`, `unsubscribe(topic)`, `close()`, `setPollAfterSeconds(seconds)` | `event_received(Dictionary)`, `snapshot_received(topic,snapshot_json)`, `resync_required(topic)`, `polling_required(topic,seconds)`, `connection_error(code)`, `subscription_failed(topic,code)`; `isReady`, `sendOverSocket` |
| Unreal 1.11.0 | Subsystem `Realtime` (`UHorizonRealtimeManager`): `Subscribe`, `IsSubscribed`, `Unsubscribe`, `Close`, `SetPollAfterSeconds` | `OnEvent(EventJson)`, `OnSubscribed(Topic)`, `OnResyncRequired`, `OnPollingRequired`, `OnConnectionError`, `OnSubscriptionError`; `bIsReady`, `CanSendOverSocket()` |

Bind before subscribing. Subscribe's boolean means retained locally, **not** authorized: check `IsSubscribed/isSubscribed` after acknowledgement. Unreal C++ reads a snapshot through `GetSnapshot(Topic,OutJson)` **inside** `OnSubscribed`; that function is not a Blueprint node.

Godot/Unreal event callbacks expose the full payload. Unity 1.13.0's public `RealtimeFrame` exposes metadata only, with no `payload` field, so its `EventReceived` handler needs the HTTP feature read. Do not invent a Unity payload API.

The published built-in Chat feeds in all three SDKs apply subscription snapshots, but still perform incremental HTTP sync after later events. Use Unity `ChatManager.Instance.WatchChannel(userId,channelId)` / `UnwatchChannel(channelId)` and `FeedChanged`; Godot `Horizon.chat.watchChannel(userId,channelId,owner)` / `stopWatching(channelId,owner)`; Unreal `Chat->WatchChannel(UserId,ChannelId)` / `UnwatchChannel(ChannelId)` and `OnFeedChanged`. These releases do not eliminate every event-triggered HTTP sync. A custom Godot/Unreal payload consumer can avoid that reload while preserving feature authorization, revisions and expiry. Do not run a second feed controller alongside the built-in watcher.

## Reconnect and HTTP fallback

Managers connect only for active subscriptions. They reconnect with full jitter capped at 30 seconds, use short jitter on service restart (close 1012), and re-subscribe for current snapshots. Resume tickets arrive with `ready`/renewals and remain in memory only. SDKs use them for up to nine minutes, falling back once to session authentication after ticket rejection. Player/project changes clear old subscriptions; token/host/context changes reconnect and discard old responses.

Connection-limit errors delay another attempt using `pollAfterSeconds`. Session/key revocation, expiry or lost permissions require current authorization, not a fresh guest. Respect rate errors and Retry-After. Use returned connection/burst policy rather than hardcoded plan values.

While disconnected, `PollingRequired` asks the game to load state; RealtimeManager does not perform that HTTP request. Update its cadence with `SetPollAfterSeconds/setPollAfterSeconds` from feature responses. Native managers do **not** emit polling callbacks for `chat:`; the game may choose explicit Chat sync/HTTP polling separately. Hosted Chat HTTP works when the socket is unavailable. simpleServer has no realtime and returns `501 NOT_SUPPORTED` for Chat; supported ordinary Match HTTP remains available. Do not subscribe to denied Inbox/other topics to obtain a polling timer.

## Sources

- [Server 1.78.1 HTTP authorization](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/src/main/kotlin/com/projectmakers/horizonserver/features/realtime/controller/RealtimeController.kt), [protocol](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/realtime-gateway/src/protocol.js), [lifecycle](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/realtime-gateway/src/gateway.js).
- [Unity 1.13.0](https://github.com/ProjectMakersDE/horizOn-SDK-Unity/blob/v1.13.0/CloudSDK/Manager/RealtimeManager.cs), [Godot 1.12.0](https://github.com/ProjectMakersDE/horizOn-SDK-Godot/blob/v1.12.0/addons/horizon_sdk/core/realtime.gd), [Unreal 1.11.0](https://github.com/ProjectMakersDE/horizOn-SDK-Unreal/blob/v1.11.0/Plugins/HorizonSDK/Source/HorizonSDK/Public/Managers/HorizonRealtimeManager.h).
