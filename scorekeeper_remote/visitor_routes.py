"""Optional analytics endpoints. No dependency on basketball persistence."""
import hashlib
import json
import secrets
import time
from threading import Lock
from flask import jsonify, request
from .visitor_repository import MongoVisitorRepository, utcnow
from .visitor_validation import validate_batch, validate_report_range, identifier, invalid

class RateLimit:
    def __init__(self):
        self.entries={}
        self.lock=Lock()
        self.key=secrets.token_bytes(32)

    def allow(self,source,admin=False):
        now=time.monotonic()
        digest=hashlib.blake2b(source.encode(),key=self.key,digest_size=16).digest()
        with self.lock:
            self.entries={k:v for k,v in self.entries.items() if now-v[0]<60}
            keys=[('admin',120)] if admin else [('all',1200),(digest,120)]
            if any(self.entries.get(k,(now,0))[1]>=limit for k,limit in keys): return False
            for k,_ in keys:
                since,count=self.entries.get(k,(now,0))
                self.entries[k]=(since,count+1)
            return True

def register_visitor_routes(app,visitor_repository,require_role):
    repo=visitor_repository
    if repo is None:
        try: repo=MongoVisitorRepository.from_env()
        except Exception: repo=None
    limiter=RateLimit()

    @app.after_request
    def private_analytics(response):
        if request.path.startswith(('/api/admin/visitor-activity','/api/visitor-events')):
            response.headers['Cache-Control']='no-store'
        return response

    def unavailable():
        return jsonify(error='Visitor analytics unavailable. Check database configuration or retry.'),503

    def limited(admin=False):
        if limiter.allow(request.remote_addr or 'unknown',admin): return None
        return jsonify(error='Too many analytics requests. Retry shortly.'),429,{'Retry-After':'60'}

    @app.post('/api/visitor-events')
    def collect():
        origins={s.strip() for s in app.config['ALLOWED_ORIGINS'].split(',') if s.strip()}
        if request.headers.get('Origin') not in origins: return jsonify(error='Origin not allowed'),403
        failure=limited()
        if failure: return failure
        if not request.is_json: return jsonify(error='JSON required'),415
        if request.content_length is not None and request.content_length>16384:
            return jsonify(error='Analytics request exceeds 16 KB'),413
        raw=request.stream.read(16385)
        if len(raw)>16384: return jsonify(error='Analytics request exceeds 16 KB'),413
        try: payload=json.loads(raw)
        except (ValueError,UnicodeError): invalid()
        rows=validate_batch(payload,utcnow())
        if repo is None: return unavailable()
        try: return jsonify(accepted=repo.insert_events(rows)),202
        except Exception: return unavailable()

    def report(kind,session_id=None):
        _,failure=require_role('admin')
        if failure: return failure
        failure=limited(True)
        if failure: return failure
        allowed={'start','end'} if kind=='summary' else {'start','end','cursor','limit'}
        if set(request.args)-allowed or any(len(request.args.getlist(k))!=1 for k in request.args): invalid()
        start,end=validate_report_range(request.args,utcnow())
        limit=50 if kind=='sessions' else 200
        if kind!='summary':
            try: supplied=int(request.args.get('limit',limit))
            except ValueError: invalid()
            if not 1<=supplied<=limit: invalid()
            limit=supplied
            from .visitor_repository import decode_cursor
            decode_cursor(request.args.get('cursor'))
        if session_id: identifier(session_id)
        if repo is None: return unavailable()
        try:
            if kind=='summary': result=repo.summary(start,end)
            elif kind=='sessions': result=repo.sessions(start,end,request.args.get('cursor'),limit)
            else: result=repo.timeline(session_id,start,end,request.args.get('cursor'),limit)
            return jsonify(result)
        except Exception: return unavailable()

    app.add_url_rule('/api/admin/visitor-activity/summary','visitor_summary',lambda:report('summary'))
    app.add_url_rule('/api/admin/visitor-activity/sessions','visitor_sessions',lambda:report('sessions'))
    app.add_url_rule('/api/admin/visitor-activity/sessions/<session_id>','visitor_timeline',lambda session_id:report('timeline',session_id))
