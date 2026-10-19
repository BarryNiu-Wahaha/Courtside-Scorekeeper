"""Strict, small contracts for optional anonymous activity collection."""
import re
from datetime import datetime, timedelta, timezone
from uuid import UUID
from scorekeeper_pipeline.validation import ValidationError

RETENTION = timedelta(days=90)
FIELDS = {'event_id', 'visitor_id', 'session_id', 'event', 'page', 'properties', 'occurred_at', 'device', 'browser'}

def invalid():
    raise ValidationError('Invalid visitor activity request')

def identifier(value):
    try:
        if not isinstance(value, str) or str(UUID(value)) != value: invalid()
    except (ValueError, AttributeError): invalid()
    return value

def timestamp(value):
    try:
        if not isinstance(value, str) or len(value) > 40: invalid()
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None: invalid()
        return result.astimezone(timezone.utc)
    except (ValueError, OverflowError): invalid()

def properties(name, value):
    if not isinstance(value, dict): invalid()
    expected = {'page_view': set(), 'view_change': {'view'}, 'player_open': {'player_id'},
                'game_open': {'game_id'}, 'filter_change': {'control', 'value'},
                'download': {'kind'}, 'engagement': {'active_ms'}}
    if name not in expected or set(value) != expected[name]: invalid()
    if name == 'view_change' and value['view'] not in ('overview', 'players', 'games'): invalid()
    if name in ('player_open', 'game_open'):
        key = 'player_id' if name == 'player_open' else 'game_id'
        if not isinstance(value[key], str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', value[key]): invalid()
    if name == 'download' and value['kind'] not in ('events','participation','player_statistics','backup','roster'): invalid()
    if name == 'engagement' and (type(value['active_ms']) is not int or not 0 <= value['active_ms'] <= 15000): invalid()
    if name == 'filter_change':
        control, selection = value['control'], value['value']
        if not isinstance(selection, str): invalid()
        if control == 'category':
            if selection not in ('all','official','friendly'): invalid()
        elif control == 'period':
            if not re.fullmatch(r'(career|year:20\d{2}|season:20\d{2}:(spring|fall))', selection): invalid()
        else: invalid()
    return dict(value)

def validate_batch(payload, now):
    if not isinstance(payload, dict) or set(payload) != {'events'}: invalid()
    rows = payload['events']
    if not isinstance(rows, list) or not 1 <= len(rows) <= 20: invalid()
    output = []
    for row in rows:
        if not isinstance(row, dict) or set(row) != FIELDS: invalid()
        for key in ('event_id', 'visitor_id', 'session_id'): identifier(row[key])
        if row['page'] not in ('dashboard','scorekeeper'): invalid()
        if row['device'] not in ('mobile','tablet','desktop','unknown'): invalid()
        if row['browser'] not in ('chrome','edge','firefox','safari','other'): invalid()
        occurred = timestamp(row['occurred_at'])
        if not now-timedelta(hours=24) <= occurred <= now+timedelta(minutes=5): invalid()
        # Only public dashboard entity/filter actions are supported.
        if row['event'] in ('player_open','game_open','filter_change','view_change') and row['page'] != 'dashboard': invalid()
        if row['event'] == 'download' and row['page'] != 'scorekeeper': invalid()
        output.append({**row, 'properties': properties(row['event'], row['properties']),
                       'occurred_at': occurred, 'received_at': now})
    return output

def validate_report_range(args, now):
    end = timestamp(args['end']) if args.get('end') else now
    start = timestamp(args['start']) if args.get('start') else end-timedelta(days=7)
    if end <= start or end-start > RETENTION or end > now+timedelta(days=1): invalid()
    return max(start, now-RETENTION), end
