# Reading and changing CourtSide

CourtSide has three entry points: the offline recorder, the public dashboard, and the authenticated Python API. The project uses plain JavaScript and Python; you do not need to learn a frontend framework to follow it.

## Start here

| If you want to understand… | Read these files in order |
| --- | --- |
| Recording a play | `src/template.html`, `src/app.js`, `src/engine.js` |
| Squad selection and playing time | `src/team.js`, then its callers in `src/app.js` |
| Correcting a play | `src/corrections.js`, then `correctEvents` in `src/engine.js` |
| Exporting results | `src/player-analytics.js`, `src/result-export.js` |
| Uploading a finished game | `src/remote.js`, `scorekeeper_remote/app.py`, `scorekeeper_remote/bundles.py`, `scorekeeper_remote/repository.py` |
| Public statistics | `scorekeeper_remote/statistics.py`, `site/analytics.js`, `site/public.js` |
| Admin actions | `site/admin.js`, then the matching route in `scorekeeper_remote/app.py` |
| Importing CSV files locally | `scorekeeper_pipeline/__main__.py`, `validation.py`, `roster.py`, `database.py` |

## Follow one action

When a scorekeeper presses a stat button, `src/app.js` handles the click. It calls the game engine to validate and record the event, saves the workspace in local storage, and renders the updated score. The engine works with JavaScript objects and can be tested without opening a browser.

When a finished game is uploaded, `src/remote.js` prepares a payload containing events, participation, and historical lineups. The API validates that payload before the repository saves it. Publication is a separate step: a failed publication does not undo a successful database save.

The public dashboard reads a published JSON snapshot. `site/analytics.js` computes filtered totals; `site/public.js` displays them. Rendering code and calculation code therefore have separate responsibilities.

## Names and data

- `game.gameEvents` contains the event history. A voided event stays in that history but does not count toward statistics.
- A **roster** is the list of known players, a **squad** is the group selected for a game, and a **lineup** is the five players currently on court.
- **Participation** records whether a player appeared and how long they played. A player can appear without recording a stat.
- `fgm`/`fga` mean field goals made/attempted; `ftm`/`fta` mean free throws made/attempted.
- `null` means a metric is unavailable. Do not replace it with zero: missing information and a measured zero are different.
- `game.finalizedAt` locks a game's results after export. `game.remote` also locks edits while an upload is pending or accepted.
- Historical lineup snapshots let plus/minus use the players who were on court when each score occurred.

The browser scripts expose names such as `ScoreEngine`, `TeamEngine`, and `CourtSideAnalytics`. Their small module wrappers also export the same functions to Node tests. Keep those wrappers and public names when changing internals.

## Edit the source, then build

`Front.html` is generated. Change `src/` and rebuild it:

```sh
node build.cjs
```

The build puts the template, styles, and scripts into one file so the recorder works offline. Public dashboard files live under `site/`; its layout and styling are in the HTML and CSS files there.

Build a local site without deploying:

```sh
node scripts/build-site.cjs --output tests/artifacts/local-site --api-base https://api.example
```

## Check a change

```sh
node --test tests/*.test.cjs
python -m unittest discover -s tests -p "test_*.py"
node build.cjs
node tests/browser-smoke.cjs
node tests/browser-recording-improvements.cjs
```

The browser scripts use installed Microsoft Edge, or Chromium at `EDGE_PATH`. Database tests need an installed MySQL server binary; `python tests/run_mysql_tests.py` starts an isolated temporary database. See the [README testing section](../README.md#testing-and-verification) for the rest of the checks.

Prefer one clear operation per line, descriptive local names, and early returns for rejected inputs. Keep comments that explain why a rule exists. Preserve exported names, database fields, CSV column order, error messages, and save/download ordering when simplifying code.
