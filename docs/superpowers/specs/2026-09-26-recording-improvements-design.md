# Recording corrections, clock speed, and player analytics

Status: proposed design for user review. Requirements extended to cloud persistence and public viewing-page plus-minus; implementation not started.

Sources: GitHub issues [#1](https://github.com/BarryNiu-Wahaha/Courtside-Scorekeeper/issues/1), [#3](https://github.com/BarryNiu-Wahaha/Courtside-Scorekeeper/issues/3), [#4](https://github.com/BarryNiu-Wahaha/Courtside-Scorekeeper/issues/4), and the requirements discussion on September 26, 2026.

## Purpose and agreed requirements

Make recording easier to correct, faster to complete, and useful for player analysis. Video remains on a separate device. Our team has player identities and substitutions; opponents have team-level actions only.

- Select any statistical event to edit or delete without removing subsequent valid actions. Editable fields: player/team, event type, shot value and made/missed outcome. Preserve original period, game time and recording timestamp.
- Resolve linked actions together. Restore deleted actions and linked deletions before finalization. Substitutions, period changes and clock adjustments are outside historical editing scope.
- Corrections work during play and after ending a game, until export. Export finalizes the game and locks editing.
- Offer game-clock speeds 1x, 1.5x, 2x and 4x. Each new game defaults to 1x.
- Show our players' plus-minus, FG%, 3P%, FT%, eFG%, true shooting percentage and assist-to-turnover ratio in the post-game summary and exports. Team totals retain basic statistics; no opponent player statistics.
- Accept scoring with incomplete lineup information and flag affected plus-minus as incomplete. Recalculate plus-minus after corrections using the original event lineup.

## Existing implementation and approach

`src/engine.js` owns events, basic statistics, a deadline-based clock, last-event undo and event CSV. `src/team.js` stores the current five and accumulated playing time, but does not retain historical lineups. `src/app.js` owns recording, history, export and end/reopen controls. `src/remote.js` preserves immutable pending upload payloads. `build.cjs` produces standalone `Front.html`.

Three approaches were considered:

1. Extend each event with its original lineup and maintain a correction audit. Recommended: captures exactly what plus-minus needs and preserves existing CSV contracts.
2. Introduce a complete replay log of substitutions, clock changes and all user commands. Supports more historical editing, but exceeds the agreed scope.
3. Reconstruct lineups from current totals. Rejected: minutes and the current five cannot establish who was on court for an earlier score.

## Event correction flow

Make each event-history entry selectable, including voided entries. A correction dialog shows the original time, editable statistical fields and related actions. The home-player selector uses the game squad rather than today's roster or current lineup. Opponent events carry no player identity. Event type determines points; arbitrary inconsistent point values are invalid.

Apply a correction as one validated transaction with before/after audit entries. Preserve event IDs and ordering. Deletion marks events voided; restoration reverses a specific deletion group. Do not reactivate entries already voided before that group. Recompute scores and statistics from active events after every change.

The current app records actions independently and has no reliable assist-to-shot links. Proposed resolution: show nearby events as candidates and let the user explicitly select related actions in the correction dialog. Proximity alone never establishes a relationship. Persist confirmed links. If an explicit assist link becomes invalid after a shot correction, require the user to remove, correct or unlink it in the same transaction. Do not invent links for existing games.

Opening a correction dialog pauses a running game clock and leaves it paused on closing, matching the existing substitution flow. Preserve event lineup snapshots when changing a scorer or converting a non-scoring event into a scoring event.

## Clock speed and playing time

Add a compact speed selector near the clock. Changes may be made while paused or running. First settle elapsed game time using the old speed, then establish a new clock anchor using the selected speed; changing speed must not jump the displayed game time.

Use elapsed wall time multiplied by speed, capped at the remaining period time. Playing time uses the same elapsed game milliseconds: 30 real seconds at 2x counts as 60 seconds for each on-court player. Do not scale event recording timestamps. Clock adjustments retain the existing rule that they do not rewrite accumulated minutes.

Retain the selected speed when reopening the same game or restoring its backup; new games and legacy games without a speed field default to 1x. Pause, resume, period expiry, browser refresh and backup creation must settle the clock consistently.

## Historical lineup and completeness

Capture the current home lineup and its completeness on every statistical event, not only scores. This supports later conversion of a rebound or other action into a scoring event. Validate that a complete snapshot has five unique squad members. Event snapshots distinguish actions around substitutions even when their displayed timestamps match.

For each active scoring event with a complete snapshot, add home points or subtract opponent points for those five players. Deleting, restoring or editing an event automatically recomputes the result using that unchanged snapshot.

Never fabricate historical snapshots for old games. If any active score lacks a complete lineup, the game cannot establish exact player plus-minus: display an incomplete label and export a blank exact value with an explicit status for potentially affected players. A known contribution may be shown separately as partial, never as a complete result. When it is impossible to identify affected players, conservatively mark the whole squad incomplete. Other advanced statistics remain available.

Keep the existing five-player selection workflow. Missing historical data must not prevent recording an opponent score; it also must not relax identity validation or claim that an incomplete lineup is complete.

## Metrics and presentation

Calculate from each player's active events:

| Metric | Definition |
| --- | --- |
| FG% | 100 x FGM / FGA |
| 3P% | 100 x 3PM / 3PA |
| FT% | 100 x FTM / FTA |
| eFG% | 100 x (FGM + 0.5 x 3PM) / FGA |
| TS% | 100 x PTS / (2 x (FGA + 0.44 x FTA)) |
| AST/TO | AST / TO |
| Plus-minus | Home points minus opponent points while the player was on court |

TS% uses the stated 0.44 free-throw approximation. Zero denominators produce unavailable values, not zero or infinity. Display percentages to one decimal place and AST/TO to two; calculations use unrounded values. Show an em dash for unavailable values with a reason available to the user.

Extend the finished-game player summary. Keep live player cards and team-total rows on their existing basic statistics. Export a dedicated player-statistics CSV containing player identity, basic counts, the seven new metrics and plus-minus completeness. Preserve individual local guest identities in this analytical file so distinct on-court guests are not merged into misleading player plus-minus; retain the existing guest aggregation in pipeline exports.

## Finalization, exports and compatibility

Proposed interpretation of the export lock: game-result exports (event, participation or player-statistics CSV) go through a shared finalization action. Require the game to be ended, preview the lock consequence, prepare export contents, then persist finalization before initiating downloads. A storage failure prevents finalization/download through this action. Browsers cannot verify a completed file save; a locked game must always permit re-downloading its results.

Backup downloads and roster exports are not game-result exports and do not finalize games. Finalization blocks recording, historical correction/restoration, clock changes, substitutions and reopening, including engine-level guards. Finished but unfinalized games remain correctable. Remote pending/uploaded locks continue to take precedence; admin-side correction behavior is unchanged.

Keep existing event and participation CSV column contracts. Add the new player-statistics CSV as a separate analytical export. JSON backups retain speed, event snapshots, links, audit data and finalization state. Following user clarification, cloud uploads must also retain historical lineup data, and the public viewing page must display player plus-minus.

### Cloud persistence and public viewing page

Extend the upload contract with versioned lineup metadata keyed by event ID. Store it transactionally with the events and participation records, include it in retry hashing and correction audit documents, and return it when an admin opens an uploaded game. Accept older uploads without lineup metadata as historical records with unavailable plus-minus.

Proposed normalized storage: add an `event_lineup_snapshots` table keyed by `(game_id, event_id)` with completeness status, and an `event_lineup_members` table containing that snapshot's local player identity and mapped cloud identity. A snapshot row represents explicit unknown/partial coverage even when it has no members. Preserve distinct local guest identities because several guests currently collapse to `P_GUEST` in cloud statistics. Foreign keys, replacement order and deletion behavior must respect event ownership. Supply an additive migration; do not rebuild existing tables or infer historical memberships.

The backend computes plus-minus from active scores and their saved lineups when building the public snapshot. Publish the calculated value and completeness status through the publication whitelist; do not expose raw correction audits or lineup metadata publicly. Admin scoring corrections must preserve snapshot associations and trigger recomputation. Newly inserted admin events without historical lineup information make affected results incomplete. Keep the existing upload retry and optimistic-concurrency guarantees.

The public viewing page shows plus-minus only in individual game box scores, as confirmed by the user. Add a +/- column to our team's player rows. Display signed values such as +8 and -3, a true zero as 0, and unavailable/incomplete results as an em dash with an explanation. Historical games without lineups remain unavailable. Do not add plus-minus to player profiles, season totals, career totals or leaderboards. The cloud's combined Guest Player row must not masquerade as an individual player's plus-minus.

Other advanced metrics remain in the agreed post-game summary and exports; this scope extension specifically adds plus-minus to the public viewing page.

Validate added metadata and references on restore. Accept old backups with conservative defaults and unavailable historical plus-minus. A restored backup that contains finalization stays locked. An older backup made before finalization remains a separate earlier snapshot; offline storage cannot prevent deliberate rollback to it.

## Implementation boundaries

- `src/engine.js`: correction transactions, edit guards, clock speed and event snapshots.
- `src/team.js`: speed-aware playing time and snapshot validation.
- A focused player-analytics module: formulas, completeness and player CSV; include it in `build.cjs`.
- `src/app.js`, `src/template.html`, `src/styles.css`: event selection/dialog, related-action resolution, speed controls, finished-game summary and finalization flow.
- State validation and backup handling: backward compatibility and persistence of new metadata.
- Documentation: recording workflow, export locking, metric definitions and partial data.
- Cloud: additive SQL migration, upload validation/versioning, transactional repository storage, admin correction round trips, backend plus-minus computation and publication whitelist.
- Public viewing: `site/public.js` and any necessary `site/analytics.js` data handling, plus markup/styles for the individual game box score's +/- column.
- Generated `Front.html`: rebuild from sources after implementation.

## Verification criteria

- Correct an earlier player, team or action type while later events and original timestamps remain unchanged.
- Resolve linked shot/assist changes atomically; cancelling changes nothing. Restore a deletion group without restoring unrelated voided actions.
- Correct after ending a game; reject every game mutation after finalization, including after reload/backup restore. Allow re-downloads and preserve remote upload retry payloads.
- Verify all four speeds, changing speed mid-run, pauses, period expiry and player minutes using deterministic elapsed-time tests.
- Score before and after substitutions at the same displayed time; attribute both using their own snapshots. Verify home and opponent scoring, edits, voids and restoration.
- Missing historical lineups yield incomplete plus-minus; no invented zeros. Exercise zero denominators and hand-calculated metric examples.
- Confirm existing CSV contracts and existing backup fixtures still validate. New analytical exports contain the agreed player metrics and completeness.
- Verify cloud upload, retry, admin correction and publication round trips retain event lineups; backend calculations match recorder results. Test legacy uploads, partial snapshots, multiple guests, transactional rollback and migration on existing data. Verify public signed values and missing-data labels.
- Browser checks cover event dialog keyboard/touch use, speed selection, post-game summary, finalization and re-download. Run relevant engine, team, remote and export regression suites and rebuild the standalone app.

## Review boundary

The user approved the requirements and requested proceeding to design. The proposed operational choices above, especially manual link confirmation, the shared result-export lock and separate player-statistics CSV, are presented for design review before an implementation plan is written.
