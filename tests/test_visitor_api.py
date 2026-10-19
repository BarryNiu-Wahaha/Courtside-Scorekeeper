import json
import unittest
import test_remote_api
from test_visitor_validation import event
from scorekeeper_remote.app import create_app
from scorekeeper_remote.repository import MemoryRepository
from scorekeeper_remote.visitor_repository import MemoryVisitorRepository

class VisitorApiTests(unittest.TestCase):
    token=test_remote_api.RemoteApiTests.token
    auth=test_remote_api.RemoteApiTests.auth
    def setUp(self):
        self.repo=MemoryVisitorRepository()
        self.app=create_app(MemoryRepository(),lambda _:None,dict(SECRET_KEY='test-secret-32-characters-long-enough',SCOREKEEPER_PIN='12345678',ADMIN_PIN='99999999',TESTING=True,ALLOWED_ORIGINS='https://site.example'),visitor_repository=self.repo)
        self.client=self.app.test_client()
        self.path='/api/admin/visitor-activity/summary'

    def post(self, **kw):
        return self.client.post('/api/visitor-events',json={'events':[event()]},headers={'Origin':'https://site.example'},**kw)

    def test_roles_and_no_store(self):
        self.assertEqual(self.client.get(self.path).status_code,401)
        self.assertEqual(self.client.get(self.path,headers=self.auth()).status_code,403)
        self.assertEqual(self.post().status_code,202)
        result=self.client.get(self.path,headers=self.auth('admin'))
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json['visits'],1)
        self.assertEqual(result.headers['Cache-Control'],'no-store')

    def test_immediate_summary_includes_events_received_at_current_clock_tick(self):
        from unittest.mock import patch
        from test_visitor_validation import NOW
        with patch('scorekeeper_remote.visitor_routes.utcnow',return_value=NOW):
            self.assertEqual(self.post().status_code,202)
            result=self.client.get(self.path,headers=self.auth('admin'))
            self.assertEqual(result.json['visits'],1)

    def test_origin_type_body_and_rate_limits(self):
        path='/api/visitor-events'
        self.assertEqual(self.client.post(path,json={}).status_code,403)
        self.assertEqual(self.client.post(path,data='x',headers={'Origin':'https://site.example'}).status_code,415)
        self.assertEqual(self.client.post(path,data='x'*16385,content_type='application/json',headers={'Origin':'https://site.example'}).status_code,413)
        self.assertEqual(self.client.post(path,json={'private':'x'},headers={'Origin':'https://site.example'}).status_code,400)
        for _ in range(120): self.post()
        self.assertEqual(self.post().status_code,429)

    def test_unavailable_does_not_break_games(self):
        def fail(*_): raise RuntimeError('private connection secret')
        self.repo.summary=fail
        result=self.client.get(self.path,headers=self.auth('admin'))
        self.assertEqual(result.status_code,503)
        self.assertNotIn('secret',result.get_data(as_text=True))
        self.assertEqual(self.client.get('/api/health').status_code,200)
        self.assertEqual(self.client.get('/api/roster').status_code,200)

    def test_invalid_query_and_pagination(self):
        headers=self.auth('admin')
        self.assertEqual(self.client.get(self.path+'?limit=999',headers=headers).status_code,400)
        self.assertEqual(self.client.get('/api/admin/visitor-activity/sessions?limit=51',headers=headers).status_code,400)
        self.assertEqual(self.client.get('/api/admin/visitor-activity/sessions?cursor=bad',headers=headers).status_code,400)
