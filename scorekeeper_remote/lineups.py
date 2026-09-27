"""Historical on-court identities and derived plus-minus, independent of clock speed."""
from collections import Counter
from scorekeeper_pipeline.validation import ValidationError


def validate_lineups(value, events, participation):
    def require(ok):
        if not ok: raise ValidationError('Invalid event lineup metadata')
    require(isinstance(value, dict) and type(value.get('version')) is int and value['version'] == 1 and isinstance(value.get('snapshots'), list))
    event_ids={e.event_id for e in events}; seen=set(); identities={p['player_id']:p for p in participation}; result=[]; mappings={}
    for snapshot in value['snapshots']:
        require(isinstance(snapshot, dict))
        eid=snapshot.get('event_id');status=snapshot.get('status');members=snapshot.get('members')
        require(type(eid) is int and eid in event_ids and eid not in seen and status in ('complete','partial','unknown') and isinstance(members,list))
        require(len(members)<=5 and (status!='complete' or len(members)==5) and (status!='unknown' or not members))
        seen.add(eid);local_ids=set();counts=Counter();clean=[]
        for member in members:
            require(isinstance(member,dict));local=member.get('local_player_id');pid=member.get('player_id')
            require(isinstance(local,str) and 0<len(local)<=128 and local not in local_ids and isinstance(pid,str) and pid in identities)
            require(pid=='P_GUEST' or pid==local)
            require(local not in mappings or mappings[local]==pid)
            mappings[local]=pid;local_ids.add(local);counts[pid]+=1
            require(counts[pid]<=identities[pid]['designated_count'])
            clean.append({'local_player_id':local,'player_id':pid})
        result.append({'event_id':eid,'status':status,'members':clean})
    require(seen==event_ids)
    require(sum(pid=='P_GUEST' for pid in mappings.values())<=identities.get('P_GUEST',{}).get('designated_count',0))
    return {'version':1,'snapshots':result}


def calculate_plus_minus(events, snapshots, participation):
    indexed={s['event_id']:s for s in snapshots};values={p['player_id']:0 for p in participation};status='complete'
    for event in events:
        if event.is_voided or not event.points_value:continue
        snap=indexed.get(event.event_id)
        if not snap or snap['status']!='complete':
            status='partial' if snap and snap['status']=='partial' and status!='unknown' else 'unknown'
            continue
        for member in snap['members']:
            pid=member['player_id']
            if pid in values and pid!='P_GUEST':values[pid]+=event.points_value*(1 if event.team_side=='HOME' else -1)
    return {pid:{'value':v if status=='complete' and pid!='P_GUEST' else None,'status':status if pid!='P_GUEST' else 'unknown'} for pid,v in values.items()}
