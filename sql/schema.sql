-- Run in Workbench, or use: python -m scorekeeper_pipeline init-db
-- These statements create objects if absent and never drop existing data.
CREATE DATABASE IF NOT EXISTS `scorekeeper` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin;
USE `scorekeeper`;

CREATE TABLE IF NOT EXISTS games (
    game_id VARCHAR(128) NOT NULL PRIMARY KEY,
    game_date DATE NOT NULL,
    opponent VARCHAR(100) NOT NULL,
    INDEX idx_game_date (game_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS players (
    player_id VARCHAR(128) NOT NULL PRIMARY KEY,
    player_name VARCHAR(100) NOT NULL,
    jersey_number SMALLINT NOT NULL,
    last_seen_at DATETIME(6) NULL,
    enrollment_year SMALLINT NULL,
    status_override ENUM('Astudent','graduated') NULL,
    is_guest BOOLEAN NOT NULL DEFAULT FALSE,
    roster_managed BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_player_jersey CHECK (jersey_number BETWEEN 0 AND 99)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

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

CREATE TABLE IF NOT EXISTS events (
    game_id VARCHAR(128) NOT NULL,
    event_id INT NOT NULL,
    player_id VARCHAR(128) NULL,
    player_name VARCHAR(100) NULL,
    jersey_number SMALLINT NULL,
    quarter VARCHAR(16) NOT NULL,
    game_clock CHAR(5) NOT NULL,
    event_type VARCHAR(16) NOT NULL,
    points_value SMALLINT NOT NULL,
    recorded_at DATETIME(6) NOT NULL COMMENT 'UTC recording timestamp',
    team_side VARCHAR(4) NOT NULL,
    is_voided BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (game_id, event_id),
    CONSTRAINT fk_event_game FOREIGN KEY (game_id) REFERENCES games(game_id),
    CONSTRAINT fk_event_player FOREIGN KEY (player_id) REFERENCES players(player_id),
    CONSTRAINT chk_event_id CHECK (event_id > 0),
    CONSTRAINT chk_void CHECK (is_voided IN (0,1)),
    CONSTRAINT chk_attribution CHECK (
        (team_side = 'HOME' AND player_id IS NOT NULL AND player_name IS NOT NULL AND jersey_number IS NOT NULL AND jersey_number BETWEEN 0 AND 99)
        OR (team_side = 'AWAY' AND player_id IS NULL AND player_name IS NULL AND jersey_number IS NULL)
    ),
    CONSTRAINT chk_event_points CHECK (
        (event_type = '2PT_MADE' AND points_value = 2)
        OR (event_type = '3PT_MADE' AND points_value = 3)
        OR (event_type = 'FT_MADE' AND points_value = 1)
        OR (event_type IN ('2PT_MISSED','3PT_MISSED','FT_MISSED','OFF_REBOUND','DEF_REBOUND','ASSIST','STEAL','BLOCK','TURNOVER','FOUL') AND points_value = 0)
    ),
    INDEX idx_player_game (player_id, game_id),
    INDEX idx_game_active_side (game_id, is_voided, team_side)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
