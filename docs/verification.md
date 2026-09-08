# Verification — 2026-09-07

Completed against the generated Front.html:

- `node --test tests/engine.test.cjs`: 12 tests passed, zero failures.
- `node --check src/app.js` and `node --check src/engine.js`: passed.
- `node build.cjs`: generated the standalone HTML successfully.
- `node tests/browser-smoke.cjs`: passed in installed Microsoft Edge, with networking disabled. Covered all 13 stat actions (including an emulated native touch), sequential IDs, voids, team-level opponent events, permanent player identity, clock start/pause/correction, period changes, actual CSV download, refresh, box scores, finish/reopen, history, backup/restore and corrupt-storage recovery.
- Layouts checked at 1194×834, 1024×768, 834×1194, 1440×1000 and 390×844. No page horizontal overflow; all stat actions fit within both landscape iPad viewports.
- Downloaded CSV read using Python `csv.DictReader` with `utf-8-sig`: 17 events, 14 columns (the 12 requested fields plus team_side and is_voided), Chinese names preserved, active score 9–2 matching the browser.
- Independent code review identified two backup issues. Both were reproduced and fixed with regression coverage: export-time clock snapshots, and separate recovery/current-workspace downloads after corrupt storage.

Screenshots are in tests/artifacts/. Browser test data uses an isolated temporary profile and does not populate the user's browser. Real iPad Safari and physical touch interaction have not been tested. No database, API or website deployment was attempted.
