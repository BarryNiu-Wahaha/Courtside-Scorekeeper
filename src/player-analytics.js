(function(root){
  'use strict';
  const E=typeof module==='object'&&module.exports?require('./engine.js'):root.ScoreEngine;
  const ratio=(a,b,scale=1)=>b?scale*a/b:null;
  function player(game,id){
    const s=E.stats(game,'HOME',id);let plusMinus=0,plusMinusStatus='complete';
    for(const e of game.gameEvents){
      if(e.is_voided||!e.points_value)continue;
      const snap=e.lineupSnapshot;
      if(!snap||snap.status!=='complete'){plusMinusStatus=snap?.status==='partial'&&plusMinusStatus!=='unknown'?'partial':'unknown';continue;}
      if(snap.playerIds.includes(id))plusMinus+=(e.team_side==='HOME'?1:-1)*e.points_value;
    }
    return {fgPct:ratio(s.fgm,s.fga,100),threePct:ratio(s.threeMade,s.threeAttempts,100),ftPct:ratio(s.ftm,s.fta,100),efgPct:ratio(s.fgm+.5*s.threeMade,s.fga,100),tsPct:ratio(s.points,2*(s.fga+.44*s.fta),100),astTo:ratio(s.assists,s.turnovers),plusMinus:plusMinusStatus==='complete'?plusMinus:null,plusMinusStatus};
  }
  function csv(game){
    const columns=['player_id','player_name','jersey_number','points','fgm','fga','threeMade','threeAttempts','ftm','fta','rebounds','assists','steals','blocks','turnovers','fouls','fgPct','threePct','ftPct','efgPct','tsPct','astTo','plusMinus','plus_minus_status'];
    const escape=v=>/[",\r\n]/.test(String(v??''))?'"'+String(v).replaceAll('"','""')+'"':String(v??'');
    const rows=game.roster.filter(p=>!game.squad||game.squad.includes(p.id)).map(p=>{const a=player(game,p.id);return {player_id:p.id,player_name:p.name,jersey_number:p.number,...E.stats(game,'HOME',p.id),...a,plus_minus_status:a.plusMinusStatus};});
    return '\uFEFF'+columns.join(',')+'\r\n'+rows.map(r=>columns.map(k=>escape(r[k])).join(',')+'\r\n').join('');
  }
  const api={player,csv};if(typeof module==='object'&&module.exports)module.exports=api;else root.PlayerAnalytics=api;
})(globalThis);
