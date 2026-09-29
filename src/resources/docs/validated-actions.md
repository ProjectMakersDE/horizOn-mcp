# Validated Actions

## Overview

Normally the game client writes its own leaderboard score. A modified client can write any value. **Validated Actions** moves the decision to the server without running game code on horizOn:

1. Before a run the game asks for a **run ticket**: a server-signed, single-use token with a server-chosen **seed** and an expiry, bound to the player, the API key and optionally a leaderboard.
2. The game seeds its deterministic randomness with the seed and records its **input log** (the player's inputs, in the game's own format).
3. After the run the game sends the ticket, the claimed result (score, optional stage) and the **SHA-256 hash of its input log** (a commitment; the log itself stays on the device).
4. The server checks the ticket and the API key's **server-only rules** (score limits, minimum duration, score per second, stage rules) **before anything is written**. The duration is measured by the server, from the ticket to the submit.
5. Only an accepted run writes the score. A ticket is used exactly once, also when the run is rejected.

Leaderboards can be marked **validated only** (`validatedOnly: true`) in the Dashboard. Such boards reject the normal score submit with `403 VALIDATED_SUBMIT_REQUIRED` and accept scores only through this flow.

Rules live only on the server. Their values never appear in app responses or error messages; only a stable `code` tells which rule rejected a run. The server checks plausibility: a modified client that sends plausible values is caught later by the evidence review (input log upload), which is not live yet.

Validated Actions is cloud only. The self-hosted simpleServer does not support it (the endpoints answer 404; SDKs report `NOT_SUPPORTED`).

## Rules and Limits

| Item | Value |
|------|-------|
| Ticket lifetime | Default 2 hours, 60 seconds to 6 hours per rule set |
| Ticket size | About 190 characters, at most 512; opaque, send it unchanged |
| Seed | 0 to 2,147,483,646 |
| Input log hash | SHA-256 of the raw log bytes, 64 hex characters (upper case accepted) |
| Score | 0 to 9,007,199,254,740,991 |
| Stage key | `^[a-z0-9][a-z0-9._-]{0,31}$` |
| Leaderboard key | `^[a-z0-9_-]{1,64}$` |
| Runs per player and hour | Rule set, default 60 (`RUN_RATE_LIMITED`) |
| Runs per account and UTC hour | FREE 300, BASIC 3,000, PRO 20,000, ENTERPRISE 200,000 (`RUN_CAPACITY_REACHED`) |

Rule sets are configured per API key in the Dashboard (global fields, defaults, per-leaderboard blocks, stage rules). The account API key (mcp admin tools) has no access to rules.

## Endpoints

Both endpoints need `X-API-Key` **and** the player's session `Authorization: Bearer <accessToken>` from sign-in. The session must belong to `userId`.

### Start Run

**`POST /api/v1/app/validated-actions/runs`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string (UUID) | Yes | The signed-in player |
| `leaderboardKey` | string | No | Bind the ticket to this board (must exist, `default` is created on first use) |

**Response (200):**

```json
{
  "runId": "5b0b6c1e-8d0f-4c55-9b0e-0e6a4a8a3d11",
  "ticket": "hzn-rt1:2026-09:Qm9...:c2Vj...",
  "seed": 1834201177,
  "leaderboardKey": "weekly",
  "issuedAt": "2026-09-29T14:00:00.120Z",
  "expiresAt": "2026-09-29T16:00:00.120Z",
  "expiresInSeconds": 7200
}
```

`leaderboardKey` is `null` for an unbound ticket.

### Submit Run

**`POST /api/v1/app/validated-actions/submit`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userId` | string (UUID) | Yes | Session player and the ticket's player |
| `ticket` | string | Yes | From the start call, unchanged |
| `inputLogHash` | string | Yes | SHA-256 of the input log, 64 hex characters |
| `leaderboardKey` | string | No | Target board. Omit to use the ticket's board. Required for a leaderboard write with an unbound ticket |
| `score` | integer | When a board is targeted | Ignored for a run without board |
| `stage` | string | No | Stage key for stage rules |
| `earned` | array of `{key, amount}` | No | Server-owned values (coming later); accepted and ignored for now, at most 64 |

Blank `leaderboardKey` and `stage` count as absent. A run without board checks only the stage and duration rules of the defaults.

**Response (200):**

```json
{
  "accepted": true,
  "runId": "5b0b6c1e-8d0f-4c55-9b0e-0e6a4a8a3d11",
  "leaderboardKey": "weekly",
  "score": 18250,
  "bestScore": 21000,
  "isNewHighScore": false,
  "rank": 17,
  "durationSeconds": 734,
  "state": null,
  "evidence": null
}
```

`bestScore` is the player's row after the write and `rank` its 1-based position. For a run without board `leaderboardKey`, `score`, `bestScore` and `rank` are `null` and `isNewHighScore` is `false`. `state` and `evidence` are reserved for server-owned state and evidence upload and are `null` for now.

Order of checks: rate limit, session, body, ticket (`TICKET_INVALID`, `TICKET_FOREIGN`, `TICKET_EXPIRED`), board (`LEADERBOARD_NOT_FOUND`, `LEADERBOARD_MISMATCH`), `SCORE_REQUIRED`, `PLAYER_NAME_REQUIRED`, rules, atomic ticket consumption (`TICKET_CONSUMED`), write.

### Computing the input log hash

The hash is the SHA-256 of the **raw bytes** of the input log, written as 64 lower case hex characters. Keep the exact bytes: the same bytes will be uploaded as evidence when the evidence review goes live.

| Environment | Helper |
|-------------|--------|
| Unity | `ValidatedActionsManager.ComputeInputLogHash(bytes)` (`System.Security.Cryptography.SHA256`) |
| Godot | `HorizonValidatedActions.computeInputLogHash(bytes)` (`HashingContext.HASH_SHA256`) |
| Unreal | `UHorizonValidatedActionsManager::ComputeInputLogHash(Bytes)` (`FSHA256::HashBuffer`) |
| Shell | `sha256sum input.log` or `shasum -a 256 input.log` |
| MCP | `horizon_submit_validated` hashes `inputLogBase64` (bytes) or `inputLog` (UTF-8 text) locally |

## Code Examples

### Unity (C#)

```csharp
using PM.horizOn.Cloud.Manager;

var run = await ValidatedActionsManager.Instance.StartRun("weekly");
if (run == null) { Debug.LogWarning(ValidatedActionsManager.Instance.LastErrorCode); return; }
Random.InitState(run.seed);

// ... play, record the inputs into byte[] inputLog ...

var result = await ValidatedActionsManager.Instance.SubmitValidated(18250, inputLog);
if (result == null)
{
    Debug.LogWarning(ValidatedActionsManager.Instance.LastErrorCode); // e.g. DURATION_TOO_SHORT
}
else
{
    Debug.Log($"Rank {result.rank}, best {result.bestScore}");
}
```

### Godot (GDScript)

```gdscript
var run: Dictionary = await Horizon.validatedActions.startRun("weekly")
if run.is_empty():
    print(Horizon.validatedActions.getLastErrorCode())
    return
seed(int(run.seed))

# ... play, record the inputs into input_log (PackedByteArray) ...

var result: Dictionary = await Horizon.validatedActions.submitValidated(18250, input_log)
if result.is_empty():
    print(Horizon.validatedActions.getLastErrorCode())  # e.g. SCORE_ABOVE_MAX
```

### Unreal (C++)

```cpp
Horizon->ValidatedActions->StartRun(TEXT("weekly"), FOnValidatedRunStarted::CreateLambda(
    [](bool bSuccess, const FHorizonValidatedRun& Run, const FString& ErrorCode, const FString& ErrorMessage)
    {
        // Seed the game's random stream with Run.Seed
    }));

Horizon->ValidatedActions->SubmitValidated(18250, InputLog, TEXT(""), TEXT("weekly"), {},
    FOnValidatedSubmitComplete::CreateLambda([](bool bSuccess, const FHorizonValidatedSubmitResult& Result,
        const FString& ErrorCode, const FString& ErrorMessage)
    {
        UE_LOG(LogTemp, Log, TEXT("Run: %s rank %lld"), bSuccess ? TEXT("ok") : *ErrorCode, Result.Rank);
    }));
```

### REST (cURL)

```bash
# Start a run bound to the "weekly" board
curl -X POST https://horizon.pm/api/v1/app/validated-actions/runs \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_SIGNIN" \
  -H "Content-Type: application/json" \
  -d '{"userId": "USER_ID", "leaderboardKey": "weekly"}'

# Hash the input log
HASH=$(shasum -a 256 input.log | cut -d' ' -f1)

# Submit the result with the unchanged ticket
curl -X POST https://horizon.pm/api/v1/app/validated-actions/submit \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_SIGNIN" \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"USER_ID\", \"ticket\": \"TICKET\", \"inputLogHash\": \"$HASH\", \"score\": 18250}"
```

### MCP tools

1. `horizon_signin_anonymous` or `horizon_signin_email`: keep `userId` and `accessToken`.
2. `horizon_start_run` with `userId`, `sessionToken` (the accessToken) and optionally `leaderboardKey`.
3. `horizon_submit_validated` with `userId`, `sessionToken`, the `ticket`, `score` and exactly one of `inputLogHash`, `inputLogBase64` or `inputLog`. The result also shows the `inputLogHash` that was sent.

Error results name the server `code`, for example `horizOn API error (HTTP 422, code DURATION_TOO_SHORT)`.

## Best Practices

- **Start the ticket when the run really starts.** The server measures the duration from the ticket; starting early wastes lifetime, starting late can trip `DURATION_TOO_SHORT`.
- **One ticket per run.** A ticket is spent after any rule rejection, `SCORE_LIMIT_REACHED` or success. Start a new run instead of resending.
- **Retry only transient failures.** After a network error, 401, 404, 429 without code or 503 the same ticket may be sent again. Do not retry `RUN_RATE_LIMITED` or `RUN_CAPACITY_REACHED` automatically: the wait can be an hour.
- **Keep the input log bytes** until the submit is accepted; the evidence review will ask for exactly those bytes.
- **Switch on `code`, never on `message`.**

## Common Errors

| Status | Code | Meaning |
|--------|------|---------|
| 400 | `SCORE_REQUIRED` | A board was targeted without `score` |
| 400 | `PLAYER_NAME_REQUIRED` | Leaderboard run by a player without display name |
| 401 | `SESSION_REQUIRED` | No, unknown or expired Bearer session |
| 403 | `SESSION_FORBIDDEN` | Session of another player, account or API key |
| 403 | `SCORE_LIMIT_REACHED` | Score rows of the API key full; the ticket is used up |
| 403 | `VALIDATED_SUBMIT_REQUIRED` | Normal score submit to a validated only board |
| 404 | `PLAYER_NOT_FOUND` / `LEADERBOARD_NOT_FOUND` | Player or board missing |
| 422 | `TICKET_INVALID` / `TICKET_EXPIRED` / `TICKET_FOREIGN` / `TICKET_CONSUMED` | Ticket unusable |
| 422 | `LEADERBOARD_MISMATCH` | Ticket bound to another board |
| 422 | `STAGE_REQUIRED` / `STAGE_UNKNOWN` | Stage rules need a known stage |
| 422 | `SCORE_ABOVE_MAX` / `SCORE_BELOW_MIN` | Score outside the board limits |
| 422 | `STAGE_SCORE_ABOVE_MAX` / `STAGE_SCORE_BELOW_MIN` | Score outside the stage limits |
| 422 | `DURATION_TOO_SHORT` | Server-measured run shorter than allowed |
| 422 | `SCORE_RATE_TOO_HIGH` | Score per second above the limit |
| 429 | `RUN_RATE_LIMITED` / `RUN_CAPACITY_REACHED` | Run limits, `Retry-After` set |
| 429 | (empty body) | Account request rate limit |
| 503 | `VALIDATED_ACTIONS_UNAVAILABLE` | Server has no ticket key configured |

## Self-hosted simpleServer

Not supported (cloud only). The endpoints do not exist there; SDKs map the 404 to `NOT_SUPPORTED`.
