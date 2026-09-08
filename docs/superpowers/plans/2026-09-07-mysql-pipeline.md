# MySQL Pipeline Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline execution.

**Goal:** Import the scorekeeper CSV into MySQL atomically and query game/player stats.

**Architecture:** A pure CSV validator produces immutable typed events. A PyMySQL repository performs schema setup and transactional imports. A CLI exposes validate, init-db, import and summary.

**Tech Stack:** Python 3.12 in conda msba, Python unittest/csv/dataclasses, installed PyMySQL, MySQL 9.7.

**Spec:** docs/superpowers/specs/2026-09-07-mysql-pipeline-design.md

## Global constraints
- Reject the entire file on any invalid row before opening a connection.
- Deduplicate on (game_id,event_id); apply void corrections atomically.
- Preserve Chinese names and permanent player IDs.
- Do not expose passwords or write synthetic data into the user's database.

## Tasks
- [x] Validator: write tests/test_pipeline.py with hand-authored CSV fixtures and invalid variants. Run `conda run -n msba python -m unittest discover -s tests -p test_pipeline.py`; implement scorekeeper_pipeline/validation.py; rerun.
- [x] Database: write sql/schema.sql and scorekeeper_pipeline/database.py using parameterized PyMySQL statements, game-row locking and rollback on conflicts. Add tests/test_mysql_integration.py using an explicit test-only database. Verify against an isolated MySQL process, never production data.
- [x] CLI: implement scorekeeper_pipeline/__main__.py with validate/init-db/import/summary, hidden password input and clear error exit codes. Test validate rejects before database access and accepts generated frontend exports.
- [ ] Document runnable conda commands, schema/query meanings, reimport behavior and credentials in docs/mysql-pipeline.md and sql/queries.sql. Initialize the user's scorekeeper database only with available authorized local credentials; report any authentication requirement accurately.

Documentation and all 21 backend checks are complete. Actual localhost:3306 database initialization is pending the user entering their password locally; the runnable init-db command has been provided.
