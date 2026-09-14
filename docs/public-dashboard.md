# Public team dashboard

CourtSide now has a public dashboard, searchable player profiles and detailed game reports. Viewing requires no PIN. Uploads still use the shared scorekeeper PIN; corrections and roster management use the separate admin PIN.

## Finding statistics

The homepage opens on the current season, based on the viewer's local date:

| View | Included games |
| --- | --- |
| Spring 2026 | March 1–July 31, 2026 |
| Fall 2026 | August 1, 2026–February 28, 2027 |
| Calendar year 2026 | January 1–December 31, 2026 |
| Entire career | Every recorded year |

The period selector contains seasons and years represented in the published games plus the current season/year. February belongs to the previous Fall, including February 29 in leap years. Both official and friendly games are included by default. Historical games without a category appear with both categories selected and are labeled Unclassified; an admin can classify them later.

Changing period or category updates team summaries, leaders, charts, player averages and game results together. Player profiles also provide synchronized period/category selectors. Search matches names (including Chinese names) and jersey numbers. Select a player to see averages, totals, shooting splits, recorded minutes and a game log. Select a game to see both teams' statistics, efficiency estimates and the player box score.

The six equally prominent leader cards show points, rebounds, offensive rebounds, assists, steals and blocks. Switch between totals and per-game averages. Tied players share the card; GP is visible so a one-game average is not confused with a long season. No minimum-games qualification is applied in v1. Combined guests appear in statistics but do not receive individual leader cards.

## Recording and corrections

New-game setup now includes Official/Friendly (Friendly is the initial selection). At upload, check **Full statistics recorded for both teams** only if made/missed shots, free throws, rebounds and turnovers were recorded for both sides. This checkbox is optional; an incomplete game can still be uploaded. It controls whether possession-based estimates are displayed, not whether basic results are published.

For complete minute tracking, upload derives game duration from the sum of player milliseconds divided by five. It uses recorded running time, including overtime, rather than assuming every game lasted 40 minutes. Partial minute tracking leaves duration unknown. The admin editor can correct category, game duration and full-stat confirmation. Metadata changes are saved atomically with the correction and included in audit history.

Pending uploads retain their exact original payload, including metadata. Retries cannot silently reclassify a previously submitted game. Existing uploaded games remain locked for scorekeepers.

## Metric definitions

| Metric | Calculation |
| --- | --- |
| Player GP | Number of selected games with a recorded appearance; unused bench is excluded |
| Player averages | Selected total divided by GP, including zero-stat appearances |
| Guest group GP | Games with at least one guest appearance; multiple guests do not create multiple games |
| Team points per game | Selected team points divided by selected game count |
| FG%, 3PT%, FT% | Aggregate makes / aggregate attempts × 100 |
| eFG% | (FGM + 0.5 × 3PM) / FGA × 100 |
| TS% | Points / [2 × (FGA + 0.44 × FTA)] × 100 |
| Estimated possessions | Mean of both teams' (FGA − OREB + turnovers + 0.44 × FTA) |
| Estimated pace | Estimated possessions × 40 / recorded game minutes |
| Offensive rating | Points scored × 100 / estimated possessions |
| Defensive rating | Points allowed × 100 / estimated possessions |
| Net rating | Offensive rating − defensive rating |
| Team OREB% | OREB / (OREB + opponent DREB) × 100 |
| Team DREB% | DREB / (DREB + opponent OREB) × 100 |

Aggregate ratings divide summed points by summed possessions from eligible games; pace divides summed eligible possessions by summed eligible game minutes. They are not unweighted averages of individual game rates. Eligible game counts are visible. Ratings require both teams' detailed totals, positive possession estimates and explicit full-stat confirmation. Pace also requires duration. Basic summaries still include all selected games.

An em dash means unavailable or no denominator. Missing opponent detail on an old snapshot is never turned into zero. If any selected game lacks opponent detail, whole-period opponent box-score averages are unavailable; the scores themselves remain available. Partial player-minute subtotals are marked `*`; a DNP entry cannot make an unknown appearance's minutes appear to be zero.

These are recorded box-score measures, not a complete evaluation of defense. No individual defensive rating, plus/minus, or overall defender award is inferred. Reference definitions: [Basketball Reference glossary](https://www.basketball-reference.com/about/glossary.html) and [Four Factors](https://www.basketball-reference.com/about/factors.html). CourtSide's displayed possession formula is a simple estimate; its pace uses 40 minutes rather than the NBA's 48-minute convention.

## Data compatibility and deployment

CSV headers and `schema_version: 1` remain unchanged. Uploads optionally add:

```json
"game_details": {
  "category": "official",
  "duration_ms": 2400000,
  "stats_complete": true
}
```

Category and duration can be null; completeness defaults false. Missing metadata remains absent during legacy upload normalization, preserving original retry hashes. The additive `remote_game_details` table stores metadata by game ID. Public JSON adds category, duration, completeness and allowlisted `home_stats`/`away_stats`. No PIN, session, private audit, raw upload or individual guest name is published.

Before using this version against an existing hosted database, run the existing migration command from the configured server environment:

```powershell
python -m scorekeeper_remote migrate
```

Then deploy the updated backend and publish the latest statistics through Admin. Publishing bundles the new dashboard assets and the current database snapshot. Do not replace a production statistics snapshot with an empty or sample preview file. This development task does not deploy to Render or Cloudflare or modify the hosted database.

Build a local static artifact with an existing public snapshot:

```powershell
node scripts/build-site.cjs --output .local/dashboard-build --api-base https://courtside-api-hrhm.onrender.com --snapshot path/to/current-stats.json
```

Omitting `--snapshot` creates an empty initial site. The public page fetches `data/stats.json`, so serve the artifact over HTTP instead of opening its HTML using `file://`:

```powershell
python -m http.server 8765 --bind 127.0.0.1 --directory .local/dashboard-build
```

## Verification

```powershell
node --test tests/engine.test.cjs tests/team.test.cjs tests/remote.test.cjs tests/analytics.test.cjs
python -m unittest discover -s tests -p 'test_*.py'
python tests/run_mysql_tests.py
node build.cjs
python -m scorekeeper_remote.publishing --output tests/artifacts/dashboard-site --api-base https://api.example
python -m scorekeeper_remote.publishing --output tests/artifacts/remote-site --api-base https://api.example
node tests/browser-dashboard.cjs
node tests/browser-remote.cjs
node tests/browser-smoke.cjs
```

Browser tests use installed Edge, temporary profiles and controlled local fixture data. `tests/dashboard-fixture.cjs` is synthetic test data only; it is not included in published assets. Screenshots are saved under `tests/artifacts/`. The isolated MySQL runner creates its own temporary server and never uses the user's ordinary database.
