# Player Values

Server-owned balances, atomic offer purchases and minimal public replay guards. Requires a Project API key and the active session of the same player. Client adjustments are disabled by default. Internal source-owned grants keep no personal recipient receipt. Hosted horizOn and simpleServer support REST within their documented technical frames.

## Configure and inspect

Use `horizon_admin_player_values_config_get(projectApiKeyId)` to read definitions, offers, limits and `revision`. Edit the complete catalogue and call `horizon_admin_player_values_config_set` with that revision as `expectedRevision`. The tool sends `If-Match`; a stale edit returns `REVISION_CONFLICT` instead of overwriting another edit. Admin tools require an Account Key with `PLAYER_VALUES` and project access, or full-account access.

Definitions have `key`, `name`, `initialBalance`, `maxBalance`, nullable `dailyCap` and optional `adjustment: {enabled, maxPerCall, dailyLimit, minimumBalance}`. Keys are 1..24 lowercase letters/digits/`.`/`_`/`-`, starting with a letter/digit. Names occupy at most120 UTF-8 bytes. An offer has key/name/active, nonempty costs and value rewards or itemRewards. Each value side has at most eight distinct keys; item grants have their fixed four-instance contract. `purchasesPerDay` is compatibility-only and must be omitted/null: no daily offer-key history is stored. Amounts/balances use safe integers; balances and costs/rewards cannot be negative. A null daily cap means unlimited; zero means no positive credit.

| Plan | Definitions | Offers | Recent receipts per player |
|---|---:|---:|---:|
| FREE | 8 | 10 | 10 |
| BASIC | 16 | 50 | 20 |
| PLUS | 24 | 100 | 25 |
| PRO | 32 | 200 | 30 |
| ENTERPRISE | 64 | 1000 | 50 |

The table lists installation defaults. Current definitions/offers/public-guard limits are administrator configurable; defaults are not maxima. Technical bounds remain1 MiB configuration and256 lifetime value identities. Offers may exceed1000 when configured and within that frame. Removing definitions archives balances/initialization bits; it never resets a balance to its initial value. Zero balances stay zero. Reductions preserve complete existing reads and original replay guards.

## Live MCP tools and REST

| Tool | Request |
|---|---|
| `horizon_get_player_values` | `GET /api/v1/app/player-values?userId=UUID` |
| `horizon_get_player_value_offers` | `GET /api/v1/app/player-values/offers?userId=UUID` |
| `horizon_purchase_player_value_offer` | `POST /api/v1/app/player-values/purchase` with `{userId, offerKey, operationId}` |
| `horizon_adjust_player_value` | `POST /api/v1/app/player-values/adjust` with `{userId, key, amount, reason, operationId}` |

Each tool accepts `sessionToken` from sign-in and sends it only as Authorization Bearer. A mutation returns current state plus operation:{operationId,replayed,alreadyApplied,applied,items}. Fresh success contains its committed delta and new item references; replay has empty applied/items. Values contain key/balance/earnedToday/nullable dailyCap.

Read offers before purchase. Only the configured server offer determines cost and reward. The complete purchase succeeds or leaves every balance unchanged. Positive credits count toward UTC daily caps; a debit does not refund today's earned allowance. Adjustments require a nonblank reason of at most 200 UTF-8 bytes and obey the configured per-call/daily limits and minimum balance.

## Retry contract

Read `operationWindow.serverTime` and align the client clock. Create `operationId` as server-aligned Unix milliseconds, a colon and a fresh UUID. Persist it with the player, project and exact payload **before** the first request. On a timeout or `STATE_CONFLICT`, retry that exact operation. MCP never creates an ID or retries mutations automatically.

Public guards are bounded by current policy and a30-day acceptance window. Eviction advances the acceptance floor permanently. A retained same-body guard can replay after catalog changes. Replay returns current state with alreadyApplied=true and empty applied/items; no historical amount/reason/item copy is retained. Never replace an expired/uncertain operation with a fresh ID automatically. Ignore stale responses after account/project changes or when their revision/server time precedes a newer result.

`INSUFFICIENT_BALANCE`, `MAX_BALANCE_REACHED`, `DAILY_LIMIT_REACHED`, `ADJUST_NOT_ALLOWED`, `ADJUST_ABOVE_LIMIT`, `VALUE_KEY_LIMIT_REACHED` are visible domain failures. `OPERATION_CONFLICT` means the same ID was used for a different payload. `OPERATION_EXPIRED` requires reconciliation. A 401 requires sign-in; a 403 may indicate the wrong player session or account-key scope. Never bypass these failures with another user or project.

## SDK examples

Initialize the SDK, sign in and obtain the user ID first. Each manager handles session transport and updates its cache from the server response. Keep pending operation IDs in durable game storage across retries.

Unity:

```csharp
using PM.horizOn.Cloud.Manager;
var manager = PlayerValuesManager.Instance;
var before = await manager.GetState(userId);
if (!before.IsSuccess) return;
string operationId = manager.CreateOperationId();
// Persist (project, userId, "gems", operationId) before sending.
var result = await manager.Purchase(userId, "gems", operationId);
if (result.IsSuccess) RenderBalances(result.State.values);
else ShowError(result.ErrorCode, result.Error);
```

Godot:

```gdscript
var before = await Horizon.playerValues.getState(user_id)
if not before.success:
    return
var operation_id = Horizon.playerValues.createOperationId()
# Persist project, user_id, offer and operation_id before sending.
var result = await Horizon.playerValues.purchase(user_id, "gems", operation_id)
if result.success:
    render_balances(result.state.values)
else:
    show_error(result.errorCode, result.error)
```

Unreal C++ (bind the native `FOnPlayerValuesComplete` delegate to a UObject member with `(bool Success, const FHorizonPlayerValuesState& State, const FString& ErrorCode, const FString& ErrorMessage)`):

```cpp
#include "HorizonSubsystem.h"
#include "Managers/HorizonAuthManager.h"
#include "Managers/HorizonPlayerValuesManager.h"
auto* SDK = GetGameInstance()->GetSubsystem<UHorizonSubsystem>();
const FString UserId = SDK->Auth->GetCurrentUser().UserId;
FOnPlayerValuesComplete Completion;
Completion.BindUObject(this, &AMyActor::OnValues);
SDK->PlayerValues->GetState(UserId, Completion);
// After successful state/clock synchronization and player confirmation:
const FString OperationId = SDK->PlayerValues->CreateOperationId();
// Persist project, UserId, offer and OperationId before sending.
SDK->PlayerValues->Purchase(UserId, TEXT("gems"), OperationId, Completion);
```

`GetOffers` returns the catalogue. `Adjust` takes user ID, key, a signed 64-bit amount, reason and stable operation ID. Unreal exposes matching Blueprint operations and `int64` balances. The example rendering/error helpers are game-owned functions.

## Support and self-hosting

`horizon_admin_player_values_player_get(projectApiKeyId,userId)` returns current state/minimal guards. Correction accepts up to256 registered {key,balance} entries, mandatory note and stable operationId. Actor/note/values are bound into its hash without a copied note/history payload; daily earned counters remain. Hosted admin routes are separate from simpleServer's local CLI. Its ENV policies/portable SQL envelopes are documented by the installed server; the public app key never grants operator access.

Both `integrate-feature` and `explain-feature` accept `feature="player-values"`. Configure the MCP base URL explicitly when testing against Develop; do not point test mutations at production.
