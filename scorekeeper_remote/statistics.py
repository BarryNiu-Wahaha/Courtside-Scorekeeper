from datetime import datetime, timezone
from scorekeeper_pipeline.validation import POINTS

def build_snapshot(revision, roster, games):
    output=[]
    for game in games:
        if game.get('deleted'): continue
        totals={}
        for p in game['participation']:
            totals[p['player_id']]={'player_id':p['player_id'],'player_name':'Guest Player' if p['player_id']=='P_GUEST' else p['player_name'],'jersey_number':p['jersey_number'],'played_ms':p['played_ms'],'played_count':p['played_count'],'starter_count':p['starter_count'],'designated_count':p['designated_count'],'stats':{k:0 for k in ('points','fgm','fga','threeMade','threeAttempts','ftm','fta','offensive','defensive','rebounds','assists','steals','blocks','turnovers','fouls')}}
        home=away=0
        for e in game['events']:
            if e.is_voided: continue
            if e.team_side=='HOME': home+=e.points_value
            else: away+=e.points_value
            if e.player_id not in totals: continue
            s=totals[e.player_id]['stats']; t=e.event_type; s['points']+=e.points_value
            if t in ('2PT_MADE','3PT_MADE'): s['fgm']+=1
            if t.startswith(('2PT_','3PT_')): s['fga']+=1
            if t=='3PT_MADE': s['threeMade']+=1
            if t.startswith('3PT_'): s['threeAttempts']+=1
            if t=='FT_MADE': s['ftm']+=1
            if t.startswith('FT_'): s['fta']+=1
            mapping={'OFF_REBOUND':'offensive','DEF_REBOUND':'defensive','ASSIST':'assists','STEAL':'steals','BLOCK':'blocks','TURNOVER':'turnovers','FOUL':'fouls'}
            if t in mapping:s[mapping[t]]+=1
            s['rebounds']=s['offensive']+s['defensive']
        output.append({'game_id':game['game_id'],'game_date':game['game_date'].isoformat(),'opponent':game['opponent'],'home_points':home,'away_points':away,'coverage':game['coverage'],'players':list(totals.values())})
    public_roster=[{k:p.get(k) for k in ('player_id','player_name','jersey_number','enrollment_year','status_override')} for p in roster if p['player_id']!='P_GUEST']
    return {'schema_version':1,'revision':revision,'generated_at':datetime.now(timezone.utc).isoformat().replace('+00:00','Z'),'roster':public_roster,'games':output}
