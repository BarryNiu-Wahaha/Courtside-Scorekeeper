# Scorekeeper Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver a standalone offline basketball scorekeeper with full event CSV exports.

**Architecture:** A dependency-free event engine owns game state and computes statistics. A browser controller renders a responsive interface. A Node build script bundles sources into the distributable Front.html.

**Tech Stack:** HTML, CSS, plain JavaScript, Node built-in test runner.

**Spec:** docs/superpowers/specs/2026-09-07-scorekeeper-design.md

## Global Constraints
- English UI; preserve Chinese roster names.
- No network runtime dependencies; open Front.html offline.
- One event per valid stat click, all 12 requested fields plus team_side and is_voided.
- Permanent player IDs, nonreused event IDs, voids excluded from statistics.
- Landscape iPad first, portrait and laptop responsive.

## Tasks
- [x] 1. Event engine: create tests/engine.test.cjs before src/engine.js. Run `node --test tests/engine.test.cjs` to see missing event engine fail; implement createGame, recordEvent, undo, stats, CSV and clock operations. Check hand-derived totals and escaped exports; rerun tests.
- [x] 2. Offline interface: create src/template.html, src/styles.css, src/app.js, src/roster.js and build.cjs. Build with `node build.cjs`. Game setup creates a game; action handlers call recordEvent exactly once; rendering reads stats. Serialize full state after changes, retain archived games and show save errors. JSON restore validates schema before replacing saved data. Back up original HTML before replacement.
- [x] 3. Validate browser workflows and responsive layout. Test create/start/pause/correct/record/void/export/reload/new-game/archive with a real browser where available. Inspect screenshots at 1194x834 and 834x1194. Fix any observed failures and rerun affected checks.
- [x] 4. Document opening the HTML, configuration, CSV schema, void handling, storage limits and rebuilding in README.md. Run `node --test tests/engine.test.cjs`, syntax checks and build. Review final requirement coverage.

## Interfaces
Engine exported as ScoreEngine in the browser and CommonJS in Node. createGame(config, roster) returns a serializable game; recordEvent(game, type, player, side, now) appends and returns one event; undo(game) voids last active event; stats(game, side, playerId) returns totals; csv(game) returns BOM-prefixed text. Clock functions take explicit milliseconds for deterministic tests. Browser state shape: {version:2, roster:[], games:[], currentGameId:string|null}.


