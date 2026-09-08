# Offline roster, lineups, and participation

## Approved product direction

Keep the standalone offline scorekeeper. Add full roster management, a game squad of at most 15 people, five starters, on-court scoring, substitutions, and playing-time exports. Remote hosting, APIs, accounts, and automatic network synchronization are outside this change.

## Permanent university roster

Each university player retains a permanent player ID, name, jersey number, nullable enrollment year, and nullable status override. Preserve existing IDs, including P_LEGACY_* and P_DEFAULT_*. Never match or merge people merely by name or jersey number; jersey numbers are not identities.

Effective status is Astudent before September 1 of enrollment year + 4, and graduated from that date. Use the local calendar date in the app and the supplied reference date in database analysis. A manual Astudent/graduated override takes precedence; clearing it restores automatic calculation. Missing enrollment year with no override gives Unknown. All statuses remain eligible for game selection. Keep graduates and historical records permanently.

Manage players supports editing and roster CSV import/export. CSV columns are player_id,player_name,jersey_number,enrollment_year,status_override. Blank enrollment year and override are allowed. Blank IDs on initial app import receive permanent IDs; subsequent exports include them. MySQL roster import requires these assigned IDs. Reject duplicate IDs, malformed rows, and invalid field values before replacing any roster data. Preview additions and updates before applying. Missing people in an import are retained rather than deleted. Updated roster names and numbers affect future game snapshots, not earlier games.

## Game selection and scoring

Before starting, select 5–15 designated players and exactly five starters. University players of any status can be selected. Guests can be added individually for this game, count toward the 15-person limit, and may start. Guests have distinct game-local identities and do not join the permanent university roster.

The scoring view displays only the five players currently on court. Starter markers refer to the original starters, not the current lineup. The substitution popup contains only the designated squad, identifies current on-court players, and allows multiple changes in one confirmation. Confirming requires exactly five distinct squad members. No change occurs until confirmation. Opening the popup pauses the clock; confirmation or cancellation leaves it paused until the user presses Resume. If the selected scorer leaves the court, clear that selection to prevent accidental attribution.

Keep the designated squad fixed after the game starts in this version. Retain team-level opponent recording and existing event undo behavior. Undoing a stat does not undo substitutions.

## Minutes and participation

Record elapsed running game-clock milliseconds for the current five. Paused time does not count. Settle elapsed time at pause, substitution, period expiry, game finish, and any operation that changes the clock or lineup. Never count beyond the period deadline. Resume establishes a new timing anchor. Clock corrections change remaining time only, leaving previously accumulated playing time intact.

Persist timing anchors and lineup state so refresh and background tabs preserve the current running interval without counting it twice. Backup export snapshots elapsed time without modifying the live game. Restoring a backup starts paused. Period changes preserve the lineup and accumulate minutes across regulation and overtime. Reopening a finished game preserves its prior minutes.

Store a participation row for every designated university player, including unused bench players with zero time. Distinguish designation, started, and played; selecting a player does not by itself imply an appearance. Display minutes using accumulated milliseconds without rounding each interval.

## Guest aggregation

Keep individual guests distinct locally for selection, substitutions, and scoring. Database-facing exports replace guest identities, names, and numbers with one reserved Guest Player identity and neutral display details. University imports must reject that reserved identity. Do not transmit individual guest names to MySQL.

Preserve each scoring event and its existing event ID while mapping its player to Guest Player. Do not collapse event rows: shot chronology, corrections, and deduplication remain available. Participation export aggregates guest milliseconds and counts of designated guests, starters, and guests who played into one Guest Player row per game. Two guests playing ten minutes each produce twenty guest player-minutes. Opponent events continue to have no player identity.

## Offline transfer and database

Keep game event CSV backward compatible with the existing 14-column contract. Add a roster CSV and a participation CSV, with UI labels explaining each. The participation CSV includes game metadata, player identity snapshots, designated_count, starter_count, played_count, and played_ms; normal university rows have designated_count=1 and starter/played counts of 0 or 1. Guest counts may exceed one.

Extend the Python CLI with explicit roster and participation validation/import commands. Full-file validation precedes credentials or database writes. Roster import upserts by permanent ID; missing rows do not delete players. Event imports must not overwrite enrollment or manual status information.

Provide an additive migration for the existing populated database: extend players for enrollment year and status override, permit unknown event-derived last_seen_at for roster-only players, distinguish the reserved aggregate guest record, and add game_participation keyed by (game_id,player_id). Preserve all current games, players, and events. Participation imports include enough metadata to create or verify the game and player rows regardless of event import order.

Participation exports include a per-game monotonically increasing revision. Reimporting identical data is a no-op; an older revision cannot replace newer participation. Equal revision with conflicting contents is rejected. Apply a complete game participation snapshot atomically. Roster imports preview changes and require explicit application, so users can assess older files before they overwrite current details.

No access to the user's MySQL password is required for development. Test migrations and imports in the existing isolated MySQL test instance. Provide the reviewed migration and local commands for the user's populated database.

## Existing saved data

Migrate browser state additively, preserving IDs, roster, games, events, and recovery downloads. Existing players begin with unknown enrollment year and no override. Do not infer historical lineups or minutes from stat events. Archived legacy games remain viewable/exportable with participation marked unavailable. An unfinished legacy game requires a squad and current five before resuming under the new interface; track minutes only from that point and label participation as partial in the UI and export/database. Existing CSV imports remain supported.

## Implementation boundaries

Keep clock/stat behavior in src/engine.js; isolate roster parsing/status and participation/export logic into focused source modules bundled by build.cjs. src/app.js coordinates views and persistence; src/template.html and src/styles.css implement roster, squad, and substitution dialogs. Extend scorekeeper_pipeline validation and database modules with separate roster/participation units rather than embedding unrelated CSV contracts in the event validator.

## Verification

Use deterministic clock tests for starters, bench zero minutes, multiple swaps, pause/cancel/resume, period expiry, overtime, manual corrections, refresh, backups, and partial legacy games. Test enrollment cutoff immediately before/on September 1 and overrides. Test CSV Unicode/escaping, identity preservation, atomic invalid-import rejection, guest anonymization, and repeated participation imports.

Use real isolated MySQL tests for additive migration of populated tables, roster-only players, guest aggregation, snapshot revisions, rollback, and scores matching local totals. Extend Edge smoke coverage for a 15-person squad, five visible scorer buttons, multiple substitutions, offline persistence, and actual exported files. Rebuild Front.html and retain existing engine/browser/pipeline regression checks. No remote service or new dependency is required.
