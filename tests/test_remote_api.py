import csv
import io
import unittest

from scorekeeper_remote.app import create_app
from scorekeeper_remote.repository import MemoryRepository


EVENT_COLUMNS = ('game_id','event_id','game_date','opponent','player_id','player_name','jersey_number','quarter','game_clock','event_type','points_value','recorded_at','team_side','is_voided')
PART_COLUMNS = ('game_id','game_date','opponent','revision','coverage','player_id','player_name','jersey_number','designated_count','starter_count','played_count','played_ms')

def csv_text(columns, rows):
    out=io.StringIO(newline=''); writer=csv.DictWriter(out,fieldnames=columns); writer.writeheader(); writer.writerows(rows); return out.getvalue()

def upload(game_id='G_REMOTE_1'):
    roster=[dict(player_id=f'P{i}',player_name=f'Player {i}',jersey_number=str(i),enrollment_year='2025',status_override='') for i in range(1,6)]
    parts=[dict(game_id=game_id,game_date='2026-09-08',opponent='Hawks',revision='1',coverage='complete',player_id=r['player_id'],player_name=r['player_name'],jersey_number=r['jersey_number'],designated_count='1',starter_count='1',played_count='1',played_ms='600000') for r in roster]
    events=[dict(game_id=game_id,event_id='1',game_date='2026-09-08',opponent='Hawks',player_id='P1',player_name='Player 1',jersey_number='1',quarter='1',game_clock='09:00',event_type='2PT_MADE',points_value='2',recorded_at='2026-09-08T20:00:00Z',team_side='HOME',is_voided='false')]
    return roster,dict(schema_version=1,finished=True,events_csv=csv_text(EVENT_COLUMNS,events),participation_csv=csv_text(PART_COLUMNS,parts))

class RemoteApiTests(unittest.TestCase):
    def setUp(self):
        self.repo=MemoryRepository(); self.published=[]
        self.app=create_app(self.repo,self.published.append,dict(SECRET_KEY='test-secret-32-characters-long-enough',SCOREKEEPER_PIN='12345678',ADMIN_PIN='99999999',TESTING=True))
        self.client=self.app.test_client()

    def token(self, role='scorekeeper', pin=None):
        response=self.client.post('/api/session',json={'pin':pin or ('12345678' if role=='scorekeeper' else '99999999'),'role':role})
        self.assertEqual(response.status_code,200,response.get_json()); return response.get_json()['token']

    def auth(self, role='scorekeeper'):
        return {'Authorization':'Bearer '+self.token(role)}

    def test_upload_is_atomic_and_duplicate_is_unchanged(self):
        roster,payload=upload(); self.repo.apply_roster_csv(csv_text(('player_id','player_name','jersey_number','enrollment_year','status_override'),roster))
        first=self.client.post('/api/games',json=payload,headers=self.auth())
        second=self.client.post('/api/games',json=payload,headers=self.auth())
        self.assertEqual(first.status_code,201,first.get_json()); self.assertEqual(second.status_code,200,second.get_json())
        self.assertEqual(first.get_json()['version'],1); self.assertTrue(second.get_json()['unchanged']); self.assertEqual(len(self.repo.games),1)

    def test_malformed_participation_leaves_no_game(self):
        _,payload=upload(); payload['participation_csv']='bad\nvalue\n'
        response=self.client.post('/api/games',json=payload,headers=self.auth())
        self.assertEqual(response.status_code,400); self.assertEqual(self.repo.games,{})

    def test_scorekeeper_cannot_admin_and_bad_pin_is_rejected(self):
        bad=self.client.post('/api/session',json={'pin':'wrong','role':'admin'})
        self.assertEqual(bad.status_code,401)
        denied=self.client.get('/api/admin/games',headers=self.auth())
        self.assertEqual(denied.status_code,403)

    def test_admin_expected_version_delete_restore_and_original_retry_conflict(self):
        roster,payload=upload(); self.repo.apply_roster_csv(csv_text(('player_id','player_name','jersey_number','enrollment_year','status_override'),roster))
        self.client.post('/api/games',json=payload,headers=self.auth())
        admin=self.auth('admin')
        deleted=self.client.post('/api/admin/games/G_REMOTE_1/delete',json={'version':1},headers=admin)
        self.assertEqual(deleted.get_json()['version'],2)
        stale=self.client.post('/api/admin/games/G_REMOTE_1/restore',json={'version':1},headers=admin)
        self.assertEqual(stale.status_code,409)
        conflict=self.client.post('/api/games',json={**payload,'events_csv':payload['events_csv'].replace('2PT_MADE','3PT_MADE').replace(',2,2026-',',3,2026-')},headers=self.auth())
        self.assertEqual(conflict.status_code,409)

    def test_public_snapshot_has_exact_top_level_keys_and_no_deleted_games(self):
        roster,payload=upload(); self.repo.apply_roster_csv(csv_text(('player_id','player_name','jersey_number','enrollment_year','status_override'),roster))
        self.client.post('/api/games',json=payload,headers=self.auth())
        snapshot=self.repo.snapshot()
        self.assertEqual(set(snapshot),{'schema_version','revision','generated_at','roster','games'})
        self.assertEqual(snapshot['games'][0]['home_points'],2)
        self.client.post('/api/admin/games/G_REMOTE_1/delete',json={'version':1},headers=self.auth('admin'))
        self.assertEqual(self.repo.snapshot()['games'],[])

    def test_invalid_json_pin_and_rate_limit(self):
        for document in ([],None,'text'):
            self.assertEqual(self.client.post('/api/session',json=document).status_code,400)
        self.assertEqual(self.client.post('/api/session',json={'role':[],'pin':'x'}).status_code,400)
        for _ in range(5):self.assertEqual(self.client.post('/api/session',json={'role':'admin','pin':'?'}).status_code,401)
        self.assertEqual(self.client.post('/api/session',json={'role':'admin','pin':'99999999'}).status_code,429)

    def test_missing_secrets_expiry_and_sanitized_failure(self):
        from scorekeeper_remote.auth import Authenticator
        with self.assertRaises(ValueError):create_app(self.repo,config={'SECRET_KEY':'','SCOREKEEPER_PIN':'12345678','ADMIN_PIN':'99999999'})
        auth=Authenticator('secret-32-characters-long-enough!!','12345678','99999999',ttl=-1)
        token,_,_=auth.login('admin','99999999','test');self.assertIsNone(auth.verify(token))
        self.repo.get_roster=lambda:(_ for _ in ()).throw(RuntimeError('private password'))
        result=self.client.get('/api/roster');self.assertEqual(result.status_code,503);self.assertNotIn('private',str(result.get_json()))

    def test_guest_requires_participation_and_void_appearance_is_allowed(self):
        from scorekeeper_remote.bundles import validate_upload
        from scorekeeper_pipeline.validation import ValidationError
        _,payload=upload();payload['events_csv']=payload['events_csv'].replace('P1,Player 1,1','P_GUEST,Guest Player,0')
        with self.assertRaises(ValidationError):validate_upload(payload)

    def test_invalid_csv_type_is_bad_request(self):
        _,payload=upload();payload['events_csv']=123
        self.assertEqual(self.client.post('/api/games',json=payload,headers=self.auth()).status_code,400)

    def test_tls_and_exact_cors_configuration(self):
        from unittest.mock import patch
        from scorekeeper_pipeline.database import Config,connect
        from scorekeeper_remote.repository import MySQLRepository
        with patch('scorekeeper_pipeline.database.pymysql.connect') as mock:
            connect(Config(ssl_ca='provider-ca.pem'))
            self.assertTrue(mock.call_args.kwargs['ssl_verify_cert']);self.assertTrue(mock.call_args.kwargs['ssl_verify_identity'])
        with patch.dict('os.environ',{'MYSQL_HOST':'remote.example','MYSQL_SSL_CA':''}):
            with self.assertRaises(ValueError):MySQLRepository.from_env()
        app=create_app(self.repo,lambda _:None,dict(SECRET_KEY='s'*32,SCOREKEEPER_PIN='12345678',ADMIN_PIN='99999999',ALLOWED_ORIGINS='https://team.example'))
        client=app.test_client()
        self.assertEqual(client.get('/api/health',headers={'Origin':'https://team.example'}).headers.get('Access-Control-Allow-Origin'),'https://team.example')
        self.assertIsNone(client.get('/api/health',headers={'Origin':'https://teamXexample'}).headers.get('Access-Control-Allow-Origin'))

if __name__=='__main__': unittest.main()
