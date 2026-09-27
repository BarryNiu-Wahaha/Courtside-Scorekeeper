const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('final result export persists lock before download and rolls back storage failure',()=>{
 const file=require('node:path').join(__dirname,'../src/result-export.js');assert.ok(fs.existsSync(file),'result export transaction module exists');const X=require(file),E=require('../src/engine.js');
 const g=E.createGame({date:'2026-09-26',opponent:'A',minutes:10,overtimeMinutes:5},[]);g.finished=true;
 let downloaded=false;assert.throws(()=>X.exportGame(g,()=> 'csv',()=>{throw Error('storage full');},()=>{downloaded=true;}));assert.equal(g.finalizedAt,undefined);assert.equal(downloaded,false);
 const order=[];X.exportGame(g,()=> 'csv',()=>order.push('saved'),()=>order.push('download'));assert.deepEqual(order,['saved','download']);assert.ok(g.finalizedAt);
 X.exportGame(g,()=> 'csv',()=>{throw Error('should not resave');},()=>order.push('again'));assert.equal(order.at(-1),'again');
});
