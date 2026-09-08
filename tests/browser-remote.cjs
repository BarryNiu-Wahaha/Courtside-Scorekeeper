// Real Edge DOM tests with a controlled HTTP transport; no cloud credentials.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const E=require('../src/engine.js'),T=require('../src/team.js');
const root=path.resolve(__dirname,'..'),artifacts=path.join(__dirname,'artifacts'),site=path.join(artifacts,'remote-site');
fs.mkdirSync(artifacts,{recursive:true});const profile=fs.mkdtempSync(path.join(artifacts,'browser-profile-remote-'));
const roster=Array.from({length:5},(_,i)=>({id:'P_'+i,name:i===0?'牛天齐':'Player '+i,number:i}));
const g=E.createGame({date:'2026-09-08',opponent:'Remote Hawks',minutes:10,overtimeMinutes:5},roster);T.configure(g,roster.map(p=>p.id),roster.map(p=>p.id));E.start(g,1000);E.recordEvent(g,'2PT_MADE',roster[0],'HOME',1100);E.pause(g,61000);g.finished=true;
const upload={schema_version:1,finished:true,events_csv:E.csv(g),participation_csv:T.participationCSV(g)};
const apiRoster=roster.map(p=>({player_id:p.id,player_name:p.name,jersey_number:p.number,enrollment_year:null,status_override:null}));
const snap={schema_version:1,revision:1,generated_at:'2026-09-08T12:00:00Z',roster:apiRoster,games:[{game_id:g.id,game_date:g.date,opponent:g.opponent,home_points:2,away_points:0,coverage:'complete',players:apiRoster.map((p,i)=>({...p,played_ms:60000,played_count:1,starter_count:1,designated_count:1,stats:{points:i===0?2:0,fgm:i===0?1:0,fga:i===0?1:0}}))}]};
const server=http.createServer((req,res)=>{let rel=decodeURIComponent(req.url.split('?')[0]);if(rel==='/')rel='/index.html';const filename=path.resolve(site,'.'+rel);if(!filename.startsWith(site+path.sep)){res.writeHead(403);return res.end();}try{const data=rel==='/data/stats.json'?JSON.stringify(snap):fs.readFileSync(filename);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'})[path.extname(filename)]||'text/plain');res.end(data);}catch{res.writeHead(404);res.end();}});
let child,ws,base;const pending=new Map();let seq=0;const errors=[];const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function send(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function until(expression){for(let i=0;i<100;i++){if(await evaluate(expression))return;await delay(50);}throw Error('Timed out waiting for '+expression);}
async function click(selector){await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled)throw Error('Disabled/missing '+${JSON.stringify(selector)});n.click();})()`);}
async function value(selector,value){await evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`);}
const injection=`
window.confirm=()=>true;
window.__uploads=[];window.__adminWrites=[];window.__failUpload=true;
const originalFetch=window.fetch.bind(window);
window.fetch=async function(url,options={}){
 if(!String(url).startsWith('https://api.example'))return originalFetch(url,options);
 const route=String(url).replace('https://api.example',''),body=options.body?JSON.parse(options.body):null;
 const response=data=>Promise.resolve({ok:true,status:200,json:async()=>structuredClone(data)});
 const rejected=(status,error)=>Promise.resolve({ok:false,status,json:async()=>({error})});
 if(route==='/api/session'){if(window.__denyLogin)return rejected(401,'Invalid PIN');return response({token:'test-session',role:body.role});}
 if(route==='/api/games'){if(window.__rejectUpload)return rejected(400,'Invalid participation');window.__uploads.push(body);if(window.__hangUpload)return new Promise(()=>{});if(window.__failUpload){window.__failUpload=false;throw TypeError('Connection interrupted');}return response({game_id:${JSON.stringify(g.id)},version:1,publication:'pending'});}
 if(route==='/api/admin/games')return response({games:[{game_id:${JSON.stringify(g.id)},game_date:'2026-09-08',opponent:'Remote Hawks',version:1,deleted:false}],publication:{status:'pending'}});
 if(route==='/api/admin/roster'||route==='/api/roster'){if(options.method==='PUT'){if(window.__expireRoster){window.__expireRoster=false;return rejected(401,'Session expired');}window.__rosterSaving=true;await new Promise(r=>setTimeout(r,500));window.__adminWrites.push(body);return response({publication:'pending'});}return response({players:${JSON.stringify(apiRoster)}});}
 if(route==='/api/admin/publish')return response({publication:'published'});
 if(route.endsWith('/delete')||route.endsWith('/restore')){window.__adminWrites.push(body);return response({version:2,publication:'published'});}
 if(route.startsWith('/api/admin/games/')){if(options.method==='PUT'){window.__adminWrites.push(body);return response({version:2,publication:'pending'});}const doc={game_id:${JSON.stringify(g.id)},game_date:'2026-09-08',opponent:'Remote Hawks',version:1,deleted:false,upload:${JSON.stringify(upload)}};if(window.__legacyGame)doc.upload.participation_csv=doc.upload.participation_csv.split('\\r\\n')[0]+'\\r\\n';return response(doc);}
 throw Error('Unexpected mock route '+route);
};
`;
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 child=spawn(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
 for(let i=0;i<100&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++)await delay(100);
 const port=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split('\n')[0],pages=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((r,j)=>{ws.addEventListener('open',r,{once:true});ws.addEventListener('error',j,{once:true});});
 ws.addEventListener('message',event=>{const msg=JSON.parse(event.data);if(msg.id){const p=pending.get(msg.id);pending.delete(msg.id);if(p)msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);});
 await send('Runtime.enable');await send('Page.enable');await send('Page.addScriptToEvaluateOnNewDocument',{source:injection});await send('Emulation.setDeviceMetricsOverride',{width:1194,height:834,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base+'/index.html'});await until("document.querySelector('#game-count')?.textContent==='1'");
 assert.equal(await evaluate("document.querySelector('#record').textContent"),'1–0–0');
 await click('#game-list button');assert.ok((await evaluate("document.querySelector('#box-table').textContent")).includes('牛天齐'));await click('#box-close');
 fs.writeFileSync(path.join(artifacts,'remote-public.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Page.navigate',{url:base+'/Front.html'});await until("!!document.querySelector('#setup-dialog')?.open");
 await evaluate(`localStorage.setItem('courtside.v2',${JSON.stringify(JSON.stringify({version:2,roster,games:[g],currentGameId:g.id}))})`);await send('Page.reload');await until("document.querySelector('#clock-status')?.textContent==='FINAL'");
 await click('#upload-button');await evaluate('window.__hangUpload=true');await value('#upload-pin','12345678');await click('#upload-submit');await until('window.__uploads.length===1');
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('courtside.v2')).games[0].remote.uncertain"),true);
 await send('Page.reload');await until("document.querySelector('#upload-button')?.textContent==='Retry upload'");await evaluate('window.__rejectUpload=true');
 await click('#upload-button');await value('#upload-pin','12345678');await click('#upload-submit');await until("document.querySelector('#upload-status').textContent.includes('Invalid participation')");
 assert.equal(await evaluate("document.querySelector('#finish-button').disabled"),true);
 await evaluate(`localStorage.setItem('courtside.v2',${JSON.stringify(JSON.stringify({version:2,roster,games:[g],currentGameId:g.id}))})`);await send('Page.reload');await until("document.querySelector('#clock-status')?.textContent==='FINAL'");
 await click('#upload-button');await evaluate('window.__denyLogin=true');await value('#upload-pin','12345678');await click('#upload-submit');await until("document.querySelector('#upload-status').textContent.includes('Invalid PIN')");
 assert.equal(await evaluate("!!JSON.parse(localStorage.getItem('courtside.v2')).games[0].remote"),false);
 await evaluate('window.__denyLogin=false;window.__rejectUpload=true');await value('#upload-pin','12345678');await click('#upload-submit');await until("document.querySelector('#upload-status').textContent.includes('Invalid participation')");
 assert.equal(await evaluate("!!JSON.parse(localStorage.getItem('courtside.v2')).games[0].remote"),false);assert.equal(await evaluate("document.querySelector('#finish-button').disabled"),false);
 await evaluate('window.__rejectUpload=false');await value('#upload-pin','12345678');await click('#upload-submit');await until("document.querySelector('#upload-status').textContent.includes('Connection interrupted')");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('courtside.v2')).games[0].remote.state"),'pending');
 assert.equal(await evaluate("document.querySelector('#finish-button').disabled"),true);
 await value('#upload-pin','12345678');await click('#upload-submit');await until("document.querySelector('#upload-status').textContent.includes('Game saved in the database')");
 assert.equal(await evaluate("JSON.parse(localStorage.getItem('courtside.v2')).games[0].remote.state"),'uploaded');
 assert.equal(await evaluate("JSON.stringify(window.__uploads[0])===JSON.stringify(window.__uploads[1])"),true);
 assert.equal(await evaluate("localStorage.getItem('courtside.v2').includes('12345678')"),false);
 await send('Page.reload');await until("document.querySelector('#upload-button')?.textContent==='Uploaded'");assert.equal(await evaluate("document.querySelector('#finish-button').disabled"),true);
 await send('Page.navigate',{url:base+'/admin.html'});await until("!!document.querySelector('#admin-pin')");
 await value('#admin-pin','87654321');await click('#login-form button');await until("!!document.querySelector('#admin-games button')");
 await until("!!document.querySelector('#roster-editor input')&&!document.querySelector('#save-roster').disabled");
 await evaluate("const nameInput=document.querySelector('#roster-editor input');nameInput.value='Unsaved roster edit';nameInput.dispatchEvent(new Event('input'));window.__expireRoster=true;");
 await click('#save-roster');await until("!document.querySelector('#login-form').hidden");
 await value('#admin-pin','87654321');await click('#login-form button');await until("document.querySelector('#login-form').hidden&&!document.querySelector('#save-roster').disabled");
 assert.equal(await evaluate("document.querySelector('#roster-editor input').value"),'Unsaved roster edit');
 await click('#save-roster');await until('window.__rosterSaving===true');assert.equal(await evaluate("document.querySelector('#roster-editor input').disabled"),true);await until("!document.querySelector('#save-roster').disabled");
 assert.ok((await evaluate('window.__adminWrites[0].roster_csv')).includes('Unsaved roster edit'));
 await click('#admin-games button');await until("!document.querySelector('#editor').hidden");await click('#event-editor input[type=checkbox]');await click('#save-game');await until("window.__adminWrites.length===2");
 const written=await evaluate('window.__adminWrites[1]');assert.equal(written.version,1);assert.ok(written.upload.events_csv.includes(',HOME,true'));assert.equal(await evaluate("document.querySelector('#admin-pin').value"),'');
 await click('#publish');await until("document.querySelector('#admin-status').textContent.includes('published')");
 fs.writeFileSync(path.join(artifacts,'remote-admin.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await click('#cancel-edit');await evaluate('window.__legacyGame=true');await click('#admin-games button');await until("!document.querySelector('#editor').hidden");
 assert.equal(await evaluate("document.querySelector('#legacy-participation-note').hidden"),false);
 assert.equal(await evaluate("document.querySelector('#edit-opponent').value"),'Remote Hawks');
 await click('#save-game');await until("document.querySelector('#admin-status').textContent.includes('Import participation')");
 await evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(upload.participation_csv)}],'participation.csv',{type:'text/csv'}));const input=document.querySelector('#participation-file');input.files=dt.files;input.dispatchEvent(new Event('change'));})()`);
 await until("document.querySelector('#legacy-participation-note').hidden");assert.equal(await evaluate("document.querySelectorAll('#participation-editor tbody tr').length"),5);
 assert.deepEqual(errors,[]);console.log('Remote Edge smoke passed: public snapshot/box score, failed upload retained, exact retry, uploaded lock survives reload, PIN not stored, admin correction and publication.');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{if(ws?.readyState===1){try{await send('Browser.close');}catch{}ws.close();}child?.kill();server.close();await delay(500);if(path.dirname(profile)===artifacts&&path.basename(profile).startsWith('browser-profile-remote-')){try{fs.rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:200});}catch{}}});
