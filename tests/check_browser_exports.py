"""Validate browser smoke downloads against the real Python CSV contracts."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scorekeeper_pipeline.validation import read_csv
from scorekeeper_pipeline.roster import read_roster, read_participation

root=Path(__file__).resolve().parent/'artifacts'
roster=read_roster(root/'university_roster.csv')
assert len(roster)==27
assert any(p['status_override']=='graduated' for p in roster)
files=sorted(root.glob('*_participation.csv'),key=lambda p:p.stat().st_mtime,reverse=True)
assert files, 'Run browser-smoke.cjs first'
for path in files:
    rows=read_participation(path)
    if rows[0]['opponent']=='Guest coverage':
        batch=read_csv(path.with_name(path.name.replace('_participation.csv','_events.csv')))
        assert sum(e.points_value for e in batch.events if not e.is_voided)==6
        assert {e.player_id for e in batch.events}=={'P_GUEST'}
        guest=next(row for row in rows if row['player_id']=='P_GUEST')
        assert guest['designated_count']==guest['starter_count']==guest['played_count']==2
        assert guest['played_ms']>0
        assert len(rows)==4
        print('Browser exports validated: 27 university players, two guests aggregated, six points preserved, participation accepted.')
        break
else:
    raise AssertionError('Missing guest browser export; complete browser smoke first')
