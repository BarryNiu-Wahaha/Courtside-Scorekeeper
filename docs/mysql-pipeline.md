# CSV → Python → MySQL

This offline pipeline imports event logs, the full university roster, and game participation into **MySQL at localhost:3306**, database **scorekeeper**. Use your existing **Conda msba** environment. No API or remote hosting is required.

## Upgrade your existing database

Because your database already has the original three tables, run this once before importing the new exports:

```powershell
conda run --no-capture-output -n msba python -m scorekeeper_pipeline migrate-db --user root
```

Enter your password in your terminal. This adds roster fields and participation tables while preserving existing data. The command checks existing columns and can safely be rerun after an interrupted upgrade. MySQL DDL commits each statement separately. `sql/migrate_roster_participation.sql` is the equivalent one-time Workbench script for an unmodified original schema; prefer the command if unsure whether it has already run. `schema.sql` creates fresh installations but does not upgrade existing columns.

## Roster and minutes exports

Export the roster from the offline app after assigning permanent player IDs. CSV columns are `player_id,player_name,jersey_number,enrollment_year,status_override`. Empty enrollment year and override are allowed. The reserved ID `P_GUEST` cannot be used for a university roster member. Missing people in a file remain in the database. Review changes before explicitly applying them:

```powershell
python -m scorekeeper_pipeline validate-roster "C:\path\to\roster.csv"
python -m scorekeeper_pipeline import-roster "C:\path\to\roster.csv" --user root
python -m scorekeeper_pipeline import-roster "C:\path\to\roster.csv" --user root --apply
```

The first command needs no database. The second reads the database and prints each player's old/new details without writing. The final command saves the roster. Roster-managed names and jersey numbers remain authoritative when older game events are imported; historical event and participation rows keep their original snapshots.

Export game participation separately, including unused designated bench players:

```powershell
python -m scorekeeper_pipeline validate-participation "C:\path\to\game_participation.csv"
python -m scorekeeper_pipeline import-participation "C:\path\to\game_participation.csv" --user root
```

Participation and events can be imported in either order. Participation is one atomic snapshot per game. Identical reimports are unchanged; stale revisions and conflicting equal revisions are rejected. A newer revision replaces the game's participation rows together. `complete` coverage records five starters; legacy `partial` coverage records zero known starters and only newly measured time. Never interpret partial minutes as whole-game minutes. Guests retain individual events but use anonymous `P_GUEST`, `Guest Player`, jersey `0`; their participation counts and milliseconds are added together. Two guests playing ten minutes each contribute twenty guest player-minutes.

To inspect roster status and minutes in Workbench:

```sql
SET @reference_date = CURRENT_DATE();
SELECT player_id, player_name, jersey_number, enrollment_year,
       COALESCE(status_override,
         CASE WHEN enrollment_year IS NULL THEN 'Unknown'
              WHEN @reference_date >= STR_TO_DATE(CONCAT(enrollment_year + 4, '-09-01'), '%Y-%m-%d')
              THEN 'graduated' ELSE 'Astudent' END) AS player_status
FROM players WHERE is_guest = FALSE;

SELECT p.*, p.played_ms / 60000.0 AS minutes, s.coverage, s.revision
FROM game_participation p JOIN participation_snapshots s USING (game_id);
```

## First-time database setup

Open a terminal in the ScoreKeeper folder. Activate the environment:

```powershell
conda activate msba
python -m scorekeeper_pipeline init-db --user root
```

Replace `root` if your Workbench connection uses another username. Enter your MySQL password at the hidden local prompt. The command creates the database and five tables if absent; it does not drop data. MySQL DDL is not transactional: if setup fails partway, fix the permission/problem and rerun it. Alternatively, open `sql/schema.sql` in MySQL Workbench and execute it using your existing connection.

If you prefer not to activate Conda:

```powershell
conda run --no-capture-output -n msba python -m scorekeeper_pipeline init-db --user root
```

The application never reads Workbench's stored passwords. Credentials are not included in source files, command-line password arguments, or output. Host, port, username and database can be set with `--host`, `--port`, `--user`, `--database` after the command, or `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_DATABASE` environment variables. Automated local runs can supply `MYSQL_PASSWORD` through their environment; otherwise the command prompts interactively. Database commands need an existing MySQL account with permissions for the operation.

## Validate and import

Export **Game Event Log** from Front.html. Keep the CSV file unmodified when possible.

```powershell
python -m scorekeeper_pipeline validate "C:\path\to\game_events.csv"
python -m scorekeeper_pipeline import "C:\path\to\game_events.csv" --user root
```

Validation needs no database and no password. The importer performs the same full-file validation before connecting. Any invalid row rejects the entire file and reports its starting physical CSV line number and reason. No valid subset is imported. Exit codes: 0 success, 2 input/conflict/configuration error, 3 MySQL error, 130 cancelled.

Supported cleanup is intentionally limited: trim surrounding whitespace and report how many fields were normalized; decode UTF-8 BOM; parse integers/booleans/dates; convert timezone-aware timestamps into UTC. It does not guess missing players, fix scores, reinterpret inconsistent event codes, or silently skip events. Empty exports are rejected because they contain no game identity/date/opponent rows. A single file must contain exactly one game with consistent metadata.

## Repeat exports and corrections

- `(game_id,event_id)` is the event key. Reimporting an identical CSV creates no duplicate events.
- Newly recorded events are appended.
- A corrected `is_voided=true` updates the stored event. Queries exclude voided events.
- Older exports cannot reactivate already-voided events or delete later events missing from that old file.
- Changing an existing event's shot type, points, player snapshot, time, or other immutable data is a conflict. The importer rejects and rolls back the whole transaction. Record corrections in the frontend using undo and a new event.
- Changing stored game date/opponent for the same game ID is also a conflict.

All import writes use one InnoDB transaction, including new game/player rows. Same-game imports serialize on a locked game row. A database error or immutable conflict rolls back the complete file. Schema initialization is a separate explicit command, not a side effect of import.

## Query the data

```powershell
python -m scorekeeper_pipeline summary "G20260907_your-game-id" --user root
```

Use the exact game ID from your export. Open `sql/queries.sql` in Workbench for game scores, a player's totals/shooting percentages, player history and the full event log. Change `@player_id` to your player's permanent ID. Chinese names use utf8mb4. MySQL stores `recorded_at` in UTC DATETIME(6); the original offset is normalized and not retained.

Tables:

| Table | Purpose |
| --- | --- |
| games | Game ID, game date, opponent |
| players | Permanent player ID and latest observed name/jersey details |
| events | Individual stat event snapshots, composite key, side and void flag |

Players not yet managed by a roster import receive display details from their most recent event. Roster imports mark the permanent roster as authoritative for names/numbers. Enrollment and manual status are never overwritten by event imports. Opponent events have NULL player fields. Roster-only players can have NULL last_seen_at.

`games_with_recorded_events` in the original event queries is not an appearance count. Use `game_participation.played_count` for tracked appearances and `played_ms` for minutes, checking `participation_snapshots.coverage` first. Historical games without participation exports have unknown minutes. `game_participation` contains identity snapshots and designated/starter/played counts; `participation_snapshots` stores revision, coverage and content hash.

## Verification

```powershell
conda run --no-capture-output -n msba python -m unittest discover -s tests -p "test_pipeline*.py"
conda run --no-capture-output -n msba python tests/run_mysql_tests.py
```

The integration runner creates a temporary, loopback-only MySQL instance using the installed MySQL 9.7 binary, chooses an unused test port, uses throwaway test databases, then shuts down and removes its own files. It does not connect to your localhost:3306 or place synthetic games in scorekeeper. Set `MYSQLD_PATH` if the executable is elsewhere. Database tests cover real transactions, constraints, deduplication, stale/corrected exports, immutable conflicts, Chinese names, case-sensitive player IDs and schema reinitialization.
