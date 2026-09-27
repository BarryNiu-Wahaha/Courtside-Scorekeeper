# Recording Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver historical statistical corrections, accelerated recording, player analytical exports and cloud-backed plus-minus in individual game box scores.

**Architecture:** Preserve the existing event/participation CSV contracts. Extend browser event records with original lineups, add transactional correction metadata, and carry versioned lineup snapshots through uploads into normalized MySQL tables. Compute public plus-minus from persisted events and publish only results and completeness.

**Tech Stack:** Vanilla JavaScript, Node test runner, Python unittest, Flask, PyMySQL, MySQL and existing standalone HTML build.

**Spec:** `docs/superpowers/specs/2026-09-26-recording-improvements-design.md`

## Global constraints

- Statistics are editable through game end until export; export finalizes and locks all game mutations. Re-downloads remain available.
- Only statistical actions are historically editable. Preserve event IDs, order, period, game clock, recording timestamp and original lineup.
- Speeds: 1x, 1.5x, 2x, 4x. New games default to 1x; player minutes use game time.
- Opponents remain team-level only. Public plus-minus appears only in individual game box scores, not profiles, leaderboards or aggregate totals.
- Do not manufacture historical lineups or convert unavailable metrics into zero.
- Preserve pending upload payloads, optimistic concurrency, legacy CSV contracts and backup compatibility.
- Deployment and migration of the live cloud database are separate from local implementation and verification. Do not modify real game files or unrelated untracked workspace files.

## Review focus

1. Two guests on court remain distinct despite their common cloud identity; cover in Tasks 1, 5 and 6.
2. A speed change close to period expiry neither adds extra minutes nor jumps time; cover in Task 2.
3. Restoring one deletion group never reactivates a separately voided event; cover in Task 3.
4. A cancelled browser download cannot unlock finalization or prevent re-download; cover in Tasks 4 and 7.
5. Admin replacement or an old client must not silently discard valid lineup data; cover in Tasks 5 and 6.

## File responsibilities

- `src/engine.js`: clock, recording, mutation guards, orchestration of correction transactions.
- `src/team.js`: game-time minutes and lineup snapshot capture/validation.
- New `src/corrections.js`: pure correction preparation, related-action validation and audit/group metadata.
- New `src/player-analytics.js`: per-player derived metrics, completeness and analytical CSV.
- `src/app.js`, `src/template.html`, `src/styles.css`: recorder interaction and finished-game presentation.
- `src/remote.js`: versioned lineup upload payloads with immutable retries.
- `scorekeeper_remote/bundles.py`, new `scorekeeper_remote/lineups.py`: transport validation and normalized lineup calculations.
- `sql/remote.sql`, new `sql/migrate_event_lineups.sql`, `scorekeeper_remote/repository.py`: normalized cloud persistence and migration.
- `scorekeeper_remote/statistics.py`, `scorekeeper_remote/publishing.py`: public calculated metrics and explicit allowlisting.
- `site/admin.js`: preserve lineup metadata through administrative edits.
- `site/public.js`: game box-score +/- column only.
- Existing test suites plus focused corrections/player-analytics/lineup tests; `build.cjs` includes new browser modules before consumers.

## Task 1: Capture historical lineups and calculate player metrics

**Files:** Modify `src/team.js`, `src/engine.js`, `build.cjs`; create `src/player-analytics.js`, `tests/player-analytics.test.cjs`; extend `tests/team.test.cjs`, `tests/engine.test.cjs`.

**Interfaces:** `TeamEngine.snapshotLineup(game)` returns `{status:'complete'|'partial'|'unknown', playerIds:string[]}`. `recordEvent` saves that object as `event.lineupSnapshot` for every event. `PlayerAnalytics.player(game, playerId)` returns `{fgPct,threePct,ftPct,efgPct,tsPct,astTo,plusMinus,plusMinusStatus}` where numeric fields may be null and status is complete/partial/unknown. `PlayerAnalytics.csv(game)` exports identity, basic statistics, derived metrics and completeness.

- [ ] Write failing tests for event snapshot immutability across substitution; equal clock timestamps retain distinct snapshots; two guest IDs stay distinct; legacy events have unknown coverage. Pin formula assertions: 4 FGM / 10 FGA, 2 3PM / 5 3PA, 3 FTM / 4 FTA and 13 points yield FG%=40, 3P%=40, FT%=75, eFG%=50, TS%=100*13/(2*(10+0.44*4)); 6 assists / 2 turnovers yields 3. Zero denominators yield null. Home +3 followed by away +2 yields +1 for a player present for both.
- [ ] Run `node --test tests/player-analytics.test.cjs tests/engine.test.cjs tests/team.test.cjs`; confirm failures exercise missing behavior.
- [ ] Implement the interfaces. Snapshot all statistical actions. Conservative incomplete scoring coverage makes exact plus-minus null for all potentially affected squad members; keep normal metrics available. Local guests have individual rows. Backup validation accepts absent legacy metadata but rejects invalid snapshots.
- [ ] Run those tests and verify all pass, including converting a non-scoring event with a saved lineup into a scoring event fixture.
- [ ] Commit only Task 1 files: `feat: capture event lineups and calculate player analytics`.

## Task 2: Speed-aware clock and player minutes

**Files:** Modify `src/engine.js`, `src/team.js`, `tests/engine.test.cjs`, `tests/team.test.cjs`.

**Interfaces:** `ScoreEngine.setSpeed(game, speed, now=Date.now())` settles elapsed game time then changes speed without changing current remaining time. `game.clockSpeed` defaults to 1. Existing `remaining`, `start`, `pause`, `settle`, `minutes`, backup and validation interfaces retain their signatures.

- [ ] Add failing deterministic tests: 30 real seconds at 2x produces 60 game seconds and one minute per active player; each supported speed works; speed change at 09:00 preserves 09:00; expiry caps elapsed minutes; pause/restart and fractional-millisecond arithmetic do not drift or violate integer saved-minute validation. Reject unsupported speeds.
- [ ] Run `node --test tests/engine.test.cjs tests/team.test.cjs` and confirm new failures.
- [ ] Use the existing deadline model with remaining game milliseconds equal to `max(0,(deadline-now)*speed)` and deadline set to `now+remainingMs/speed`. Settle old-speed playing time before rebasing. Use one consistent integer rounding policy for stored milliseconds. Adjust timing-anchor validation for the speed-scaled deadline. Legacy speed is 1.
- [ ] Re-run the suites; assert backup/reload pauses at the correct game time, same-game speed persists and a new game resets to 1.
- [ ] Commit: `feat: add accelerated clock with consistent player minutes`.

## Task 3: Atomic corrections and restoration

**Files:** Create `src/corrections.js`, `tests/corrections.test.cjs`; modify `src/engine.js`, `build.cjs` and backup validation.

**Interfaces:** `ScoreEngine.correctEvents(game, changes, links, now)` returns a transaction ID. Each change is `{eventId,patch:{event_type?,team_side?,player_id?,is_voided?}}`. Links are `{assistEventId,shotEventId}`. `ScoreEngine.restoreDeletion(game, transactionId, now)` reverses only void transitions made by that transaction. Persist `game.correctionAudit` and `game.eventLinks`.

- [ ] Write failing tests for editing an earlier event without touching later IDs/times/snapshots; deriving points from type; changing home/away clears or validates player identity; invalid linked assists reject the whole transaction. Test a previously voided event remains voided when another deletion group is restored, and restoration rejects conflicts rather than overwriting later corrections.
- [ ] Run `node --test tests/corrections.test.cjs` and confirm the expected missing-interface failures.
- [ ] Prepare changes on copies, validate all events/links, then commit atomically. Restrict fields to the patch schema. Require home identity from the game's squad (legacy roster fallback), not current on-court selection. Explicit assists link only to active same-team made field goals; home assister differs from shooter. Never infer a link from proximity. Preserve before/after audit entries and reject duplicates/invalid references.
- [ ] Route last-action undo through the same mechanism; run corrections, engine and analytical tests. Assert all derived values change correctly for edits, deletion and restoration.
- [ ] Commit: `feat: support targeted statistical corrections and restoration`.

## Task 4: Recorder controls, summary and finalization

**Files:** Modify `src/app.js`, `src/template.html`, `src/styles.css`, `src/engine.js`, `src/team.js`; extend `tests/engine.test.cjs`, `tests/team.test.cjs`; create `tests/browser-recording-improvements.cjs`.

**Interfaces:** `ScoreEngine.assertMutable(game)` rejects finalized or remote-locked games; `ScoreEngine.finalize(game, now)` requires an ended game and sets `finalizedAt`. Apply guards to all mutation entry points, including team operations. Export preparation returns stable files before finalization persistence.

- [ ] Add failing tests: ended/unfinalized statistical edits succeed; finalized mutations fail through engine calls; restoration/reload retain locks; existing remote lock behavior persists. Browser scenario selects an earlier action, changes its player/type, resolves explicitly selected nearby related events, cancels safely, deletes and restores a group.
- [ ] Run unit tests and the new browser scenario; confirm missing controls/guards fail.
- [ ] Add event dialog and accessible event buttons, related-event selection, speed selector, finished-game analytical table and player CSV action. Pause on opening correction dialog and leave paused. Display unavailable values with explanations. Require ended game for result exports; show finalization consequence, generate content, persist lock, then initiate download. On persistence failure do not finalize/export. Backups and roster export remain nonfinalizing. Repeat downloads do not mutate finalized participation revisions.
- [ ] Run the browser scenario and engine/team/analytics suites; confirm 1.5x and 4x controls, post-game metrics, cancel behavior, storage failure and re-download. Include narrow-screen and keyboard checks.
- [ ] Commit: `feat: add correction UI speed controls and final export locking`.

## Task 5: Versioned lineup transport and normalized cloud storage

**Files:** Modify `src/remote.js`, `scorekeeper_remote/bundles.py`, `scorekeeper_remote/repository.py`, `sql/remote.sql`, `site/admin.js`; create `scorekeeper_remote/lineups.py`, `sql/migrate_event_lineups.sql`; extend `tests/remote.test.cjs`, `tests/test_remote_api.py`, `tests/test_remote_mysql.py`.

**Interfaces:** Upload schema v2 adds `lineups:{version:1,snapshots:[{event_id,status,members:[{local_player_id,player_id}]}]}`. Normal members map local ID to the same cloud ID; guests map distinct local IDs to `P_GUEST`. One snapshot per event, including voided/non-scoring events. V1 remains accepted unchanged. `validate_lineups(value, events, participation)` returns validated normalized metadata; `Bundle` carries it through repositories.

- [ ] Add failing validation/round-trip tests for complete five-member snapshots, unknown empty snapshots, invalid event IDs, duplicate local IDs, forged roster mappings and multiple guests. Verify legacy normalized hashes remain unchanged. A v2 retry must reuse the exact prepared payload.
- [ ] Run `node --test tests/remote.test.cjs` and `python -m unittest tests.test_remote_api -v`; confirm new cases fail.
- [ ] Add `event_lineup_snapshots(game_id,event_id,status)` and `event_lineup_members(game_id,event_id,local_player_id,player_id)`, with composite event ownership and member uniqueness, plus foreign keys to snapshots/players. Store upload lineup JSON in a nullable `remote_uploads.lineups_json` column for lossless document/audit round trips. Migration must be additive and safely rerunnable using an information-schema check for the added column. Persist actual schema version rather than hardcoded 1. Validate mapped member counts against participation designated counts, especially guests.
- [ ] Store/replace snapshots and events in one transaction; delete children before event replacement. Preserve metadata in admin documents and audit snapshots. Reject a v1 replacement of an existing v2 game rather than silently downgrading it. Admin UI retains snapshots for unchanged IDs and inserts unknown snapshots for newly added events. Preserve existing optimistic concurrency and deletion/publication handling.
- [ ] Run API/remote suites and `python tests/run_mysql_tests.py` against isolated MySQL. Verify rollback leaves no partial lineup writes, migration preserves existing games, retry equality and admin round trips.
- [ ] Commit: `feat: persist event lineups in versioned cloud uploads`.

## Task 6: Backend plus-minus and game box-score display

**Files:** Modify `scorekeeper_remote/lineups.py`, `scorekeeper_remote/statistics.py`, `scorekeeper_remote/repository.py`, `scorekeeper_remote/publishing.py`, `site/public.js`; create `tests/test_lineups.py`; extend `tests/test_remote_publishing.py`, `tests/test_remote_mysql.py`, `tests/dashboard-fixture.cjs`, `tests/browser-dashboard.cjs`.

**Interfaces:** `calculate_plus_minus(events, snapshots, participation)` returns a map from cloud player ID to `{value:int|None,status:'complete'|'partial'|'unknown'}`. Published player rows add `plus_minus` and `plus_minus_status` outside basic `stats`. Grouped `P_GUEST` always has unavailable individual plus-minus. Existing public snapshot version remains 1 with additive optional fields.

- [ ] Write failing tests matching Task 1's scoring fixtures across substitutions, voids and corrected scoring. Assert missing history yields null, not zero; two guests do not multiply a regular player's contribution. Public allowlist exposes result/status only, not member identities or audit metadata.
- [ ] Run `python -m unittest tests.test_lineups tests.test_remote_publishing -v`; confirm new cases fail.
- [ ] Load stored snapshots for publication and calculate values from active event points. Keep game-wide conservative coverage policy identical to the recorder. Add optional public fields to the allowlist. In `site/public.js` add +/- only to the individual game box table: +8, -3, 0, or em dash and a coverage explanation. Missing fields in historical snapshots are unknown. Do not add fields to seasonal aggregation or leaderboards.
- [ ] Run unit tests, isolated MySQL publication tests and `node tests/browser-dashboard.cjs`. Include positive, negative, zero, unavailable and grouped guest rows; ensure player profiles and season tables have no new +/- column.
- [ ] Commit: `feat: publish player plus-minus in game box scores`.

## Task 7: Integrated verification, documentation and build

**Files:** Modify `build.cjs`, generated `Front.html`, `docs/scorekeeper-guide.md`, `docs/remote-api.md`, `docs/public-dashboard.md`, `docs/mysql-pipeline.md`; extend integrated browser fixtures as required.

- [ ] Add a failing integrated regression: create a game, use 2x clock, score, substitute, record opponent score, correct an earlier shot, end game, inspect local metrics, finalize/export and upload. Verify published box-score values match the recorder and survive admin scoring correction. Include a legacy game without lineups and an export download cancelled by the browser followed by a successful re-download.
- [ ] Run the regression to establish any remaining integration failure.
- [ ] Build with `node build.cjs`; document metric definitions, lock semantics, speed/minutes, migration sequence, upload v2 compatibility and historical missing data. Resolve integration failures at their owning layer.
- [ ] Run `node --test tests/engine.test.cjs tests/team.test.cjs tests/corrections.test.cjs tests/player-analytics.test.cjs tests/remote.test.cjs tests/analytics.test.cjs`; run `python -m unittest discover -s tests -p "test_*.py"`; run isolated MySQL tests; run recorder, remote and dashboard browser suites using their existing harness prerequisites. All executed checks must pass; explicitly report unavailable infrastructure rather than treating skipped database tests as verified.
- [ ] Run `git diff --check`, review the final diff for accidental data/untracked-file inclusion, and commit the build/documentation/integration changes. Request final code review using the applicable skill. Report changes and verification evidence; do not deploy or migrate production as part of these local checks.

## Execution and review

Tasks 1, 3, 4, 5 and 6 share event and transport contracts and should be executed in order. Task 2 is independently testable but is kept in the same sequence to simplify integration. Each task gets a failing-test/pass-test cycle before moving on. The plan is self-reviewed for spec coverage, guest identity, upload compatibility, lock persistence and public-display scope.

Recommended execution: native implementation in this session, followed by a focused review, because the changes share tightly coupled event and validation interfaces. Await the user's plan review and execution-method choice before implementation.
