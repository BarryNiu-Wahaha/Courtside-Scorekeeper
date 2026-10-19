"""Local browser-test server; uses synthetic data and an in-memory repository only."""
import json
import sys
import tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from flask import send_from_directory
from werkzeug.serving import make_server
from scorekeeper_remote.app import create_app
from scorekeeper_remote.repository import MemoryRepository
from scorekeeper_remote.visitor_repository import MemoryVisitorRepository
from scorekeeper_remote.publishing import build_artifact

root=Path(__file__).resolve().parents[1]
app=create_app(MemoryRepository(),lambda _:None,dict(SECRET_KEY='visitor-browser-test-secret-32-characters',SCOREKEEPER_PIN='12345678',ADMIN_PIN='99999999',ALLOWED_ORIGINS=''),visitor_repository=MemoryVisitorRepository())
with tempfile.TemporaryDirectory(prefix='courtside-visitor-test-') as folder:
    @app.get('/')
    def index(): return send_from_directory(folder,'index.html')
    @app.get('/<path:name>')
    def assets(name): return send_from_directory(folder,name)
    server=make_server('127.0.0.1',0,app,threaded=True)
    base='http://127.0.0.1:'+str(server.server_port)
    app.config['ALLOWED_ORIGINS']=base
    snapshot=json.loads((root/'tests/artifacts/visitor-fixture.json').read_text(encoding='utf-8'))
    build_artifact(root,folder,snapshot,base,visitor_tracking=True)
    print(base,flush=True)
    server.serve_forever()
