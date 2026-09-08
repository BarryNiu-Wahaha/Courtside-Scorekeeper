# Offline roster and lineups implementation plan

User approved design and autonomous folder changes; no further design checkpoints are required.

**Spec:** ../specs/2026-09-07-roster-lineups-design.md
**Architecture:** Standalone TeamEngine module owns roster CSV/status and lineup timing. Existing ScoreEngine delegates clock accounting. UI handles selection and previews; Python adds independent roster/participation contracts and additive migrations.

- [x] Engine: add tests/team.test.cjs for cutoff/override, CSV identity and atomic rejection, 15-person limit, five-player lineups, timed substitutions, corrections, expiry, backups and anonymous guest exports. Run node --test tests/team.test.cjs to observe missing functionality, implement src/team.js and engine integration, rerun with existing engine tests.
- [x] Frontend: add roster import/export and enrollment controls, squad and starter selection, five on-court cards, multi-substitution popup, minutes and participation export in app/template/styles. Preserve historic game snapshots. Update browser smoke to perform squad selection and validate substitution/privacy behavior.
- [x] Backend: add strict roster/participation validators and CLI imports, atomic revision-checked snapshots, schema migration and isolated MySQL regression tests. Preserve event CSV compatibility and production data.
- [x] Integration: build Front.html, run node engine/team tests, actual Edge smoke and Python validation/MySQL suites. Inspect responsive screenshots. Document commands and limitations, reconcile specification against final behavior.

Interface contract: roster CSV player_id,player_name,jersey_number,enrollment_year,status_override. Participation CSV game_id,game_date,opponent,revision,coverage,player_id,player_name,jersey_number,designated_count,starter_count,played_count,played_ms. Reserved database guest identity P_GUEST / Guest Player / 0. Coverage complete or partial. Revision monotonically increases per game. The existing 14-column event CSV remains unchanged.

Work directly in the authorized folder, which is not a Git repository. Never write credentials or synthetic records to the user's MySQL service. Use deterministic clock tests and the existing isolated integration runner.
