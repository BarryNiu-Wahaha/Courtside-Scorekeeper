import os
from flask import Flask, jsonify, request
from flask_cors import CORS
from scorekeeper_pipeline.validation import ValidationError
from .auth import Authenticator
from .bundles import validate_upload
from .repository import Conflict, MemoryRepository

def create_app(repository=None,publisher=None,config=None):
    app=Flask(__name__); app.config.update(MAX_CONTENT_LENGTH=2*1024*1024,SECRET_KEY=os.getenv('SECRET_KEY',''),SCOREKEEPER_PIN=os.getenv('SCOREKEEPER_PIN',''),ADMIN_PIN=os.getenv('ADMIN_PIN',''),SESSION_TTL=3600,ALLOWED_ORIGINS=os.getenv('ALLOWED_ORIGINS',''))
    if config:app.config.update(config)
    auth=Authenticator(app.config['SECRET_KEY'],app.config['SCOREKEEPER_PIN'],app.config['ADMIN_PIN'],app.config['SESSION_TTL'])
    repo=repository or _repository_from_env()
    if publisher is None:
        try:
            from .publishing import CloudflarePublisher
            publisher=CloudflarePublisher.from_env()
        except (ImportError,AttributeError):publisher=None
    origins=[x.strip() for x in app.config['ALLOWED_ORIGINS'].split(',') if x.strip()]
    if origins:CORS(app,origins=origins,allow_headers=['Authorization','Content-Type'],methods=['GET','POST','PUT','OPTIONS'])
    def error(message,status):return jsonify(error=str(message)),status
    def role(required=None):
        header=request.headers.get('Authorization','')
        current=auth.verify(header[7:]) if header.startswith('Bearer ') else None
        if not current:return None,error('authentication required',401)
        if required=='admin' and current!='admin':return None,error('admin role required',403)
        return current,None
    def body():
        value=request.get_json(silent=True)
        if not isinstance(value,dict):raise ValidationError('JSON object required')
        return value
    def version(value):
        if type(value) is not int or value<1:raise ValidationError('Positive integer version required')
        return value
    def publish():
        if publisher is None:return 'pending'
        return repo.publish(publisher)
    @app.errorhandler(400)
    def bad_request(_):return error('Invalid request',400)
    @app.errorhandler(Exception)
    def unavailable(exc):
        from werkzeug.exceptions import HTTPException
        if isinstance(exc,HTTPException):return error(exc.name,exc.code)
        return error('Service temporarily unavailable',503)
    @app.errorhandler(413)
    def too_large(_):return error('request exceeds 2 MB limit',413)
    @app.errorhandler(ValidationError)
    def invalid(exc):return error(exc,400)
    @app.errorhandler(Conflict)
    def conflict(exc):return error(exc,409)
    @app.errorhandler(KeyError)
    def missing(exc):return error('game not found',404)
    @app.get('/api/health')
    def health():return jsonify(status='ok')
    @app.post('/api/session')
    def session():
        document=body(); token,message,status=auth.login(document.get('role'),document.get('pin'),request.remote_addr or 'unknown')
        return (jsonify(token=token,role=document['role']),200) if token else error(message,status)
    @app.get('/api/roster')
    def roster():return jsonify(players=repo.get_roster())
    @app.post('/api/games')
    def games():
        _,denied=role()
        if denied:return denied
        bundle=validate_upload(request.get_json(silent=True)); result=repo.save_initial(bundle); result['publication']=publish() if not result['unchanged'] else repo.publication()['state']
        result['publication_state']=repo.publication()
        return jsonify(result),200 if result['unchanged'] else 201
    @app.get('/api/admin/games')
    def game_list():
        _,denied=role('admin')
        if denied:return denied
        return jsonify(games=repo.list_games(),publication=repo.publication())
    @app.get('/api/admin/games/<game_id>')
    def game_detail(game_id):
        _,denied=role('admin')
        return denied or jsonify(repo.get_game(game_id))
    @app.put('/api/admin/games/<game_id>')
    def replace(game_id):
        _,denied=role('admin')
        if denied:return denied
        document=body(); result=repo.replace(game_id,version(document.get('version')),validate_upload(document.get('upload'))); result['publication']=publish();result['publication_state']=repo.publication();return jsonify(result)
    @app.post('/api/admin/games/<game_id>/<action>')
    def deletion(game_id,action):
        _,denied=role('admin')
        if denied:return denied
        if action not in ('delete','restore'):return error('unknown action',404)
        result=repo.set_deleted(game_id,version(body().get('version')),action=='delete');result['publication']=publish();result['publication_state']=repo.publication();return jsonify(result)
    @app.get('/api/admin/roster')
    def admin_roster():
        _,denied=role('admin')
        return denied or jsonify(players=repo.get_roster())
    @app.put('/api/admin/roster')
    def put_roster():
        _,denied=role('admin')
        if denied:return denied
        players=repo.apply_roster_csv(body().get('roster_csv'));state=publish();return jsonify(players=players,publication=state,publication_state=repo.publication())
    @app.post('/api/admin/publish')
    def retry_publish():
        _,denied=role('admin')
        if denied:return denied
        outcome=publish()
        return jsonify(publication=outcome,**repo.publication())
    return app

def _repository_from_env():
    from .repository import MySQLRepository
    return MySQLRepository.from_env()
