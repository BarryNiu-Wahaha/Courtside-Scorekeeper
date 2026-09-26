# Issue #6 — compact public dashboard

Implemented a shorter statistics masthead, denser summary/leader cards, tighter tables and dialogs, and player statistics before the charts. CourtSide colors, all statistics, filters, player links, and game reports remain available. Player-group controls share the section heading where space permits.

## Verification

- The original browser fixture placed leaders at y=1073 and the player section at y=1635 on desktop. The revised layout places them at y=632 and y=655, respectively (1440 px wide).
- All 57 JavaScript unit tests passed.
- Dashboard browser checks cover filtering, sorting/search flows, profiles, game reports, empty/error/retry states, navigation, and responsive overflow. Added first-screen density checks and long/tied leader-name checks in per-game mode. The final suite passed at widths 320, 390, 541, 600, 768, 1194, 1440, and 1920 px. A reproduced 541 px player-toolbar overflow was fixed by allowing its controls to wrap.
- Standalone and hosted site artifact builds passed. No production data or services were changed.
- Screenshots are generated under `tests/artifacts/dashboard-*.png` by the browser suite.
- Two intermediate browser launches timed out in CDP `Runtime.enable` before loading the application; subsequent full browser runs passed.

These are local Edge checks, not physical iPad Safari validation. Publication is separate; this change has not been deployed.
