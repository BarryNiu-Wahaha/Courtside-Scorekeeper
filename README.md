# CourtSide — basketball scorekeeping and team statistics

CourtSide is a basketball scorekeeping and statistics platform for one university team. Scorekeepers share one upload PIN, with one scorekeeper responsible for each game. A separate admin PIN controls roster management and corrections to uploaded games. The platform connects courtside recording to a hosted Python backend, a shared MySQL database, and a statistics website.

## Features

- Record shots, rebounds, assists, steals, blocks, turnovers, fouls, and opponent statistics.
- Manage permanent player identities, enrollment years, graduation status, and game-specific guests.
- Select squads and starters, make substitutions, and track playing minutes.
- Preserve event history and apply corrections without double-counting plays.
- Upload finished games remotely using the shared scorekeeper PIN.
- Save games locally while offline and retry uploads when connectivity returns.
- View game results, player statistics, shooting percentages, and minutes on the statistics website.
- Explore the public dashboard by Spring/Fall season, calendar year, or career; filter official/friendly games, search players, and view averages, leaders, game reports, and estimated pace/efficiency.
- Export CSV files for analysis and JSON backups for restoring the local workspace.

## Remote workflow

1. One scorekeeper records a game for the team and finishes it locally.
2. The app saves events, squad selections, and playing time locally.
3. The scorekeeper enters the shared PIN and uploads the finished game when connected to the internet.
4. The hosted Python backend checks access, validates and converts the data, and writes it into MySQL automatically.
5. The backend publishes a static statistics snapshot. Public visitors read that snapshot without a PIN, even while the backend or database is asleep.

Repeated submissions do not create duplicate events. Uploaded games are locked for scorekeepers. The admin can correct any uploaded game, manage the shared roster, and delete or restore games. Corrections preserve the game's identity and audit history. Database saving and website publication have separate status messages; publication can be retried without uploading another copy of the game. Scorekeepers do not need to export CSVs or run Python commands for remote uploads.

The backend and database run on remote hosting, so a scorekeeper's personal computer does not need to stay on. Database credentials remain on the server; the browser communicates with the backend.

## Architecture

The [public dashboard guide](docs/public-dashboard.md) explains period filters, metric definitions, recording completeness, and the additive database migration required for the dashboard release. Public readers need no PIN; upload and admin access retain their existing PIN roles.

| Component | Responsibility |
| --- | --- |
| Scorekeeper frontend | Recording, roster selection, substitutions, local saving, and uploads |
| Hosted Python backend | PIN sessions, validation, atomic game uploads, admin corrections, and publishing |
| MySQL database | Shared player, game, event, and participation records |
| Statistics website | Public game results, player totals, shooting percentages, and minutes from published snapshots |
| Python CSV importer | Local imports from exported files |

## Deployment

The deployment package targets **Cloudflare Pages Free**, **Render Free**, and **Aiven MySQL Free**, using their included subdomains. See [remote deployment setup](docs/remote-deployment.md) for configuration and [remote API setup](docs/remote-api.md) for migration commands. Deployment progress as of 2026-09-13: the user confirmed backend health at https://courtside-api-hrhm.onrender.com/api/health and uploaded the initial website at https://courtside-team.pages.dev/. Roster import and hosted upload/publication verification remain pending. See the [latest handoff](docs/superpowers/plans/2026-09-08-remote-progress.md) for configuration checks and next steps.

Public results are static files and do not depend on an awake API or database. Uploads and admin changes require those services to be running. An already-open scorekeeper continues recording during a connection loss; local backups remain important. The standalone HTML is also available for offline use. Free-service quotas and availability limits are described in the deployment guide.

## Standalone scorekeeper

Open **Front.html** in a modern browser to use the standalone offline scorekeeper. The instructions below cover this standalone version and its local CSV workflow. The HTML contains all its styles, JavaScript and roster; it does not load CDNs or call an API. The original is preserved in `backups/Front.original.html`.

## Record a game

1. Create a game with its date, opponent, quarter length and overtime length. Default lengths are 10 and 5 minutes.
2. Select 5–15 designated players and exactly five starters. Add guests for this game if needed; they count toward the same limit. Only the five on court appear in the scoring panel.
3. Press **Start game** at tip-off. Use **Pause** for stoppages and **Resume** when play resumes. **Substitute** pauses the clock and opens the designated squad: select the next five and confirm, then resume manually. Cancel also leaves the clock paused. While paused, **Adjust** accepts a remaining time such as `06:31`; accumulated minutes stay unchanged.
4. Select a player and tap a stat. Made shots, missed shots and every other stat each create one event. Selecting players or controlling the clock does not create stat events. You can record a late play while paused after the game has started.
5. Switch to **Opponent** to record team-level opponent stats. Those events have no player identity.
6. **Undo last** marks the latest active event as voided. Its row remains in the log; its effect on the score and box score is removed. Event IDs are never reused. This does not undo substitutions.
7. While paused, use **Next quarter** or **Next overtime**. The new period begins paused. Regulation has four quarters; overtime is labeled `OT1`, `OT2`, etc.
8. **End game**, then **Export Game Event Log**. In **Box score**, use **Export participation CSV** for minutes and designated bench players. A completed game can be reopened for corrections. **New game** keeps prior games in **Game history**.

The English layout is optimized for landscape iPad. Portrait uses a two-column player/action layout with the event feed underneath; narrow phones show the five players in a compact grid. Minutes follow running game-clock time and stop during pauses or at period expiry. Legacy archived games show unavailable minutes; continuing an older game requires selecting a squad and current five, and its newly measured minutes are labeled partial.

## Players and saving

The original 27 Chinese names and jersey numbers are retained. **Manage** adds university players, edits names/numbers/enrollment years, and imports or exports a roster CSV. Permanent IDs are independent of names and jersey numbers. Changes affect future game rosters; existing games retain their original player snapshots. Missing players in a CSV import remain saved, and there is no delete-player action that could orphan historical data.

Status becomes `graduated` on September 1 of enrollment year + four, otherwise `Astudent`. Unknown enrollment year gives `Unknown`; an optional manual override takes precedence. All statuses remain eligible for selection. Guests are distinct people locally but export as one anonymous **Guest Player** identity for database statistics. See the [roster and lineup walkthrough](docs/roster-lineups.md) and [blank roster CSV template](examples/roster-template.csv). Export your existing roster first when updating players so their IDs are preserved.

The default roster has stable `P_DEFAULT_...` IDs. Added players receive `P_<UUID>` IDs. A legacy roster found under the old `basketballStats` storage key is copied with stable legacy IDs; that original key is untouched. Existing legacy aggregate scores are not fabricated into event logs. Use the original HTML at its original browser location to export an old game before replacing it if needed.

Games and roster save under the browser's `courtside.v2` localStorage key. Running clocks use a saved wall-clock deadline, so refreshes and background timer throttling do not reset them. The clock continues while the tab is hidden until paused or it reaches zero. Keep the device's system clock unchanged during a game.

Use **Download backup** regularly. Its JSON file includes the roster, IDs, all games and voided events. The backup freezes the clock at export time without pausing your live game. **Restore backup** validates a file before replacement and asks for confirmation. Move this backup to another device to preserve your player identities and history. Storage is local to the browser/location; clearing browser data can remove it. A visible warning appears when saving fails. If saved data is damaged, **Download original recovery data** preserves its original bytes while **Download backup** still saves your new work. CSV is the analysis dataset; JSON is the complete restorable workspace.

## CSV contract

There are three separate exports: **roster CSV** for all permanent university players, **event log CSV** for plays, and **participation CSV** for the game squad, starters, appearances, and minutes. Guests keep separate event rows under `P_GUEST`; their participation counts and time are added together. Individual guest names are not included in these database exports. JSON backup retains the full local workspace.

One event per row, including voided rows. UTF-8 with BOM, CRLF line endings, CSV escaping for commas, quotes and newlines. Headers:

```text
game_id,event_id,game_date,opponent,player_id,player_name,jersey_number,quarter,game_clock,event_type,points_value,recorded_at,team_side,is_voided
```

| Field | Meaning |
| --- | --- |
| `game_id` | Unique game identifier: `GYYYYMMDD_<UUID>` |
| `event_id` | Increasing integer within a game; combine with game_id as a key |
| `game_date` | Local game date, `YYYY-MM-DD` |
| `opponent` | Opposing team name |
| `player_id` | Permanent player identity; empty for opponent events |
| `player_name`, `jersey_number` | Player details at event time; empty for opponent events |
| `quarter` | `1`–`4`, then `OT1`, `OT2`, and onward |
| `game_clock` | Remaining period time, `MM:SS` |
| `event_type` | One of the 13 codes below |
| `points_value` | 0, 1, 2, or 3; missed shots and non-scoring actions are 0 |
| `recorded_at` | Actual event-recording timestamp in ISO 8601 UTC, including `Z` |
| `team_side` | `HOME` = our team; `AWAY` = opponent (not venue assignment) |
| `is_voided` | Lowercase `true` or `false`; exclude `true` from statistics |

```text
2PT_MADE  2PT_MISSED  3PT_MADE  3PT_MISSED  FT_MADE  FT_MISSED
OFF_REBOUND  DEF_REBOUND  ASSIST  STEAL  BLOCK  TURNOVER  FOUL
```

For local CSV imports, see [CSV → Python → MySQL setup](docs/mysql-pipeline.md). It uses your `msba` environment and defaults to `localhost:3306`, database `scorekeeper`.

For a simple CSV-only analysis without extra dependencies:

```python
import csv

with open("your-game_events.csv", encoding="utf-8-sig", newline="") as file:
    events = list(csv.DictReader(file))

active = [e for e in events if e["is_voided"] == "false"]
our_points = sum(int(e["points_value"]) for e in active if e["team_side"] == "HOME")
```

Repeated exports of the same game retain event IDs. The MySQL importer deduplicates by `(game_id, event_id)` and applies void flags so corrected exports do not double count points or retain cancelled plays. It rejects conflicting immutable data and prevents older exports from reactivating voided plays.

## Database records

| Table | Stored data |
| --- | --- |
| `players` | Permanent player identities, roster details, and enrollment information |
| `games` | Game identifiers, dates, and opponents |
| `events` | Individual plays, player snapshots, points, and void flags |
| `game_participation` | Designated players, starters, appearances, and `played_ms` |
| `participation_snapshots` | Participation revision, coverage, and content hash |

`played_ms` stores playing time in milliseconds; divide by `60000` to obtain minutes. Partial coverage identifies games where only part of the playing time was tracked.

For the local CSV workflow, import the event log and participation CSV for each game. Import the roster initially and whenever player details change.

## Development and verification

Node 24 is used for the development scripts; the app itself does not need Node.

```sh
node --test tests/engine.test.cjs tests/team.test.cjs
node build.cjs
node tests/browser-smoke.cjs
```

`src/engine.js` owns events, CSV, validation and clock logic; `src/team.js` owns roster parsing/status, lineups, and participation; `src/app.js` owns browser interaction and persistence; `src/styles.css` and `src/template.html` define the UI. `src/roster.js` holds the default roster. Edit those sources and run the build to regenerate the single-file `Front.html`.

The browser smoke test uses installed Microsoft Edge on Windows (or the executable in `EDGE_PATH`) through its debugging protocol. It records real UI actions, verifies downloaded CSV, reloads persisted games and captures screenshots in `tests/artifacts/`. It runs with network access disabled. Viewport tests approximate iPad layouts; real iPad Safari/touch behavior still needs a device check. Files-app HTML previews are not a substitute for a browser runtime.

For browser access through a local development server, run `python -m http.server 8000` in this folder and visit `/Front.html`. An iPad can use the computer's LAN address while connected to the same network. This server is for previewing the page; persistent offline installation on iPad would be a separate hosting/PWA step. No database is involved.
