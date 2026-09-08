import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from test_pipeline import BASE, fixture

ROOT=Path(__file__).resolve().parents[1]

class CLITests(unittest.TestCase):
    def command(self,text,*args):
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)/'input.csv';p.write_text(text,encoding='utf-8-sig',newline='')
            return subprocess.run([sys.executable,'-m','scorekeeper_pipeline',*args,str(p)],cwd=ROOT,env={**os.environ,'PYTHONUTF8':'1'},input='',text=True,capture_output=True,encoding='utf-8',timeout=20)
    def test_validate_works_without_mysql_or_password(self):
        result=self.command(fixture([BASE]),'validate')
        self.assertEqual(result.returncode,0,result.stderr);self.assertIn('1 events',result.stdout);self.assertIn('G20260907_001',result.stdout)
    def test_invalid_import_fails_before_connecting_or_requesting_password(self):
        result=self.command(fixture([{**BASE,'points_value':'99'}]),'import','--host','127.0.0.1','--port','1')
        self.assertEqual(result.returncode,2,result.stderr);self.assertIn('points_value',result.stderr);self.assertNotIn('password',result.stderr.lower());self.assertNotIn('connect',result.stderr.lower())
    def test_missing_file_is_clear_nonzero_error(self):
        result=subprocess.run([sys.executable,'-m','scorekeeper_pipeline','validate','missing-events.csv'],cwd=ROOT,capture_output=True,text=True)
        self.assertEqual(result.returncode,2);self.assertNotIn('Traceback',result.stderr)

    def test_roster_validation_and_invalid_import_need_no_credentials(self):
        row=dict(player_id='P001',player_name='张三',jersey_number='7',enrollment_year='2022',status_override='')
        result=self.command(fixture([row],list(row)),'validate-roster')
        self.assertEqual(result.returncode,0,result.stderr)
        result=self.command(fixture([{**row,'player_id':'P_GUEST'}],list(row)),'import-roster','--host','127.0.0.1','--port','1','--apply')
        self.assertEqual(result.returncode,2,result.stderr);self.assertIn('reserved',result.stderr)
        self.assertNotIn('password',result.stderr.lower())

    def test_invalid_participation_rejected_before_credentials(self):
        result=self.command('wrong,columns\n1,2\n','import-participation','--host','127.0.0.1','--port','1')
        self.assertEqual(result.returncode,2);self.assertIn('Expected columns',result.stderr)
        self.assertNotIn('password',result.stderr.lower())

if __name__=='__main__':unittest.main()
