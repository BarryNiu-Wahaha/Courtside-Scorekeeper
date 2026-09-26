const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {snapshot}=require('./dashboard-fixture.cjs');
const E=require('../src/engine.js'),T=require('../src/team.js');
function groupSnapshot(){
 const doc=structuredClone(snapshot),zero={...doc.games[0].players[0].stats};for(const key in zero)zero[key]=0;
 const player=(id,name,played)=>({player_id:id,player_name:name,jersey_number:90,played_count:played,played_ms:played?60000:0,designated_count:1,stats:{...zero}});
 const old=player('P_OLD','Former teammate',1),bench=player('P_BENCH','Unused bench',0),active=player('P_ZERO','Zero-stat appearance',1);
 doc.roster.push(old,bench,active,player('P_NEW','New teammate',0));
 doc.games.find(g=>g.game_id==='spring').players.push(old);
 doc.games.find(g=>g.game_id==='fall1').players.push(bench,active);
 return doc;
}
const root=path.resolve(__dirname,'..'),artifacts=path.join(__dirname,'artifacts'),site=path.join(artifacts,'dashboard-site');
fs.mkdirSync(artifacts,{recursive:true});const profile=fs.mkdtempSync(path.join(artifacts,'browser-profile-dashboard-'));
let mode='normal';
const server=http.createServer((req,res)=>{let rel=decodeURIComponent(req.url.split('?')[0]);if(rel==='/')rel='/index.html';const filename=path.resolve(site,'.'+rel);if(!filename.startsWith(site+path.sep)){res.writeHead(403);return res.end();}try{if(rel==='/data/stats.json'&&mode==='error'){res.writeHead(503);return res.end();}let data=fs.existsSync(filename)?fs.readFileSync(filename):'';if(rel==='/data/stats.json'){let doc=mode==='empty'?{...snapshot,games:[]}:mode==='groups'?groupSnapshot():snapshot;if(mode==='legacy')doc={...snapshot,games:snapshot.games.map(({home_stats,away_stats,stats_complete,duration_ms,...g})=>g)};data=JSON.stringify(doc);}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(filename)]||'text/plain');res.end(data);}catch{res.writeHead(404);res.end();}});
let child,ws,base;const pending=new Map();let seq=0;const errors=[];const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}throw Error('Timed out waiting for '+expression);}
async function click(selector){await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.getClientRects().length)throw Error('Hidden/disabled/missing '+${JSON.stringify(selector)});n.click();})()`);}
async function view(name){if(await evaluate("matchMedia('(max-width:700px)').matches"))await click('.main-nav a[href="#'+name+'"]');}
async function change(selector,value,event='change'){await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);}
async function shot(name){fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'));}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 child=spawn(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 for(let i=0;i<100&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await delay(100);
 const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0],pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(p)msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);});
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"const RealDate=Date;window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:['2026-09-13T12:00:00']));}static now(){return new RealDate('2026-09-13T12:00:00').getTime();}};"});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/index.html'});await until("document.querySelector('#game-count')?.textContent==='7'");
 assert.equal(await evaluate("document.querySelector('#period-select').value"),'fall:2026');
 assert.equal(await evaluate("document.querySelector('#record').textContent"),'5–2–0');
 assert.equal(await evaluate("document.querySelectorAll('.leader-card').length"),6);
 assert.equal(await evaluate("document.querySelector('#latest-game')?.dataset.gameId"),'winter','overview leads with latest game in selected period');
 await click('#latest-game .latest-report');assert.equal(await evaluate("document.querySelector('#box-dialog').open"),true);await click('#box-close');
 await shot('dashboard-desktop');
 const density=await evaluate(`({leadersBottom:document.querySelector('#leader-grid').getBoundingClientRect().bottom,playersTop:document.querySelector('#players').getBoundingClientRect().top})`);
 console.log('Desktop content positions:',density);
 assert.ok(density.leadersBottom<=650,'team summary and leaders should fit comfortably in the first desktop screen');
 assert.ok(density.playersTop<=750,'player statistics should begin within the first desktop screen');
 await change('#period-select','spring:2026');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'2');
 await change('#category-select','official');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'1');assert.equal(await evaluate("document.querySelector('#latest-game').dataset.gameId"),'spring');
 await change('#period-select','year:2026');await change('#category-select','all');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'8');
 await change('#period-select','career');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'10');
 await change('#player-search','牛','input');assert.equal(await evaluate("document.querySelectorAll('#player-table tbody tr').length"),1);
 await view('players');await click('#player-table tbody button');assert.equal(await evaluate("document.querySelector('#player-dialog').open"),true);assert.ok((await evaluate("document.querySelector('#player-summary').textContent")).includes('20.0'));
 await change('#profile-period','spring:2026');assert.ok((await evaluate("document.querySelector('#player-note').textContent")).includes('2 appearances'));
 await change('#profile-period','career');await shot('dashboard-player');await click('#player-close');
 await change('#player-search','23','input');assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('Marcus Lee'));
 await change('#player-search','nothing-matches','input');assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('No players'));
 await change('#player-search','','input');await change('#period-select','fall:2026');
 await click('#leader-average');assert.equal(await evaluate("document.querySelector('#leader-average').getAttribute('aria-pressed')"),'true');
 await view('games');await click('#game-list button');assert.equal(await evaluate("document.querySelector('#box-dialog').open"),true);assert.ok((await evaluate("document.querySelector('#box-table').textContent")).includes('OREB'));
 const comparison=await evaluate("[...document.querySelectorAll('#game-comparison tbody tr')].map(r=>[...r.cells].map(c=>c.textContent))");
 assert.deepEqual(comparison.find(r=>r[0]==='Steals'),['Steals','7','5']);
 assert.deepEqual(comparison.find(r=>r[0]==='Rebounds'),['Rebounds','34','30']);
 assert.deepEqual(comparison.find(r=>r[0]==='3PT%'),['3PT%','40.0%','36.4%']);
 assert.deepEqual(comparison.find(r=>r[0]==='FT%'),['FT%','60.0%','100.0%']);
 assert.deepEqual(comparison.find(r=>r[0]==='Offensive rating'),['Offensive rating','114.9','100.6']);
 assert.ok((await evaluate("document.querySelector('#game-metrics').textContent")).includes('69.6'));
 assert.equal(await evaluate("document.querySelectorAll('#box-table tbody tr').length"),6);
 await shot('dashboard-game');await click('#box-close');
 for(const width of [1920,1194,768,600,541,320,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await evaluate('window.scrollTo(0,0)');await delay(100);assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'page overflow at '+width);await shot('dashboard-'+width);}
 assert.ok(await evaluate("document.querySelector('#latest-game').getBoundingClientRect().bottom<window.innerHeight"),'latest game fits on first phone screen');
 assert.ok(await evaluate("document.querySelector('.main-nav').getBoundingClientRect().top>window.innerHeight-120 && document.querySelector('.main-nav').getBoundingClientRect().bottom<=window.innerHeight"),'phone navigation stays at the viewport bottom');
 assert.equal(await evaluate("document.querySelector('#players').getClientRects().length"),0,'phone Overview hides player table');
 await click('.main-nav a[href="#players"]');
 assert.ok(await evaluate("document.querySelector('#players').getClientRects().length>0"));
 await evaluate('history.back()');await until("location.hash==='' && document.body.dataset.view==='overview'");
 await evaluate('history.forward()');await until("location.hash==='#players' && document.body.dataset.view==='players'");
 assert.equal(await evaluate("document.querySelector('#games').getClientRects().length"),0);
 assert.deepEqual(await evaluate("[...document.querySelectorAll('#player-table th')].filter(n=>n.getClientRects().length).map(n=>n.textContent.trim())"),['Player','GP','PPG ↓','RPG','APG']);
 assert.ok(await evaluate("document.querySelector('#player-table').scrollWidth<=document.querySelector('#player-table').clientWidth"),'phone player stats need no sideways scrolling');
 await change('#player-search','Marcus','input');await click('.main-nav a[href="#games"]');await click('.main-nav a[href="#players"]');
 assert.equal(await evaluate("document.querySelector('#player-search').value"),'Marcus','tab navigation retains search');
 await change('#player-search','','input');await shot('dashboard-phone-players');
 await click('.main-nav a[href="#games"]');await shot('dashboard-phone-games');
 await click('.main-nav a[href="#overview"]');

 await evaluate("document.querySelector('#leader-grid').scrollIntoView({behavior:'instant',block:'start'})");await shot('dashboard-leaders-mobile');
 await click('.analysis-disclosure>summary');await click('.more-metrics summary');assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'expanded team metrics overflow');
 await view('games');await click('#game-list button');assert.equal(await evaluate('document.querySelector("#box-dialog").getBoundingClientRect().width<=window.innerWidth'),true);await shot('dashboard-game-mobile');await click('#box-close');
 await view('players');await click('#player-table tbody button');assert.equal(await evaluate('document.querySelector("#player-dialog").scrollWidth<=document.querySelector("#player-dialog").clientWidth'),true,'player dialog should not scroll sideways');await shot('dashboard-player-mobile');await click('#player-close');
 await view('overview');
 const pointerOpen="(()=>{const n=document.querySelector('#latest-game .latest-report');n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch'}));n.click();return document.querySelector('#box-dialog').getAnimations().length;})()";
 assert.ok(await evaluate(pointerOpen)>0,'pointer-opened report gets a responsive entrance');await click('#box-close');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evaluate(pointerOpen),0,'reduced motion suppresses sheet movement');await click('#box-close');
 await send('Emulation.setEmulatedMedia',{features:[]});
 assert.equal(await evaluate("(()=>{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));document.querySelector('#latest-game .latest-report').click();return document.querySelector('#box-dialog').getAnimations().length;})()"),0,'keyboard actions open immediately');await click('#box-close');
 const savedName=snapshot.roster[0].player_name;snapshot.roster[0].player_name='Alexandria Montgomery';
 await send('Page.reload');await until("document.querySelector('#game-count')?.textContent==='7'");await click('#leader-average');
 for(const width of [1194,320,390]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});
  const readable=await evaluate(`Array.from(document.querySelectorAll('.leader-card .player-link')).every(n=>n.clientWidth>=n.closest('.leader-card').clientWidth-28 && n.scrollWidth<=n.clientWidth)`);
  assert.ok(readable,'long and tied leader names have a readable full-width line at '+width);
 }
 snapshot.roster[0].player_name=savedName;
 mode='groups';await send('Page.reload');await until("document.querySelector('#game-count')?.textContent==='7'");await view('players');
 assert.equal(await evaluate("document.querySelectorAll('#player-table tbody tr').length"),7);
 assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('Zero-stat appearance'));
 assert.equal(await evaluate("document.querySelector('#player-table').textContent.includes('Unused bench')"),false);
 await click('#players-other');assert.equal(await evaluate("document.querySelectorAll('#player-table tbody tr').length"),3);
 await change('#player-search','Former','input');await view('players');await click('#player-table tbody button');
 assert.ok((await evaluate("document.querySelector('#player-note').textContent")).includes('0 appearances'));
 await change('#profile-period','spring:2026');assert.ok((await evaluate("document.querySelector('#player-note').textContent")).includes('1 appearances'));await click('#player-close');
 await change('#player-search','','input');await click('#players-appeared');assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('Former teammate'));
 await change('#period-select','fall:2026');await change('#category-select','friendly');assert.equal(await evaluate("document.querySelectorAll('#player-table tbody tr').length"),6);
 await click('#players-other');assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('Zero-stat appearance'));
 assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'player filters fit on phone');
 await change('#category-select','all');await click('#players-appeared');await evaluate("document.querySelector('#players').scrollIntoView({behavior:'instant',block:'start'})");await shot('dashboard-player-tabs-mobile');
 mode='empty';await send('Page.reload');await until("document.querySelector('#game-count')?.textContent==='0'");assert.ok((await evaluate("document.querySelector('#game-list').textContent")).includes('No games'));await view('overview');assert.equal(await evaluate("document.querySelector('#latest-game').dataset.gameId"),undefined);await shot('dashboard-empty');
 mode='error';await send('Page.reload');await until("document.querySelector('#retry-load')&&!document.querySelector('#retry-load').hidden");mode='normal';await click('#retry-load');await until("document.querySelector('#game-count').textContent==='7'");
 mode='legacy';await send('Page.reload');await until("document.querySelector('#game-count').textContent==='7'");assert.equal(await evaluate("document.querySelector('#pace').textContent"),'—');assert.ok((await evaluate("document.querySelector('#team-comparison').textContent")).includes('unavailable'));
 await view('games');await click('#game-list button');
 const legacyRows=await evaluate("[...document.querySelectorAll('#game-comparison tbody tr')].map(r=>[...r.cells].map(c=>c.textContent))");
 assert.deepEqual(legacyRows.find(r=>r[0]==='Points'),['Points','80','70']);
 assert.deepEqual(legacyRows.find(r=>r[0]==='Steals'),['Steals','7','—']);
 assert.deepEqual(legacyRows.find(r=>r[0]==='Offensive rating'),['Offensive rating','—','—']);await click('#box-close');
 mode='normal';snapshot.roster[0].player_name='<img src=x onerror=alert(1)>';await send('Page.reload');await until("document.querySelector('#game-count').textContent==='7'");assert.equal(await evaluate("document.querySelectorAll('#player-table img,#leader-grid img').length"),0);assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('<img src=x'));
 await click('a[href="Front.html"]');await until("!!document.querySelector('#new-game-button')");
 const roster=Array.from({length:5},(_,i)=>({id:'P_NAV_'+i,name:'Navigation '+i,number:i}));
 const game=E.createGame({date:'2026-09-20',opponent:'Navigation test',minutes:10,overtimeMinutes:5},roster);T.configure(game,roster.map(p=>p.id),roster.map(p=>p.id));E.start(game,Date.now());E.recordEvent(game,'2PT_MADE',roster[0],'HOME');E.pause(game,Date.now());
 const saved=JSON.stringify({version:2,roster,games:[game],currentGameId:game.id});await evaluate(`localStorage.setItem('courtside.v2',${JSON.stringify(saved)})`);await send('Page.reload');await until("document.querySelector('#home-score')?.textContent==='2'");
 assert.equal(await evaluate("!document.querySelector('#hosted-nav').hidden"),true);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'scorekeeper navigation fits on phone');await shot('scorekeeper-navigation-mobile');
 await click('#statistics-link');await until("document.querySelector('#game-count')?.textContent==='7'");
 await click('a[href="Front.html"]');await until("document.querySelector('#home-score')?.textContent==='2'");assert.equal(await evaluate("JSON.parse(localStorage.getItem('courtside.v2')).games[0].gameEvents.length"),1);
 await click('#staff-admin-link');await until("!!document.querySelector('#login-form')");await click('a[href="index.html"]');await until("document.querySelector('#game-count')?.textContent==='7'");
 assert.deepEqual(errors,[]);console.log('Dashboard Edge checks passed: season/year/career/category filters, averages, search, profiles, games, leader toggle, responsive layouts, empty/error/retry; no JS exceptions.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(ws?.readyState===1){try{await send('Browser.close');}catch{}ws.close();}child?.kill();server.close();await delay(500);if(path.dirname(profile)===artifacts&&path.basename(profile).startsWith('browser-profile-dashboard-')){try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{}}});
