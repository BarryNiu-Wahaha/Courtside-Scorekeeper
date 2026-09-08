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
 assert.equal(await evaluate('document.querySelector("#setup-dialog").open'),true);
 await value('#setup-opponent','Northside Hawks');await value('#setup-date','2026-09-07');await value('#setup-minutes','12');await click('#setup-form button[type=submit]');
 await chooseSquad();
 assert.equal(await evaluate('document.querySelector("#clock-display").textContent'),'12:00');
 await click('[data-player="P_DEFAULT_001"]');assert.equal(await evaluate('document.querySelector("[data-stat]").disabled'),true);
 await click('#clock-button');await click('#clock-button');await click('#adjust-button');await value('#clock-input','06:31');await click('#clock-form button[type=submit]');
 assert.equal(await evaluate('document.querySelector("#clock-display").textContent'),'06:31');
 const actions=['2PT_MADE','2PT_MISSED','3PT_MADE','3PT_MISSED','FT_MADE','FT_MISSED','OFF_REBOUND','DEF_REBOUND','ASSIST','STEAL','BLOCK','TURNOVER','FOUL'];
 for(let i=0;i<actions.length;i++){const selector=`[data-stat="${actions[i]}"]`;if(i===2)await tap(selector);else await click(selector);assert.equal((await current()).gameEvents.length,i+1);}
 assert.equal(await evaluate('document.querySelector("#home-score").textContent'),'6');
 await click('#undo-button');assert.equal((await current()).gameEvents[12].is_voided,true);
 await click('#away-side');await click('[data-stat="3PT_MADE"]');assert.equal(await evaluate('document.querySelector("#away-score").textContent'),'3');
 assert.equal((await current()).gameEvents[13].player_id,'');
 await click('#undo-button');assert.equal(await evaluate('document.querySelector("#away-score").textContent'),'0');
 await click('[data-stat="2PT_MADE"]');assert.equal((await current()).gameEvents[14].event_id,15);
 await click('#roster-button');await click('[data-edit="P_DEFAULT_001"]');await value('#player-number','90');await click('#save-player');await click('#roster-dialog [data-close]');
 assert.equal((await current()).roster[0].id,'P_DEFAULT_001');assert.equal((await current()).gameEvents[0].jersey_number,91);
 await click('[data-player="P_DEFAULT_001"]');await click('[data-stat="3PT_MADE"]');assert.equal((await current()).gameEvents.at(-1).jersey_number,91,'game snapshots retain original jersey after master roster edits');
 const beforeReload=await current();await send('Page.reload');await delay(400);
 assert.deepEqual((await current()).gameEvents,beforeReload.gameEvents);assert.equal(await evaluate('document.querySelector("#clock-display").textContent'),'06:31');
 await click('#period-button');await click('#confirm-yes');assert.equal((await current()).quarter,'2');assert.equal(await evaluate('document.querySelector("#clock-display").textContent'),'12:00');
 await click('#adjust-button');await value('#clock-input','08:42');await click('#clock-form button[type=submit]');
 await click('[data-player="P_DEFAULT_002"]');await click('[data-stat="DEF_REBOUND"]');
 await click('#export-button');
 const exportedName=(await current()).id+'_events.csv';for(let i=0;i<50&&!fs.existsSync(path.join(artifacts,exportedName));i++)await delay(100);
 const csv=fs.readFileSync(path.join(artifacts,exportedName),'utf8');assert.ok(csv.startsWith('\uFEFFgame_id,'));assert.ok(csv.includes('牛天齐'));assert.ok(csv.includes(',HOME,true\r\n'));assert.equal(csv.split('\r\n').length,19);
 await click('#box-tab');assert.ok((await evaluate('document.querySelector("#box-table").textContent')).includes('牛天齐'));await click('#live-tab');
 await verifySubstitutions();
 await click('#participation-export-button');await delay(150);
 assert.ok(fs.existsSync(path.join(artifacts,(await current()).id+'_participation.csv')));
 await click('#finish-button');await click('#confirm-yes');assert.equal((await current()).finished,true);assert.equal(await evaluate('document.querySelector("[data-stat]").disabled'),true);await click('#finish-button');
 await evaluate('window.scrollTo(0,0)');await delay(3100);
 await screenshot('ipad-landscape',1194,834);
 assert.equal(await evaluate('[...document.querySelectorAll("[data-stat]")].every(b=>b.getBoundingClientRect().bottom<=innerHeight)'),true,'all stat buttons must fit landscape iPad without page scrolling');
 await screenshot('ipad-small-landscape',1024,768);
 assert.equal(await evaluate('[...document.querySelectorAll("[data-stat]")].every(b=>b.getBoundingClientRect().bottom<=innerHeight)'),true,'all stat buttons must fit a smaller landscape iPad');
 await screenshot('ipad-portrait',834,1194);await screenshot('laptop',1440,1000);await screenshot('phone',390,844);
 const firstId=(await current()).id;await click('#new-game-button');await value('#setup-opponent','Second game');await click('#setup-form button[type=submit]');await chooseSquad();assert.equal((await current()).gameEvents.length,0);assert.equal((await snapshot()).games.length,2);
 await click('#history-button');await click(`[data-game="${firstId}"]`);assert.equal((await current()).gameEvents.length,17);
 await click('#backup-button');await delay(200);
 // A failed load must preserve original bytes AND allow new in-memory work to be backed up.
 await evaluate('localStorage.setItem("courtside.v2","broken original data")');await send('Page.reload');await delay(300);
 await click('#new-game-button');await value('#setup-opponent','Recovery game');await click('#setup-form button[type=submit]');await chooseSquad();await click('#clock-button');await click('#clock-button');await click('[data-player="P_DEFAULT_001"]');await click('[data-stat="3PT_MADE"]');
 await evaluate('globalThis.lastDownload=null;const originalCreate=URL.createObjectURL.bind(URL);URL.createObjectURL=(blob)=>{globalThis.lastDownload=blob;return originalCreate(blob)}');
 await click('#backup-button');const recovered=JSON.parse(await evaluate('lastDownload.text()'));
 assert.equal(recovered.games[0].gameEvents.length,1);assert.equal(recovered.games[0].gameEvents[0].points_value,3);
 assert.equal(await evaluate('localStorage.getItem("courtside.v2")'),'broken original data');
 await click('#recovery-button');assert.equal(await evaluate('lastDownload.text()'),'broken original data');
 // Restore through the real file-input path, then confirm replacement.
 await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(JSON.stringify(recovered))}],"backup.json",{type:"application/json"}));document.querySelector("#restore-file").files=dt.files;document.querySelector("#restore-file").dispatchEvent(new Event("change"));})()`);
 for(let i=0;i<50;i++){if(await evaluate('document.querySelector("#confirm-dialog").open'))break;await delay(50);}
 await click('#confirm-yes');assert.equal((await current()).gameEvents.length,1);assert.equal(await evaluate('document.querySelector("#storage-warning").hidden'),true);
 // Full roster editing and real file import preserve IDs and players absent from CSV.
 await click('#roster-button');await click('[data-edit="P_DEFAULT_001"]');await value('#player-year','2022');await value('#player-status','Astudent');
 assert.equal(await evaluate('document.querySelector("#player-status").value'),'Astudent','student override must be selectable');
 await click('#save-player');
 assert.equal((await snapshot()).roster[0].statusOverride,'Astudent',await evaluate('JSON.stringify({toast:document.querySelector("#toast").textContent,valid:document.querySelector("#player-form").checkValidity(),year:document.querySelector("#player-year").value,status:document.querySelector("#player-status").value,editing:document.querySelector("#editing-player").value})'));
 const importedRoster='player_id,player_name,jersey_number,enrollment_year,status_override\nP_DEFAULT_001,Updated name,90,2022,graduated\n';
 await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(importedRoster)}],"roster.csv",{type:"text/csv"}));document.querySelector('#roster-file').files=dt.files;document.querySelector('#roster-file').dispatchEvent(new Event('change'));})()`);
 for(let i=0;i<50;i++){if(await evaluate('document.querySelector("#confirm-dialog").open'))break;await delay(50);}
 assert.ok((await evaluate('document.querySelector("#confirm-text").textContent')).includes('Astudent → graduated'));
 await click('#confirm-yes');assert.equal((await snapshot()).roster.length,27);assert.equal((await snapshot()).roster[0].statusOverride,'graduated');
 if(fs.existsSync(path.join(artifacts,'university_roster.csv')))fs.unlinkSync(path.join(artifacts,'university_roster.csv'));
 await click('#roster-export-button');for(let i=0;i<50&&!fs.existsSync(path.join(artifacts,'university_roster.csv'));i++)await delay(100);assert.ok(fs.existsSync(path.join(artifacts,'university_roster.csv')));await click('#roster-dialog [data-close]');
 // Two individually selectable guests become one anonymous database identity in both CSVs.
 await click('#new-game-button');await value('#setup-opponent','Guest coverage');await click('#setup-form button[type=submit]');
 for(let i=1;i<=3;i++){const id='P_DEFAULT_'+String(i).padStart(3,'0');await click(`[data-squad="${id}"]`);await click(`[data-starter="${id}"]`);}
 for(const name of ['Private Guest A','Private Guest B']){await value('#guest-name',name);await value('#guest-number','80');await click('#add-guest');}
 const guestIds=await evaluate('[...document.querySelectorAll("[data-starter]")].map(b=>b.dataset.starter).filter(id=>id.startsWith("GUEST_"))');
 for(const id of guestIds)await click(`[data-starter="${id}"]`);await click('#lineup-confirm');await click('#clock-button');await delay(100);await click('#clock-button');
 for(const id of guestIds){await click(`[data-player="${id}"]`);await click('[data-stat="3PT_MADE"]');}
 assert.equal(await evaluate('document.querySelector("#home-score").textContent'),'6');
 await click('#export-button');await click('#participation-export-button');
 const downloadGame=await current();for(let i=0;i<100;i++){if(['_events.csv','_participation.csv'].every(suffix=>fs.existsSync(path.join(artifacts,downloadGame.id+suffix))))break;await delay(100);}
 const guestGame=await current(),guestCSV=fs.readFileSync(path.join(artifacts,guestGame.id+'_events.csv'),'utf8'),guestParticipation=fs.readFileSync(path.join(artifacts,guestGame.id+'_participation.csv'),'utf8');
 assert.equal(guestCSV.split('P_GUEST').length-1,2);assert.ok(!guestCSV.includes('Private Guest'));assert.ok(guestParticipation.includes('P_GUEST,Guest Player,0,2,2,2,'));assert.ok(!guestParticipation.includes('Private Guest'));assert.equal((await snapshot()).roster.length,27);
 await click('#lineup-button');await screenshot('substitution-popup',1194,834);await click('#lineup-dialog [data-close]');assert.equal((await current()).running,false);
 assert.deepEqual(errors,[],'no browser JavaScript errors');assert.ok(!requests.some(u=>/^https?:/.test(u)),'app works without network requests');
 console.log('Browser smoke passed: setup, all 13 actions, undo, opponent records, roster identity, clock correction, periods, CSV download, refresh, box score, finish/reopen, game history, backup/restore, corrupt-storage recovery, five responsive sizes, offline operation.');
 console.log('Screenshots and exported CSV: tests/artifacts/');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{
 if(ws?.readyState===1){try{await send('Browser.close');}catch{}ws.close();}child.kill();await delay(500);
 // Only remove the exact temporary profile created by this run, inside the artifacts directory.
 if(path.dirname(path.resolve(profile))===path.resolve(artifacts)&&path.basename(profile).startsWith('browser-profile-')){
  try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{console.warn('Temporary browser profile remains at '+profile);}
 }
});
