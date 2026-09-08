const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const enginePath = path.join(__dirname, '../src/engine.js');
const E = fs.existsSync(enginePath) ? require(enginePath) : {};
const player = {id:'permanent-7', name:'牛天齐', number:7};
const config = {date:'2026-09-07', opponent:'Team A', minutes:10, overtimeMinutes:5};
function game() { assert.equal(typeof E.createGame,'function','event engine must create a game'); return E.createGame(config,[player]); }
test('all thirteen stat actions create exactly one sequential event with correct point values', () => {
  const g=game(); E.start(g,1000);
  const cases=[['2PT_MADE',2],['2PT_MISSED',0],['3PT_MADE',3],['3PT_MISSED',0],['FT_MADE',1],['FT_MISSED',0],['OFF_REBOUND',0],['DEF_REBOUND',0],['ASSIST',0],['STEAL',0],['BLOCK',0],['TURNOVER',0],['FOUL',0]];
  cases.forEach(([type,points],i)=>{const e=E.recordEvent(g,type,player,'HOME',2000); assert.equal(g.gameEvents.length,i+1); assert.equal(e.event_id,i+1); assert.equal(e.points_value,points); assert.equal(e.event_type,type);});
  assert.equal(g.gameEvents[0].game_clock,'09:59'); assert.equal(g.gameEvents[0].player_name,'牛天齐');
  assert.equal(E.stats(g,'HOME').points,6); assert.equal(E.stats(g,'HOME').fga,4); assert.equal(E.stats(g,'HOME').rebounds,2);
});
test('metadata is snapshotted and opponent records have no player identity',()=>{
 const g=game(); E.start(g,0); const p={...player}; const e=E.recordEvent(g,'3PT_MADE',p,'HOME',1000); p.name='changed'; p.number=42;
 assert.equal(e.player_name,'牛天齐'); assert.equal(e.jersey_number,7); assert.equal(e.player_id,'permanent-7'); assert.equal(e.game_date,'2026-09-07'); assert.equal(e.recorded_at,'1970-01-01T00:00:01.000Z');
 const a=E.recordEvent(g,'2PT_MADE',null,'AWAY',2000); assert.equal(a.player_id,''); assert.equal(a.player_name,''); assert.equal(a.jersey_number,''); assert.equal(E.stats(g,'AWAY').points,2); assert.equal(E.stats(g,'HOME').points,3);
});
test('undo retains voided events, corrects stats and never reuses IDs',()=>{
 const g=game(); E.start(g,0); E.recordEvent(g,'3PT_MADE',player,'HOME',0); E.undo(g);
 assert.equal(g.gameEvents.length,1); assert.equal(g.gameEvents[0].is_voided,true); assert.equal(E.stats(g,'HOME').points,0);
 assert.equal(E.recordEvent(g,'FT_MADE',player,'HOME',0).event_id,2); E.undo(g); assert.equal(E.undo(g),null);
});
test('clock uses elapsed time, freezes on pause and corrects only while paused',()=>{
 const g=game(); E.start(g,1000); assert.equal(E.clock(g,62500),'08:59'); assert.throws(()=>E.setClock(g,'08:00'));
 E.pause(g,62500); assert.equal(E.clock(g,900000),'08:59'); E.setClock(g,'06:31'); E.start(g,100000); assert.equal(E.clock(g,106000),'06:25');
 E.pause(g,900000); assert.equal(E.clock(g,900000),'00:00'); assert.throws(()=>E.setClock(g,'2:99'));
});
test('period transitions include distinct overtime labels and do not generate events',()=>{
 const g=game(); for(let i=0;i<4;i++) E.nextPeriod(g); assert.equal(g.quarter,'OT1'); assert.equal(E.clock(g,0),'05:00'); E.nextPeriod(g); assert.equal(g.quarter,'OT2'); assert.equal(g.gameEvents.length,0);
});
test('invalid actions do not append events; late paused records are allowed once started',()=>{
 const g=game(); assert.throws(()=>E.recordEvent(g,'ASSIST',player,'HOME',0)); E.start(g,0); E.pause(g,0);
 for(const args of [['bad',player,'HOME'],['ASSIST',null,'HOME'],['ASSIST',player,'OTHER'],['ASSIST',{id:'unknown'},'HOME']]) assert.throws(()=>E.recordEvent(g,...args,0));
 assert.equal(g.gameEvents.length,0); E.recordEvent(g,'ASSIST',player,'HOME',0); assert.equal(g.gameEvents.length,1); g.finished=true; assert.throws(()=>E.recordEvent(g,'ASSIST',player,'HOME',0));
});
test('CSV preserves Chinese, commas, quotes, newlines and includes void markers',()=>{
 const g=game(); g.opponent='Team, "A"\nB'; E.start(g,0); E.recordEvent(g,'3PT_MADE',player,'HOME',0); E.undo(g); const csv=E.csv(g);
 assert.ok(csv.startsWith('\uFEFFgame_id,event_id,game_date,opponent,player_id,player_name,jersey_number,quarter,game_clock,event_type,points_value,recorded_at,team_side,is_voided\r\n'));
 assert.ok(csv.includes('"Team, ""A""\nB"')); assert.ok(csv.includes('牛天齐')); assert.ok(csv.endsWith(',HOME,true\r\n'));
});
test('game IDs are unique and serialized games retain clock, events and player identity',()=>{
 const g=game(); assert.notEqual(g.id,game().id); E.start(g,1000); E.recordEvent(g,'2PT_MISSED',player,'HOME',2000);
 const restored=JSON.parse(JSON.stringify(g)); assert.equal(E.clock(restored,3000),'09:58'); assert.equal(E.stats(restored,'HOME',player.id).fga,1); assert.equal(restored.roster[0].id,player.id);
});
test('invalid setup values and clock values are rejected',()=>{
 game(); for(const bad of [{minutes:0},{minutes:100},{minutes:1.5},{opponent:' '},{date:'2026-02-30'},{overtimeMinutes:-1}]) assert.throws(()=>E.createGame({...config,...bad},[player]));
 const g=game(); for(const v of ['-1:00','abc','99:99','100:00']) assert.throws(()=>E.setClock(g,v));
});
test('backup validation accepts complete state and rejects malformed or inconsistent events',()=>{
 const g=game(); E.start(g,0); E.recordEvent(g,'3PT_MADE',player,'HOME',0);
 const state={version:2,roster:[player],games:[g],currentGameId:g.id};
 assert.equal(typeof E.validateState,'function','backup validator must exist'); assert.equal(E.validateState(state),true);
 for(const edit of [s=>s.games[0].gameEvents[0].points_value=99,s=>s.games[0].gameEvents[0].event_id=0,s=>s.games[0].gameEvents[0].is_voided='false',s=>s.currentGameId='missing',s=>s.roster.push({...player}),s=>s.games[0].deadline='tomorrow',s=>s.games[0].gameEvents[0].player_id='missing']) {
  const broken=JSON.parse(JSON.stringify(state)); edit(broken); assert.throws(()=>E.validateState(broken));
 }
});
test('game and player IDs work when randomUUID is unavailable on a local-network page',()=>{
 const vm=require('node:vm'); const crypto=require('node:crypto').webcrypto;
 const context=vm.createContext({crypto:{getRandomValues:crypto.getRandomValues.bind(crypto)}});
 vm.runInContext(fs.readFileSync(enginePath,'utf8'),context);
 const a=context.ScoreEngine.uuid(), b=context.ScoreEngine.uuid();
 assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.notEqual(a,b);
});
test('backup snapshots freeze running clocks at export time without pausing the live game',()=>{
 const g=game(); E.start(g,1000);
 const s={version:2,roster:[player],games:[g],currentGameId:g.id};
 assert.equal(typeof E.backup,'function','snapshot export must exist');
 const exported=E.backup(s,62500);
 assert.equal(E.clock(exported.games[0],90000000),'08:59');assert.equal(exported.games[0].running,false);
 assert.equal(g.running,true);assert.equal(E.clock(g,63500),'08:58');assert.equal(E.validateState(exported),true);
});
