// Dependency-free Chromium smoke test. Uses installed Edge and the DevTools protocol.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const artifacts=path.join(__dirname,'artifacts');fs.mkdirSync(artifacts,{recursive:true});
const profile=fs.mkdtempSync(path.join(artifacts,'browser-profile-'));
const browser=process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const child=spawn(browser,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let ws;const pending=new Map();let id=0;const errors=[];const requests=[];
async function send(method,params={}){return new Promise((resolve,reject)=>{const key=++id;const timer=setTimeout(()=>{pending.delete(key);reject(Error('Timed out: '+method));},15000);pending.set(key,{resolve:r=>{clearTimeout(timer);resolve(r);},reject});ws.send(JSON.stringify({id:key,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function click(selector){await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled)throw Error('Missing or disabled: '+${JSON.stringify(selector)});e.click();})()`);}
async function tap(selector){
 const point=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:0}]});
 await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await delay(80);
}
async function value(selector,value){await evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`);}
async function snapshot(){return evaluate(`JSON.parse(localStorage.getItem('courtside.v2'))`);}
async function current(){const s=await snapshot();return s.games.find(g=>g.id===s.currentGameId);}
async function chooseSquad(){
 if(!await evaluate('document.querySelector("#lineup-dialog").open'))await click('#lineup-button');
 for(let i=1;i<=15;i++)await click(`[data-squad="P_DEFAULT_${String(i).padStart(3,'0')}"]`);
 for(let i=1;i<=5;i++)await click(`[data-starter="P_DEFAULT_${String(i).padStart(3,'0')}"]`);
 await click('#lineup-confirm');
 assert.ok((await evaluate('document.querySelector("#lineup-count").textContent')).includes('15/15'));
 assert.equal(await evaluate('document.querySelectorAll("[data-player]").length'),5);
}
async function verifySubstitutions(){
 await click('#clock-button');await delay(120);
 await click('#lineup-button');assert.equal((await current()).running,false,'substitution pauses');
 assert.equal(await evaluate('document.querySelectorAll("[data-court]").length'),15);
 await click('[data-court="P_DEFAULT_001"]');await click('[data-court="P_DEFAULT_002"]');
 await click('[data-court="P_DEFAULT_006"]');await click('[data-court="P_DEFAULT_007"]');await click('#lineup-confirm');
 assert.equal((await current()).running,false);assert.equal(await evaluate('document.querySelectorAll("[data-player]").length'),5);
 assert.equal(await evaluate('Boolean(document.querySelector(\'[data-player="P_DEFAULT_001"]\'))'),false);
 await click('#clock-button');await delay(120);await click('#lineup-button');
 await click('[data-court="P_DEFAULT_006"]');await click('[data-court="P_DEFAULT_007"]');
 await click('[data-court="P_DEFAULT_001"]');await click('[data-court="P_DEFAULT_002"]');await click('#lineup-confirm');
 const g=await current();assert.ok(g.participation.P_DEFAULT_006.playedMs>0);assert.equal(g.participation.P_DEFAULT_015.playedMs,0);
}
async function screenshot(name,width,height){await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(artifacts,name+'.png'),Buffer.from(r.data,'base64'));assert.equal(await evaluate('document.documentElement.scrollWidth > innerWidth'),false,'page must not overflow horizontally at '+width);}
(async()=>{
 for(let i=0;i<100&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await delay(100);
 const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0];
 const pages=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);if(p)data.error?p.reject(Error(data.error.message)):p.resolve(data.result);}else if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);else if(data.method==='Network.requestWillBeSent')requests.push(data.params.request.url);});
 await send('Runtime.enable');await send('Page.enable');await send('Network.enable');
 await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
 await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts});
 await send('Emulation.setDeviceMetricsOverride',{width:1194,height:834,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:pathToFileURL(path.join(root,'Front.html')).href});
 for(let i=0;i<50;i++){if(await evaluate('Boolean(document.querySelector("#setup-dialog")?.open)'))break;await delay(100);}

 await value('#setup-opponent','Test Away');await value('#setup-date','2026-09-26');await click('#setup-form button[type=submit]');await chooseSquad();
 await value('#clock-speed','2');await evaluate('document.querySelector("#clock-speed").dispatchEvent(new Event("change"))');
 await click('#clock-button');await click('[data-player="P_DEFAULT_001"]');await click('[data-stat="2PT_MADE"]');
 await click('[data-player="P_DEFAULT_002"]');await click('[data-stat="ASSIST"]');
 await click('[data-event="1"]');assert.equal((await current()).running,false);await value('#correction-type','3PT_MADE');await click('[data-related-link="2"]');await click('#correction-form button[type=submit]');
 assert.equal((await current()).gameEvents[0].points_value,3);assert.equal((await current()).eventLinks.length,1);
 await click('[data-event="1"]');await click('#correction-delete');await click('#correction-form button[type=submit]');assert.equal(await evaluate('document.querySelector("#correction-dialog").open'),true,'linked assist must be explicitly resolved');assert.equal((await current()).gameEvents[0].is_voided,false);await click('[data-related-delete="2"]');await click('#correction-form button[type=submit]');
 assert.equal((await current()).gameEvents.filter(e=>!e.is_voided).length,0);
 await click('[data-event="1"]');await click('#correction-restore');assert.equal((await current()).gameEvents.filter(e=>!e.is_voided).length,2);
 await click('#finish-button');await click('#confirm-yes');await click('#box-tab');assert.ok((await evaluate('document.querySelector("#box-table").textContent')).includes('TS%'));
 await evaluate('document.querySelector("#player-export-button").focus()');await delay(450);assert.equal(await evaluate('document.activeElement.id'),'player-export-button','finished summary must preserve keyboard focus between clock ticks');
 await click('#player-export-button');await click('#confirm-yes');assert.ok((await current()).finalizedAt);assert.equal(await evaluate('document.querySelector("#finish-button").disabled'),true);
 await click('#export-button');await send('Page.reload');await delay(300);assert.ok((await current()).finalizedAt);
 await screenshot('recording-improvements-mobile',390,844);assert.deepEqual(errors,[]);console.log('Recording improvements browser checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 if(ws?.readyState===1){try{await send('Browser.close');}catch{}ws.close();}child.kill();await delay(500);
 // Only remove the exact temporary profile created by this run, inside the artifacts directory.
 if(path.dirname(path.resolve(profile))===path.resolve(artifacts)&&path.basename(profile).startsWith('browser-profile-')){
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{console.warn('Temporary browser profile remains at '+profile);}
 }
});
