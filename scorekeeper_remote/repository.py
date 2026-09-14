import copy
import hashlib
import json
import threading
from dataclasses import dataclass
from .bundles import validate_roster_csv
from scorekeeper_pipeline.validation import ValidationError
from .statistics import build_snapshot

class Conflict(ValueError): pass
class Unavailable(RuntimeError): pass

def digest(upload):
    return hashlib.sha256(json.dumps(upload,sort_keys=True,separators=(',',':')).encode()).hexdigest()

class MemoryRepository:
    def __init__(self):
        self.games={}; self.roster={}; self.revision=0; self.published_revision=0; self.error=None; self.lock=threading.RLock()
    def apply_roster_csv(self,text):
        rows=validate_roster_csv(text)
        with self.lock:
            for row in rows:self.roster[row['player_id']]=copy.deepcopy(row)
            self.revision+=1
        return self.get_roster()
    def get_roster(self):return [copy.deepcopy(self.roster[k]) for k in sorted(self.roster)]
    def save_initial(self,bundle):
        with self.lock:
            old=self.games.get(bundle.game_id); h=digest(bundle.upload)
            if old:
                if old['original_hash']==h:return dict(game_id=bundle.game_id,version=old['version'],unchanged=True)
                raise Conflict('game_id already has a different original submission')
            self._check_roster(bundle)
            self.revision+=1
            self.games[bundle.game_id]={'game_id':bundle.game_id,'game_date':bundle.game_date,'opponent':bundle.opponent,'version':1,'deleted':False,'upload':copy.deepcopy(bundle.upload),'original_hash':h,'events':bundle.events.events,'participation':bundle.participation,'coverage':bundle.participation[0]['coverage'],'audit':[]}
            return dict(game_id=bundle.game_id,version=1,unchanged=False)
    def _check_roster(self,bundle):
        for row in bundle.participation:
            if row['player_id']=='P_GUEST':continue
            p=self.roster.get(row['player_id'])
            if not p:raise ValidationError('Unknown roster player_id: '+row['player_id'])
    def list_games(self):
        return [{k:g[k] for k in ('game_id','game_date','opponent','version','deleted')} for g in sorted(self.games.values(),key=lambda x:(x['game_date'],x['game_id']),reverse=True)]
    def get_game(self,game_id):
        g=self.games.get(game_id)
        if not g:raise KeyError(game_id)
        return {k:copy.deepcopy(g[k]) for k in ('game_id','game_date','opponent','version','deleted','upload')}
    def replace(self,game_id,version,bundle):
        with self.lock:
            g=self.games.get(game_id)
            if not g:raise KeyError(game_id)
            if bundle.game_id!=game_id:raise Conflict('Replacement upload must preserve game_id')
            if g['version']!=version:raise Conflict('version conflict')
            self._check_roster(bundle); g['audit'].append(copy.deepcopy(g['upload']))
            g.update(game_date=bundle.game_date,opponent=bundle.opponent,upload=copy.deepcopy(bundle.upload),events=bundle.events.events,participation=bundle.participation,coverage=bundle.participation[0]['coverage'],version=version+1)
            self.revision+=1; return self.get_game(game_id)
    def set_deleted(self,game_id,version,deleted):
        with self.lock:
            g=self.games.get(game_id)
            if not g:raise KeyError(game_id)
            if g['version']!=version:raise Conflict('version conflict')
            g['audit'].append(copy.deepcopy(g['upload']));g['deleted']=deleted;g['version']+=1;self.revision+=1
            return self.get_game(game_id)
    def snapshot(self):return build_snapshot(self.revision,self.get_roster(),list(self.games.values()))
    def publication(self):
        return {'state':'published' if self.published_revision==self.revision else 'pending','revision':self.revision,'published_revision':self.published_revision,'error':self.error}
    def publish(self,publisher):
        with self.lock:snapshot=self.snapshot()
        try:publisher(snapshot)
        except Exception:self.error='Publication failed; retry required';return 'pending'
        with self.lock:
            self.published_revision=snapshot['revision'];self.error=None
            return self.publication()['state']

class MySQLRepository:
    def __init__(self,config):
        from scorekeeper_pipeline import database
        self.config=config; self.D=database; self.publish_lock=threading.RLock()
    @classmethod
    def from_env(cls):
        import os
        from scorekeeper_pipeline.database import Config
        if os.getenv('MYSQL_HOST','localhost') not in ('localhost','127.0.0.1','::1') and not os.getenv('MYSQL_SSL_CA'):raise ValueError('MYSQL_SSL_CA is required for remote MySQL')
        return cls(Config(host=os.getenv('MYSQL_HOST','localhost'),port=int(os.getenv('MYSQL_PORT','3306')),user=os.getenv('MYSQL_USER','root'),password=os.getenv('MYSQL_PASSWORD',''),database=os.getenv('MYSQL_DATABASE','scorekeeper'),ssl_ca=os.getenv('MYSQL_SSL_CA') or None))
    def migrate(self):
        from pathlib import Path
        self.D.initialize(self.config)
        self.D.migrate(self.config)
        sql=(Path(__file__).resolve().parents[1]/'sql'/'remote.sql').read_text(encoding='utf-8')
        with self.D.connect(self.config) as c:
            with c.cursor() as q:
                for statement in sql.split(';'):
                    if statement.strip():q.execute(statement)
            c.commit()
    def _publication_pending(self,q):
        q.execute("UPDATE remote_publication SET revision=revision+1,state='pending',last_error=NULL WHERE singleton=1")
    def _check_roster(self,q,bundle):
        ids=[r['player_id'] for r in bundle.participation if r['player_id']!='P_GUEST']
        if ids:
            q.execute('SELECT player_id,player_name,jersey_number FROM players WHERE roster_managed=TRUE AND player_id IN ('+','.join(['%s']*len(ids))+')',ids)
            found={r['player_id']:r for r in q.fetchall()}
            for row in bundle.participation:
                if row['player_id']=='P_GUEST':continue
                p=found.get(row['player_id'])
                if not p:raise ValidationError('Unknown roster player_id: '+row['player_id'])
    def _write(self,q,bundle):
        details=bundle.upload.get('game_details')
        if details is not None:
            q.execute('INSERT INTO remote_game_details(game_id,category,duration_ms,stats_complete) VALUES(%s,%s,%s,%s) ON DUPLICATE KEY UPDATE category=VALUES(category),duration_ms=VALUES(duration_ms),stats_complete=VALUES(stats_complete)',(bundle.game_id,details['category'],details['duration_ms'],details['stats_complete']))
        else:
            q.execute('DELETE FROM remote_game_details WHERE game_id=%s',(bundle.game_id,))
        for row in bundle.participation:
            if row['player_id']=='P_GUEST':q.execute("INSERT INTO players(player_id,player_name,jersey_number,is_guest,roster_managed) VALUES('P_GUEST','Guest Player',0,TRUE,FALSE) ON DUPLICATE KEY UPDATE player_name='Guest Player',jersey_number=0,is_guest=TRUE")
        fields=('game_id','event_id','player_id','player_name','jersey_number','quarter','game_clock','event_type','points_value','recorded_at','team_side','is_voided')
        for e in bundle.events.events:q.execute('INSERT INTO events('+','.join(fields)+') VALUES('+','.join(['%s']*len(fields))+')',tuple(getattr(e,k) for k in fields))
        pfields=('game_id','player_id','player_name','jersey_number','designated_count','starter_count','played_count','played_ms')
        for row in bundle.participation:q.execute('INSERT INTO game_participation('+','.join(pfields)+') VALUES('+','.join(['%s']*len(pfields))+')',tuple(row[k] for k in pfields))
        first=bundle.participation[0];q.execute('INSERT INTO participation_snapshots(game_id,revision,coverage,content_hash) VALUES(%s,%s,%s,%s)',(bundle.game_id,first['revision'],first['coverage'],hashlib.sha256(bundle.upload['participation_csv'].encode()).hexdigest()))
    def save_initial(self,bundle):
        h=digest(bundle.upload)
        with self.D.connect(self.config) as c:
            try:
                c.begin()
                with c.cursor() as q:
                    q.execute('SELECT singleton FROM remote_publication WHERE singleton=1 FOR UPDATE')
                    q.execute('SELECT game_id FROM games WHERE game_id=%s FOR UPDATE',(bundle.game_id,)); legacy=q.fetchone()
                    if legacy:
                        q.execute('SELECT version,original_hash FROM remote_uploads WHERE game_id=%s',(bundle.game_id,))
                        old=q.fetchone()
                        if not old:raise Conflict('Existing game is read-only until adopted by migration')
                        if old['original_hash']==h:c.rollback();return {'game_id':bundle.game_id,'version':old['version'],'unchanged':True}
                        raise Conflict('game_id already has a different original submission')
                    self._check_roster(q,bundle)
                    q.execute('INSERT INTO games(game_id,game_date,opponent) VALUES(%s,%s,%s)',(bundle.game_id,bundle.game_date,bundle.opponent))
                    self._write(q,bundle)
                    q.execute('INSERT INTO remote_uploads(game_id,original_hash,schema_version,finished,events_csv,participation_csv) VALUES(%s,%s,1,TRUE,%s,%s)',(bundle.game_id,h,bundle.upload['events_csv'],bundle.upload['participation_csv']))
                    self._publication_pending(q)
                c.commit();return {'game_id':bundle.game_id,'version':1,'unchanged':False}
            except Exception:c.rollback();raise
    def list_games(self):
        with self.D.connect(self.config) as c:
            with c.cursor() as q:q.execute('SELECT g.game_id,g.game_date,g.opponent,r.version,r.deleted FROM remote_uploads r JOIN games g USING(game_id) ORDER BY g.game_date DESC,g.game_id');rows=list(q.fetchall())
        for row in rows:row['game_date']=row['game_date'].isoformat();row['deleted']=bool(row['deleted'])
        return rows
    def get_game(self,game_id):
        with self.D.connect(self.config) as c:
            with c.cursor() as q:
                q.execute('SELECT r.game_id,g.game_date,g.opponent,r.version,r.deleted,r.schema_version,r.finished,r.events_csv,r.participation_csv FROM remote_uploads r JOIN games g USING(game_id) WHERE r.game_id=%s',(game_id,));r=q.fetchone()
                details=self._details(q,game_id)
        if not r:raise KeyError(game_id)
        r['finished']=bool(r['finished'])
        document={k:r[k] for k in ('schema_version','finished','events_csv','participation_csv')}
        if details is not None: document['game_details']=details
        return {'game_id':r['game_id'],'game_date':r['game_date'].isoformat(),'opponent':r['opponent'],'version':r['version'],'deleted':bool(r['deleted']),'upload':document}
    def _details(self,q,game_id):
        q.execute('SELECT category,duration_ms,stats_complete FROM remote_game_details WHERE game_id=%s',(game_id,))
        details=q.fetchone()
        if details is not None: details['stats_complete']=bool(details['stats_complete'])
        return details
    def _audit(self,q,row,action):
        doc={k:row[k] for k in ('schema_version','finished','events_csv','participation_csv')}
        details=self._details(q,row['game_id'])
        if details is not None: doc['game_details']=details
        q.execute('INSERT INTO remote_audit(game_id,prior_version,action,prior_document) VALUES(%s,%s,%s,%s)',(row['game_id'],row['version'],action,json.dumps(doc)))
    def replace(self,game_id,version,bundle):
        with self.D.connect(self.config) as c:
            try:
                c.begin()
                with c.cursor() as q:
                    q.execute('SELECT singleton FROM remote_publication WHERE singleton=1 FOR UPDATE')
                    q.execute('SELECT * FROM remote_uploads WHERE game_id=%s FOR UPDATE',(game_id,));old=q.fetchone()
                    if not old:raise KeyError(game_id)
                    if old['version']!=version:raise Conflict('version conflict')
                    if bundle.game_id!=game_id:raise Conflict('Replacement upload must preserve game_id')
                    self._check_roster(q,bundle);self._audit(q,old,'replace')
                    q.execute('DELETE FROM events WHERE game_id=%s',(game_id,));q.execute('DELETE FROM game_participation WHERE game_id=%s',(game_id,));q.execute('DELETE FROM participation_snapshots WHERE game_id=%s',(game_id,))
                    q.execute('UPDATE games SET game_date=%s,opponent=%s WHERE game_id=%s',(bundle.game_date,bundle.opponent,game_id));self._write(q,bundle)
                    q.execute('UPDATE remote_uploads SET version=version+1,schema_version=1,finished=TRUE,events_csv=%s,participation_csv=%s WHERE game_id=%s',(bundle.upload['events_csv'],bundle.upload['participation_csv'],game_id));self._publication_pending(q)
                c.commit();return self.get_game(game_id)
            except Exception:c.rollback();raise
    def set_deleted(self,game_id,version,deleted):
        with self.D.connect(self.config) as c:
            try:
                c.begin()
                with c.cursor() as q:
                    q.execute('SELECT singleton FROM remote_publication WHERE singleton=1 FOR UPDATE')
                    q.execute('SELECT * FROM remote_uploads WHERE game_id=%s FOR UPDATE',(game_id,));old=q.fetchone()
                    if not old:raise KeyError(game_id)
                    if old['version']!=version:raise Conflict('version conflict')
                    self._audit(q,old,'delete' if deleted else 'restore');q.execute('UPDATE remote_uploads SET version=version+1,deleted=%s WHERE game_id=%s',(deleted,game_id));self._publication_pending(q)
                c.commit();return self.get_game(game_id)
            except Exception:c.rollback();raise
    def get_roster(self):
        with self.D.connect(self.config) as c:
            with c.cursor() as q:q.execute("SELECT player_id,player_name,jersey_number,enrollment_year,status_override FROM players WHERE roster_managed=TRUE ORDER BY player_id");return list(q.fetchall())
    def apply_roster_csv(self,text):
        rows=validate_roster_csv(text)
        with self.D.connect(self.config) as c:
            try:
                c.begin()
                with c.cursor() as q:
                    q.execute('SELECT singleton FROM remote_publication WHERE singleton=1 FOR UPDATE')
                    for r in rows:q.execute('INSERT INTO players(player_id,player_name,jersey_number,enrollment_year,status_override,roster_managed) VALUES(%s,%s,%s,%s,%s,TRUE) ON DUPLICATE KEY UPDATE player_name=%s,jersey_number=%s,enrollment_year=%s,status_override=%s,roster_managed=TRUE',(r['player_id'],r['player_name'],r['jersey_number'],r['enrollment_year'],r['status_override'],r['player_name'],r['jersey_number'],r['enrollment_year'],r['status_override']))
                    self._publication_pending(q)
                c.commit()
            except Exception:c.rollback();raise
        return self.get_roster()
    def publication(self):
        with self.D.connect(self.config) as c:
            with c.cursor() as q:q.execute('SELECT state,revision,published_revision,last_error AS error FROM remote_publication WHERE singleton=1');return q.fetchone()
    def mark_publication_failed(self,message='Publication failed; retry required'):
        with self.D.connect(self.config) as c:
            with c.cursor() as q:
                q.execute("UPDATE remote_publication SET state='pending',last_error=%s WHERE singleton=1",('Publication failed; retry required',))
            c.commit()

    def snapshot(self,connection=None):
        from types import SimpleNamespace
        c=connection or self.D.connect(self.config)
        try:
            c.begin()
            with c.cursor() as q:
                q.execute('SELECT revision FROM remote_publication WHERE singleton=1');revision=q.fetchone()['revision']
                q.execute('SELECT player_id,player_name,jersey_number,enrollment_year,status_override FROM players WHERE roster_managed=TRUE ORDER BY player_id');roster=q.fetchall()
                q.execute('SELECT g.game_id,g.game_date,g.opponent,r.deleted,COALESCE(p.coverage,"partial") AS coverage FROM remote_uploads r JOIN games g USING(game_id) LEFT JOIN participation_snapshots p USING(game_id) ORDER BY g.game_date,g.game_id');games=q.fetchall()
                public_games=[]
                for g in games:
                    g['game_details']=self._details(q,g['game_id'])
                    q.execute('SELECT * FROM events WHERE game_id=%s ORDER BY event_id',(g['game_id'],));g['events']=[SimpleNamespace(**x) for x in q.fetchall()]
                    q.execute('SELECT * FROM game_participation WHERE game_id=%s ORDER BY player_id',(g['game_id'],));g['participation']=q.fetchall()
                    if not g['participation']:
                        identities={e.player_id:e for e in g['events'] if e.player_id and not e.is_voided}
                        g['participation']=[dict(player_id=e.player_id,player_name=e.player_name,jersey_number=e.jersey_number,played_ms=None,played_count=1,starter_count=0,designated_count=1) for e in identities.values()]
                    public_games.extend(build_snapshot(revision,[],[g])['games'])
                    g.pop('events');g.pop('participation')
            c.rollback()
            snapshot=build_snapshot(revision,roster,[])
            snapshot['games']=public_games
            return snapshot
        finally:
            if connection is None:c.close()

    def publish(self,publisher):
        # The dedicated connection owns the advisory lock across deployment, but
        # holds no row locks while the network operation runs.
        with self.D.connect(self.config) as c:
            lock_name='scorekeeper-publish-'+hashlib.sha256(self.config.database.encode()).hexdigest()[:32]
            acquired=False
            try:
                with c.cursor() as q:
                    q.execute('SELECT GET_LOCK(%s,0) AS acquired',(lock_name,));acquired=q.fetchone()['acquired']==1
                if not acquired:return 'pending'
                snapshot=self.snapshot(c)
                publisher(snapshot)
                with c.cursor() as q:
                    q.execute("UPDATE remote_publication SET published_revision=%s,state=IF(revision=%s,'published','pending'),last_error=NULL WHERE singleton=1",(snapshot['revision'],snapshot['revision']))
                c.commit()
                return self.publication()['state']
            except Exception:
                c.rollback();self.mark_publication_failed();return 'pending'
            finally:
                if acquired:
                    with c.cursor() as q:q.execute('SELECT RELEASE_LOCK(%s)',(lock_name,))

    def adopt_legacy(self):
        import csv,io
        from scorekeeper_pipeline.validation import COLUMNS
        from scorekeeper_pipeline.roster import PARTICIPATION_COLUMNS
        def encode(columns,rows):
            stream=io.StringIO(newline='');writer=csv.DictWriter(stream,fieldnames=columns,extrasaction='ignore');writer.writeheader();writer.writerows(rows);return stream.getvalue()
        with self.D.connect(self.config) as c:
            try:
                c.begin()
                with c.cursor() as q:
                    q.execute('SELECT singleton FROM remote_publication WHERE singleton=1 FOR UPDATE')
                    q.execute('SELECT g.* FROM games g LEFT JOIN remote_uploads r USING(game_id) WHERE r.game_id IS NULL FOR UPDATE');games=q.fetchall()
                    for g in games:
                        q.execute('SELECT * FROM events WHERE game_id=%s ORDER BY event_id',(g['game_id'],));events=q.fetchall()
                        for e in events:
                            e.update(game_date=g['game_date'].isoformat(),opponent=g['opponent']);e['is_voided']='true' if e['is_voided'] else 'false';e['recorded_at']=e['recorded_at'].isoformat()+'Z'
                        q.execute('SELECT gp.*,ps.revision,ps.coverage FROM game_participation gp JOIN participation_snapshots ps USING(game_id) WHERE game_id=%s',(g['game_id'],));parts=q.fetchall()
                        for row in parts:row.update(game_date=g['game_date'].isoformat(),opponent=g['opponent'])
                        q.execute('INSERT INTO remote_uploads(game_id,original_hash,schema_version,finished,events_csv,participation_csv) VALUES(%s,%s,1,TRUE,%s,%s)',(g['game_id'],'legacy-adopted',encode(COLUMNS,events),encode(PARTICIPATION_COLUMNS,parts)))
                    if games:self._publication_pending(q)
                c.commit();return len(games)
            except Exception:c.rollback();raise
