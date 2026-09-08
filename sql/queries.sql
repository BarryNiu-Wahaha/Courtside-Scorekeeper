USE scorekeeper;

-- All imported games and active score. Voided events never contribute points.
SELECT g.game_id, g.game_date, g.opponent,
       COALESCE(SUM(CASE WHEN e.team_side = 'HOME' AND NOT e.is_voided THEN e.points_value ELSE 0 END), 0) AS our_points,
       COALESCE(SUM(CASE WHEN e.team_side = 'AWAY' AND NOT e.is_voided THEN e.points_value ELSE 0 END), 0) AS opponent_points
FROM games g LEFT JOIN events e ON e.game_id = g.game_id
GROUP BY g.game_id, g.game_date, g.opponent
ORDER BY g.game_date DESC, g.game_id;

-- One player's totals. Change this ID to the player's permanent ID from your CSV.
SET @player_id = 'P_DEFAULT_001';
SELECT p.player_id, p.player_name, p.jersey_number,
       COUNT(DISTINCT e.game_id) AS games_with_recorded_events,
       COALESCE(SUM(e.points_value), 0) AS points,
       COALESCE(SUM(e.event_type IN ('OFF_REBOUND','DEF_REBOUND')), 0) AS rebounds,
       COALESCE(SUM(e.event_type = 'ASSIST'), 0) AS assists,
       COALESCE(SUM(e.event_type = 'STEAL'), 0) AS steals,
       COALESCE(SUM(e.event_type = 'BLOCK'), 0) AS blocks,
       COALESCE(SUM(e.event_type = 'TURNOVER'), 0) AS turnovers,
       COALESCE(SUM(e.event_type = 'FOUL'), 0) AS fouls,
       ROUND(100.0 * SUM(e.event_type IN ('2PT_MADE','3PT_MADE')) /
             NULLIF(SUM(e.event_type IN ('2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED')), 0), 1) AS field_goal_pct,
       ROUND(100.0 * SUM(e.event_type = '3PT_MADE') /
             NULLIF(SUM(e.event_type IN ('3PT_MADE','3PT_MISSED')), 0), 1) AS three_point_pct,
       ROUND(100.0 * SUM(e.event_type = 'FT_MADE') /
             NULLIF(SUM(e.event_type IN ('FT_MADE','FT_MISSED')), 0), 1) AS free_throw_pct
FROM players p
LEFT JOIN events e ON e.player_id = p.player_id AND e.team_side = 'HOME' AND NOT e.is_voided
WHERE p.player_id = @player_id
GROUP BY p.player_id, p.player_name, p.jersey_number;

-- Player history per game. Names/numbers in events are snapshots; players holds latest observed display details.
SELECT g.game_id, g.game_date, g.opponent,
       SUM(e.points_value) AS points,
       SUM(e.event_type IN ('OFF_REBOUND','DEF_REBOUND')) AS rebounds,
       SUM(e.event_type = 'ASSIST') AS assists
FROM events e JOIN games g ON g.game_id = e.game_id
WHERE e.player_id = @player_id AND e.team_side = 'HOME' AND NOT e.is_voided
GROUP BY g.game_id, g.game_date, g.opponent
ORDER BY g.game_date DESC, g.game_id;

-- Full event log reconstructed in export-column order (including voided rows).
SELECT e.game_id, e.event_id, g.game_date, g.opponent,
       e.player_id, e.player_name, e.jersey_number, e.quarter, e.game_clock,
       e.event_type, e.points_value, e.recorded_at, e.team_side, e.is_voided
FROM events e JOIN games g ON g.game_id = e.game_id
ORDER BY g.game_date, e.game_id, e.event_id;
