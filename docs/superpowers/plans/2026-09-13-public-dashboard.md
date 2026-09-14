# Public Dashboard Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. User authorized uninterrupted execution; implement inline and use a bounded independent code review without additional approval checkpoints.

**Goal:** Deliver a public, responsive team dashboard with period/category filters, player profiles, game reports and trustworthy metrics.

**Architecture:** Extend the existing static snapshot, retain the PIN API, and calculate filtered aggregates in a pure browser/Node statistics module. Store optional upload metadata in an additive MySQL table. Render safe DOM nodes with responsive CSS and dependency-free SVG charts.

**Tech Stack:** Vanilla JS/CSS/HTML, Python Flask, MySQL, Node test runner, unittest, headless Edge CDP.

**Spec:** `docs/superpowers/specs/2026-09-13-public-dashboard-design.md`

## Global Constraints

- Current-season default; Spring March–July; Fall August–February named by starting year; calendar years and career also supported.
- Preserve existing CSV contracts, PIN permissions, retry identity, private data boundaries, unrelated local files.
- Missing historical metrics are unavailable, never fabricated zeroes. No new runtime dependencies.
- Both categories default; historical unclassified games remain in All games.

## Task 1: Metadata and snapshot contract

Files: `tests/test_dashboard.py`, `tests/test_remote_mysql.py`, `scorekeeper_remote/bundles.py`, `repository.py`, `statistics.py`, `publishing.py`, `sql/remote.sql`.

- [x] Add failing tests exercising validate_upload + real repositories + public_snapshot: literal opponent FGA/OREB/TO, void exclusion, new category/duration/completeness, invalid metadata, unchanged old hash, edit/audit roundtrip.
- [x] Run `python -m unittest discover -s tests -p test_dashboard.py -v` and verify missing fields fail.
- [x] Implement optional `game_details`, retaining omission for old payloads; upsert a separate metadata row inside existing upload transactions; join on snapshot; preserve in get/edit/audit.
- [x] Run focused tests and isolated MySQL integration runner; test migration twice on populated data.

## Task 2: Recording and admin metadata controls

Files: `tests/remote.test.cjs`, `src/engine.js`, `src/remote.js`, `src/template.html`, `src/app.js`, `site/admin.html`, `site/admin.js`.

- [x] Add failing test: finished game with five players each 60000 ms uploads duration_ms 60000, requested category and completeness; retry returns identical payload even after controls change.
- [x] Run `node --test tests/remote.test.cjs` to see missing metadata assertion fail.
- [x] Add required category selector for new games; optional full-stat confirmation on upload; derive duration from complete participation. Validate category in saved-state restoration. Preserve all prior pending uploads exactly.
- [x] Add admin category/duration/coverage fields and include them in corrected payloads; preserve on PIN expiry.
- [x] Run Node regression suite and rebuild Front.html via `node build.cjs`.

## Task 3: Pure public analytics

Files: `site/analytics.js`, `tests/analytics.test.cjs`.

- [x] Write failing tests for `season(date)`, `filterGames(games,{period,category})`, `summarize(snapshot,games)`, `gameMetrics(game)`, `leaders(players,key,mode)` with hand-derived expected values.
- [x] Check Spring/Fall boundaries and independent calendar year behavior; DNP denominator, permanent identity, ties, unknown minutes, guest exclusion, weighted shooting, unavailable old data, possession and pace formulas.
- [x] Run `node --test tests/analytics.test.cjs`, implement the module, then run again.

## Task 4: Dashboard interface and browser verification

Files: `site/index.html`, `site/public.js`, `site/dashboard.css`, `site/analytics.js`, `scorekeeper_remote/publishing.py`, `tests/browser-dashboard.cjs`, `tests/browser-remote.cjs`.

- [x] Add CDP behavior test using isolated fixture snapshot. Select Fall 2026 vs Spring 2026 vs calendar 2026 vs career; change categories; search a player; open profile and game; verify basic/advanced numbers and no PIN needed.
- [x] Run it against the prior interface to verify missing selectors/behavior.
- [x] Implement scoped styles, filter toolbar, six leader cards, team summary, accessible scoring chart/comparison, players, profiles and reports. Retain old smoke-test selectors where practical.
- [x] Build artifact; run browser tests at desktop/tablet/mobile sizes and inspect screenshots. Assert no document overflow, console exceptions, unsafe injected markup, or unusable empty/error states.

## Task 5: Review and delivery

- [x] Run all Node tests and all Python unit tests; run isolated MySQL integration and original frontend/remote browser suites.
- [x] Review diff for migration, backward compatibility, privacy allowlist, date boundaries, filtered denominator mistakes and layout/accessibility; fix findings with regression tests.
- [x] Write `docs/public-dashboard.md` and verification evidence; update README; build local artifact; run `git diff --check`.
- [x] Commit task changes and provide concise handoff with local preview and deployment prerequisites. Do not close unrelated processes or claim cloud deployment.

## Completion notes

Implemented and verified September 14, 2026. See docs/public-dashboard-verification.md for the test results, review fixes, screenshots and local preview. Work remains on the feature branch; cloud deployment is a separate action.
