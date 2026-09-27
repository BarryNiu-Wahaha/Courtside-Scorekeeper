CREATE TABLE IF NOT EXISTS event_lineup_snapshots (
 game_id VARCHAR(128) NOT NULL, event_id INT NOT NULL,
 status ENUM('complete','partial','unknown') NOT NULL,
 PRIMARY KEY(game_id,event_id),
 FOREIGN KEY(game_id,event_id) REFERENCES events(game_id,event_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS event_lineup_members (
 game_id VARCHAR(128) NOT NULL, event_id INT NOT NULL,
 local_player_id VARCHAR(128) NOT NULL, player_id VARCHAR(128) NOT NULL,
 PRIMARY KEY(game_id,event_id,local_player_id),
 FOREIGN KEY(game_id,event_id) REFERENCES event_lineup_snapshots(game_id,event_id) ON DELETE CASCADE,
 FOREIGN KEY(player_id) REFERENCES players(player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
