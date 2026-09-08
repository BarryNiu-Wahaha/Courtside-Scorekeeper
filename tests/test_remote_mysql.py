import os
import unittest
import uuid
from tests.test_remote_api import upload, csv_text
from scorekeeper_remote.bundles import validate_upload
from scorekeeper_remote.repository import MySQLRepository, Conflict
from scorekeeper_pipeline import database as D

@unittest.skipUnless(os.environ.get('SCOREKEEPER_TEST_PORT'),'Use isolated runner')
class RemoteMySQLTests(unittest.TestCase):
    def setUp(self):
        self.config=D.Config(host='127.0.0.1',port=int(os.environ['SCOREKEEPER_TEST_PORT']),user='root',database='remote_test_'+uuid.uuid4().hex[:10])
        self.repo=MySQLRepository(self.config);self.repo.migrate()
        roster,payload=upload();self.payload=payload
        self.repo.apply_roster_csv(csv_text(('player_id','player_name','jersey_number','enrollment_year','status_override'),roster))
    def tearDown(self):
        with D.connect(self.config,with_database=False) as c:
            with c.cursor() as q:q.execute(f'DROP DATABASE `{self.config.database}`')
    def test_initial_duplicate_and_different_retry(self):
        bundle=validate_upload(self.payload)
        self.assertFalse(self.repo.save_initial(bundle)['unchanged'])
        self.assertTrue(self.repo.save_initial(bundle)['unchanged'])
        changed=dict(self.payload);changed['events_csv']=changed['events_csv'].replace('09:00','08:59')
        with self.assertRaises(Conflict):self.repo.save_initial(validate_upload(changed))
    def test_stale_delete_and_restore(self):
        self.repo.save_initial(validate_upload(self.payload))
        deleted=self.repo.set_deleted('G_REMOTE_1',1,True);self.assertTrue(deleted['deleted'])
        with self.assertRaises(Conflict):self.repo.set_deleted('G_REMOTE_1',1,False)
        self.assertFalse(self.repo.set_deleted('G_REMOTE_1',2,False)['deleted'])
    def test_zero_event_game(self):
        _,payload=upload('G_ZERO');payload['events_csv']='\ufeff'+','.join(('game_id','event_id','game_date','opponent','player_id','player_name','jersey_number','quarter','game_clock','event_type','points_value','recorded_at','team_side','is_voided'))+'\n'
        self.assertEqual(self.repo.save_initial(validate_upload(payload))['version'],1)

    def test_unknown_roster_rolls_back(self):
        from scorekeeper_pipeline.validation import ValidationError
        bad={**self.payload,'participation_csv':self.payload['participation_csv'].replace('P5,','P99,')}
        before=self.repo.publication()['revision']
        with self.assertRaises(ValidationError):self.repo.save_initial(validate_upload(bad))
        self.assertEqual(self.repo.list_games(),[])
        self.assertEqual(self.repo.publication()['revision'],before)

    def test_failure_mid_write_rolls_back(self):
        from unittest.mock import patch
        original=self.repo._write
        def fail(q,b):original(q,b);raise RuntimeError('injected')
        before=self.repo.publication()['revision']
        with patch.object(self.repo,'_write',fail):
            with self.assertRaises(RuntimeError):self.repo.save_initial(validate_upload(self.payload))
        self.assertEqual(self.repo.list_games(),[])
        self.assertEqual(self.repo.publication()['revision'],before)
        self.assertEqual(self.repo.save_initial(validate_upload(self.payload))['version'],1)

    def test_admin_edit_historical_snapshot_and_original_retry(self):
        self.repo.save_initial(validate_upload(self.payload))
        changed={**self.payload,'events_csv':self.payload['events_csv'].replace('Player 1','Historical Name'),'participation_csv':self.payload['participation_csv'].replace('Player 1','Historical Name')}
        self.assertEqual(self.repo.replace('G_REMOTE_1',1,validate_upload(changed))['version'],2)
        self.assertEqual(self.repo.snapshot()['games'][0]['players'][0]['player_name'],'Historical Name')
        self.assertTrue(self.repo.save_initial(validate_upload(self.payload))['unchanged'])
        with self.assertRaises(Conflict):self.repo.replace('G_REMOTE_1',1,validate_upload(changed))
        with D.connect(self.config) as c:
            with c.cursor() as q:q.execute('SELECT COUNT(*) AS n FROM remote_audit');self.assertEqual(q.fetchone()['n'],1)

    def test_concurrent_initial_upload(self):
        from concurrent.futures import ThreadPoolExecutor
        bundle=validate_upload(self.payload)
        with ThreadPoolExecutor(2) as pool:results=list(pool.map(lambda _:self.repo.save_initial(bundle),range(2)))
        self.assertEqual(sorted(r['unchanged'] for r in results),[False,True])

    def test_publication_lock_and_revision_during_deploy(self):
        self.repo.save_initial(validate_upload(self.payload))
        other=MySQLRepository(self.config);captured=[]
        def deployment(snapshot):
            captured.append(snapshot['revision'])
            self.assertEqual(other.publish(lambda _:self.fail('second deployment entered')),'pending')
            other.set_deleted('G_REMOTE_1',1,True)
        self.assertEqual(self.repo.publish(deployment),'pending')
        state=self.repo.publication();self.assertEqual(state['published_revision'],captured[0]);self.assertGreater(state['revision'],captured[0])
        self.assertEqual(other.publish(lambda snapshot:self.assertEqual(snapshot['games'],[])),'published')
        def fail(snapshot):raise RuntimeError('secret-token')
        self.assertEqual(self.repo.publish(fail),'pending');self.assertNotIn('secret-token',str(self.repo.publication()))
        self.assertEqual(other.publish(lambda _:None),'published')

    def test_explicit_legacy_adoption_unknown_minutes(self):
        D.import_batch(self.config,validate_upload(self.payload).events)
        with self.assertRaises(Conflict):self.repo.save_initial(validate_upload(self.payload))
        self.assertEqual(self.repo.adopt_legacy(),1);self.assertEqual(self.repo.adopt_legacy(),0)
        game=self.repo.snapshot()['games'][0];self.assertEqual(game['home_points'],2);self.assertIsNone(game['players'][0]['played_ms'])
        self.assertEqual(self.repo.get_game('G_REMOTE_1')['version'],1)
        self.assertEqual(self.repo.get_game('G_REMOTE_1')['game_date'],'2026-09-08')
        self.assertEqual(self.repo.get_game('G_REMOTE_1')['opponent'],'Hawks')
        with self.assertRaises(Conflict):self.repo.save_initial(validate_upload(self.payload))
        self.repo.set_deleted('G_REMOTE_1',1,True);self.assertEqual(self.repo.snapshot()['games'],[])

if __name__=='__main__':unittest.main()

