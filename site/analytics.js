(function(root){
  'use strict';
  const keys=['points','fgm','fga','threeMade','threeAttempts','ftm','fta','offensive','defensive','rebounds','assists','steals','blocks','turnovers','fouls'];
  const empty=()=>Object.fromEntries(keys.map(k=>[k,0]));
  const number=v=>Number.isFinite(Number(v))?Number(v):0;
  const ratio=(a,b,scale=1)=>b>0&&Number.isFinite(a)&&Number.isFinite(b)?a/b*scale:null;
  const add=(to,from)=>{for(const k of keys)to[k]+=number(from?.[k]);return to;};
  function season(date){const [y,m]=date.split('-').map(Number);return m>=3&&m<=7?`spring:${y}`:`fall:${m<3?y-1:y}`;}
  function currentSeason(now=new Date()){return season(`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`);}
  function periodLabel(period){if(period==='career')return 'Entire career';const [kind,y]=period.split(':');return kind==='year'?y:`${kind==='spring'?'Spring':'Fall'} ${y}`;}
  function filterGames(games,{period='career',category='all'}={}){
    return games.filter(g=>!g.deleted&&(category==='all'||g.category===category)&&(period==='career'||(period.startsWith('year:')?g.game_date.slice(0,4)===period.slice(5):season(g.game_date)===period)));
  }
  function shooting(s){return {fg:ratio(s.fgm,s.fga,100),three:ratio(s.threeMade,s.threeAttempts,100),ft:ratio(s.ftm,s.fta,100),efg:ratio(s.fgm+.5*s.threeMade,s.fga,100),ts:ratio(s.points,2*(s.fga+.44*s.fta),100)};}
  function possession(s){return number(s.fga)-number(s.offensive)+number(s.turnovers)+.44*number(s.fta);}
  function gameMetrics(g){
    const m={possessions:null,pace:null,offensiveRating:null,defensiveRating:null,netRating:null};
    if(g.stats_complete!==true||!g.home_stats||!g.away_stats)return m;
    const h=possession(g.home_stats),a=possession(g.away_stats),poss=(h+a)/2;
    if(h<=0||a<=0||!Number.isFinite(poss))return m;
    m.possessions=poss;m.offensiveRating=ratio(g.home_points,poss,100);m.defensiveRating=ratio(g.away_points,poss,100);m.netRating=m.offensiveRating-m.defensiveRating;
    m.pace=ratio(poss,number(g.duration_ms)/60000,40);return m;
  }
  function summarize(snapshot,games){
    const identities=new Map((snapshot.roster||[]).map(p=>[p.player_id,p]));
    const players=new Map();let wins=0,losses=0,ties=0,points=0,allowed=0;
    const home=empty(),away=empty();let awayKnown=games.length>0;
    let possessions=0,offPoints=0,defPoints=0,pacePoss=0,duration=0,eligible=0,paceEligible=0;
    for(const g of games){
      points+=number(g.home_points);allowed+=number(g.away_points);
      if(g.home_points>g.away_points)wins++;else if(g.home_points<g.away_points)losses++;else ties++;
      add(home,g.home_stats|| (g.players||[]).reduce((s,p)=>add(s,p.stats),empty()));
      if(g.away_stats)add(away,g.away_stats);else awayKnown=false;
      const m=gameMetrics(g);
      if(m.possessions!==null){eligible++;possessions+=m.possessions;offPoints+=g.home_points;defPoints+=g.away_points;
        if(m.pace!==null){paceEligible++;pacePoss+=m.possessions;duration+=g.duration_ms/60000;}}
      for(const p of g.players||[]){
        if(!players.has(p.player_id))players.set(p.player_id,{...p,...identities.get(p.player_id),appearances:0,played_ms:null,partial:false,stats:empty(),games:[]});
        const total=players.get(p.player_id);
        if(p.player_id==='P_GUEST'){total.player_name='Guest Player';total.jersey_number=0;}
        total.appearances+=p.played_count>0?1:0;
        if(p.played_count>0&&p.played_ms!=null)total.played_ms=(total.played_ms??0)+number(p.played_ms);
        if(p.played_count>0)total.partial||=g.coverage!=='complete'||p.played_ms==null;
        add(total.stats,p.stats);total.games.push({game:g,player:p});
      }
    }
    // Team scores are authoritative, including older snapshots with partial player coverage.
    home.points=points;away.points=allowed;
    for(const p of players.values()){p.averages=Object.fromEntries(keys.map(k=>[k,ratio(p.stats[k],p.appearances)]));p.shooting=shooting(p.stats);}
    const off=ratio(offPoints,possessions,100),def=ratio(defPoints,possessions,100);
    return {games:games.length,wins,losses,ties,points,allowed,ppg:ratio(points,games.length),oppg:ratio(allowed,games.length),home,away:awayKnown?away:null,
      shooting:shooting(home),opponentShooting:awayKnown?shooting(away):null,players:[...players.values()],
      advanced:{eligible,paceEligible,possessions:eligible?possessions:null,pace:ratio(pacePoss,duration,40),offensiveRating:off,defensiveRating:def,netRating:off===null?null:off-def},
      offensiveReboundPct:awayKnown?ratio(home.offensive,home.offensive+away.defensive,100):null,
      defensiveReboundPct:awayKnown?ratio(home.defensive,home.defensive+away.offensive,100):null};
  }
  function playerGroups(snapshot,selectedPlayers){
    const identities=new Map();
    for(const g of snapshot.games||[])if(!g.deleted)for(const p of g.players||[])identities.set(p.player_id,p);
    for(const p of snapshot.roster||[])identities.set(p.player_id,{...identities.get(p.player_id),...p});
    const selected=new Map(selectedPlayers.map(p=>[p.player_id,p]));
    for(const p of selectedPlayers)if(!identities.has(p.player_id))identities.set(p.player_id,p);
    const appeared=selectedPlayers.filter(p=>p.appearances>0),other=[];
    for(const [id,identity] of identities){
      if(selected.get(id)?.appearances>0)continue;
      other.push(selected.get(id)||{...identity,appearances:0,played_ms:null,partial:false,stats:empty(),averages:Object.fromEntries(keys.map(k=>[k,null])),shooting:shooting(empty()),games:[]});
    }
    return {appeared,other};
  }
  function leaders(players,key,mode){
    const eligible=players.filter(p=>p.player_id!=='P_GUEST'&&p.appearances>0);
    const value=p=>mode==='average'?p.stats[key]/p.appearances:p.stats[key];
    const best=Math.max(0,...eligible.map(value));
    return {value:best>0?best:null,players:best>0?eligible.filter(p=>Math.abs(value(p)-best)<1e-9).sort((a,b)=>a.player_id.localeCompare(b.player_id)):[]};
  }
  const api={keys,empty,ratio,season,currentSeason,periodLabel,filterGames,shooting,gameMetrics,summarize,playerGroups,leaders};
  if(typeof module==='object'&&module.exports)module.exports=api;root.CourtSideAnalytics=api;
})(globalThis);
