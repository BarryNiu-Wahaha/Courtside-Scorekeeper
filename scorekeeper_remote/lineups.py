"""Historical on-court identities and derived plus-minus, independent of clock speed."""

from collections import Counter
from scorekeeper_pipeline.validation import ValidationError


def validate_lineups(value, events, participation):
    def require(ok):
        if not ok:
            raise ValidationError("Invalid event lineup metadata")

    require(
        isinstance(value, dict)
        and type(value.get("version")) is int
        and value["version"] == 1
        and isinstance(value.get("snapshots"), list)
    )
    event_ids = {event.event_id for event in events}
    seen_event_ids = set()
    identities = {player["player_id"]: player for player in participation}
    result = []
    official_ids_by_local_id = {}
    for snapshot in value["snapshots"]:
        require(isinstance(snapshot, dict))
        event_id = snapshot.get("event_id")
        status = snapshot.get("status")
        members = snapshot.get("members")
        require(
            type(event_id) is int
            and event_id in event_ids
            and event_id not in seen_event_ids
            and status in ("complete", "partial", "unknown")
            and isinstance(members, list)
        )
        require(
            len(members) <= 5
            and (status != "complete" or len(members) == 5)
            and (status != "unknown" or not members)
        )
        seen_event_ids.add(event_id)
        local_ids = set()
        counts = Counter()
        validated_members = []
        for member in members:
            require(isinstance(member, dict))
            local_player_id = member.get("local_player_id")
            player_id = member.get("player_id")
            require(
                isinstance(local_player_id, str)
                and 0 < len(local_player_id) <= 128
                and local_player_id not in local_ids
                and isinstance(player_id, str)
                and player_id in identities
            )
            require(player_id == "P_GUEST" or player_id == local_player_id)
            require(
                local_player_id not in official_ids_by_local_id
                or official_ids_by_local_id[local_player_id] == player_id
            )
            official_ids_by_local_id[local_player_id] = player_id
            local_ids.add(local_player_id)
            counts[player_id] += 1
            require(counts[player_id] <= identities[player_id]["designated_count"])
            validated_members.append(
                {"local_player_id": local_player_id, "player_id": player_id}
            )
        result.append(
            {"event_id": event_id, "status": status, "members": validated_members}
        )
    require(seen_event_ids == event_ids)
    require(
        sum(player_id == "P_GUEST" for player_id in official_ids_by_local_id.values())
        <= identities.get("P_GUEST", {}).get("designated_count", 0)
    )
    return {"version": 1, "snapshots": result}


def calculate_plus_minus(events, snapshots, participation):
    snapshots_by_event_id = {snapshot["event_id"]: snapshot for snapshot in snapshots}
    values = {player["player_id"]: 0 for player in participation}
    status = "complete"
    for event in events:
        if event.is_voided or not event.points_value:
            continue
        snapshot = snapshots_by_event_id.get(event.event_id)
        if not snapshot or snapshot["status"] != "complete":
            # Later partial coverage cannot repair an unknown scoring lineup.
            if snapshot and snapshot["status"] == "partial" and status != "unknown":
                status = "partial"
            else:
                status = "unknown"
            continue
        for member in snapshot["members"]:
            player_id = member["player_id"]
            if player_id in values and player_id != "P_GUEST":
                values[player_id] += event.points_value * (
                    1 if event.team_side == "HOME" else -1
                )
    return {
        player_id: {
            "value": (
                points if status == "complete" and player_id != "P_GUEST" else None
            ),
            "status": status if player_id != "P_GUEST" else "unknown",
        }
        for player_id, points in values.items()
    }
