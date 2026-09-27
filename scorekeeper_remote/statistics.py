from datetime import datetime, timezone
from scorekeeper_pipeline.validation import POINTS
from .lineups import calculate_plus_minus

STAT_KEYS = (
    "points",
    "fgm",
    "fga",
    "threeMade",
    "threeAttempts",
    "ftm",
    "fta",
    "offensive",
    "defensive",
    "rebounds",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "fouls",
)


def add_event(s, e):
    t = e.event_type
    s["points"] += e.points_value
    if t in ("2PT_MADE", "3PT_MADE"):
        s["fgm"] += 1
    if t.startswith(("2PT_", "3PT_")):
        s["fga"] += 1
    if t == "3PT_MADE":
        s["threeMade"] += 1
    if t.startswith("3PT_"):
        s["threeAttempts"] += 1
    if t == "FT_MADE":
        s["ftm"] += 1
    if t.startswith("FT_"):
        s["fta"] += 1
    mapping = {
        "OFF_REBOUND": "offensive",
        "DEF_REBOUND": "defensive",
        "ASSIST": "assists",
        "STEAL": "steals",
        "BLOCK": "blocks",
        "TURNOVER": "turnovers",
        "FOUL": "fouls",
    }
    if t in mapping:
        s[mapping[t]] += 1
    s["rebounds"] = s["offensive"] + s["defensive"]


def build_snapshot(revision, roster, games):
    public_games = []
    for game in games:
        if game.get("deleted"):
            continue
        totals = {}
        for player in game["participation"]:
            totals[player["player_id"]] = {
                "player_id": player["player_id"],
                "player_name": (
                    "Guest Player"
                    if player["player_id"] == "P_GUEST"
                    else player["player_name"]
                ),
                "jersey_number": player["jersey_number"],
                "played_ms": player["played_ms"],
                "played_count": player["played_count"],
                "starter_count": player["starter_count"],
                "designated_count": player["designated_count"],
                "stats": dict.fromkeys(STAT_KEYS, 0),
            }
        home_stats = dict.fromkeys(STAT_KEYS, 0)
        away_stats = dict.fromkeys(STAT_KEYS, 0)
        for event in game["events"]:
            if event.is_voided:
                continue
            add_event(home_stats if event.team_side == "HOME" else away_stats, event)
            if event.team_side == "HOME" and event.player_id in totals:
                add_event(totals[event.player_id]["stats"], event)
        lineups = game.get("lineups") or game.get("upload", {}).get("lineups") or {}
        plus_minus = calculate_plus_minus(
            game["events"], lineups.get("snapshots", []), game["participation"]
        )
        for player_id, player_totals in totals.items():
            player_totals.update(
                plus_minus=plus_minus[player_id]["value"],
                plus_minus_status=plus_minus[player_id]["status"],
            )
        details = (
            game.get("upload", {}).get("game_details") or game.get("game_details") or {}
        )
        public_games.append(
            {
                "game_id": game["game_id"],
                "game_date": game["game_date"].isoformat(),
                "opponent": game["opponent"],
                "home_points": home_stats["points"],
                "away_points": away_stats["points"],
                "coverage": game["coverage"],
                "players": list(totals.values()),
                "home_stats": home_stats,
                "away_stats": away_stats,
                "category": details.get("category"),
                "duration_ms": details.get("duration_ms"),
                "stats_complete": details.get("stats_complete") is True,
            }
        )
    public_roster = [
        {
            field: player.get(field)
            for field in (
                "player_id",
                "player_name",
                "jersey_number",
                "enrollment_year",
                "status_override",
            )
        }
        for player in roster
        if player["player_id"] != "P_GUEST"
    ]
    return {
        "schema_version": 1,
        "revision": revision,
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "roster": public_roster,
        "games": public_games,
    }
