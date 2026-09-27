# Scorekeeper user guide

Run commands from the repository root. For the project overview, see [README](../README.md).

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

The original 27 Chinese names and jersey numbers are retained. **Manage** adds university players, edits names/numbers/enrollment years, and imports or exports a roster CSV. Permanent IDs are independent of names and jersey numbers. Changes refresh games that have not started, including their on-court and player-selection panels, while preserving selected starters and guests. Started, finished, and upload-locked games retain their original player snapshots. Newly added teammates can be selected through **Choose game players** before tip-off. Missing players in a CSV import remain saved, and there is no delete-player action that could orphan historical data.

Status becomes `graduated` on September 1 of enrollment year + four, otherwise `Astudent`. Unknown enrollment year gives `Unknown`; an optional manual override takes precedence. All statuses remain eligible for selection. Guests are distinct people locally but export as one anonymous **Guest Player** identity for database statistics. See the [roster and lineup walkthrough](roster-lineups.md) and [blank roster CSV template](../examples/roster-template.csv). Export your existing roster first when updating players so their IDs are preserved.

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

For local CSV imports, see [CSV → Python → MySQL setup](mysql-pipeline.md). It uses your `msba` environment and defaults to `localhost:3306`, database `scorekeeper`.

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


## Corrections, recording speed and final exports

Select any action in the event feed to edit its player/team or statistical type, or delete it. The original game time and lineup stay attached. Opening the correction dialog pauses the clock; resume manually afterward. Related actions can be selected for deletion or explicitly linked as shot/assist pairs. Nearby events are suggestions, not automatic links. Invalid linked assists must be corrected, deleted or unlinked. Select a deleted action to restore its deletion group. Substitutions and clock/period history are not editable through this dialog.

Clock speed offers 1×, 1.5×, 2× and 4×. Every new game starts at 1×; an existing game retains its speed. Player minutes advance in game time: thirty real seconds at 2× adds one minute. Match your video on the separate device manually.

End the game to see the player analytics table in Box score. It includes +/−, FG%, 3P%, FT%, eFG%, TS% and AST/TO. TS% uses PTS / (2 × (FGA + 0.44 × FTA)); eFG% uses (FGM + 0.5 × 3PM) / FGA. Zero denominators display —. Exact +/− is unavailable if any active score lacks a complete historical lineup. Corrected scores recalculate using their original lineup.

Event, participation and player-statistics CSV exports require an ended game. The first result export asks to finalize and permanently locks local game edits. Re-download any result after finalization. The browser cannot confirm that you saved the downloaded file; canceling a download does not unlock the game. Backup and roster downloads do not finalize games. Download a backup before finalizing if you need a separate earlier snapshot. Browser storage failure prevents finalization. Cloud upload locks and admin corrections keep their existing rules.

Player-statistics CSV keeps individual local guest rows. Existing event/participation CSVs still combine guests for cloud imports. Uploaded games retain their historical lineups for public box-score +/−; legacy games remain unavailable rather than receiving invented lineup history.
