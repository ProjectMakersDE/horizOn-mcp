# Self-hosting and project migration

[horizOn simpleServer](https://github.com/ProjectMakersDE/horizOn-simpleServer) is
the self-hosted PHP edition. The official SDKs use the same supported App API
contracts after configuring the installation's Project API Key and backend URL.
Changing those settings does not transfer any hosted data or sessions.

## Hosting boundary

simpleServer runs on PHP 7.4+ with SQLite or MySQL. The operator owns configuration,
TLS, database backups, upgrades and maintenance. It has no hosted Dashboard,
Account Key admin API, managed multi-tenancy or multi-region service. Administration
uses the release's `bin/` CLI tools and SQL where documented.

The released edition includes player services such as Items, Item Gifts, Marketplace,
Inbox, Achievements, Statistics, Friends, Groups, Shared Objects and REST Matches,
as well as saves, profiles, content and logging APIs. This does not imply full cloud
parity. In particular:

| Area | simpleServer boundary |
| --- | --- |
| Player authentication | Anonymous and Apple. No email/password, Google, account linking, email verification or password reset |
| Realtime and Chat | Hosted-only, no polling emulation. Chat routes answer `NOT_SUPPORTED` |
| Validated Actions / ranked validation | Hosted-only. Plain leaderboard and REST match functionality do not implement trusted run validation |
| Content and email | No hosted AI translation, Dashboard administration or SMTP pooling |
| Quotas | Local installation policies and per-IP rate limits. Hosted tier tables do not configure the PHP installation |

Check the installed release's
[parity matrix and operator instructions](https://github.com/ProjectMakersDE/horizOn-simpleServer/blob/v1.8.0/README.md).
Do not promise compatibility for an omitted capability or an older installation.

## SDK config is not a migration

`horizOn_config.json` contains SDK connection settings. `horizon-migration.json`
is a versioned project-content export. Neither file is a complete account or player
backup. Configure the self-hosted key and credentials independently.

In the hosted Dashboard, open **API Keys**, select the project and review the
migration summary before downloading its content export. Version 1 includes only:

| Exported category | Import behavior |
| --- | --- |
| Remote Config | Keys/values, excluding internal `smtp_config` |
| Localization | Keys and supported language translations |
| News | Published content, split into one SQL row per language |
| Gift Codes | Usable campaign configuration. No prior redemption counters. Unsupported value/cosmetic rewards are skipped |
| Email templates | Template content and variables. Sender identity comes from the target SMTP configuration |

**Excluded:** players, logins, sessions, cloud saves, leaderboard scores, past
redemptions, feedback, logs and crash reports. Player-service data and catalogs,
including items, gifts, marketplace escrow, cosmetics, values, achievements,
statistics, relationships, groups and shared objects, do not migrate in this format.
API key secrets, SMTP, Apple, Google and AI credentials are never exported. Players
start fresh on the target. Campaign counters start at zero, so review reward exposure
before enabling imported codes.

## Explicit operator import

Back up the source and target and check restore before changing the running game's
backend. Use a fresh target installation and inspect all skipped/transformed counts:

```bash
php bin/migration-import.php /path/to/horizon-migration.json --dry-run
php bin/migration-import.php /path/to/horizon-migration.json
```

Run this locally on the target host, never through an HTTP endpoint. The dry run
checks without writing. Only format version 1 is accepted. Invalid structure,
duplicates, unknown languages or `smtp_config` reject the file. Size/field limits
can skip individual supported records, with reasons. The target content tables must
be empty (the internal SMTP config is excepted). The import is one transaction and
the same `migrationId` is refused on another attempt. Exit codes: `0` success,
`2` invalid file, `4` target not empty/already imported, `3` other failure.

After import, configure credentials, operator catalogs and game policies separately.
Verify the supported game flows against the target before distributing a changed
backend config. Keep the source backup for data the export omits. This content
import is separate from simpleServer's internal schema upgrades and explicit
legacy Gift V2/compact-state migration commands. Follow the installed release's
upgrade instructions and stop old writers wherever they require it.

## Verification basis

Source checked on 2026-11-17: simpleServer v1.8.0
[README and import contract](https://github.com/ProjectMakersDE/horizOn-simpleServer/blob/v1.8.0/README.md),
Server v1.78.1
[whitelisted export DTO](https://github.com/ProjectMakersDE/horizOn-Server/blob/v1.78.1/src/main/kotlin/com/projectmakers/horizonserver/features/projectmigration/dto/response/ProjectMigrationExport.kt).
No customer installation or data was migrated as part of this documentation check.
