# Offline basketball event scorekeeper

Approved in conversation: English UI, original Chinese roster, a light colorful dashboard optimized for landscape iPad, responsive portrait and laptop support. Build approval: “let's built”.

## Behavior
Before a new game, enter date, opponent, quarter minutes and overtime minutes (default 5). Assign a unique game ID. Start/pause/resume a countdown; time may be corrected only while paused. Use wall-clock deadlines to avoid timer drift. Each stat button creates exactly one immutable event snapshot; misses count as events, player selection and clock controls do not. Our team events identify the selected player; opponent events are team-level with empty player fields. Permanent player IDs do not derive from jersey numbers. Preserve the existing default roster.

Store every event in gameEvents with: game_id,event_id,game_date,opponent,player_id,player_name,jersey_number,quarter,game_clock,event_type,points_value,recorded_at,team_side,is_voided. Event codes: 2PT_MADE,2PT_MISSED,3PT_MADE,3PT_MISSED,FT_MADE,FT_MISSED,OFF_REBOUND,DEF_REBOUND,ASSIST,STEAL,BLOCK,TURNOVER,FOUL. Quarter labels: 1,2,3,4,OT1,OT2 and onward. recorded_at is ISO 8601 UTC; game_date is a local calendar date. Away records use AWAY; our records HOME. Undo marks the latest active event void and never reuses IDs. Recompute live statistics from nonvoid events.

CSV includes a UTF-8 BOM, quoted/escaped text and CRLF records. One row per event including voids. CSV is the raw dataset; downstream calculations must exclude is_voided=true. Save current and completed games plus roster in localStorage. Surface storage failures. Provide JSON backup/restore for device transfer and recovery; keep original legacy localStorage untouched. Legacy aggregate data cannot be converted to truthful play-by-play events.

## Interface
Scoreboard, game clock and pause control above a roster / action panel / event feed layout. Green made buttons, amber missed, blue neutral, red turnovers/fouls. Show selected player prominently. Switch between our team and opponent actions. Offer a box score, roster management, setup, game history, CSV export and backup. New games archive previous games. End-game action pauses recording until reopened. All runtime resources inline in Front.html, no CDN, database, API or network requirement.

## Validation
Node tests for all event types, sequential IDs, voids, opponent attribution, metadata snapshots, stable IDs, clock correction/deadlines/periods, CSV escaping and state recovery. Browser smoke tests when a browser is available, including tablet landscape, portrait and laptop layout, single-click recording, export, refresh, and no network dependencies. Real iPad Safari touch behavior remains a device check.
