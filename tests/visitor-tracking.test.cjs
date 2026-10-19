const {test}=require('node:test');
const assert=require('node:assert/strict');
const {create}=require('../site/visitor-tracking.js');
const {randomUUID}=require('node:crypto');
function harness(options={}) {
  let now=Date.now(), mono=0; const listeners={}, timers=new Map(), sent=[], store=new Map(); let next=0;
  const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  const doc={visibilityState:'visible',addEventListener:(k,f)=>(listeners[k]??=[]).push(f),removeEventListener(){}};
  const dep={now:()=>now,mono:()=>mono,uuid:randomUUID,storage,document:doc,navigator:{userAgent:'Mobile Safari'},
    setTimeout:(f,ms)=>{const id=++next;timers.set(id,{f,at:mono+ms});return id;},clearTimeout:id=>timers.delete(id),
    fetch:async(url,config)=>{sent.push(JSON.parse(config.body));return {ok:true,status:202,headers:{get:()=>null}};},...options};
  const instance=create({enabled:true,apiBase:'https://api.example',page:'dashboard'},dep);
  async function advance(ms){now+=ms;mono+=ms;const due=[...timers].filter(([,t])=>t.at<=mono);for(const [id,t] of due){if(timers.delete(id))t.f();}await new Promise(setImmediate);}
  return {instance,advance,sent,store,dep,doc,fire:k=>{for(const f of listeners[k]||[])f();},clockJump:ms=>now+=ms};
}
test('disabled and privacy signals send nothing',async()=>{
  for(const navigator of [{doNotTrack:'1'},{globalPrivacyControl:true}]) {const h=harness({navigator});await h.advance(20000);assert.equal(h.sent.length,0);}
  const h=harness();h.instance.disable();await h.advance(20000);assert.equal(h.sent.length,0);assert.equal(h.store.get('courtside.visitor.optout'),'1');
});
test('collects real actions in bounded batches without search text',async()=>{
  const h=harness();h.instance.track('player_open',{player_id:'P012'});h.instance.track('search',{text:'private'});h.instance.track('player_open',{player_id:'P1',search:'private'});
  await h.advance(10000);assert.equal(h.sent[0].events.length,2);assert.equal(h.sent[0].events[1].event,'player_open');assert.ok(!JSON.stringify(h.sent).includes('private'));h.instance.destroy();
});
test('hidden and idle tabs do not inflate active time',async()=>{
  const h=harness();await h.advance(15000);h.doc.visibilityState='hidden';h.fire('visibilitychange');await h.advance(100000);h.doc.visibilityState='visible';h.fire('visibilitychange');await h.advance(15000);
  const values=h.sent.flatMap(x=>x.events).filter(x=>x.event==='engagement').map(x=>x.properties.active_ms);
  assert.ok(values.reduce((a,b)=>a+b,0)<=30000);assert.ok(values.every(x=>x<=15000));h.instance.destroy();
});
test('new documents use different sessions and same unexpired visitor',async()=>{
  const h=harness();await h.advance(10000);const h2=harness({storage:h.dep.storage});await h2.advance(10000);
  assert.equal(h.sent[0].events[0].visitor_id,h2.sent[0].events[0].visitor_id);assert.notEqual(h.sent[0].events[0].session_id,h2.sent[0].events[0].session_id);h.instance.destroy();h2.instance.destroy();
});
test('throwing storage still permits transient collection',async()=>{
  const h=harness({storage:{getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}}});await h.advance(10000);assert.equal(h.sent[0].events[0].event,'page_view');h.instance.destroy();
});
test('idle rollover sends a fresh page view and wall clock jumps do not inflate time',async()=>{
  const h=harness();await h.advance(10000);const first=h.sent[0].events[0].session_id;h.clockJump(3600000);h.instance.track('game_open',{game_id:'G1'});await h.advance(10000);
  const events=h.sent.flatMap(x=>x.events);assert.equal(events.filter(x=>x.event==='page_view').length,2);assert.notEqual(events.at(-1).session_id,first);assert.ok(events.filter(x=>x.event==='engagement').every(x=>x.properties.active_ms<=15000));h.instance.destroy();
});
test('queue bounded to 100 and retries reuse IDs',async()=>{
  const calls=[];let fail=true;
  const h=harness({fetch:async(_,config)=>{calls.push(JSON.parse(config.body));return {ok:!fail,status:fail?503:202,headers:{get:()=>null}};}});
  for(let i=0;i<150;i++)h.instance.track('game_open',{game_id:'G'+i});await h.advance(10000);fail=false;await h.advance(1000);
  assert.equal(calls[0].events.length,20);assert.deepEqual(calls[0],calls[1]);for(let i=0;i<6;i++)await h.advance(10000);
  assert.ok(new Set(calls.flatMap(x=>x.events).filter(x=>x.event==='game_open').map(x=>x.event_id)).size<=100);h.instance.destroy();
});
test('rate-limit backoff is respected by periodic flush',async()=>{
  let calls=0;
  const h=harness({fetch:async()=>{calls++;return {status:429,headers:{get:()=> '60'}};}});
  await h.advance(10000);assert.equal(calls,1);await h.advance(10000);assert.equal(calls,1);
  await h.advance(50000);assert.equal(calls,2);h.instance.destroy();
});
test('expired visitor ID is replaced, never extended',async()=>{
  const h=harness();await h.advance(10000);const old=h.sent[0].events[0].visitor_id;
  h.clockJump(91*86400000);h.instance.track('game_open',{game_id:'G1'});await h.advance(10000);
  assert.notEqual(h.sent.at(-1).events.at(-1).visitor_id,old);h.instance.destroy();
});
test('rapid input accumulates time without evicting page views or real actions',async()=>{
  const h=harness();h.instance.track('player_open',{player_id:'P1'});
  for(let i=0;i<110;i++){await h.advance(50);h.fire('keydown');}
  await h.advance(4500);const events=h.sent.flatMap(x=>x.events);
  assert.equal(events.filter(e=>e.event==='page_view').length,1);
  assert.equal(events.filter(e=>e.event==='player_open').length,1);h.instance.destroy();
});
test('hiding flushes the final visible interval',async()=>{
  const h=harness();await h.advance(5000);h.doc.visibilityState='hidden';h.fire('visibilitychange');await new Promise(setImmediate);
  const active=h.sent.flatMap(x=>x.events).filter(e=>e.event==='engagement').reduce((sum,e)=>sum+e.properties.active_ms,0);
  assert.equal(active,5000);h.instance.destroy();
});
test('showing an idle tab does not invent new interaction',async()=>{
  const h=harness();await h.advance(65000);h.doc.visibilityState='hidden';h.fire('visibilitychange');await new Promise(setImmediate);
  const sum=()=>h.sent.flatMap(x=>x.events).filter(e=>e.event==='engagement').reduce((sum,e)=>sum+e.properties.active_ms,0);
  const before=sum();h.doc.visibilityState='visible';h.fire('visibilitychange');await h.advance(15000);await h.advance(10000);
  assert.equal(sum(),before);h.instance.destroy();
});
