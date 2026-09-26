# CourtSide light UI preview

Implemented the approved light, navy/blue dashboard and recorder refresh. Phone dashboard views separate Overview, Players, and Games; latest game leads the overview. The phone player table keeps name, GP, PPG, RPG, and APG visible, with full statistics in the player dialog. Desktop retains dense tables and compact summary placement. Advanced charts remain available in a disclosure.

Recorder control positions and immediate recording remain intact. Selected players have stronger visual feedback, successful plays receive a nonblocking confirmation, and pointer scoring has a brief animation. Keyboard and reduced-motion users do not receive score animation.

Validation completed:

- 57 JavaScript engine, team, remote, and analytics tests.
- 4 publishing tests.
- Dashboard Edge checks, including phone view navigation, Back/Forward, filters, compact tables, profiles, reduced motion, and responsive layouts.
- Recorder Edge smoke checks, including rapid entry, keyboard entry, reduced motion, exports, and five responsive sizes.
- Remote Edge smoke checks for uploads, Admin, roster refresh, history preservation, and offline fallback.
- Independent dashboard and recorder code reviews; dashboard history finding fixed and regression tested.

Local sample-data preview artifacts are ignored under `tests/artifacts/apple-preview`; helper scripts and server metadata are ignored under `.local`. The preview has no configured backend. The preview launcher offers phone dashboard, desktop dashboard, and iPad recorder sizes. Real iPad Safari touch behavior still needs a hardware check.

No deployment or push was performed for this redesign.
