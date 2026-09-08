import csv
import io
import tempfile
from dataclasses import dataclass
from pathlib import Path
from scorekeeper_pipeline.roster import read_participation, read_roster
from scorekeeper_pipeline.validation import COLUMNS, Batch, ValidationError, read_csv

@dataclass(frozen=True)
class Bundle:
    upload: dict
    events: Batch
    participation: tuple
    game_id: str
    game_date: object
    opponent: str

def _read(text, reader, name):
    if not isinstance(text,str): raise ValidationError(f'{name} must be a string')
    with tempfile.TemporaryDirectory() as directory:
        path=Path(directory)/name
        try:path.write_text(text,encoding='utf-8',newline='')
        except UnicodeError:raise ValidationError(f'{name} must contain valid Unicode') from None
        return reader(path)

def validate_upload(document):
    if not isinstance(document,dict) or type(document.get('schema_version')) is not int or document.get('schema_version')!=1: raise ValidationError('schema_version must be 1')
    if document.get('finished') is not True: raise ValidationError('Only finished games may upload')
    participation=tuple(_read(document.get('participation_csv'),read_participation,'participation.csv'))
    events_text=document.get('events_csv')
    if not isinstance(events_text,str):raise ValidationError('events_csv must be a string')
    try: events=_read(events_text,read_csv,'events.csv')
    except ValidationError as error:
        try: rows=list(csv.reader(io.StringIO(events_text or '')))
        except csv.Error: rows=[]
        if len(rows)==1 and tuple(x.lstrip('﻿') if i==0 else x for i,x in enumerate(rows[0]))==COLUMNS: events=Batch(())
        else: raise error
    meta=(participation[0]['game_id'],participation[0]['game_date'],participation[0]['opponent'])
    if events.events:
        event=events.events[0]
        if (event.game_id,event.game_date,event.opponent)!=meta: raise ValidationError('Event and participation exports describe different games')
    identities={r['player_id']:(r['player_name'],r['jersey_number'],r['played_count']) for r in participation}
    for event in events.events:
        if event.player_id and (event.player_id not in identities or identities[event.player_id][:2]!=(event.player_name,event.jersey_number) or (not event.is_voided and identities[event.player_id][2]<1)):
            raise ValidationError('Event and participation player identity snapshots differ')
    normalized={'schema_version':1,'finished':True,'events_csv':events_text,'participation_csv':document['participation_csv']}
    return Bundle(normalized,events,participation,*meta)

def validate_roster_csv(text): return _read(text,read_roster,'roster.csv')
