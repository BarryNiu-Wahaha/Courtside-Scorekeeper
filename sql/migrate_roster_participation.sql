-- One-time upgrade for the original three-table installation.
-- Existing games, players and events are preserved. DDL commits statement by statement.
-- Prefer python -m scorekeeper_pipeline migrate-db for an idempotent, resumable upgrade.
USE scorekeeper;
ALTER TABLE players
    MODIFY last_seen_at DATETIME(6) NULL,
    ADD COLUMN enrollment_year SMALLINT NULL,
    ADD COLUMN status_override ENUM('Astudent','graduated') NULL,
    ADD COLUMN is_guest BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN roster_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS participation_snapshots (
    game_id VARCHAR(128) NOT NULL PRIMARY KEY,
    revision BIGINT NOT NULL,
    coverage ENUM('complete','partial') NOT NULL,
    content_hash CHAR(64) NOT NULL,
    FOREIGN KEY (game_id) REFERENCES games(game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS game_participation (
    game_id VARCHAR(128) NOT NULL,
    player_id VARCHAR(128) NOT NULL,
    player_name VARCHAR(100) NOT NULL,
    jersey_number SMALLINT NOT NULL,
    designated_count SMALLINT NOT NULL,
    starter_count SMALLINT NOT NULL,
    played_count SMALLINT NOT NULL,
    played_ms BIGINT NOT NULL,
    PRIMARY KEY (game_id,player_id),
    FOREIGN KEY (game_id) REFERENCES games(game_id),
    FOREIGN KEY (player_id) REFERENCES players(player_id),
    CHECK (jersey_number BETWEEN 0 AND 99),
    CHECK (designated_count BETWEEN 1 AND 15),
    CHECK (starter_count BETWEEN 0 AND designated_count),
    CHECK (played_count BETWEEN 0 AND designated_count),
    CHECK (played_ms >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

