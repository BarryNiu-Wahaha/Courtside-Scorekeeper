import importlib.util
import tempfile
from pathlib import Path
import unittest
from test_pipeline import fixture

class RosterTests(unittest.TestCase):
    def test_roster_and_participation_contracts(self):
        self.assertIsNotNone(importlib.util.find_spec('scorekeeper_pipeline.roster'), 'roster validation must exist')
        from scorekeeper_pipeline.roster import read_roster, read_participation, effective_status
        from datetime import date
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'roster.csv'
            row=dict(player_id='P007',player_name='张三',jersey_number='7',enrollment_year='2022',status_override='')
            path.write_text(fixture([row],list(row)),encoding='utf-8-sig')
            player=read_roster(path)[0]
            self.assertEqual(effective_status(player,date(2026,8,31)),'Astudent')
            self.assertEqual(effective_status(player,date(2026,9,1)),'graduated')
            for change in [dict(player_id='P_GUEST'),dict(status_override='retired'),dict(enrollment_year='22')]:
                path.write_text(fixture([{**row,**change}],list(row)),encoding='utf-8')
                with self.assertRaises(ValueError):read_roster(path)

    def test_participation_snapshots_validate_counts_guests_and_partial_coverage(self):
        from scorekeeper_pipeline.roster import read_participation,PARTICIPATION_COLUMNS
        rows=[dict(game_id='G001',game_date='2026-09-07',opponent='Team, A',revision='100',coverage='complete',player_id='P_GUEST',player_name='Guest Player',jersey_number='0',designated_count='5',starter_count='5',played_count='5',played_ms='300000')]
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'p.csv'
            def load(values):
                path.write_text(fixture(values,PARTICIPATION_COLUMNS),encoding='utf-8');return read_participation(path)
            self.assertEqual(load(rows)[0]['played_ms'],300000)
            partial={**rows[0],'coverage':'partial','starter_count':'0'}
            self.assertEqual(load([partial])[0]['coverage'],'partial')
            for change in [dict(player_name='Private guest'),dict(designated_count='16'),dict(played_count='0'),dict(revision='-1'),dict(starter_count='4')]:
                with self.assertRaises(ValueError):load([{**rows[0],**change}])
            with self.assertRaises(ValueError):load(rows*2)
