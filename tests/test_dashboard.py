import copy
import csv
import io
import unittest
from test_remote_api import upload, csv_text, EVENT_COLUMNS
from scorekeeper_remote.bundles import validate_upload
from scorekeeper_remote.repository import MemoryRepository, digest
from scorekeeper_remote.publishing import public_snapshot
from scorekeeper_pipeline.validation import ValidationError


class DashboardContractTests(unittest.TestCase):
    def setUp(self):
        self.roster, self.payload = upload()
        self.repo = MemoryRepository()
        self.repo.apply_roster_csv(csv_text(('player_id','player_name','jersey_number','enrollment_year','status_override'), self.roster))

    def test_snapshot_preserves_opponent_stats_and_metadata_without_private_fields(self):
        rows = list(csv.DictReader(io.StringIO(self.payload['events_csv'])))
        for i, kind in enumerate(('3PT_MADE','2PT_MISSED','FT_MISSED','OFF_REBOUND','TURNOVER','BLOCK'), 2):
            rows.append({**rows[0], 'event_id':str(i), 'player_id':'', 'player_name':'', 'jersey_number':'', 'team_side':'AWAY', 'event_type':kind, 'points_value':'3' if kind=='3PT_MADE' else '0'})
        rows.append({**rows[1], 'event_id':'8', 'is_voided':'true'})
        self.payload['events_csv'] = csv_text(EVENT_COLUMNS, rows)
        self.payload['game_details'] = dict(category='friendly', duration_ms=600000, stats_complete=True)
        self.repo.save_initial(validate_upload(self.payload))
        snapshot = self.repo.snapshot()
        snapshot['games'][0]['away_stats']['secret'] = 'private'
        game = public_snapshot(snapshot)['games'][0]
        self.assertEqual(game.get('category'), 'friendly')
        self.assertEqual(game.get('duration_ms'), 600000)
        self.assertTrue(game.get('stats_complete'))
        self.assertEqual(game['away_stats']['points'], 3)
        self.assertEqual(game['away_stats']['fga'], 2)
        self.assertEqual(game['away_stats']['offensive'], 1)
        self.assertEqual(game['away_stats']['turnovers'], 1)
        self.assertEqual(game['home_stats']['points'], 2)
        self.assertNotIn('private', str(game))

    def test_old_upload_normalization_preserves_retry_hash_and_unknown_metadata(self):
        bundle = validate_upload(self.payload)
        self.assertEqual(digest(bundle.upload), digest(self.payload))
        self.repo.save_initial(bundle)
        game = self.repo.snapshot()['games'][0]
        self.assertIsNone(game.get('category'))
        self.assertIsNone(game.get('duration_ms'))
        self.assertIs(game.get('stats_complete'), False)
        self.assertTrue(self.repo.save_initial(bundle)['unchanged'])

    def test_admin_metadata_roundtrip_audit_and_original_retry(self):
        self.payload['game_details'] = dict(category='friendly',duration_ms=600000,stats_complete=False)
        self.repo.save_initial(validate_upload(self.payload))
        changed = copy.deepcopy(self.payload)
        changed['game_details'] = dict(category='official',duration_ms=1200000,stats_complete=True)
        self.repo.replace('G_REMOTE_1',1,validate_upload(changed))
        self.assertEqual(self.repo.get_game('G_REMOTE_1')['upload']['game_details'], changed['game_details'])
        self.assertEqual(self.repo.snapshot()['games'][0].get('category'), 'official')
        self.assertEqual(self.repo.games['G_REMOTE_1']['audit'][0]['game_details']['category'], 'friendly')
        self.assertTrue(self.repo.save_initial(validate_upload(self.payload))['unchanged'])

    def test_reject_invalid_metadata_instead_of_silently_accepting(self):
        for details in ([], {'category':'practice'}, {'duration_ms':True}, {'duration_ms':0}, {'duration_ms':86400001}, {'stats_complete':'yes'}):
            with self.subTest(details=details), self.assertRaises(ValidationError):
                validate_upload({**self.payload,'game_details':details})

    def test_legacy_snapshot_keeps_missing_opponent_stats_unavailable(self):
        clean = public_snapshot(dict(schema_version=1, games=[dict(game_id='old',players=[])]))
        self.assertIsNone(clean['games'][0].get('away_stats'))


if __name__ == '__main__': unittest.main()
