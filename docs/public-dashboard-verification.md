# Dashboard verification — September 14, 2026

Implemented on `feat/public-season-dashboard`, based on `936efbb`. The user authorized the design and uninterrupted implementation. Source, rebuilt `Front.html`, tests, design and documentation are included; pre-existing CSV files and diagrams remain untouched.

## Verified results

- **49 JavaScript unit tests passed**: engine, lineup/participation, remote client and public analytics.
- **34 Python unit/API/publication tests passed**. The discovery run lists 57 tests, skipping the 23 database cases that are run separately below.
- **23 real MySQL integration tests passed** using the isolated loopback-only runner. This includes additive/idempotent migration, metadata round trips, correction audit, unchanged original retry, transaction rollback, concurrency and publication ordering. The user's ordinary MySQL instance and hosted database were not used.
- **Dashboard Edge browser suite passed**: current-season default; Spring/Fall, year and career; category intersections; totals/averages; name/jersey search; player profile filters and game reports; desktop/tablet/phone widths; empty/error/retry states; old snapshot fallback; safe rendering of HTML-like names. No JavaScript exceptions or document overflow in tested views.
- **Remote Edge suite passed**: PIN login, payload persistence across ambiguous failures, exact retries, uploaded-game lock across reload, no stored PIN, admin edit/publication, category/duration/full-stat payload fields, metadata controls, and locked completeness checkbox after submission.
- **Standalone scorekeeper Edge suite passed**: all 13 recording actions, opponent records, clock/periods, substitutions and roster identity, export, refresh, finish/reopen, history, backup/restore, corrupt-storage recovery, responsive layouts and offline operation.
- Standalone HTML and static website builds passed. `git diff --check` found no whitespace errors (Git reports its normal LF/CRLF conversion notices).

## Review findings resolved

An independent code review found two analytics edge cases. Both were reproduced by failing tests and fixed:

1. Multiple guests in one game now count as one game for the combined guest group's per-game averages.
2. A DNP row with zero minutes no longer makes an unknown historical appearance's minutes look like a known zero.

The follow-up review verified both fixes and reported no additional actionable correctness issues. A browser check also caught that the full-stat upload checkbox looked editable after a payload was frozen; it now displays and locks the submitted value.

## Visual evidence

Screenshots under `tests/artifacts/` use synthetic fixtures only:

- `dashboard-desktop.png`, `dashboard-1194.png`, `dashboard-768.png`, `dashboard-390.png`
- `dashboard-player.png`, `dashboard-player-mobile.png`
- `dashboard-game.png`, `dashboard-game-mobile.png`, `dashboard-empty.png`
- Existing `remote-public.png`, `remote-admin.png` and standalone smoke screenshots

Desktop, player-profile and phone game-report screenshots were visually inspected. Tables scroll inside their own regions on phones. Game-log names have room to wrap without breaking date labels into narrow fragments.

## Local preview and delivery

A clearly labeled sample preview is built in `.local/dashboard-preview/`; it is excluded from Git and contains no real team results or production credentials. A loopback-only preview server is running; its current URL and process ID are in `.local/dashboard-preview-server.json`. If the helper stops, restart with:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory .local/dashboard-preview
```

Then open `http://127.0.0.1:8765/`. Preview game data comes from `tests/dashboard-fixture.cjs`; do not upload it to the live site.

The live website has **not** been deployed or altered. Deploying this version requires the additive remote migration and a publication from the real database, as described in [the dashboard guide](public-dashboard.md). Production account/service behavior was not tested by this local implementation task.

Codex was not force-terminated. No controllable Codex application window was exposed to this session; unrelated processes were left running. Headless browser test processes and temporary database processes were cleaned up by their runners. The local preview helper is intentionally left available for review.
