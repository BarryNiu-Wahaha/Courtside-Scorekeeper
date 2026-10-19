const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {browser}=require('./browser-driver.cjs');
test('admin reports render, validate ranges and ignore stale responses after logout',async()=>{
  const b=await browser();try{
    await b.send('Page.navigate',{url:'data:text/html,<main id="reports"></main>'});await b.until("document.querySelector('#reports')");
    await b.evaluate(fs.readFileSync(path.resolve(__dirname,'../site/visitor-admin.js'),'utf8'));
    await b.evaluate(`globalThis.calls=[];globalThis.responses=[];globalThis.panel=CourtSideVisitorAdmin.mount(document.querySelector('#reports'),{request:path=>{calls.push(path);return new Promise(resolve=>responses.push(resolve));}});`);
    assert.equal(await b.evaluate('calls.length'),2);
    await b.evaluate(`responses[0]({visits:2,unique_visitors:1,page_views:3,active_ms:45000,daily:[],popular_players:[],popular_games:[],devices:[],browsers:[]});responses[1]({items:[],next_cursor:null});`);
    await b.until("document.querySelector('#reports').textContent.includes('No visits')");
    assert.equal(await b.evaluate("document.querySelector('[data-metric=visits]').textContent"),'2');
    await b.evaluate(`(async()=>{document.querySelector('[name=start]').value='2020-01-01';await panel.refresh();})()`);
    assert.equal(await b.evaluate('calls.length'),2);
    assert.ok((await b.evaluate("document.querySelector('#reports').textContent")).includes('90'));
    await b.evaluate(`document.querySelector('[name=start]').value=new Date(Date.now()-86400000).toISOString().slice(0,10);panel.refresh();panel.destroy();responses[2]({visits:999});responses[3]({items:[],next_cursor:null});`);
    assert.equal(await b.evaluate("document.querySelector('#reports').textContent"),'');
    assert.deepEqual(b.errors,[]);
  }finally{await b.close();}
});
