# Recording improvements verification

Implementation branch: `feature/recording-improvements`, based on `267fa82`.

## Delivered behavior

- Select statistical history entries to edit/delete; keep original event time and lineup. Resolve linked assists explicitly, restore deletion groups, and keep later valid events.
- Use 1x, 1.5x, 2x or 4x clock speed with consistent player minutes. New games start at 1x.
- Show player plus-minus and shooting/efficiency metrics after game end and in an analytical CSV.
- Finalize local game edits on first result export, independently of remote upload outcomes; permit repeated downloads.
- Upload event lineups using schema v2; persist normalized snapshots/members and exact upload metadata transactionally. Preserve v1 historical games with unavailable plus-minus.
- Publish plus-minus only in individual public game box scores. Historical gaps and combined guests show unavailable values.

## Verification evidence

- JavaScript: `node --test tests/*.test.cjs` — 71 passed.
- Python discovery: 64 tests, 40 passed and 24 database tests skipped by their explicit isolated-runner guard.
- Isolated MySQL: `python tests/run_mysql_tests.py` — all 24 passed, including migration replay, v2 round trips, admin correction/audit, and rollback after lineup writes. Uses a temporary loopback database; no production migration.
- Edge: `tests/browser-recording-improvements.cjs`, `tests/browser-smoke.cjs`, `tests/browser-remote.cjs`, and `tests/browser-dashboard.cjs` verified recording, corrections, grouped restoration, export/focus behavior, responsive layouts, uploads/admin and public game box scores.
- Built `Front.html` from source and checked the diff for whitespace errors.

The browser fixtures require the documented local site build. Initial dashboard test attempts without those artifacts timed out; creating them resolved that setup failure. Edge DevTools required execution outside the filesystem sandbox. A landscape-tablet height regression was reproduced and corrected with a compact speed selector.

## Independent review and fixes

A read-only reviewer identified three important issues. Each was reproduced before the fix:

1. Export while a first upload is pending could lose its lock after a definitive upload rejection. Finalization now persists independently; the regression checks the lock survives HTTP 400 handling.
2. Removing a linked basket could leave its assist active and silently unlink it. The correction dialog now requires explicit resolution, and last-action undo removes dependent assists as a restorable group.
3. Timed finished-summary rendering recreated the export button and lost keyboard focus. Finished summaries no longer refresh on clock ticks; an Edge test retains focus across ticks.

The reviewer also identified a direct TeamEngine.start guard gap. This was treated as important under the plan's engine-level finalization requirement, reproduced, and guarded. No deferred review findings remain.

## Implementation decisions and limits

- Used a PowerShell progress ledger on Windows rather than Bash helper scripts; no product impact.
- Extracted result-export.js to isolate persistence-before-download and test storage failures; behavior remains as designed.
- Retained exact lineup upload JSON alongside normalized membership tables so retries and audits preserve documents. MySQL public calculations use normalized memberships. Both representations are written in one transaction; round-trip and rollback tests cover consistency.
- Direct team-start calls now respect finalization, matching the other public mutation entry points. Invalid callers that relied on bypassing locks now fail.
- Actual download cancellation cannot be detected by browser code. Finalization persists before initiation, and re-download is always available; cancellation intentionally does not unlock a game.
- Older games cannot acquire trustworthy plus-minus without historical lineup information.

## Live release — 2026-09-27 UTC

- Deployed application commit `62e0c7e4bd84d7ed6873223e6a0d1079ddc04f53`. Render deployment `dep-das865fpn0mc73f85kc0` reached `live` at 02:45:01 UTC.
- Created a full private database backup and verified its restoration into an isolated MySQL instance against the original table checksums.
- Applied the additive event lineup migration before publishing the v2 recorder. Existing game, roster, and audit data checksums remained unchanged through migration and release; publication metadata changed as expected.
- Published public revision 12 at https://courtside-team.pages.dev. Fresh Edge checks verified the recorder speed controls, correction dialog, schema v2 support, and plus-minus column in the individual game box score, with no JavaScript exceptions.
- Live verification at 02:50:54 UTC found one public game, 37 roster entries, and 14 player box-score rows. All historical player rows correctly report unavailable plus-minus because they lack lineup history. No synthetic game was uploaded during live verification.
- Private backup and release evidence remain in the ignored local workspace directories; credentials are excluded from this report and version control.
