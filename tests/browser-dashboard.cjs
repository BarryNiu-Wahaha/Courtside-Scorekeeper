const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {snapshot}=require('./dashboard-fixture.cjs');
const root=path.resolve(__dirname,'..'),artifacts=path.join(__dirname,'artifacts'),site=path.join(artifacts,'dashboard-site');
fs.mkdirSync(artifacts,{recursive:true});const profile=fs.mkdtempSync(path.join(artifacts,'browser-profile-dashboard-'));
let mode='normal';
const server=http.createServer((req,res)=>{let rel=decodeURIComponent(req.url.split('?')[0]);if(rel==='/')rel='/index.html';const filename=path.resolve(site,'.'+rel);if(!filename.startsWith(site+path.sep)){res.writeHead(403);return res.end();}try{if(rel==='/data/stats.json'&&mode==='error'){res.writeHead(503);return res.end();}let data=fs.existsSync(filename)?fs.readFileSync(filename):'';if(rel==='/data/stats.json'){let doc=mode==='empty'?{...snapshot,games:[]}:snapshot;if(mode==='legacy')doc={...snapshot,games:snapshot.games.map(({home_stats,away_stats,stats_complete,duration_ms,...g})=>g)};data=JSON.stringify(doc);}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(filename)]||'text/plain');res.end(data);}catch{res.writeHead(404);res.end();}});
let child,ws,base;const pending=new Map();let seq=0;const errors=[];const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}throw Error('Timed out waiting for '+expression);}
async function click(selector){await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)throw Error('Disabled/missing '+${JSON.stringify(selector)});n.click();})()`);}
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
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/index.html'});await until("document.querySelector('#game-count')?.textContent==='7'");
 assert.equal(await evaluate("document.querySelector('#period-select').value"),'fall:2026');
 assert.equal(await evaluate("document.querySelector('#record').textContent"),'5–2–0');
 assert.equal(await evaluate("document.querySelectorAll('.leader-card').length"),6);
 await shot('dashboard-desktop');
 await change('#period-select','spring:2026');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'2');
 await change('#category-select','official');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'1');
 await change('#period-select','year:2026');await change('#category-select','all');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'8');
 await change('#period-select','career');assert.equal(await evaluate("document.querySelector('#game-count').textContent"),'10');
 await change('#player-search','牛','input');assert.equal(await evaluate("document.querySelectorAll('#player-table tbody tr').length"),1);
 await click('#player-table tbody button');assert.equal(await evaluate("document.querySelector('#player-dialog').open"),true);assert.ok((await evaluate("document.querySelector('#player-summary').textContent")).includes('20.0'));
 await change('#profile-period','spring:2026');assert.ok((await evaluate("document.querySelector('#player-note').textContent")).includes('2 appearances'));
 await change('#profile-period','career');await shot('dashboard-player');await click('#player-close');
 await change('#player-search','23','input');assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('Marcus Lee'));
 await change('#player-search','nothing-matches','input');assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('No players'));
 await change('#player-search','','input');await change('#period-select','fall:2026');
 await click('#leader-average');assert.equal(await evaluate("document.querySelector('#leader-average').getAttribute('aria-pressed')"),'true');
 await click('#game-list button');assert.equal(await evaluate("document.querySelector('#box-dialog').open"),true);assert.ok((await evaluate("document.querySelector('#box-table').textContent")).includes('OREB'));
 await shot('dashboard-game');await click('#box-close');
 for(const width of [1194,768,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await evaluate('window.scrollTo(0,0)');await delay(100);assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'page overflow at '+width);await shot('dashboard-'+width);}
 await click('.more-metrics summary');assert.equal(await evaluate('document.documentElement.scrollWidth<=window.innerWidth'),true,'expanded team metrics overflow');
 await click('#game-list button');assert.equal(await evaluate('document.querySelector("#box-dialog").getBoundingClientRect().width<=window.innerWidth'),true);await shot('dashboard-game-mobile');await click('#box-close');
 await click('#player-table tbody button');assert.equal(await evaluate('document.querySelector("#player-dialog").scrollWidth<=document.querySelector("#player-dialog").clientWidth'),true,'player dialog should not scroll sideways');await shot('dashboard-player-mobile');await click('#player-close');
 mode='empty';await send('Page.reload');await until("document.querySelector('#game-count')?.textContent==='0'");assert.ok((await evaluate("document.querySelector('#game-list').textContent")).includes('No games'));await shot('dashboard-empty');
 mode='error';await send('Page.reload');await until("document.querySelector('#retry-load')&&!document.querySelector('#retry-load').hidden");mode='normal';await click('#retry-load');await until("document.querySelector('#game-count').textContent==='7'");
 mode='legacy';await send('Page.reload');await until("document.querySelector('#game-count').textContent==='7'");assert.equal(await evaluate("document.querySelector('#pace').textContent"),'—');assert.ok((await evaluate("document.querySelector('#team-comparison').textContent")).includes('unavailable'));
 mode='normal';snapshot.roster[0].player_name='<img src=x onerror=alert(1)>';await send('Page.reload');await until("document.querySelector('#game-count').textContent==='7'");assert.equal(await evaluate("document.querySelectorAll('#player-table img,#leader-grid img').length"),0);assert.ok((await evaluate("document.querySelector('#player-table').textContent")).includes('<img src=x'));
 assert.deepEqual(errors,[]);console.log('Dashboard Edge checks passed: season/year/career/category filters, averages, search, profiles, games, leader toggle, responsive layouts, empty/error/retry; no JS exceptions.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(ws?.readyState===1){try{await send('Browser.close');}catch{}ws.close();}child?.kill();server.close();await delay(500);if(path.dirname(profile)===artifacts&&path.basename(profile).startsWith('browser-profile-dashboard-')){try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{}}});
