(function(root){
  'use strict';
  const GUEST='P_GUEST';
  const ROSTER_COLUMNS=['player_id','player_name','jersey_number','enrollment_year','status_override'];
  const PART_COLUMNS=['game_id','game_date','opponent','revision','coverage','player_id','player_name','jersey_number','designated_count','starter_count','played_count','played_ms'];
  const fail=message=>{throw Error(message);};
  function newId(){if(typeof root.crypto.randomUUID==='function')return root.crypto.randomUUID();const bytes=root.crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;}
  function status(p,date=new Date()){
    if(p.statusOverride)return p.statusOverride;
    if(p.enrollmentYear==null)return 'Unknown';
    return date>=new Date(p.enrollmentYear+4,8,1)?'graduated':'Astudent';
  }
  function validatePlayer(p){
    if(!p||typeof p.id!=='string'||!p.id||p.id.length>128||p.id===GUEST||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||!Number.isInteger(p.number)||p.number<0||p.number>99)fail('Invalid roster identity, name, or jersey number.');
    if(p.enrollmentYear!=null&&(!Number.isInteger(p.enrollmentYear)||p.enrollmentYear<1900||p.enrollmentYear>9995))fail('Enrollment year must be a whole year from 1900 to 9995.');
    if(p.statusOverride!=null&&!['Astudent','graduated'].includes(p.statusOverride))fail('Status override must be Astudent, graduated, or automatic.');
    if(p.guest!==undefined&&typeof p.guest!=='boolean')fail('Invalid guest category.');
  }
  function encode(columns,rows){const escape=v=>/[",\r\n]/.test(String(v??''))?'"'+String(v??'').replaceAll('"','""')+'"':String(v??'');return '\uFEFF'+columns.join(',')+'\r\n'+rows.map(r=>columns.map(k=>escape(r[k])).join(',')+'\r\n').join('');}
  function parseCSV(text){
    text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],value='',quoted=false,closed=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;continue;}
      if(c==='"'){if(value||closed)fail('Invalid CSV quoting.');quoted=true;continue;}
      if(c===','||c==='\n'||c==='\r'){row.push(value);value='';closed=false;if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;rows.push(row);row=[];}continue;}
      if(closed)fail('Unexpected characters after CSV quote.');value+=c;
    }
    if(quoted)fail('Unclosed CSV quote.');if(value||closed||row.length){row.push(value);rows.push(row);}return rows;
  }
  function rosterCSV(roster){return encode(ROSTER_COLUMNS,roster.filter(p=>!p.guest).map(p=>({player_id:p.id,player_name:p.name,jersey_number:p.number,enrollment_year:p.enrollmentYear,status_override:p.statusOverride})));}
  function parseRoster(text,existing=[]){
    const rows=parseCSV(text);if(!rows.length||rows[0].join(',')!==ROSTER_COLUMNS.join(','))fail('Roster CSV headers must be '+ROSTER_COLUMNS.join(',')+'.');
    const ids=new Set(),incoming=[];
    for(const [index,row] of rows.slice(1).entries()){
      if(row.length!==5)fail('Invalid roster row '+(index+2)+'.');
      const [rawId,name,number,year,override]=row.map(v=>v.trim());
      if(rawId&&!/^P[A-Za-z0-9_-]{1,127}$/.test(rawId))fail('Player IDs must start with P and contain only letters, digits, underscores, or hyphens.');
      if(!/^\d{1,2}$/.test(number)||year&&!/^\d{4}$/.test(year))fail('Invalid number or enrollment year on roster row '+(index+2)+'.');
      const p={id:rawId||'P_'+newId(),name,number:Number(number),enrollmentYear:year?Number(year):null,statusOverride:override||null};validatePlayer(p);
      if(ids.has(p.id))fail('Duplicate player ID: '+p.id);ids.add(p.id);incoming.push(p);
    }
    if(!incoming.length)fail('Roster CSV contains no players.');
    const merged=new Map(existing.map(p=>[p.id,{...p}]));for(const p of incoming)merged.set(p.id,p);return [...merged.values()];
  }
  function checkFive(game,ids,squad=game.squad){if(!Array.isArray(ids)||ids.length!==5||new Set(ids).size!==5||ids.some(id=>!squad.includes(id)))fail('Choose exactly five different players from the designated squad.');}
  function revision(game,now=Date.now()){game.revision=Math.max((game.revision||0)+1,Math.floor(now),1);}
  function refreshPregameRoster(game,roster){
    if(!game||game.started||game.running||game.finished||game.remote||game.gameEvents.length)return false;
    const merged=new Map(game.roster.map(p=>[p.id,{...p}]));
    for(const p of roster)if(!p.guest&&!merged.get(p.id)?.guest)merged.set(p.id,{...merged.get(p.id),...p});
    const next=[...merged.values()];
    if(JSON.stringify(next)===JSON.stringify(game.roster))return false;
    game.roster=next;revision(game);return true;
  }
  function configure(game,squadIds,starterIds){
    if(game.running||game.finished||game.squad&&game.started)fail('Squad selection is only available before play starts.');
    if(!Array.isArray(squadIds)||squadIds.length<5||squadIds.length>15||new Set(squadIds).size!==squadIds.length||squadIds.some(id=>!game.roster.some(p=>p.id===id)))fail('Choose between 5 and 15 different designated players.');
    checkFive(game,starterIds,squadIds);game.squad=[...squadIds];game.lineup=[...starterIds];game.starters=game.started?[]:[...starterIds];game.coverage=game.started?'partial':'complete';
    game.participation=Object.fromEntries(squadIds.map(id=>[id,{playedMs:0,played:false}]));game.timingAnchor=null;revision(game);
  }
  function settle(game,now=Date.now()){
    if(!game.squad||!game.running||game.timingAnchor==null)return;
    const end=Math.min(now,game.deadline),elapsed=Math.max(0,end-game.timingAnchor);
    if(elapsed){for(const id of game.lineup){game.participation[id].playedMs+=elapsed;game.participation[id].played=true;}game.timingAnchor=end;revision(game,now);}
  }
  function start(game,now){if(!game.squad)return;checkFive(game,game.lineup);game.timingAnchor=now;for(const id of game.lineup)game.participation[id].played=true;revision(game,now);}
  function substitute(game,ids,now=Date.now()){
    if(game.running||game.finished)fail('Pause the game before substituting.');checkFive(game,ids);game.lineup=[...ids];revision(game,now);
  }
  function minutes(game,id,now=Date.now()){
    if(!game.participation?.[id])return 0;let ms=game.participation[id].playedMs;
    if(game.running&&game.lineup.includes(id)&&game.timingAnchor!=null)ms+=Math.max(0,Math.min(now,game.deadline)-game.timingAnchor);return ms/60000;
  }
  function exportEvent(game,event){return game.roster.find(p=>p.id===event.player_id)?.guest?{...event,player_id:GUEST,player_name:'Guest Player',jersey_number:0}:event;}
  function participationCSV(game,now=Date.now()){
    if(!game.squad)fail('Participation is unavailable for this legacy game.');settle(game,now);revision(game,now);
    const rows=new Map();for(const id of game.squad){const p=game.roster.find(p=>p.id===id),key=p.guest?GUEST:id,part=game.participation[id];
      if(!rows.has(key))rows.set(key,{game_id:game.id,game_date:game.date,opponent:game.opponent,revision:game.revision,coverage:game.coverage,player_id:key,player_name:p.guest?'Guest Player':p.name,jersey_number:p.guest?0:p.number,designated_count:0,starter_count:0,played_count:0,played_ms:0});
      const row=rows.get(key);row.designated_count++;row.starter_count+=Number(game.starters.includes(id));row.played_count+=Number(part.played);row.played_ms+=part.playedMs;
    }return encode(PART_COLUMNS,[...rows.values()]);
  }
  function validateGame(game){
    if(game.squad===undefined)return;
    if(!Array.isArray(game.squad)||game.squad.length<5||game.squad.length>15||new Set(game.squad).size!==game.squad.length||game.squad.some(id=>!game.roster.some(p=>p.id===id)))fail('Invalid saved game squad.');
    checkFive(game,game.lineup);if(!['complete','partial'].includes(game.coverage)||!Array.isArray(game.starters)||(game.coverage==='complete'?game.starters.length!==5:game.starters.length!==0)||new Set(game.starters).size!==game.starters.length||game.starters.some(id=>!game.squad.includes(id)))fail('Invalid saved starters or participation coverage.');
    if(!Number.isSafeInteger(game.revision)||game.revision<1||!game.participation||Object.keys(game.participation).length!==game.squad.length)fail('Invalid saved participation.');
    for(const id of game.squad){const p=game.participation[id];if(!p||!Number.isSafeInteger(p.playedMs)||p.playedMs<0||typeof p.played!=='boolean'||p.playedMs>0&&!p.played)fail('Invalid saved player minutes.');}
    if(game.running&&(!Number.isSafeInteger(game.timingAnchor)||game.timingAnchor>game.deadline||game.timingAnchor<game.deadline-game.remainingMs))fail('Invalid saved timing anchor.');
  }
  const api={GUEST,ROSTER_COLUMNS,PART_COLUMNS,status,validatePlayer,rosterCSV,parseRoster,refreshPregameRoster,configure,settle,start,substitute,minutes,exportEvent,participationCSV,validateGame};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TeamEngine=api;
})(globalThis);
