"""MySQL persistence. All event changes for one file commit or roll back together."""
from dataclasses import dataclass, field
from pathlib import Path
import re
import hashlib
import json
import pymysql
from pymysql.cursors import DictCursor
from .validation import Batch

class ImportConflict(ValueError):
    """Stored immutable game/event data disagrees with a supplied export."""

@dataclass(frozen=True)
class Config:
    host: str = 'localhost'
    port: int = 3306
    user: str = 'root'
    password: str = field(default='',repr=False)
    database: str = 'scorekeeper'
    ssl_ca: str | None = None

    def __post_init__(self):
        if not re.fullmatch(r'[A-Za-z][A-Za-z0-9_]{0,63}',self.database) or self.database.lower() in ('mysql','sys','information_schema','performance_schema'):
            raise ValueError('Use a non-system database name containing only letters, digits and underscores (maximum 64 characters).')
        if not self.host or not self.user or not 1<=self.port<=65535:
            raise ValueError('Provide a host, username and port between 1 and 65535.')

@dataclass(frozen=True)
class ImportResult:
    game_id: str
    inserted: int
    voided: int
    unchanged: int
    stale_voids: int

def connect(config: Config, *, with_database=True):
    return pymysql.connect(host=config.host,port=config.port,user=config.user,password=config.password,
        database=config.database if with_database else None,charset='utf8mb4',cursorclass=DictCursor,
        autocommit=False,connect_timeout=5,read_timeout=20,write_timeout=20,
        ssl_ca=config.ssl_ca,ssl_verify_cert=bool(config.ssl_ca),ssl_verify_identity=bool(config.ssl_ca),
        init_command="SET SESSION sql_mode='STRICT_ALL_TABLES,NO_ZERO_DATE,NO_ZERO_IN_DATE,ERROR_FOR_DIVISION_BY_ZERO'")

def initialize(config: Config):
    """Non-destructive DDL setup. DDL commits in MySQL; imports use separate transactions."""
    schema=(Path(__file__).resolve().parents[1]/'sql'/'schema.sql').read_text(encoding='utf-8')
    schema='\n'.join(line for line in schema.splitlines() if not line.lstrip().startswith('--'))
    schema=schema.replace('`scorekeeper`',f'`{config.database}`')
    with connect(config,with_database=False) as connection:
        with connection.cursor() as cursor:
            for statement in schema.split(';'):
                if statement.strip():cursor.execute(statement)
        connection.commit()

EVENT_FIELDS=('game_id','event_id','player_id','player_name','jersey_number','quarter','game_clock','event_type','points_value','recorded_at','team_side','is_voided')
IMMUTABLE_FIELDS=EVENT_FIELDS[:-1]

def import_batch(config: Config, batch: Batch) -> ImportResult:
    if not batch.events:raise ValueError('Cannot import an empty batch.')
    first=batch.events[0]
    inserted=voided=unchanged=stale=0
    with connect(config) as connection:
        try:
            connection.begin()
            with connection.cursor() as cursor:
                # This no-op duplicate update serializes imports for the same game before comparing metadata.
                cursor.execute('INSERT INTO games (game_id,game_date,opponent) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE game_id=game_id', (first.game_id,first.game_date,first.opponent))
                cursor.execute('SELECT * FROM games WHERE game_id=%s FOR UPDATE',(first.game_id,));game=cursor.fetchone()
                if game['game_date']!=first.game_date or game['opponent']!=first.opponent:
                    raise ImportConflict(f'Game {first.game_id}: stored date/opponent differs. Entire import rolled back.')
                cursor.execute('SELECT * FROM events WHERE game_id=%s ORDER BY event_id FOR UPDATE',(first.game_id,))
                existing={row['event_id']:row for row in cursor.fetchall()}
                for event in batch.events:
                    old=existing.get(event.event_id)
                    if old:
                        differences=[name for name in IMMUTABLE_FIELDS if old[name]!=getattr(event,name)]
                        if differences:raise ImportConflict(f'CSV line {event.source_line}, event {event.event_id}: immutable fields differ ({", ".join(differences)}). Entire import rolled back.')
                # Player names in events remain snapshots. The lookup table uses the latest observed timestamp.
                latest={}
                for event in batch.events:
                    if event.player_id and (event.player_id not in latest or (event.recorded_at,event.event_id)>(latest[event.player_id].recorded_at,latest[event.player_id].event_id)):
                        latest[event.player_id]=event
                for player_id,event in sorted(latest.items()):
                    cursor.execute('INSERT INTO players (player_id,player_name,jersey_number,last_seen_at,is_guest) VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE player_id=player_id',(player_id,event.player_name,event.jersey_number,event.recorded_at,player_id=='P_GUEST'))
                    cursor.execute('UPDATE players SET player_name=IF(roster_managed,player_name,%s),jersey_number=IF(roster_managed,jersey_number,%s),last_seen_at=%s,is_guest=%s WHERE player_id=%s AND (last_seen_at IS NULL OR last_seen_at < %s)',(event.player_name,event.jersey_number,event.recorded_at,player_id=='P_GUEST',player_id,event.recorded_at))
                statement='INSERT INTO events ('+','.join(EVENT_FIELDS)+') VALUES ('+','.join(['%s']*len(EVENT_FIELDS))+')'
                for event in batch.events:
                    old=existing.get(event.event_id)
                    if old is None:
                        cursor.execute(statement,tuple(getattr(event,name) for name in EVENT_FIELDS));inserted+=1
                    elif event.is_voided and not old['is_voided']:
                        cursor.execute('UPDATE events SET is_voided=TRUE WHERE game_id=%s AND event_id=%s',(event.game_id,event.event_id));voided+=1
                    else:
                        unchanged+=1
                        if old['is_voided'] and not event.is_voided:stale+=1
            connection.commit()
        except Exception:
            connection.rollback();raise
    return ImportResult(first.game_id,inserted,voided,unchanged,stale)

def summary(config: Config, game_id: str):
    with connect(config) as connection:
        with connection.cursor() as cursor:
            cursor.execute('''SELECT g.game_id,g.game_date,g.opponent,
                COALESCE(SUM(CASE WHEN e.team_side='HOME' AND e.is_voided=FALSE THEN e.points_value ELSE 0 END),0) AS home_points,
                COALESCE(SUM(CASE WHEN e.team_side='AWAY' AND e.is_voided=FALSE THEN e.points_value ELSE 0 END),0) AS away_points,
                COUNT(e.event_id) AS recorded_events,
                COALESCE(SUM(e.is_voided),0) AS voided_events
                FROM games g LEFT JOIN events e ON e.game_id=g.game_id
                WHERE g.game_id=%s GROUP BY g.game_id,g.game_date,g.opponent''',(game_id,))
            return cursor.fetchone()

def migrate(config: Config):
    """Idempotent additive upgrade; MySQL DDL commits each statement."""
    with connect(config) as connection:
        with connection.cursor() as cursor:
            cursor.execute('SHOW COLUMNS FROM players')
            columns={row['Field'] for row in cursor.fetchall()}
            for name,definition in [('enrollment_year','SMALLINT NULL'),('status_override',"ENUM('Astudent','graduated') NULL"),('is_guest','BOOLEAN NOT NULL DEFAULT FALSE'),('roster_managed','BOOLEAN NOT NULL DEFAULT FALSE')]:
                if name not in columns:cursor.execute(f'ALTER TABLE players ADD COLUMN {name} {definition}')
            cursor.execute('ALTER TABLE players MODIFY last_seen_at DATETIME(6) NULL')
        connection.commit()
    initialize(config)

def import_roster(config: Config, rows, *, apply=False):
    """Preview by default. Explicit apply atomically upserts all supplied players."""
    if not rows:raise ValueError('Empty roster')
    fields=('player_name','jersey_number','enrollment_year','status_override')
    changes=[]
    with connect(config) as connection:
        try:
            connection.begin()
            with connection.cursor() as cursor:
                for row in sorted(rows,key=lambda r:r['player_id']):
                    if row['player_id']=='P_GUEST':raise ValueError('Guest identity cannot be imported as a university player')
                    cursor.execute('SELECT * FROM players WHERE player_id=%s FOR UPDATE',(row['player_id'],));old=cursor.fetchone()
                    changes.append(dict(player_id=row['player_id'],action='add' if old is None else 'update' if any(old[f]!=row[f] for f in fields) else 'unchanged',before={f:old[f] for f in fields} if old else None,after={f:row[f] for f in fields}))
                    if apply:
                        cursor.execute('INSERT INTO players (player_id,player_name,jersey_number,enrollment_year,status_override,roster_managed) VALUES (%s,%s,%s,%s,%s,TRUE) ON DUPLICATE KEY UPDATE player_name=%s,jersey_number=%s,enrollment_year=%s,status_override=%s,roster_managed=TRUE',tuple(row[f] for f in ('player_id',)+fields)+tuple(row[f] for f in fields))
            if apply:connection.commit()
            else:connection.rollback()
        except Exception:connection.rollback();raise
    return changes

def import_participation(config: Config, rows):
    """One locked game snapshot, with stale/equal-conflicting revision rejection."""
    if not rows:raise ValueError('Empty participation snapshot')
    first=rows[0]
    digest=hashlib.sha256(json.dumps(sorted(rows,key=lambda r:r['player_id']),sort_keys=True,default=str,separators=(',',':')).encode()).hexdigest()
    with connect(config) as connection:
        try:
            connection.begin()
            with connection.cursor() as cursor:
                cursor.execute('INSERT INTO games (game_id,game_date,opponent) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE game_id=game_id',tuple(first[k] for k in ('game_id','game_date','opponent')))
                cursor.execute('SELECT * FROM games WHERE game_id=%s FOR UPDATE',(first['game_id'],));game=cursor.fetchone()
                if game['game_date']!=first['game_date'] or game['opponent']!=first['opponent']:raise ImportConflict('Game date/opponent differs; entire import rolled back.')
                cursor.execute('SELECT * FROM participation_snapshots WHERE game_id=%s',(first['game_id'],));old=cursor.fetchone()
                if old:
                    if first['revision']<old['revision']:raise ImportConflict('Stale participation revision; entire import rolled back.')
                    if first['revision']==old['revision']:
                        if digest!=old['content_hash']:raise ImportConflict('Equal participation revision has conflicting contents.')
                        connection.rollback();return 'unchanged'
                for row in rows:
                    guest=row['player_id']=='P_GUEST'
                    if guest and (row['player_name']!='Guest Player' or row['jersey_number']!=0):raise ValueError('Guest identity must be anonymous')
                    cursor.execute('INSERT INTO players (player_id,player_name,jersey_number,is_guest) VALUES (%s,%s,%s,%s) ON DUPLICATE KEY UPDATE player_id=player_id',(row['player_id'],row['player_name'],row['jersey_number'],guest))
                cursor.execute('DELETE FROM game_participation WHERE game_id=%s',(first['game_id'],))
                fields=('game_id','player_id','player_name','jersey_number','designated_count','starter_count','played_count','played_ms')
                for row in rows:cursor.execute('INSERT INTO game_participation ('+','.join(fields)+') VALUES ('+','.join(['%s']*len(fields))+')',tuple(row[k] for k in fields))
                cursor.execute('INSERT INTO participation_snapshots (game_id,revision,coverage,content_hash) VALUES (%s,%s,%s,%s) ON DUPLICATE KEY UPDATE revision=%s,coverage=%s,content_hash=%s',(first['game_id'],first['revision'],first['coverage'],digest,first['revision'],first['coverage'],digest))
            connection.commit()
        except Exception:connection.rollback();raise
    return 'updated'
