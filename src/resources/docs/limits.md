# Plans, quotas and live limits

The hosted plans are **FREE, BASIC, PLUS, PRO and ENTERPRISE**, in that order.
Quotas are configurable system settings. Use the server you are integrating with,
not a table copied from an older package.

## Public source, no credentials

In MCP, explicitly read `horizon://api/feature-limits` for the current hosted JSON.
Reading this documentation alone does not fetch live values.

Read [GET /api/v1/public/system/feature-limits](https://horizon.pm/api/v1/public/system/feature-limits).
For a different hosted backend, use that backend's origin and the same path.

```bash
curl --fail --silent --show-error --max-time 20 \
  https://horizon.pm/api/v1/public/system/feature-limits
```

The result is an object keyed by `free`, `basic`, `plus`, `pro`, `enterprise`.
Each value contains named numeric policies such as `cloudSaveBytes`, `users`,
`apiKeys`, `rateLimitSoft`, `rateLimitHard`, `itemInventory` and `statisticsKeys`.
For example, to inspect PLUS without assuming its numbers:

```javascript
const response = await fetch("https://horizon.pm/api/v1/public/system/feature-limits");
if (!response.ok) throw new Error(`Feature limits unavailable: ${response.status}`);
const tiers = await response.json();
const plus = tiers.plus;
console.log(plus.cloudSaveBytes, plus.rateLimitSoft, plus.rateLimitHard);
```

Make this read when explicitly checking a plan, preparing configuration, or refreshing
a limits display. Cache that result for the display/session. Do not add a public
limits request before every SDK or MCP request. An unavailable response means the
current quotas were not verified, not that an old example becomes authoritative.

The public response is a plan comparison, not the authenticated account's usage,
remaining capacity, permissions or a complete feature contract. It does not publish
every policy. In particular, Item Gifts reads its own current `limits` from
`horizon_get_item_gift_config` / `horizon_get_item_gifts`. Use each feature's
configured limits/config endpoint before a capacity-sensitive action when that
feature requires it. Do not infer unlimited access from a missing field or zero.

## Scope and units

| Policy | Meaning |
| --- | --- |
| `cloudSaveBytes` | Maximum save size per player in bytes, not an account storage pool |
| `users`, `apiKeys` | Account capacities for players and Project API Keys |
| `usersTempOverflow`, `usersOverflowGraceDays` | Temporary player overflow and its configured grace period. These are not permanent extra seats |
| `rateLimitSoft`, `rateLimitHard` | Shared account request thresholds per minute, across projects, pods and regions |
| `leaderboardEntries` | Account score-row slots across its boards and projects. `maxLeaderboardsPerApiKey` is a separate per-project board cap |
| `remoteConfigEntries`, `remoteConfigChars` | Remote Config entries per account and characters per entry (key plus value) |
| `playerProfileCosmetics` | Catalog capacity per Project API Key, not the number a player has equipped |
| `itemCatalog`, `itemInventory`, `itemReceipts` | Separate catalog, per-player inventory and receipt capacities. Read `horizon://docs/items` |
| `statisticsKeys` | Statistic definition capacity per project |
| Names ending in `Bytes`, `KiB`, `MiB`, `Seconds`, `Days` | Keep the indicated unit. A byte limit is not a character count |

Read the feature resource for all other scopes, retention, zero values and downgrade
behavior. Never delete retained state merely because a newly read limit is lower.

User Logs availability follows a positive configured `userLogs` quota. The hosted
FREE quota can be positive. Do not enforce a fixed BASIC-only gate in a client.
Other features may have independent role, hosting, session or permission gates.

## Rate limits and recovery

The hard account threshold is an immediate cap. Exceeding the soft threshold in
three distinct hours of a UTC day causes soft-threshold enforcement until midnight
UTC. This is not a single universal requests-per-minute allowance. Account Keys also
have a narrower per-key lane, and features can impose separate write/send budgets.

On HTTP 429, respect `Retry-After` when the response supplies it. It is not present
on every limiter response. Avoid polling and per-frame calls. Cache read-only
metadata where appropriate. For a timeout, connection loss or uncertain write,
follow that feature's original request/receipt recovery. Do not turn a retry into
a new gift, purchase, claim or statistic operation.

## Verification basis

Public response and the released Server v1.78.1 were checked on 2026-11-17.
Source contracts: [public limits controller](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/src/main/kotlin/com/projectmakers/horizonserver/core/controller/PublicSystemConfigController.kt),
[quota definitions](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/src/main/kotlin/com/projectmakers/horizonserver/core/config/SystemConfigKey.kt),
[rate enforcement](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/src/main/kotlin/com/projectmakers/horizonserver/core/security/RateLimitingService.kt).
Numbers in system configuration can change without an MCP package release.
