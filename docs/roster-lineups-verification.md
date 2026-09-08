# Roster and lineup verification — 2026-09-07

Implemented and rebuilt the standalone Front.html. No remote service or additional runtime package is required.

- `node --test tests/team.test.cjs tests/engine.test.cjs`: 24 passed. Covers original scoring/CSV behavior plus graduation cutoff, overrides, roster CSV identity/escaping, squad limits, starters, substitutions, clock corrections, period expiry, overtime, reload/backup timing, legacy partial coverage, and anonymous guest exports.
- `node --check` for app.js, engine.js, and team.js: passed.
- `node build.cjs`: passed; generated Front.html includes TeamEngine before ScoreEngine and the UI.
- `node tests/browser-smoke.cjs`: passed in offline Microsoft Edge. Real UI checks cover 15 designated players, five visible scorer cards, multiple substitutions and paused clock, all 13 stat actions, voids, opponent records, preserved game jersey snapshots, refresh, period changes, history, backup/restore and corrupt-storage recovery. Extended checks save enrollment/status overrides, import a roster through the file input with a changes preview, and export two guests under one anonymous database identity.
- Responsive screenshots checked at 1194×834, 1024×768, 834×1194, 1440×1000, and 390×844. No horizontal page overflow; stat buttons fit both landscape iPad viewports. The substitution popup was also captured and inspected.
- `conda run --no-capture-output -n msba python -m unittest discover -s tests -p "test_pipeline*.py"`: 15 passed.
- `conda run --no-capture-output -n msba python tests/run_mysql_tests.py`: 13 passed against an isolated temporary MySQL instance. Covers preservation of populated legacy tables during migration, roster-only players, authoritative roster details, guest records, atomic participation snapshots, stale/equal revisions, rollback, and existing event behavior.
- `conda run --no-capture-output -n msba python tests/check_browser_exports.py`: passed against actual browser downloads: 27 university roster records accepted; two guests aggregate into one participation row while both events and all six points remain intact.

Independent review findings were reproduced and addressed: paused selections falsely counting as appearances, blank-ID import on LAN pages without randomUUID, invalid saved timing anchors, incompatible roster IDs, and stat-recorded appearances while paused. Browser coverage found and fixed a malformed Astudent option. Roster import previews now expose IDs and old/new enrollment and override values.

## Local database upgrade

The user's populated MySQL database was not changed. Before importing the new exports into an existing installation, run the documented `migrate-db` command and enter the password in the local terminal. A one-time Workbench SQL migration is also supplied. See [pipeline instructions](mysql-pipeline.md).

## Practical limits

Physical iPad Safari/touch behavior has not been tested; browser viewport emulation is not a device test. Existing games have no inferred historical minutes. Continued legacy games explicitly carry partial participation. Remote synchronization remains deferred. JSON backups retain individual local guests; only database-facing CSVs anonymize them.
