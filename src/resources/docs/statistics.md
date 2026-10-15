# Player statistics

Statistics are separate from spendable player values. Define up to 10/25/35/50/100 keys for Free/Basic/Plus/Pro/Enterprise. Each key has a short immutable `key`, `name`, mode `sum|max|min|last`, reset `none|daily|weekly` and an optional positive integer `maxPerUpdate`. Days and ISO weeks use UTC. Min/max/last initialize from the first report; `hasValue:false` distinguishes an untouched zero. Changing mode/reset or deleting and recreating a key resets its generation; names and report bounds preserve counters.

Player calls require the project API key and the matching Bearer session. Nothing is automatically loaded at login. Send one whole session batch. Values are JSON integers in ±9,007,199,254,740,991; float/string coercion, duplicate keys, unknown keys, per-update bounds and overflow reject the whole batch.

- `horizon_get_statistics(userId,sessionToken,definitionVersion?)` → snapshot.
- `horizon_get_statistics_definitions(sessionToken,definitionVersion?)` → catalog.
- `horizon_update_statistics(userId,sessionToken,operationId,updates)` → snapshot with `operationId` and `replayed`.

The snapshot is `{userId,definitionVersion,definitions,revision,values:[{key,value,hasValue,period}],operationWindow:{serverTimeUnixMillis,maxAgeSeconds,maxFutureSkewSeconds},operationId?,replayed,newlyUnlocked:[]}`. Definitions null means unchanged at the supplied version; retain the cached catalog. An empty array means an empty catalog. `newlyUnlocked` is reserved for a later achievement feature.

Persist a new `<13-digit Unix milliseconds>:<UUID>` ID and the original updates before sending. Use the snapshot server time for clock alignment (max future skew30s, nominal age24h). After an uncertain timeout read a snapshot and retry the original ID and payload; never create a new ID automatically. A retained same-ID/same-payload receipt replays first, even after the age window or policy changes. A changed payload gives `409 OPERATION_CONFLICT`. Only eight receipts are retained; the persistent eviction floor can reject delayed out-of-order unknown IDs before24h. Expired or evicted unknown IDs fail closed with `410 OPERATION_EXPIRED`, never rebook. Inspect/reconcile the original outcome rather than blindly resubmitting as new.

Other codes: `400 INVALID_REQUEST`, `401 SESSION_REQUIRED`, `403 SESSION_FORBIDDEN`, `404 PLAYER_NOT_FOUND`, `409 STATE_CONFLICT`, `422 UNKNOWN_STATISTIC|UPDATE_ABOVE_LIMIT|VALUE_OVERFLOW|OPERATION_IN_FUTURE`, transient account429 with Retry-After. No counters change on a rejected batch.

## SDK calls

Unity: `StatisticsManager.Instance.GetStatistics()` and `UpdateStatistics(new[]{new StatisticUpdate("kills",3)},operationId)` return `Task<StatisticsSnapshot>`; null means failure, read `LastErrorCode`. `GetDefinitions()` returns `Task<StatisticsDefinitionsResponse>`. `CreateOperationId()` creates an ID for a new durable intent. Fields use camelCase. Persist the original batch before updating, as `StatisticsExample` shows.

Godot: `await Horizon.statistics.getStatistics()`, `.getDefinitions()` and `.updateStatistics([{ "key":"kills", "value":3 }],operation_id)` return Dictionary; `{}` means failure, call `.getLastErrorCode()`. Signals: statistics_loaded,statistics_updated,definitions_loaded,statistics_failed(error,code). `.createOperationId()` creates one ID for a new batch. Persist using binary Variant storage to preserve int64 values exactly.

Unreal: `Horizon->Statistics->GetStatistics(FOnStatisticsLoaded)` and `UpdateStatistics(Updates,OperationId,FOnStatisticsLoaded)` call `(bool,const FHorizonStatisticsSnapshot&,const FString& Code,const FString& Message)`. `GetDefinitions(FOnStatisticsDefinitionsLoaded)` returns the catalog via delegate. Blueprint async nodes Get Statistics/Get Statistics Definitions/Update Statistics expose success/failure pins; Create Operation Id is a manager method. `AHorizonStatisticsExample` persists its pending batch in SaveGame before posting.

All three SDKs require a signed-in matching session and add Bearer automatically. Cache is scoped to the player/session/project/host. Late lower revisions and server times cannot replace newer projections. Catalog-only refresh preserves watermarks; ClearCache invalidates in-flight responses. On reconnect explicitly load a snapshot. Neither chat nor realtime is needed.

## Administration

Account Key tools require full-account or STATISTICS feature scope. A project-scoped key can read and replace the catalog only for its matching project; project and feature restrictions both apply.

- `horizon_admin_statistics_definitions_get(projectApiKeyId)` reads the full catalog and version.
- `horizon_admin_statistics_definitions_set(projectApiKeyId,expectedVersion,definitions)` replaces it using numeric If-Match;409 REVISION_CONFLICT means reload and reconcile.
- `horizon_admin_statistics_player_get(projectApiKeyId,userId)` reads an owned player's snapshot.
- `horizon_admin_statistics_limits(projectApiKeyId)` reads plan limits.

The app REST contract is `GET /api/v1/app/statistics?userId=&definitionVersion?`, `GET /api/v1/app/statistics/definitions?definitionVersion?`, `POST /api/v1/app/statistics` with `{userId,operationId,updates:[{key,value}]}`. Cloud and simpleServer share this REST surface. simpleServer configures its catalog through SQL and has no hosted admin/billing surface. Realtime/chat remain Cloud-only.
