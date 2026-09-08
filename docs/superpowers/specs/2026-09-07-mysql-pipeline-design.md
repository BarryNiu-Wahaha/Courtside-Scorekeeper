# CSV to MySQL pipeline

Approved in conversation: MySQL on localhost:3306, conda msba, database scorekeeper; reject the whole CSV on any invalid row; repeat imports deduplicate by game_id + event_id and update void flags. User approved proceeding.

## Scope and contract
Implement a local command-line importer, database initialization, and example SQL queries. No API or frontend changes. The input is one game's complete event CSV, using the exact 14 existing headers in any order, UTF-8 with optional BOM. Reject empty exports because they contain no game metadata. Preserve names and event snapshots; trim surrounding whitespace with a reported normalization count. Validate identifiers, integers, dates, known codes, point values, HOME player attribution and empty AWAY identity, boolean void flags, quarter labels, clock format, and timezone-aware recorded_at. Convert timestamps to UTC for MySQL DATETIME(6).

## Import rules
Read and validate the entire file before connecting. Within one InnoDB transaction, lock the game row and compare existing game/event metadata. Immutable conflicts reject the entire import, including any new events in that file. Reimports append new IDs, update false-to-true void flags, and leave unchanged rows alone. An older export must not reactivate a voided event or remove events omitted by that older file. Sort player writes by permanent ID. Preserve player name/jersey snapshots in events, and maintain the most recently observed display details separately in players.

## Database
Use utf8mb4 for Chinese names and case-sensitive utf8mb4_bin identifiers. Tables: games (identity/date/opponent); players (permanent identity/latest observed display metadata); events (composite game/event key and stat snapshots). Use foreign keys and checks. Provide active-event, game-score and player-stat queries. Do not label games-with-events as appearances: the CSV does not record appearances/minutes.

## Operations
Commands: validate CSV (no database), init-db (create database/tables without dropping existing objects), import CSV, summary game ID. Host/port/user/database configurable via command flags or MYSQL_* environment variables; password from MYSQL_PASSWORD or a local hidden prompt, never CLI arguments or committed files. Reject invalid input with physical CSV line numbers; nonzero exit on failure. Default credentials are not stored. Actual database setup requires local authentication.

## Verification
Built-in unittest validation tests, real MySQL transaction tests in a dedicated temporary local test server if executable available. Never put synthetic test games in the user's scorekeeper database. Verify actual frontend exports and repeat/corrected imports, immutable conflict rollback, Chinese names, timezone conversion and invalid file no-connect behavior.
