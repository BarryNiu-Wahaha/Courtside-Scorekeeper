import csv
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest

if importlib.util.find_spec('scorekeeper_pipeline'):
    from scorekeeper_pipeline import validation as V
else:
    V = None

COLUMNS = 'game_id,event_id,game_date,opponent,player_id,player_name,jersey_number,quarter,game_clock,event_type,points_value,recorded_at,team_side,is_voided'.split(',')
BASE = dict(zip(COLUMNS, ['G20260907_001','1','2026-09-07','Team A','P007','牛天齐','7','2','06:31','3PT_MADE','3','2026-09-07T20:01:14.123Z','HOME','false']))

def fixture(rows, columns=COLUMNS):
    stream=io.StringIO(newline=''); writer=csv.DictWriter(stream,fieldnames=columns);writer.writeheader();writer.writerows(rows);return stream.getvalue()

class ValidationTests(unittest.TestCase):
    def load(self, text):
        self.assertIsNotNone(V, 'CSV validator must exist')
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'game.csv';path.write_text(text,encoding='utf-8-sig',newline='')
            return V.read_csv(path)

    def test_chinese_and_offset_timestamp_become_typed_utc_events(self):
        batch=self.load(fixture([{**BASE,'recorded_at':'2026-09-07T16:01:14.123-04:00'}]))
        event=batch.events[0]
        self.assertEqual(event.player_name,'牛天齐');self.assertEqual(event.jersey_number,7)
        self.assertEqual(event.recorded_at.isoformat(),'2026-09-07T20:01:14.123000')
        self.assertEqual(event.points_value,3);self.assertIs(event.is_voided,False)

    def test_all_event_codes_and_opponent_null_player_fields(self):
        cases=[('2PT_MADE',2),('2PT_MISSED',0),('3PT_MADE',3),('3PT_MISSED',0),('FT_MADE',1),('FT_MISSED',0),('OFF_REBOUND',0),('DEF_REBOUND',0),('ASSIST',0),('STEAL',0),('BLOCK',0),('TURNOVER',0),('FOUL',0)]
        rows=[{**BASE,'event_id':str(i+1),'event_type':code,'points_value':str(points),'team_side':'AWAY','player_id':'','player_name':'','jersey_number':''} for i,(code,points) in enumerate(cases)]
        events=self.load(fixture(rows)).events
        self.assertEqual(len(events),13);self.assertEqual(sum(e.points_value for e in events),6)
        self.assertIsNone(events[0].player_id);self.assertIsNone(events[0].jersey_number)

    def test_bad_second_row_rejects_entire_file_with_line_number(self):
        self.assertIsNotNone(V)
        with self.assertRaises(V.ValidationError) as caught:
            self.load(fixture([BASE,{**BASE,'event_id':'2','points_value':'2'}]))
        self.assertIn('line 3',str(caught.exception));self.assertIn('points_value',str(caught.exception))

    def test_invalid_fields_are_rejected_not_coerced(self):
        self.assertIsNotNone(V)
        variants=[{'event_id':'0'},{'event_id':'1.0'},{'event_id':'2147483648'},{'game_date':'2026-02-30'},{'event_type':'three'}, {'points_value':'-1'},{'is_voided':'maybe'},{'game_clock':'06:99'},{'quarter':'0'},{'recorded_at':'2026-09-07T20:01:14'},{'recorded_at':'garbage'},{'player_id':''},{'player_name':''},{'jersey_number':'100'},{'team_side':'OTHER'},{'game_id':'../../bad'},{'opponent':' '},{'team_side':'AWAY'},{'player_id':'P007 ' + chr(0)}]
        for variant in variants:
            with self.subTest(variant=variant), self.assertRaises(V.ValidationError):self.load(fixture([{**BASE,**variant}]))

    def test_headers_empty_duplicate_ids_and_mixed_game_metadata_rejected(self):
        self.assertIsNotNone(V)
        cases=[fixture([]),fixture([BASE]).replace('event_id,','event_id,event_id,',1),fixture([BASE,BASE]),fixture([BASE,{**BASE,'event_id':'2','opponent':'Different'}]),fixture([BASE,{**BASE,'event_id':'2','game_id':'G_OTHER'}]),fixture([BASE]).replace('game_clock,','unknown,',1)]
        for text in cases:
            with self.subTest(text=text[:80]),self.assertRaises(V.ValidationError):self.load(text)

    def test_csv_escaping_and_whitespace_normalization_preserve_content(self):
        batch=self.load(fixture([{**BASE,'opponent':'  Team, "A"\nB  ','player_name':' 牛天齐 ','is_voided':'true','quarter':'OT2'}],list(reversed(COLUMNS))))
        self.assertEqual(batch.events[0].opponent,'Team, "A"\nB');self.assertEqual(batch.events[0].quarter,'OT2');self.assertTrue(batch.events[0].is_voided);self.assertGreater(batch.normalized_fields,0)

    def test_malformed_quotes_extra_values_and_wrong_encoding_rejected(self):
        self.assertIsNotNone(V)
        for text in [fixture([BASE]).rstrip('\r\n')+',extra\r\n',','.join(COLUMNS)+'\r\n"unterminated']:
            with self.assertRaises(V.ValidationError):self.load(text)

    def test_invalid_timezone_offset_is_rejected_instead_of_normalized(self):
        for offset in ['+01:99','-00:60','+24:00']:
            with self.subTest(offset=offset),self.assertRaises(V.ValidationError):
                self.load(fixture([{**BASE,'recorded_at':'2026-09-07T12:00:00'+offset}]))

if __name__=='__main__':unittest.main()
