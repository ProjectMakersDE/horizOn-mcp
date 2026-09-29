# Validated Actions

## Overview

Normally the game client writes its own leaderboard score. A modified client can write any value. **Validated Actions** moves the decision to the server without running game code on horizOn:

1. Before a run the game asks for a **run ticket**: a server-signed, single-use token with a server-chosen **seed** and an expiry, bound to the player, the API key and optionally a leaderboard.
2. The game seeds its deterministic randomness with the seed and records its **input log** (the player's inputs, in the game's own format).
3. After the run the game sends the ticket, the claimed result (score, optional stage) and the **SHA-256 hash of its input log** (a commitment; the log itself stays on the device).
4. The server checks the ticket and the API key's **server-only rules** (score limits, minimum duration, score per second, stage rules) **before anything is written**. The duration is measured by the server, from the ticket to the submit.
5. Only an accepted run writes the score. A ticket is used exactly once, also when the run is rejected.
6. A run can also carry **earned values** (currency, loot counters). The server keeps them as **server-owned player state**: only accepted validated runs change a balance, with per-run limits and daily caps. Clients read the state, never write it.

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
| Value key | `^[a-z0-9][a-z0-9._-]{0,23}$` |
| Earned values per run | At most 64, each key once |
| Value keys per API key | FREE 8, BASIC 16, PRO 32, ENTERPRISE 64 |
| Amounts and balances | At most 9,007,199,254,740,991 in magnitude |

Rule sets are configured per API key in the Dashboard (global fields, defaults, per-leaderboard blocks, stage rules, values). The account API key (mcp admin tools) has no access to rules or to the player state; balance corrections are made in the Dashboard (user management).

## Endpoints

All three endpoints need `X-API-Key` **and** the player's session `Authorization: Bearer <accessToken>` from sign-in. The session must belong to `userId`.

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
| `earned` | array of `{key, amount}` | No | Earned (positive) or spent (negative) server-owned values, at most 64, each key once. Every key must be defined in the values of the rules |

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

`bestScore` is the player's row after the write and `rank` its 1-based position. For a run without board `leaderboardKey`, `score`, `bestScore` and `rank` are `null` and `isNewHighScore` is `false`. `state` is the server-owned player state after the run (see below); it is `null` when the rules define no values. `evidence` is reserved for the evidence upload and is `null` for now.

A run without board still applies `earned`, so a pure currency run needs no leaderboard.

Order of checks: rate limit, session, body, ticket (`TICKET_INVALID`, `TICKET_FOREIGN`, `TICKET_EXPIRED`), board (`LEADERBOARD_NOT_FOUND`, `LEADERBOARD_MISMATCH`), `SCORE_REQUIRED`, `PLAYER_NAME_REQUIRED`, rules, earned values (`UNKNOWN_VALUE_KEY` and `DUPLICATE_VALUE_KEY` over all entries first, then per entry `EARNED_ABOVE_MAX`, `EARNED_BELOW_MIN`, `INSUFFICIENT_BALANCE`), atomic ticket consumption (`TICKET_CONSUMED`), write, state credit.

### Get State

**`GET /api/v1/app/validated-actions/state?userId={uuid}`**

**Response (200):**

```json
{
  "userId": "0d7e2f4a-9c1b-4a55-8e0e-3f6a4a8a3d11",
  "day": "2026-09-29",
  "values": [
    { "key": "chest.gold", "balance": 2, "earnedToday": 0, "dailyCap": null },
    { "key": "gold", "balance": 1250, "earnedToday": 250, "dailyCap": 5000 }
  ]
}
```

Every key defined in the values of the rules is listed, sorted by key (balance `0` when never earned). `values` is empty when the rules define no values. `day` is the current UTC day; `earnedToday` is the positive credit on that day (`0` after midnight UTC). `dailyCap` is shown so games can display "250 / 5000 today" (`null` means no cap); the other value rules stay hidden. There is no app endpoint that writes the state.

Errors: `401 SESSION_REQUIRED`, `403 SESSION_FORBIDDEN`, `404 PLAYER_NOT_FOUND`, `429` without body (account request limit).

## Server-Owned Player State

Each value is defined in the rules of the API key (Dashboard, rule editor, section values):

| Rule | Meaning | Effect |
|------|---------|--------|
| `maxPerRun` | Highest amount per run (0 or more, required) | Rejects the run with `EARNED_ABOVE_MAX` |
| `minPerRun` | Lowest amount per run (0 or less, default 0; negative allows spending) | Rejects the run with `EARNED_BELOW_MIN` |
| `dailyCap` | Positive credit per UTC day, or none | Clamps the credit, no rejection |
| `maxBalance` | Highest balance, or none | Clamps the credit, no rejection |

A spend larger than the balance rejects the run with `INSUFFICIENT_BALANCE`. Per-run limits reject, caps clamp.

### State in the submit result

```json
"state": {
  "day": "2026-09-29",
  "values": [
    { "key": "chest.gold", "balance": 1, "earnedToday": 0, "dailyCap": null, "requested": -1, "credited": -1 },
    { "key": "gems", "balance": 3, "earnedToday": 0, "dailyCap": null },
    { "key": "gold", "balance": 5000, "earnedToday": 5000, "dailyCap": 5000, "requested": 500, "credited": 250 }
  ]
}
```

Each key sent in `earned` has `requested` (the amount sent) and `credited` (the amount applied); untouched keys omit both.

- **`credited < requested` for a positive amount** means `dailyCap` or `maxBalance` clamped it. The run is still accepted; show the player what was really credited.
- **For a spend** `credited` is either `requested` or `0`. `0` means a concurrent run of the same player used the balance first; the run itself (and its score) stays accepted. **Grant a purchase only when `credited == requested`.**
- `state` is `null` when the rules define no values, or when the state write failed with a database error.

### Cloud save as a mirror

Cloud save stays a client-written blob. After each accepted run copy `state.values` (or the result of Get State) into the save for offline display, and on start overwrite that copy with the server state. Never send a cloud save value back as a balance: the only way to change a balance is `earned` in a validated run (plus the support correction in the Dashboard).

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

The Part 2 calls (`GetState`, `earned`, `result.state`) follow the SDK spec; check your SDK version for them.

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

// Server-owned values: earn 250 gold in a run, then read the balance
var earned = new List<EarnedValue> { new EarnedValue { key = "gold", amount = 250 } };
var paid = await ValidatedActionsManager.Instance.SubmitValidated(18250, inputLog, earned: earned);
var state = await ValidatedActionsManager.Instance.GetState();
Debug.Log($"Gold: {state?.GetBalance("gold")}");
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

# Server-owned values: spend 100 gold, grant the item only when fully credited
var buy: Dictionary = await Horizon.validatedActions.submitValidated(0, input_log, "", "", [{"key": "gold", "amount": -100}])
var state: Dictionary = await Horizon.validatedActions.getState()
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

// Server-owned values: pass TArray<FHorizonEarnedValue> as Earned, read Result.State,
// or load the state with Horizon->ValidatedActions->GetState(FOnPlayerStateLoaded)
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
  -d "{\"userId\": \"USER_ID\", \"ticket\": \"TICKET\", \"inputLogHash\": \"$HASH\", \"score\": 18250, \"earned\": [{\"key\": \"gold\", \"amount\": 250}]}"

# Read the server-owned values
curl "https://horizon.pm/api/v1/app/validated-actions/state?userId=USER_ID" \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Authorization: Bearer ACCESS_TOKEN_FROM_SIGNIN"
```

### MCP tools

1. `horizon_signin_anonymous` or `horizon_signin_email`: keep `userId` and `accessToken`.
2. `horizon_start_run` with `userId`, `sessionToken` (the accessToken) and optionally `leaderboardKey`.
3. `horizon_submit_validated` with `userId`, `sessionToken`, the `ticket`, `score` and exactly one of `inputLogHash`, `inputLogBase64` or `inputLog`, plus `earned` (`[{"key": "gold", "amount": 250}]`) when the rules define values. The result also shows the `inputLogHash` that was sent and the `state` with `requested` and `credited`. A key listed twice in `earned` fails locally with `DUPLICATE_VALUE_KEY` (no request sent, the ticket stays usable).
4. `horizon_get_state` with `userId` and `sessionToken` to read the balances at any time.

Error results name the server `code`, for example `horizOn API error (HTTP 422, code DURATION_TOO_SHORT)`.

## Best Practices

- **Start the ticket when the run really starts.** The server measures the duration from the ticket; starting early wastes lifetime, starting late can trip `DURATION_TOO_SHORT`.
- **One ticket per run.** A ticket is spent after any rule rejection, `SCORE_LIMIT_REACHED` or success. Start a new run instead of resending.
- **Retry only transient failures.** After a network error, 401, 404, 429 without code or 503 the same ticket may be sent again. Do not retry `RUN_RATE_LIMITED` or `RUN_CAPACITY_REACHED` automatically: the wait can be an hour.
- **Keep the input log bytes** until the submit is accepted; the evidence review will ask for exactly those bytes.
- **Switch on `code`, never on `message`.**
- **Send `earned` only when the rules define values.** An undefined key rejects the whole run with `UNKNOWN_VALUE_KEY` and spends the ticket.
- **Grant purchases only when `credited == requested`.** A clamped or concurrent spend is not an error, so check the numbers.
- **Treat the cloud save copy as display only.** Refresh it from the server state on start.

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
| 422 | `UNKNOWN_VALUE_KEY` | `earned` key not defined in the values of the rules (also when the rules define none) |
| 422 | `DUPLICATE_VALUE_KEY` | A key twice in `earned` (the mcp tool catches this locally) |
| 422 | `EARNED_ABOVE_MAX` / `EARNED_BELOW_MIN` | Amount outside `maxPerRun` / `minPerRun` |
| 422 | `INSUFFICIENT_BALANCE` | Spend larger than the balance |
| 429 | `RUN_RATE_LIMITED` / `RUN_CAPACITY_REACHED` | Run limits, `Retry-After` set |
| 429 | (empty body) | Account request rate limit |
| 503 | `VALIDATED_ACTIONS_UNAVAILABLE` | Server has no ticket key configured |

## Self-hosted simpleServer

Not supported (cloud only). The endpoints do not exist there; SDKs map the 404 to `NOT_SUPPORTED`.
