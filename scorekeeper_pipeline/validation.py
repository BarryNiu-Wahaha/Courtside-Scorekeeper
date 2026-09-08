"""Validate a whole CSV before any database connection or mutation."""
from dataclasses import dataclass
from datetime import date, datetime, timezone
import csv
import io
from pathlib import Path
import re

COLUMNS = ('game_id','event_id','game_date','opponent','player_id','player_name','jersey_number','quarter','game_clock','event_type','points_value','recorded_at','team_side','is_voided')
POINTS = {'2PT_MADE':2,'2PT_MISSED':0,'3PT_MADE':3,'3PT_MISSED':0,'FT_MADE':1,'FT_MISSED':0,'OFF_REBOUND':0,'DEF_REBOUND':0,'ASSIST':0,'STEAL':0,'BLOCK':0,'TURNOVER':0,'FOUL':0}

class ValidationError(ValueError):
    """An input file is invalid and must not be imported."""

@dataclass(frozen=True)
class Event:
    game_id: str
    event_id: int
    game_date: date
    opponent: str
    player_id: str | None
    player_name: str | None
    jersey_number: int | None
    quarter: str
    game_clock: str
    event_type: str
    points_value: int
    recorded_at: datetime  # UTC, naive for MySQL DATETIME(6)
    team_side: str
    is_voided: bool
    source_line: int

@dataclass(frozen=True)
class Batch:
    events: tuple[Event, ...]
    normalized_fields: int = 0

def _require(condition, message):
    if not condition:
        raise ValueError(message)

def _integer(value, field, low, high):
    _require(bool(re.fullmatch(r'[0-9]+',value)), f'{field} must be a whole integer')
    number=int(value)
    _require(low<=number<=high, f'{field} must be between {low} and {high}')
    return number

def _text(value, field, maximum):
    _require(0<len(value)<=maximum, f'{field} must contain 1–{maximum} characters')
    _require(not any(ord(c)<32 and c not in '\n\r\t' for c in value), f'{field} contains a control character')
    return value

def _event(row, line):
    _require(bool(re.fullmatch(r'G[A-Za-z0-9_-]{1,127}',row['game_id'])), 'game_id must start with G and contain only letters, digits, _ or - (maximum 128 characters)')
    event_id=_integer(row['event_id'],'event_id',1,2147483647)
    _require(bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['game_date'])), 'game_date must use YYYY-MM-DD')
    try: game_date=date.fromisoformat(row['game_date'])
    except ValueError: raise ValueError('game_date is not a valid calendar date') from None
    _require(game_date.year>=1000,'game_date must be in year 1000 or later')
    opponent=_text(row['opponent'],'opponent',100)
    _require(row['team_side'] in ('HOME','AWAY'),'team_side must be HOME or AWAY')
    if row['team_side']=='HOME':
        _require(bool(re.fullmatch(r'P[A-Za-z0-9_-]{1,127}',row['player_id'])), 'HOME player_id must start with P and use letters, digits, _ or - (maximum 128 characters)')
        player_id=row['player_id'];player_name=_text(row['player_name'],'player_name',100)
        jersey=_integer(row['jersey_number'],'jersey_number',0,99)
        if player_id=='P_GUEST':
            _require(player_name=='Guest Player' and jersey==0,'Guest identity must be anonymous: Guest Player, jersey 0')
    else:
        _require(not any(row[f] for f in ('player_id','player_name','jersey_number')), 'AWAY player_id, player_name and jersey_number must all be empty')
        player_id=player_name=jersey=None
    _require(bool(re.fullmatch(r'(?:[1-4]|OT[1-9][0-9]{0,7})',row['quarter'])), 'quarter must be 1–4 or OT1, OT2, etc.')
    _require(bool(re.fullmatch(r'[0-9]{2}:[0-5][0-9]',row['game_clock'])), 'game_clock must use MM:SS with seconds 00–59')
    _require(row['event_type'] in POINTS,'event_type is not a supported standardized code')
    points=_integer(row['points_value'],'points_value',0,3)
    _require(points==POINTS[row['event_type']],f"points_value must be {POINTS[row['event_type']]} for {row['event_type']}")
    _require(bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-](?:[01][0-9]|2[0-3]):[0-5][0-9])',row['recorded_at'])), 'recorded_at must be ISO 8601 with Z or a valid explicit timezone offset')
    try:
        timestamp=datetime.fromisoformat(row['recorded_at']).astimezone(timezone.utc).replace(tzinfo=None)
    except (ValueError,OverflowError): raise ValueError('recorded_at is not a valid timestamp') from None
    _require(timestamp.year>=1000,'recorded_at UTC year must be 1000 or later')
    _require(row['is_voided'] in ('true','false'),'is_voided must be true or false')
    return Event(row['game_id'],event_id,game_date,opponent,player_id,player_name,jersey,row['quarter'],row['game_clock'],row['event_type'],points,timestamp,row['team_side'],row['is_voided']=='true',line)

def read_csv(path: str | Path) -> Batch:
    """Read one game export, collect validation errors, and return a typed batch."""
    path=Path(path)
    if path.stat().st_size>20*1024*1024:
        raise ValidationError('File exceeds the 20 MB limit for a single game.')
    try: content=path.read_bytes().decode('utf-8-sig')
    except UnicodeDecodeError: raise ValidationError('File must be UTF-8. Export it again from the scorekeeper.') from None
    reader=csv.reader(io.StringIO(content,newline=''),strict=True)
    errors=[];events=[];seen=set();metadata=None;normalized=0
    try:
        headers=next(reader,[])
        if len(headers)!=len(COLUMNS) or set(headers)!=set(COLUMNS):
            raise ValidationError('CSV line 1: expected each of the 14 event-log column names exactly once; missing, duplicate or unexpected headers found.')
        while True:
            line=reader.line_num+1
            try: values=next(reader)
            except StopIteration: break
            if len(values)!=len(headers):
                errors.append(f'CSV line {line}: expected 14 fields, found {len(values)}');continue
            row={name:value.strip() for name,value in zip(headers,values)}
            normalized+=sum(row[name]!=value for name,value in zip(headers,values))
            try:
                event=_event(row,line)
                _require(event.event_id not in seen, f'duplicate event_id {event.event_id} within this file')
                identity=(event.game_id,event.game_date,event.opponent)
                _require(metadata is None or identity==metadata,'all rows must have the same game_id, game_date and opponent')
                metadata=identity;seen.add(event.event_id);events.append(event)
            except ValueError as error: errors.append(f'CSV line {line}: {error}')
    except csv.Error as error:
        errors.append(f'CSV line {reader.line_num}: malformed CSV ({error})')
    if not events and not errors: errors.append('CSV contains no events; an empty export has no game metadata to import.')
    if errors: raise ValidationError('Entire file rejected:\n'+'\n'.join(errors))
    return Batch(tuple(sorted(events,key=lambda e:e.event_id)),normalized)
