"""Separate, fully validated roster and game participation CSV contracts."""
import csv
from datetime import date
from pathlib import Path
import re
from .validation import ValidationError, _require, _integer, _text

ROSTER_COLUMNS=('player_id','player_name','jersey_number','enrollment_year','status_override')
PARTICIPATION_COLUMNS=('game_id','game_date','opponent','revision','coverage','player_id','player_name','jersey_number','designated_count','starter_count','played_count','played_ms')
GUEST_ID='P_GUEST'

def _rows(path, columns):
    path=Path(path)
    if path.stat().st_size>20*1024*1024:raise ValidationError('File exceeds 20 MB.')
    try:
        with path.open(encoding='utf-8-sig',newline='') as stream:
            reader=csv.DictReader(stream,strict=True)
            if len(reader.fieldnames or [])!=len(columns) or set(reader.fieldnames or [])!=set(columns):
                raise ValidationError('Expected columns: '+','.join(columns))
            result=[]
            for row in reader:
                if None in row or None in row.values():raise ValidationError(f'CSV line {reader.line_num}: wrong field count')
                result.append({key:value.strip() for key,value in row.items()})
    except (UnicodeError,csv.Error) as error:raise ValidationError(f'Invalid UTF-8 CSV: {error}') from None
    if not result:raise ValidationError('CSV contains no rows.')
    return result

def _player(row):
    _require(bool(re.fullmatch(r'P[A-Za-z0-9_-]{1,127}',row['player_id'])),'Invalid player_id')
    row['player_name']=_text(row['player_name'],'player_name',100)
    row['jersey_number']=_integer(row['jersey_number'],'jersey_number',0,99)

def read_roster(path):
    rows=_rows(path,ROSTER_COLUMNS);seen=set()
    for index,row in enumerate(rows,2):
        try:
            _player(row)
            _require(row['player_id']!=GUEST_ID,'P_GUEST is reserved; guests cannot join the university roster')
            _require(row['player_id'] not in seen,'duplicate player_id');seen.add(row['player_id'])
            row['enrollment_year']=_integer(row['enrollment_year'],'enrollment_year',1900,9995) if row['enrollment_year'] else None
            _require(row['status_override'] in ('','Astudent','graduated'),'Invalid status_override')
            row['status_override']=row['status_override'] or None
        except ValueError as error:raise ValidationError(f'CSV row {index}: {error}') from None
    return rows

def effective_status(player, reference_date):
    if player['status_override']:return player['status_override']
    if player['enrollment_year'] is None:return 'Unknown'
    return 'graduated' if reference_date>=date(player['enrollment_year']+4,9,1) else 'Astudent'

def read_participation(path):
    rows=_rows(path,PARTICIPATION_COLUMNS);seen=set();metadata=None
    for index,row in enumerate(rows,2):
        try:
            _player(row)
            _require(row['player_id'] not in seen,'duplicate player_id');seen.add(row['player_id'])
            _require(bool(re.fullmatch(r'G[A-Za-z0-9_-]{1,127}',row['game_id'])),'Invalid game_id')
            _require(bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',row['game_date'])),'Invalid game_date')
            row['game_date']=date.fromisoformat(row['game_date'])
            _require(row['game_date'].year>=1000,'Invalid game_date')
            _text(row['opponent'],'opponent',100)
            row['revision']=_integer(row['revision'],'revision',1,9007199254740991)
            _require(row['coverage'] in ('complete','partial'),'Invalid coverage')
            identity=tuple(row[k] for k in ('game_id','game_date','opponent','revision','coverage'))
            _require(metadata is None or identity==metadata,'All rows must describe the same game snapshot');metadata=identity
            guest=row['player_id']==GUEST_ID
            if guest:_require(row['player_name']=='Guest Player' and row['jersey_number']==0,'Guest identity must be anonymous: Guest Player, jersey 0')
            row['designated_count']=_integer(row['designated_count'],'designated_count',1,15 if guest else 1)
            for field in ('starter_count','played_count'):row[field]=_integer(row[field],field,0,row['designated_count'])
            row['played_ms']=_integer(row['played_ms'],'played_ms',0,9007199254740991)
            _require(row['played_ms']==0 or row['played_count']>0,'Positive minutes require played_count')
        except ValueError as error:raise ValidationError(f'CSV row {index}: {error}') from None
    _require(5<=sum(r['designated_count'] for r in rows)<=15,'A squad must have 5 to 15 players')
    expected_starters=5 if rows[0]['coverage']=='complete' else 0
    _require(sum(r['starter_count'] for r in rows)==expected_starters,f'This coverage requires {expected_starters} known starters')
    return sorted(rows,key=lambda row:row['player_id'])
