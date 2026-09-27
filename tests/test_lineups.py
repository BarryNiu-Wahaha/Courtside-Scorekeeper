import copy
import unittest
from tests.test_remote_api import upload, csv_text
from scorekeeper_remote.bundles import validate_upload
from scorekeeper_remote.repository import MemoryRepository, Conflict

def payload_v2():
    roster,p=upload()
    p['schema_version']=2
    p['lineups']={'version':1,'snapshots':[{'event_id':1,'status':'complete','members':[{'local_player_id':f'P{i}','player_id':f'P{i}'} for i in range(1,6)]}]}
    return roster,p

class LineupTests(unittest.TestCase):
    def repository(self):
        roster,p=payload_v2();r=MemoryRepository();r.apply_roster_csv(csv_text(('player_id','player_name','jersey_number','enrollment_year','status_override'),roster));return r,p
    def test_v2_roundtrip_and_computed_plus_minus(self):
        r,p=self.repository();r.save_initial(validate_upload(p));self.assertEqual(r.get_game('G_REMOTE_1')['upload']['lineups'],p['lineups'])
        row=r.snapshot()['games'][0]['players'][0];self.assertEqual(row['plus_minus'],2);self.assertEqual(row['plus_minus_status'],'complete')
        self.assertTrue(r.save_initial(validate_upload(p))['unchanged'])
        p['events_csv']=p['events_csv'].replace('2PT_MADE,2','3PT_MADE,3');r.replace('G_REMOTE_1',1,validate_upload(p));self.assertEqual(r.snapshot()['games'][0]['players'][0]['plus_minus'],3)
    def test_duplicate_members_missing_event_and_forged_identity_rejected(self):
        _,p=payload_v2()
        for mutation in ('duplicate','missing','foreign'):
            q=copy.deepcopy(p);s=q['lineups']['snapshots'][0]
            if mutation=='duplicate':s['members'][1]=s['members'][0]
            elif mutation=='missing':s['event_id']=2
            else:s['members'][0]['player_id']='P_INVALID'
            with self.assertRaises(ValueError):validate_upload(q)
    def test_legacy_missing_lineups_and_downgrade(self):
        r,p=self.repository();r.save_initial(validate_upload(p));old=copy.deepcopy(p);old['schema_version']=1;del old['lineups']
        with self.assertRaises(Conflict):r.replace('G_REMOTE_1',1,validate_upload(old))
        r2=MemoryRepository();r2.roster=r.roster;r2.save_initial(validate_upload(old));self.assertIsNone(r2.snapshot()['games'][0]['players'][0]['plus_minus'])
    def test_unknown_snapshot_and_voided_score(self):
        r,p=self.repository();p['lineups']['snapshots'][0]={'event_id':1,'status':'unknown','members':[]};r.save_initial(validate_upload(p));self.assertIsNone(r.snapshot()['games'][0]['players'][0]['plus_minus'])
        p['events_csv']=p['events_csv'].replace('HOME,false','HOME,true');r.replace('G_REMOTE_1',1,validate_upload(p));self.assertEqual(r.snapshot()['games'][0]['players'][0]['plus_minus'],0)

    def test_multiple_guests_preserve_regular_player_values(self):
        from scorekeeper_remote.lineups import calculate_plus_minus, validate_lineups
        from types import SimpleNamespace
        events=[SimpleNamespace(event_id=1,points_value=3,team_side='HOME',is_voided=False)]
        parts=[{'player_id':'P1','designated_count':1},{'player_id':'P2','designated_count':1},{'player_id':'P3','designated_count':1},{'player_id':'P_GUEST','designated_count':2}]
        members=[{'local_player_id':p,'player_id':p} for p in ('P1','P2','P3')]+[{'local_player_id':p,'player_id':'P_GUEST'} for p in ('G1','G2')]
        value=validate_lineups({'version':1,'snapshots':[{'event_id':1,'status':'complete','members':members}]},events,parts)
        actual=calculate_plus_minus(events,value['snapshots'],parts)
        self.assertEqual(actual['P1']['value'],3);self.assertIsNone(actual['P_GUEST']['value'])
        from scorekeeper_remote.publishing import public_snapshot
        r,p=self.repository();r.save_initial(validate_upload(p));published=public_snapshot(r.snapshot())
        self.assertEqual(published['games'][0]['players'][0]['plus_minus'],2)
        self.assertNotIn('lineups',published['games'][0])

if __name__=='__main__':unittest.main()
