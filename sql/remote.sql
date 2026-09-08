CREATE TABLE IF NOT EXISTS remote_uploads (
 game_id VARCHAR(128) PRIMARY KEY, version BIGINT NOT NULL DEFAULT 1, original_hash CHAR(64) NOT NULL,
 deleted BOOLEAN NOT NULL DEFAULT FALSE, schema_version SMALLINT NOT NULL, finished BOOLEAN NOT NULL,
 events_csv MEDIUMTEXT NOT NULL, participation_csv MEDIUMTEXT NOT NULL,
 FOREIGN KEY (game_id) REFERENCES games(game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS remote_audit (
 audit_id BIGINT AUTO_INCREMENT PRIMARY KEY, game_id VARCHAR(128) NOT NULL, prior_version BIGINT NOT NULL,
 action VARCHAR(16) NOT NULL, prior_document JSON NOT NULL, changed_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
 INDEX (game_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS remote_publication (
 singleton TINYINT PRIMARY KEY, revision BIGINT NOT NULL DEFAULT 0, published_revision BIGINT NOT NULL DEFAULT 0,
 state ENUM('pending','published') NOT NULL DEFAULT 'pending', last_error VARCHAR(500) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
INSERT INTO remote_publication(singleton) VALUES(1) ON DUPLICATE KEY UPDATE singleton=singleton;
