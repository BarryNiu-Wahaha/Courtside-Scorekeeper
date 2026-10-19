const {test}=require('node:test'),assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {browser}=require('./browser-driver.cjs'),{snapshot}=require('./dashboard-fixture.cjs');
test('dashboard records actions, not rerenders or search text',async()=>{
  const root=path.resolve(__dirname,'../site');
  const server=http.createServer((req,res)=>{
    const rel=new URL(req.url,'http://local').pathname;
    res.setHeader('Content-Type',rel.endsWith('.js')?'text/javascript':rel.endsWith('.json')?'application/json':rel.endsWith('.css')?'text/css':'text/html');
    if(rel==='/data/stats.json')return res.end(JSON.stringify(snapshot));
    if(rel==='/config.js')return res.end('globalThis.COURTSIDE_CONFIG={apiBase:"http://localhost",visitorTrackingEnabled:true};');
    if(rel==='/visitor-tracking.js')return res.end('globalThis.recorded=[];globalThis.CourtSideVisitor={create:()=>({track:(event,properties)=>recorded.push({event,properties})})};');
    const file=path.resolve(root,'.'+rel);if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}try{res.end(fs.readFileSync(file));}catch{res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));let b;
  try{
    b=await browser();await b.send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/index.html'});
    await b.until("document.querySelector('#period-select')?.disabled===false");
    await b.evaluate("document.querySelector('#period-select').value='career';document.querySelector('#period-select').dispatchEvent(new Event('change'));");
    await b.evaluate("document.querySelector('#player-table tbody button').click();document.querySelector('#player-close').click();document.querySelector('#latest-game .latest-report').click();document.querySelector('#box-close').click();");
    await b.evaluate("document.querySelector('#player-search').value='PRIVATE SEARCH';document.querySelector('#player-search').dispatchEvent(new Event('input'));document.querySelector('#leader-average').click();");
    const recorded=await b.evaluate('globalThis.recorded||[]');
    assert.equal(recorded.filter(e=>e.event==='player_open').length,1);assert.equal(recorded.filter(e=>e.event==='game_open').length,1);
    assert.equal(recorded.filter(e=>e.event==='filter_change').length,1);assert.ok(!JSON.stringify(recorded).includes('PRIVATE'));assert.deepEqual(b.errors,[]);
  }finally{await b?.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
