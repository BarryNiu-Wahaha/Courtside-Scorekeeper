"""Real MySQL tests. Run through run_mysql_tests.py, not against user data."""
import dataclasses
import importlib.util
import os
from pathlib import Path
import tempfile
import unittest
import uuid
from test_pipeline import BASE, fixture
from scorekeeper_pipeline.validation import read_csv

if importlib.util.find_spec('scorekeeper_pipeline.database'):
    from scorekeeper_pipeline import database as D
else: D=None

@unittest.skipUnless(os.environ.get('SCOREKEEPER_TEST_PORT'),'Use tests/run_mysql_tests.py for a dedicated temporary server')
class MySQLTests(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(D,'MySQL importer must exist')
        self.config=D.Config(host='127.0.0.1',port=int(os.environ['SCOREKEEPER_TEST_PORT']),user='root',password='',database='scorekeeper_test_'+uuid.uuid4().hex[:12])
        D.initialize(self.config)
    def tearDown(self):
        if hasattr(self,'config'):
            self.assertTrue(self.config.database.startswith('scorekeeper_test_'))
            with D.connect(self.config,with_database=False) as connection:
                with connection.cursor() as cursor:cursor.execute(f'DROP DATABASE `{self.config.database}`')
    def batch(self,rows):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'events.csv';p.write_text(fixture(rows),encoding='utf-8-sig',newline='');return read_csv(p)
    def rows(self,sql,args=()):
        with D.connect(self.config) as conn:
            with conn.cursor() as cursor:cursor.execute(sql,args);return cursor.fetchall()
    def test_import_twice_preserves_chinese_and_does_not_duplicate(self):
        batch=self.batch([BASE]);first=D.import_batch(self.config,batch);second=D.import_batch(self.config,batch)
        self.assertEqual(first.inserted,1);self.assertEqual(second.inserted,0);self.assertEqual(second.unchanged,1)
        rows=self.rows('SELECT * FROM events');self.assertEqual(len(rows),1);self.assertEqual(rows[0]['player_name'],'牛天齐')
        self.assertEqual(D.summary(self.config,BASE['game_id'])['home_points'],3)
    def test_void_updates_and_stale_exports_cannot_reactivate_or_delete(self):
        first=self.batch([BASE]);D.import_batch(self.config,first)
        corrected=self.batch([{**BASE,'is_voided':'true'},{**BASE,'event_id':'2','event_type':'FT_MADE','points_value':'1'}])
        result=D.import_batch(self.config,corrected);self.assertEqual(result.voided,1);self.assertEqual(result.inserted,1)
        stale=D.import_batch(self.config,first);self.assertEqual(stale.stale_voids,1)
        self.assertEqual(D.summary(self.config,BASE['game_id'])['home_points'],1);self.assertEqual(len(self.rows('SELECT * FROM events')),2)
    def test_immutable_conflict_rolls_back_entire_file(self):
        D.import_batch(self.config,self.batch([BASE]))
        batch=self.batch([{**BASE,'event_type':'2PT_MADE','points_value':'2'},{**BASE,'event_id':'2','player_id':'P008','player_name':'New player'}])
        with self.assertRaises(D.ImportConflict):D.import_batch(self.config,batch)
        self.assertEqual(len(self.rows('SELECT * FROM events')),1);self.assertEqual(len(self.rows('SELECT * FROM players')),1)
        self.assertEqual(D.summary(self.config,BASE['game_id'])['home_points'],3)
    def test_game_metadata_conflict_keeps_original(self):
        D.import_batch(self.config,self.batch([BASE]))
        with self.assertRaises(D.ImportConflict):D.import_batch(self.config,self.batch([{**BASE,'opponent':'Other team'}]))
        self.assertEqual(self.rows('SELECT opponent FROM games')[0]['opponent'],'Team A')
    def test_opponent_events_do_not_create_players(self):
        row={**BASE,'team_side':'AWAY','player_id':'','player_name':'','jersey_number':''}
        D.import_batch(self.config,self.batch([row]));self.assertEqual(self.rows('SELECT * FROM players'),())
        event=self.rows('SELECT * FROM events')[0];self.assertIsNone(event['player_id']);self.assertEqual(D.summary(self.config,BASE['game_id'])['away_points'],3)
    def test_player_identity_survives_number_change_and_old_import(self):
        D.import_batch(self.config,self.batch([BASE]))
        later={**BASE,'game_id':'G20260908_001','game_date':'2026-09-08','jersey_number':'42','player_name':'Barry Niu','recorded_at':'2026-09-08T20:00:00Z'}
        D.import_batch(self.config,self.batch([later]));D.import_batch(self.config,self.batch([BASE]))
        player=self.rows('SELECT * FROM players')[0];self.assertEqual(player['jersey_number'],42);self.assertEqual(player['player_name'],'Barry Niu')
        self.assertEqual(self.rows('SELECT jersey_number FROM events WHERE game_id=%s',(BASE['game_id'],))[0]['jersey_number'],7)
    def test_database_failure_after_insert_rolls_back(self):
        # Bypass the validated input boundary deliberately to provoke a DB constraint failure mid-write.
        batch=self.batch([BASE,{**BASE,'event_id':'2'}]);bad=dataclasses.replace(batch.events[1],points_value=99)
        malformed=dataclasses.replace(batch,events=(batch.events[0],bad))
        with self.assertRaises(Exception):D.import_batch(self.config,malformed)
        self.assertEqual(self.rows('SELECT * FROM events'),());self.assertEqual(self.rows('SELECT * FROM games'),());self.assertEqual(self.rows('SELECT * FROM players'),())
    def test_identifiers_are_case_sensitive(self):
        D.import_batch(self.config,self.batch([BASE,{**BASE,'event_id':'2','player_id':'Pabc'},{**BASE,'event_id':'3','player_id':'PABC'}]))
        self.assertEqual(len(self.rows('SELECT * FROM players')),3)
    def test_reinitializing_schema_does_not_erase_data(self):
        D.import_batch(self.config,self.batch([BASE]));D.initialize(self.config);self.assertEqual(len(self.rows('SELECT * FROM events')),1)

    def test_roster_and_participation_imports(self):
        self.assertTrue(hasattr(D,'import_roster'),'roster database importer must exist')
        roster=[dict(player_id='P007',player_name='Roster name',jersey_number=9,enrollment_year=2022,status_override='Astudent')]
        self.assertEqual(D.import_roster(self.config,roster,apply=False)[0]['action'],'add')
        self.assertEqual(self.rows('SELECT * FROM players'),())
        D.import_roster(self.config,roster,apply=True)
        self.assertIsNone(self.rows('SELECT * FROM players')[0]['last_seen_at'])
        D.import_batch(self.config,self.batch([BASE]))
        self.assertEqual(self.rows('SELECT * FROM players')[0]['player_name'],'Roster name')
        from datetime import date
        rows=[dict(game_id=BASE['game_id'],game_date=date(2026,9,7),opponent='Team A',revision=100,coverage='complete',player_id='P007',player_name='Old name',jersey_number=7,designated_count=1,starter_count=1,played_count=1,played_ms=60000),dict(game_id=BASE['game_id'],game_date=date(2026,9,7),opponent='Team A',revision=100,coverage='complete',player_id='P_GUEST',player_name='Guest Player',jersey_number=0,designated_count=4,starter_count=4,played_count=4,played_ms=240000)]
        self.assertEqual(D.import_participation(self.config,rows),'updated')
        self.assertEqual(D.import_participation(self.config,rows),'unchanged')
        for revision in (99,100):
            with self.assertRaises(D.ImportConflict):D.import_participation(self.config,[{**r,'revision':revision,'played_ms':0} for r in rows])
        self.assertEqual(sum(r['played_ms'] for r in self.rows('SELECT * FROM game_participation')),300000)
        self.assertTrue(self.rows("SELECT is_guest FROM players WHERE player_id='P_GUEST'")[0]['is_guest'])
        bad=[{**r,'revision':101,'played_ms':-1} for r in rows]
        with self.assertRaises(Exception):D.import_participation(self.config,bad)
        self.assertEqual(sum(r['played_ms'] for r in self.rows('SELECT * FROM game_participation')),300000)
        self.assertEqual(self.rows('SELECT revision FROM participation_snapshots')[0]['revision'],100)
        D.import_participation(self.config,[{**r,'revision':102,'played_ms':r['played_ms']*2} for r in rows])
        self.assertEqual(sum(r['played_ms'] for r in self.rows('SELECT * FROM game_participation')),600000)

    def test_guest_event_import_marks_anonymous_aggregate(self):
        D.import_batch(self.config,self.batch([{**BASE,'player_id':'P_GUEST','player_name':'Guest Player','jersey_number':'0'}]))
        self.assertTrue(self.rows('SELECT is_guest FROM players')[0]['is_guest'])
        self.assertEqual(D.summary(self.config,BASE['game_id'])['home_points'],3)

    def test_migration_preserves_populated_legacy_tables(self):
        self.assertTrue(hasattr(D,'migrate'),'additive migration must exist')
        D.import_batch(self.config,self.batch([BASE]))
        with D.connect(self.config) as conn:
            with conn.cursor() as cursor:
                cursor.execute('ALTER TABLE players DROP COLUMN enrollment_year, DROP COLUMN status_override, DROP COLUMN is_guest, DROP COLUMN roster_managed')
                cursor.execute('ALTER TABLE players MODIFY last_seen_at DATETIME(6) NOT NULL')
        D.migrate(self.config);D.migrate(self.config)
        self.assertEqual(len(self.rows('SELECT * FROM events')),1)
        self.assertIn('enrollment_year',self.rows('SELECT * FROM players')[0])

    def test_workbench_queries_match_active_event_totals_and_percentages(self):
        base={**BASE,'player_id':'P_DEFAULT_001'}
        D.import_batch(self.config,self.batch([base,{**base,'event_id':'2','event_type':'3PT_MISSED','points_value':'0'},{**base,'event_id':'3','event_type':'FT_MADE','points_value':'1'},{**base,'event_id':'4','is_voided':'true'}]))
        sql=(Path(__file__).resolve().parents[1]/'sql'/'queries.sql').read_text(encoding='utf-8')
        sql='\n'.join(line for line in sql.splitlines() if not line.lstrip().startswith('--')).replace('USE scorekeeper;',f'USE `{self.config.database}`;')
        results=[]
        with D.connect(self.config) as connection:
            with connection.cursor() as cursor:
                for statement in sql.split(';'):
                    if statement.strip():
                        cursor.execute(statement)
                        if cursor.description:results.append(cursor.fetchall())
        self.assertEqual(len(results),4);self.assertEqual(results[0][0]['our_points'],4)
        self.assertEqual(results[1][0]['points'],4);self.assertEqual(results[1][0]['field_goal_pct'],50);self.assertEqual(results[1][0]['free_throw_pct'],100)
        self.assertEqual(results[2][0]['points'],4);self.assertEqual(len(results[3]),4)

if __name__=='__main__':unittest.main()
