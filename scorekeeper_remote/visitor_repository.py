"""Analytics storage isolated from all basketball persistence."""
import base64
import json
import os
from collections import Counter
from copy import deepcopy
from datetime import datetime, timezone
from threading import Lock
from .visitor_validation import RETENTION, identifier, invalid, timestamp

def utcnow():
    return datetime.now(timezone.utc)

def iso(value):
    return value.astimezone(timezone.utc).isoformat()

def encode_cursor(date, key):
    return base64.urlsafe_b64encode(json.dumps([iso(date), key]).encode()).decode()

def decode_cursor(value):
    if not value: return None
    try:
        if len(value) > 300: invalid()
        data = json.loads(base64.b64decode(value, altchars=b'-_', validate=True))
        if not isinstance(data, list) or len(data) != 2: invalid()
        return timestamp(data[0]), identifier(data[1])
    except (ValueError, TypeError, UnicodeError): invalid()

def counts(values):
    return [{'key': key, 'count': count} for key,count in sorted(Counter(values).items(), key=lambda x:(-x[1],x[0]))[:20]]

def page(items, limit, cursor_key):
    more = len(items) > limit
    items = items[:limit]
    cursor = encode_cursor(*cursor_key(items[-1])) if more else None
    return {'items': items, 'next_cursor': cursor}

class MemoryVisitorRepository:
    def __init__(self):
        self.events = {}
        self.lock = Lock()

    def insert_events(self, events):
        with self.lock:
            before = len(self.events)
            for row in events: self.events.setdefault(row['event_id'], deepcopy(row))
            return len(self.events)-before

    def _rows(self, start, end):
        start = max(start, utcnow()-RETENTION)
        with self.lock:
            return sorted([deepcopy(r) for r in self.events.values() if start <= r['received_at'] < end], key=lambda r:(r['received_at'],r['event_id']))

    def summary(self, start, end):
        rows = self._rows(start,end)
        views = [r for r in rows if r['event']=='page_view']
        sessions = {}
        for row in views: sessions.setdefault(row['session_id'], row)
        daily = Counter(r['received_at'].date().isoformat() for r in sessions.values())
        return dict(visits=len(sessions), unique_visitors=len({r['visitor_id'] for r in rows}),
                    page_views=len(views), active_ms=sum(r['properties'].get('active_ms',0) for r in rows if r['event']=='engagement'),
                    daily=[{'date':d,'visits':n} for d,n in sorted(daily.items())],
                    popular_players=counts(r['properties']['player_id'] for r in rows if r['event']=='player_open'),
                    popular_games=counts(r['properties']['game_id'] for r in rows if r['event']=='game_open'),
                    devices=counts(r['device'] for r in sessions.values()), browsers=counts(r['browser'] for r in sessions.values()))

    def sessions(self, start, end, cursor=None, limit=50):
        boundary = decode_cursor(cursor)
        groups = {}
        for row in self._rows(start,end): groups.setdefault(row['session_id'],[]).append(row)
        items=[]
        for sid, rows in groups.items():
            if not any(r['event']=='page_view' for r in rows): continue
            last=rows[-1]['received_at']
            if boundary and not (last < boundary[0] or (last == boundary[0] and sid > boundary[1])): continue
            items.append(dict(session_id=sid,label='Visit '+sid[:8],started_at=iso(rows[0]['received_at']),last_seen_at=iso(last),event_count=len(rows),active_ms=sum(r['properties'].get('active_ms',0) for r in rows if r['event']=='engagement')))
        items.sort(key=lambda r:r['session_id'])
        items.sort(key=lambda r:r['last_seen_at'],reverse=True)
        return page(items,limit,lambda r:(timestamp(r['last_seen_at']),r['session_id']))

    def timeline(self, session_id, start, end, cursor=None, limit=200):
        boundary=decode_cursor(cursor)
        rows=[r for r in self._rows(start,end) if r['session_id']==session_id and (not boundary or (r['occurred_at'],r['event_id'])>boundary)]
        rows.sort(key=lambda r:(r['occurred_at'],r['event_id']))
        items=[{**{k:r[k] for k in ('event_id','event','page','properties')},'occurred_at':iso(r['occurred_at']),'received_at':iso(r['received_at'])} for r in rows]
        return page(items,limit,lambda r:(timestamp(r['occurred_at']),r['event_id']))

class MongoVisitorRepository:
    def __init__(self, client, database):
        self.client=client
        self.database=client[database]
        self.collection=self.database.visitor_events

    @classmethod
    def from_env(cls):
        uri=os.getenv('VISITOR_MONGODB_URI')
        database=os.getenv('VISITOR_MONGODB_DATABASE')
        if not uri or not database: return None
        from pymongo import MongoClient
        client=MongoClient(uri,tls=True,connect=False,tz_aware=True,maxPoolSize=10,
                           serverSelectionTimeoutMS=3000,connectTimeoutMS=3000,socketTimeoutMS=5000)
        return cls(client,database)

    def setup(self):
        strings={key:{'bsonType':'string'} for key in ('_id','event_id','visitor_id','session_id','event','page','device','browser')}
        schema={'bsonType':'object','required':list(strings)+['properties','occurred_at','received_at'],
                'additionalProperties':False,'properties':{**strings,'properties':{'bsonType':'object'},'occurred_at':{'bsonType':'date'},'received_at':{'bsonType':'date'}}}
        if 'visitor_events' not in self.database.list_collection_names():
            self.database.create_collection('visitor_events',validator={'$jsonSchema':schema})
        else:
            self.database.command('collMod','visitor_events',validator={'$jsonSchema':schema},validationLevel='strict')
        self.collection.create_index('received_at',expireAfterSeconds=7776000,name='visitor_retention')
        self.collection.create_index([('session_id',1),('received_at',1),('_id',1)])
        self.collection.create_index([('session_id',1),('occurred_at',1),('_id',1)])
        self.collection.create_index([('visitor_id',1),('received_at',1)])

    def insert_events(self, events):
        from pymongo.errors import BulkWriteError
        try:
            return len(self.collection.insert_many([{**r,'_id':r['event_id']} for r in events],ordered=False).inserted_ids)
        except BulkWriteError as exc:
            if exc.details.get('writeConcernErrors') or any(e['code']!=11000 for e in exc.details.get('writeErrors',[])): raise
            return exc.details['nInserted']

    def _match(self,start,end):
        return {'received_at':{'$gte':max(start,utcnow()-RETENTION),'$lt':end}}

    def _aggregate(self, pipeline):
        return list(self.collection.aggregate(pipeline,maxTimeMS=5000,allowDiskUse=False))

    def summary(self,start,end):
        def count_group(key):
            return [{'$group':{'_id':key,'count':{'$sum':1}}},{'$sort':{'count':-1,'_id':1}},{'$limit':20},{'$project':{'_id':0,'key':'$_id','count':1}}]
        facets={
            'unique':[{'$group':{'_id':'$visitor_id'}},{'$count':'n'}],
            'page_views':[{'$match':{'event':'page_view'}},{'$count':'n'}],
            'active':[{'$match':{'event':'engagement'}},{'$group':{'_id':None,'n':{'$sum':'$properties.active_ms'}}}],
            'popular_players':[{'$match':{'event':'player_open'}}]+count_group('$properties.player_id'),
            'popular_games':[{'$match':{'event':'game_open'}}]+count_group('$properties.game_id'),
            'sessions':[{'$match':{'event':'page_view'}},{'$sort':{'received_at':1,'_id':1}},
                {'$group':{'_id':'$session_id','device':{'$first':'$device'},'browser':{'$first':'$browser'},'date':{'$first':'$received_at'}}},
                {'$facet':{'visits':[{'$count':'n'}], 'devices':count_group('$device'),'browsers':count_group('$browser'),
                    'daily':[{'$group':{'_id':{'$dateToString':{'format':'%Y-%m-%d','date':'$date','timezone':'UTC'}},'visits':{'$sum':1}}},{'$sort':{'_id':1}},{'$project':{'_id':0,'date':'$_id','visits':1}}]}}]
        }
        # MongoDB does not permit a facet nested inside another facet.
        session_pipeline=facets.pop('sessions')
        result=self._aggregate([{'$match':self._match(start,end)},{'$facet':facets}])[0]
        sessions=self._aggregate([{'$match':self._match(start,end)}]+session_pipeline)[0]
        number=lambda rows:rows[0]['n'] if rows else 0
        return dict(visits=number(sessions['visits']),unique_visitors=number(result['unique']),page_views=number(result['page_views']),active_ms=number(result['active']),daily=sessions['daily'],devices=sessions['devices'],browsers=sessions['browsers'],popular_players=result['popular_players'],popular_games=result['popular_games'])

    def sessions(self,start,end,cursor=None,limit=50):
        boundary=decode_cursor(cursor)
        pipeline=[{'$match':self._match(start,end)},{'$group':{'_id':'$session_id','started_at':{'$min':'$received_at'},'last_seen_at':{'$max':'$received_at'},'event_count':{'$sum':1},'active_ms':{'$sum':{'$cond':[{'$eq':['$event','engagement']},'$properties.active_ms',0]}},'views':{'$sum':{'$cond':[{'$eq':['$event','page_view']},1,0]}}}},{'$match':{'views':{'$gt':0}}}]
        if boundary:
            pipeline.append({'$match':{'$or':[{'last_seen_at':{'$lt':boundary[0]}},{'last_seen_at':boundary[0],'_id':{'$gt':boundary[1]}}]}})
        pipeline += [{'$sort':{'last_seen_at':-1,'_id':1}},{'$limit':limit+1}]
        items=[]
        for r in self._aggregate(pipeline):
            items.append(dict(session_id=r['_id'],label='Visit '+r['_id'][:8],started_at=iso(r['started_at']),last_seen_at=iso(r['last_seen_at']),event_count=r['event_count'],active_ms=r['active_ms']))
        return page(items,limit,lambda r:(timestamp(r['last_seen_at']),r['session_id']))

    def timeline(self,session_id,start,end,cursor=None,limit=200):
        boundary=decode_cursor(cursor)
        match={**self._match(start,end),'session_id':session_id}
        if boundary: match['$or']=[{'occurred_at':{'$gt':boundary[0]}},{'occurred_at':boundary[0],'_id':{'$gt':boundary[1]}}]
        rows=self.collection.find(match,{'event_id':1,'event':1,'page':1,'properties':1,'occurred_at':1,'received_at':1}).sort([('occurred_at',1),('_id',1)]).limit(limit+1).max_time_ms(5000)
        items=[{**{k:r[k] for k in ('event_id','event','page','properties')},'occurred_at':iso(r['occurred_at']),'received_at':iso(r['received_at'])} for r in rows]
        return page(items,limit,lambda r:(timestamp(r['occurred_at']),r['event_id']))
