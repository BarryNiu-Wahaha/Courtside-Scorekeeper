(function(root){
'use strict';
const statKeys=['points','fgm','fga','threeMade','threeAttempts','ftm','fta','offensive','defensive','rebounds','assists','steals','blocks','turnovers','fouls'];
function csv(columns,rows){const escape=v=>/[",\r\n]/.test(String(v??''))?'"'+String(v??'').replaceAll('"','""')+'"':String(v??'');return '\uFEFF'+columns.join(',')+'\r\n'+rows.map(r=>columns.map(k=>escape(r[k])).join(',')+'\r\n').join('');}
function parseCSV(text){
  text=String(text).replace(/^\uFEFF/,'');const records=[];let row=[],value='',quoted=false,closed=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){value+='"';i++;}else{quoted=false;closed=true;}}else value+=c;}
    else if(c==='"'){if(value||closed)throw Error('Invalid CSV quotation.');quoted=true;}
    else if(c===','){row.push(value);value='';closed=false;}
    else if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);records.push(row);row=[];value='';closed=false;}
    else{if(closed)throw Error('Invalid CSV after quote.');value+=c;}
  }
  if(quoted)throw Error('Unclosed CSV quotation.');if(value||row.length||closed){row.push(value);records.push(row);}
  const columns=records.shift()||[];if(!columns.length||new Set(columns).size!==columns.length)throw Error('Invalid CSV headers.');
  return {columns,rows:records.map(r=>{if(r.length!==columns.length)throw Error('Invalid CSV field count.');return Object.fromEntries(columns.map((c,i)=>[c,r[i]]));})};
}
function prepare(game,E,T){
  if(!game?.finished)throw Error('Finish this game before uploading.');
  if(game.remote?.payload)return game.remote.payload;
  const payload={schema_version:1,finished:true,events_csv:E.csv(game),participation_csv:T.participationCSV(game)};
  game.remote={state:'pending',payload};return payload;
}
function begin(game){const prior=Boolean(game.remote?.uncertain);game.remote.uncertain=true;return prior;}
function failed(game,error,priorUncertainty=Boolean(game.remote?.uncertain)){
  if(!game.remote)return;
  if([400,401,403,413,429].includes(error.status)&&!priorUncertainty){delete game.remote;return;}
  game.remote.uncertain=true;
}
class Client{
  constructor(base,transport=root.fetch?.bind(root)){
    let url;try{url=new URL(base);}catch{throw Error('Configure a valid backend URL.');}
    if(url.username||url.password||url.search||url.hash)throw Error('Backend URL must not contain credentials, a query, or a fragment.');
    if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('Use HTTPS for the backend URL.');
    this.base=url.href.replace(/\/$/,'');this.transport=transport;this.token=null;
  }
  async request(path,method='GET',body){
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),240000);
    try{
      const response=await this.transport(this.base+path,{method,headers:{'Content-Type':'application/json',...(this.token?{Authorization:'Bearer '+this.token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:controller.signal,cache:'no-store'});
      let data;try{data=await response.json();}catch{throw Error('The backend is starting or unavailable. Your data is safe; try again shortly.');}
      if(!response.ok){const error=Error(data.error||'Request failed.');error.status=response.status;if(response.status===401)this.token=null;throw error;}
      return data;
    }catch(error){if(error.name==='AbortError')throw Error('The upload timed out. Your game remains saved; retry to check whether it was received.');throw error;}
    finally{clearTimeout(timer);}
  }
  async login(pin,role){const data=await this.request('/api/session','POST',{pin,role});this.token=data.token;return data;}
  upload(payload){return this.request('/api/games','POST',payload);}
}
function totals(snapshot){
  const players=new Map((snapshot.roster||[]).map(p=>[p.player_id,{...p,appearances:0,played_ms:null,partial:false,stats:Object.fromEntries(statKeys.map(k=>[k,0]))}]));
  let wins=0,losses=0,ties=0;
  for(const g of snapshot.games||[]){if(g.home_points>g.away_points)wins++;else if(g.home_points<g.away_points)losses++;else ties++;
    for(const p of g.players||[]){if(!players.has(p.player_id))players.set(p.player_id,{...p,appearances:0,played_ms:null,partial:false,stats:Object.fromEntries(statKeys.map(k=>[k,0]))});const total=players.get(p.player_id);total.appearances+=Number(p.played_count||0);if(p.played_ms!=null)total.played_ms=(total.played_ms??0)+Number(p.played_ms);total.partial||=g.coverage!=='complete'||p.played_ms==null;for(const k of statKeys)total.stats[k]+=Number(p.stats?.[k]||0);}
  }return {wins,losses,ties,players:[...players.values()]};
}
const api={Client,prepare,begin,failed,csv,parseCSV,totals,statKeys};if(typeof module==='object'&&module.exports)module.exports=api;root.RemoteClient=api;
})(globalThis);
