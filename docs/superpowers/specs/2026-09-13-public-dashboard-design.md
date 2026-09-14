# Public team dashboard

Approved direction: the user approved the dashboard layout and authorized uninterrupted implementation and verification on September 13, 2026. No further design checkpoint is needed for routine choices. Work stays in this folder; existing unrelated work is preserved. No cloud deployment or application shutdown is implied by local implementation.

## Experience

One university team. Public readers need no PIN. A shared scorekeeper PIN uploads finished games; the separate admin PIN manages corrections and roster changes. Keep these permissions intact.

Default to the current season based on the viewer's local date. Spring runs March 1 through July 31. Fall runs August 1 through the last day of February in the following year, labeled by its starting year. Also offer calendar-year and career views. All summaries, leaderboards, profiles, charts and game lists respect the period and category filters. Include official and friendly games by default. Historical games with no category remain visible in All games and are clearly unclassified; never silently classify them.

Use a spacious navy/white dashboard with blue accents, responsive cards, readable type, horizontal table scrolling, accessible form labels, keyboard-operable dialogs, and no external font or chart dependency. Keep public page styles separate from admin styles. Provide useful loading, empty, missing-data, and retry states. Never ship fabricated games as real results.

Homepage: hero with filters; team record, scoring/allowed averages, estimated pace and offensive/defensive ratings; equal-sized leader cards for points, rebounds, offensive rebounds, assists, steals and blocks; totals/per-game toggle; scoring chart; our-team/opponent comparison; searchable player table; game results. Search supports names and jersey numbers. Guest aggregate is excluded from individual leader awards and labeled as a combined group in tables.

Player dialog: name/number, selected period, games played, points/rebounds/assists/steals/blocks/turnovers averages, total stats, minutes and shooting splits, dated game log linking to game reports. Global period/category filters also update open profiles. Individual appearances derive participation, not events; zero-stat appearances count and unused bench does not. Roster identity uses permanent player IDs. Display GP beside leaders and ties together; no complex minimum rules in v1.

Game dialog: category/date/season, final score, both-team box score comparison, advanced metrics and individual box score including offensive and defensive boards. No manually awarded badges, hustle buttons, per-40 rankings, or inferred best-defender award.

## Data and calculations

Keep upload schema_version 1 and existing CSV contracts, with optional `game_details` containing `category` (official/friendly/null), `duration_ms` (positive integer <= 86400000 or null), and `stats_complete` (boolean). Missing metadata on old uploads remains missing in normalization so original duplicate hashes still match. Store metadata in a new remote_game_details table keyed by game ID; migration is additive/idempotent. Preserve metadata in admin edits, audit snapshots and public snapshots. Both in-memory and MySQL repositories must agree. Admin can classify historical games and correct duration/coverage. New games select a category; upload asks the recorder to confirm complete statistics for both teams. Duration comes from complete tracked player time divided by five; partial minutes yield null. An unchecked completeness confirmation still permits upload.

Public snapshots add allowlisted `home_stats`, `away_stats`, `category`, `duration_ms`, `stats_complete`. Publish only nonvoid events and nondeleted games. Old static snapshots render safely with unavailable opponent details. Missing data is not zero. Sensitive fields and individual guest names never enter public output.

Per-game averages divide by actual games played. Shooting percentages divide aggregate makes by aggregate attempts (not the average of percentages); zero attempts display a dash. Estimated possessions per side = FGA - OREB + TO + 0.44*FTA. Game possessions = mean of the two sides. Pace = possessions*40/duration_minutes. Offensive/defensive ratings = points scored/allowed*100/possessions. eFG% = (FGM+0.5*3PM)/FGA; TS% = points/[2*(FGA+0.44*FTA)]. Team OREB% = OREB/(OREB+opponent DREB); DREB% = DREB/(DREB+opponent OREB). All are explicitly labeled; possession-based measures are estimates. Do not infer player defensive ratings or plus/minus.

Possession metrics require both team stat objects and explicit complete-stat confirmation; pace also requires valid duration. Aggregates weight eligible games by summed possessions/duration and state the eligible game count. Basic stats retain all selected games. Unknown opponent data makes full-period opponent metrics unavailable rather than averaging only an undisclosed subset. Player percentages and rates remain labeled recorded statistics.

## Verification and delivery

Test season boundaries (including Jan/Feb and leap years), year/career/category filters, averages including bench/DNP/guest rules, weighted percentages, zero denominators, ties, old snapshots, and metrics with partial coverage. Verify upload retry identity, validation, metadata edit/audit persistence, idempotent migration and real isolated MySQL behavior. Run existing Node/Python/browser suites. Add headless browser checks for filters, search, dialogs, empty/error states, mobile/desktop overflow and console errors; capture screenshots and inspect them. Build a local deployable artifact with an empty initial snapshot, separate from test fixture previews. Document metric definitions and deployment migration requirement. Commit only task files if Git permits; leave live deployment for an explicitly authorized deployment task.
