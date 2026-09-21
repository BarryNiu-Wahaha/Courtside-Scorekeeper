const test=require('node:test'),assert=require('node:assert/strict');
const E=require('../src/engine.js');
const team=()=>require('../src/team.js');
const roster=()=>Array.from({length:16},(_,i)=>({id:'P_'+i,name:'Player '+i,number:i}));
const game=()=>E.createGame({date:'2026-09-07',opponent:'Test',minutes:10,overtimeMinutes:5},roster());

test('pregame roster refresh updates selected players and adds choices without resetting lineup or guests',()=>{
 const T=team(),g=game(),guest={id:'GUEST_local',name:'Local guest',number:88,guest:true};g.roster.push(guest);
 const ids=['P_0','P_1','P_2','P_3',guest.id];T.configure(g,ids,ids);
 const before=structuredClone({lineup:g.lineup,squad:g.squad,starters:g.starters,participation:g.participation});
 const incoming=[{...g.roster[0],name:'Updated player',number:77},{id:'P_NEW',name:'New player',number:98}];
 assert.equal(T.refreshPregameRoster(g,incoming),true);
 assert.equal(g.roster.find(p=>p.id==='P_0').name,'Updated player');assert.equal(g.roster.find(p=>p.id==='P_0').number,77);
 assert.ok(g.roster.some(p=>p.id==='P_NEW'));assert.ok(g.roster.some(p=>p.id==='P_15'));
 assert.deepEqual(g.roster.find(p=>p.id===guest.id),guest);
 assert.deepEqual({lineup:g.lineup,squad:g.squad,starters:g.starters,participation:g.participation},before);
 incoming[0].name='Later mutation';assert.equal(g.roster[0].name,'Updated player');
 E.validateState({version:2,roster:roster(),games:[g],currentGameId:g.id});
 assert.equal(T.refreshPregameRoster(g,g.roster.filter(p=>!p.guest)),false);
});

test('roster refresh leaves started, finished, and upload-locked games unchanged',()=>{
 for(const flags of [{started:true},{finished:true},{remote:{state:'pending'}},{gameEvents:[{event_id:1}]}]){
  const g=Object.assign(game(),flags),before=structuredClone(g);
  assert.equal(team().refreshPregameRoster(g,[{id:'P_0',name:'Changed',number:99}]),false);assert.deepEqual(g,before);
 }
});

test('official roster replaces selectable defaults, archives local people and resets obsolete pregame selections',()=>{
 const T=team(),ready=game(),played=game(),ids=ready.roster.slice(0,5).map(p=>p.id);
 T.configure(ready,ids,ids);T.configure(played,ids,ids);E.start(played,1000);E.pause(played,2000);
 const original=structuredClone(played),s={version:2,roster:roster(),games:[ready,played],currentGameId:ready.id};
 const official=Array.from({length:6},(_,i)=>({id:'P_OFFICIAL_'+i,name:'Official '+i,number:i+20}));
 T.applySharedRoster(s,official);
 assert.deepEqual(s.roster,official);assert.equal(s.localRosterArchive.length,16);assert.deepEqual(ready.roster,official);
 assert.equal(ready.lineup,undefined);assert.equal(ready.squad,undefined);assert.deepEqual(played,original);E.validateState(s);
 official[0].name='Updated official';T.applySharedRoster(s,official);
 assert.equal(s.roster[0].name,'Updated official');assert.equal(ready.roster[0].name,'Updated official');assert.equal(s.localRosterArchive.length,16);
 assert.ok(E.backup(s).localRosterArchive.some(p=>p.id==='P_0'));
 const invalid=E.backup(s);invalid.localRosterArchive[0].number=-1;assert.throws(()=>E.validateState(invalid));
});

test('official roster preserves valid starters and guests but removes absent bench players',()=>{
 const T=team(),g=game(),guest={id:'GUEST_keep',name:'Game guest',number:99,guest:true};g.roster.push(guest);
 const five=['P_0','P_1','P_2','P_3',guest.id];T.configure(g,[...five,'P_4'],five);
 const s={version:2,roster:roster(),games:[g],currentGameId:g.id};T.applySharedRoster(s,roster().slice(0,4));
 assert.deepEqual(g.lineup,five);assert.deepEqual(g.squad,five);assert.equal(g.roster.length,5);assert.ok(g.roster.some(p=>p.guest));assert.equal(g.participation.P_4,undefined);E.validateState(s);
 const before=structuredClone(s);assert.throws(()=>T.applySharedRoster(s,[]));assert.deepEqual(s,before);
 assert.throws(()=>T.applySharedRoster(s,[s.roster[0],s.roster[0]]));assert.deepEqual(s,before);
});
test('September cutoff, override, and unknown year',()=>{const T=team();assert.equal(T.status({enrollmentYear:2022},new Date(2026,7,31)),'Astudent');assert.equal(T.status({enrollmentYear:2022},new Date(2026,8,1)),'graduated');assert.equal(T.status({enrollmentYear:2022,statusOverride:'Astudent'},new Date(2026,8,1)),'Astudent');assert.equal(T.status({}),'Unknown');});
test('roster CSV round trips Unicode and quoted names, retains missing people, rejects duplicate identities',()=>{const T=team(),r=[{id:'P_LEGACY_1',name:'张,三"',number:7,enrollmentYear:2022,statusOverride:null}];const out=T.parseRoster(T.rosterCSV(r),[{id:'old',name:'Old',number:7}]);assert.equal(out.length,2);assert.equal(out.find(p=>p.id===r[0].id).name,r[0].name);assert.throws(()=>T.parseRoster(T.rosterCSV([...r,...r]),[]));assert.throws(()=>T.parseRoster('player_id,player_name,jersey_number,enrollment_year,status_override\nP_GUEST,Guest,0,,',[]));});
test('squad limits and starters are enforced atomically',()=>{const T=team(),g=game(),ids=g.roster.map(p=>p.id);assert.throws(()=>T.configure(g,ids,ids.slice(0,5)));assert.equal(g.squad,undefined);assert.throws(()=>T.configure(g,ids.slice(0,10),ids.slice(0,4)));T.configure(g,ids.slice(0,15),ids.slice(0,5));assert.equal(g.squad.length,15);assert.throws(()=>T.substitute(g,[...ids.slice(0,4),ids[15]]));assert.deepEqual(g.lineup,ids.slice(0,5));});
test('substitutions, pauses, corrections, reload and expiry count only running elapsed time',()=>{const T=team();let g=game();T.configure(g,g.roster.slice(0,8).map(p=>p.id),g.roster.slice(0,5).map(p=>p.id));E.start(g,1000);E.pause(g,61000);assert.equal(T.minutes(g,'P_0',61000),1);T.substitute(g,['P_1','P_2','P_3','P_4','P_5'],61000);E.setClock(g,'02:00');E.start(g,100000);g=JSON.parse(JSON.stringify(g));E.pause(g,999999);assert.equal(T.minutes(g,'P_0'),1);assert.equal(T.minutes(g,'P_1'),3);assert.equal(T.minutes(g,'P_5'),2);assert.equal(T.minutes(g,'P_6'),0);E.pause(g,999999);assert.equal(T.minutes(g,'P_1'),3);});
test('running backup snapshot does not mutate live timing',()=>{const T=team(),g=game();T.configure(g,g.roster.slice(0,5).map(p=>p.id),g.roster.slice(0,5).map(p=>p.id));E.start(g,1000);const s={version:2,roster:roster(),games:[g],currentGameId:g.id};const b=E.backup(s,61000);assert.equal(T.minutes(b.games[0],'P_0'),1);assert.equal(g.running,true);E.pause(g,121000);assert.equal(T.minutes(g,'P_0'),2);E.validateState(b);});
test('guest exports aggregate participation while preserving individual stat events anonymously',()=>{const T=team(),g=game();g.roster[0]={id:'GUEST_a',name:'Private A',number:80,guest:true};g.roster[1]={id:'GUEST_b',name:'Private B',number:81,guest:true};const ids=g.roster.slice(0,5).map(p=>p.id);T.configure(g,ids,ids);E.start(g,1000);E.recordEvent(g,'3PT_MADE',g.roster[0],'HOME',2000);E.recordEvent(g,'2PT_MADE',g.roster[1],'HOME',3000);E.pause(g,61000);const csv=E.csv(g);assert.ok(!csv.includes('Private'));assert.equal(csv.split('P_GUEST').length-1,2);const p=T.participationCSV(g,61000);assert.ok(!p.includes('Private'));assert.ok(p.includes('P_GUEST,Guest Player,0,2,2,2,120000'));assert.equal(g.gameEvents[0].player_name,'Private A');});
test('legacy games track partial participation without inventing past minutes',()=>{const T=team(),g=game();E.start(g,0);E.pause(g,60000);T.configure(g,g.roster.slice(0,5).map(p=>p.id),g.roster.slice(0,5).map(p=>p.id));assert.equal(g.coverage,'partial');assert.equal(T.minutes(g,'P_0'),0);});
test('paused lineup changes alone do not count as appearances',()=>{const T=team(),g=game(),ids=g.roster.slice(0,6).map(p=>p.id);T.configure(g,ids,ids.slice(0,5));E.start(g,1000);E.pause(g,2000);T.substitute(g,ids.slice(1),2000);T.substitute(g,ids.slice(0,5),2000);assert.equal(g.participation.P_5.played,false);});
test('roster imports only accept IDs supported by MySQL CSV contracts',()=>{assert.throws(()=>team().parseRoster('player_id,player_name,jersey_number,enrollment_year,status_override\nalice,Alice,7,2022,',[]));});
test('a paused stat establishes appearance without adding clock time',()=>{const T=team(),g=game(),ids=g.roster.slice(0,6).map(p=>p.id);T.configure(g,ids,ids.slice(0,5));E.start(g,1000);E.pause(g,2000);T.substitute(g,ids.slice(1),2000);E.recordEvent(g,'FT_MADE',g.roster[5],'HOME',2000);assert.equal(g.participation.P_5.played,true);assert.equal(g.participation.P_5.playedMs,0);});
test('minutes accumulate across periods and overtime and each export advances revision',()=>{const T=team(),g=game(),ids=g.roster.slice(0,5).map(p=>p.id);T.configure(g,ids,ids);E.start(g,0);E.pause(g,60000);for(let i=0;i<4;i++)E.nextPeriod(g);assert.equal(g.quarter,'OT1');E.start(g,100000);E.pause(g,999999);assert.equal(T.minutes(g,'P_0'),6);const revision=g.revision;T.participationCSV(g,999999);assert.ok(g.revision>revision);const next=g.revision;T.participationCSV(g,999999);assert.ok(g.revision>next);});
test('blank roster IDs work without randomUUID and damaged timing anchors are rejected',()=>{const T=team(),original=globalThis.crypto.randomUUID;try{globalThis.crypto.randomUUID=undefined;assert.match(T.parseRoster('player_id,player_name,jersey_number,enrollment_year,status_override\n,New,7,,',[])[0].id,/^P_/);}finally{globalThis.crypto.randomUUID=original;}const g=game(),ids=g.roster.slice(0,5).map(p=>p.id);T.configure(g,ids,ids);E.start(g,1000);g.timingAnchor=-100000000000000;assert.throws(()=>T.validateGame(g));});
