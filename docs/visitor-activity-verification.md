# Visitor activity implementation verification

Feature branch: `feature/visitor-activity`, isolated under `.local/visitor-activity`, based on remote-confirmed main `d776f7f`. The readability refactor has not been merged or deployed. This feature has not been deployed, and no Atlas account or paid service has been created.

## Executed checks

- JavaScript: 82 tests passed, including real headless Edge tests of dashboard instrumentation and admin rendering/logout races.
- Python discovery: 88 tests run, 57 passed and 31 database tests skipped when connection variables are absent. Database checks were run separately below; skips are not treated as passes.
- MongoDB: all 7 isolated integration tests passed against a loopback-only MongoDB 8.0.17 server with PyMongo 4.19.0. Covered real aggregation results, duplicate/concurrent retries, partial batch retry, collection validation, repeated setup, TTL configuration, retention exclusion, timeline order, and pagination.
- MySQL: all 24 existing isolated integration tests passed. No production database used.
- Browser end-to-end: real browser collector to temporary Flask/in-memory analytics storage, then authenticated admin reports. Passed page/player/game/filter/export actions, admin timeline, opt-out, unauthorized read denial, no admin tracking, and mobile/desktop layouts.
- Existing recording-improvements browser suite passed.
- Existing remote-upload/admin browser suite passed.
- Existing dashboard browser suite reaches its known reduced-motion failure (active animation remains after reduced motion is enabled). The September 27 handoff records this failure on the baseline and refactor too. It is not counted as a passing suite or changed in this feature.
- Standalone build and public artifact generation passed; standalone excludes the collector, hosted builds require an explicit enabled flag, and public basketball snapshot allowlisting is unchanged.

## Design decisions made during implementation

- Each document load starts a new session to avoid cloned-tab reuse; reloads count as new visits. Thirty-minute idle rollover remains supported.
- Summary uses two bounded aggregation queries because MongoDB forbids nested facets. Under concurrent ingestion, the two parts can momentarily represent slightly different instants.
- Timeline sorts by validated client action time, then event ID, while filtering by server receipt time. This preserves action order within a delivered batch; inaccurate client clocks can affect displayed order. Identical action times use stable ID ordering.
- Default API report end includes the current millisecond, avoiding omission of an event received in the same clock tick. Explicit ranges keep exclusive end semantics.
- PowerShell ledger operations replace unavailable Bash workflow helper scripts; task/test evidence is retained here and in commits.

## Remaining release work

Configure a dedicated Atlas database/user, private backend connection settings and network access, run the setup command, then deploy the backend and enabled hosted assets after the owner's separate deployment decision. Verify with a controlled hosted visit. Local tests do not prove production DNS, credentials, network permissions, or free-tier capacity. The free tier is a starting target, not a capacity guarantee.

Screenshots with synthetic records are in ignored `tests/artifacts/visitor-admin-desktop.png` and `visitor-admin-mobile.png`. They demonstrate the local implementation, not real visitor counts. Setup and operation: [visitor activity guide](visitor-activity.md).

Independent review is the final implementation gate; its result and any fixes will be recorded below before handoff.
