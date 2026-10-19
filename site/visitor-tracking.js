(function(root) {
  'use strict';
  const VISITOR='courtside.visitor.id', OPTOUT='courtside.visitor.optout', DAYS90=90*86400000;
  function allowed(name, p) {
    if(!p || typeof p!=='object' || Array.isArray(p)) return false;
    const keys={page_view:[],view_change:['view'],player_open:['player_id'],game_open:['game_id'],filter_change:['control','value'],download:['kind'],engagement:['active_ms']}[name];
    if(!keys || Object.keys(p).length!==keys.length || !keys.every(k=>Object.hasOwn(p,k))) return false;
    if(name==='view_change') return ['overview','players','games'].includes(p.view);
    if(name==='player_open'||name==='game_open') return /^[A-Za-z0-9_-]{1,128}$/.test(p[keys[0]]) && typeof p[keys[0]]==='string';
    if(name==='download') return ['events','participation','player_statistics','backup','roster'].includes(p.kind);
    if(name==='engagement') return Number.isInteger(p.active_ms)&&p.active_ms>=0&&p.active_ms<=15000;
    if(name==='filter_change') return p.control==='category'?['all','official','friendly'].includes(p.value):p.control==='period'&&typeof p.value==='string'&&/^(career|(year|spring|fall):20\d{2})$/.test(p.value);
    return true;
  }
  function create(config={}, deps={}) {
    const doc=deps.document||root.document, win=deps.window||root;
    const now=deps.now||Date.now, mono=deps.mono||(()=>root.performance.now());
    const schedule=deps.setTimeout||root.setTimeout.bind(root), cancel=deps.clearTimeout||root.clearTimeout.bind(root);
    const uuid=deps.uuid||(()=>root.crypto.randomUUID()), nav=deps.navigator||root.navigator||{};
    const transport=deps.fetch||root.fetch?.bind(root);
    let storage;try {storage=deps.storage||root.localStorage;} catch {}
    const read=k=>{try{return storage?.getItem(k);}catch{return null;}};
    const write=(k,v)=>{try{storage?.setItem(k,v);}catch{}};
    const remove=k=>{try{storage?.removeItem(k);}catch{}};
    const noop={track(){},disable(){write(OPTOUT,'1');remove(VISITOR);},destroy(){}};
    let url;try {url=new URL(config.apiBase);if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol))return noop;}catch{return noop;}
    if(config.enabled!==true||!doc||!transport||!['dashboard','scorekeeper'].includes(config.page)||read(OPTOUT)==='1'||nav.globalPrivacyControl||nav.doNotTrack==='1'||win.doNotTrack==='1') return noop;
    let visitor,session,expiry,lastAction=now(),lastInput=mono(),lastTick=mono(),active=true;
    let visible=doc.visibilityState==='visible',activeMilliseconds=0;
    const timers=new Set(), listeners=[];let queue=[],pending=null,retries=0,retryAt=0,controller=null,notice=null;
    function later(fn,ms){const id=schedule(()=>{timers.delete(id);if(active)fn();},ms);timers.add(id);return id;}
    function listen(target,key,fn){if(target?.addEventListener){target.addEventListener(key,fn);listeners.push([target,key,fn]);}}
    function identity(){
      let saved;try{saved=JSON.parse(read(VISITOR));}catch{}
      if(saved&&typeof saved.id==='string'&&/^[a-f0-9-]{36}$/.test(saved.id)&&Number.isFinite(saved.expires)&&saved.expires>now()&&saved.expires<=now()+DAYS90){visitor=saved.id;expiry=saved.expires;}
      else {visitor=uuid();expiry=now()+DAYS90;write(VISITOR,JSON.stringify({id:visitor,expires:expiry}));}
      session=uuid();
    }
    try{identity();}catch{return noop;}
    const ua=nav.userAgent||'';
    const browser=/Edg\//.test(ua)?'edge':/Firefox\//.test(ua)?'firefox':/Chrome\//.test(ua)?'chrome':/Safari/.test(ua)?'safari':'other';
    const device=/iPad|Tablet/.test(ua)?'tablet':/Mobile|Android/.test(ua)?'mobile':ua?'desktop':'unknown';
    function enqueue(event,properties){
      queue.push({event_id:uuid(),visitor_id:visitor,session_id:session,event,page:config.page,properties:{...properties},occurred_at:new Date(now()).toISOString(),device,browser});
      const room=100-(pending?.length||0);if(queue.length>room)queue.splice(0,queue.length-room);
    }
    function track(event,properties={}){
      if(!active||!allowed(event,properties))return;
      if(config.page==='scorekeeper'&&['view_change','player_open','game_open','filter_change'].includes(event))return;
      if(config.page==='dashboard'&&event==='download')return;
      try{
        if(now()>=expiry){identity();enqueue('page_view',{});}
        else if(now()-lastAction>=1800000){session=uuid();enqueue('page_view',{});}
        lastAction=now();enqueue(event,properties);
      }catch{} // Optional analytics must never interrupt the action being recorded.
    }
    async function flush(exit=false){
      if(!active||controller||mono()<retryAt)return;
      if(!pending){pending=queue.splice(0,20);retries=0;}
      if(!pending.length){pending=null;return;}
      controller=new AbortController();const current=controller;
      const timeout=later(()=>current.abort(),5000);
      let retry=false,wait=0;
      try{
        const response=await transport(url.href.replace(/\/$/,'')+'/api/visitor-events',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:pending}),credentials:'omit',keepalive:exit,signal:current.signal});
        retry=response.status===429||response.status>=500;
        wait=Math.min(60000,Math.max(0,Number(response.headers?.get('Retry-After'))*1000||0));
      }catch{retry=true;}
      finally{cancel(timeout);timers.delete(timeout);if(controller===current)controller=null;}
      if(!active)return;
      if(retry&&retries<3){retries++;const delay=Math.max(wait,1000*2**(retries-1));retryAt=mono()+delay;later(()=>flush(),delay);}
      else {pending=null;retryAt=0;}
    }
    function accrue(){
      const t=mono(),elapsed=Math.max(0,Math.min(t,lastInput+60000)-lastTick);lastTick=t;
      if(visible&&now()<expiry)activeMilliseconds=Math.min(60000,activeMilliseconds+elapsed);
    }
    function engagement(){
      accrue();
      // Input accrues duration; only scheduled/lifecycle flushes create records.
      while(activeMilliseconds>=1){const amount=Math.min(15000,Math.floor(activeMilliseconds));activeMilliseconds-=amount;try{enqueue('engagement',{active_ms:amount});}catch{}}
    }
    function input(){
      // Finish the preceding window before marking new input, avoiding credit for idle time.
      accrue();
      if(now()>=expiry){activeMilliseconds=0;identity();enqueue('page_view',{});}
      else if(now()-lastAction>=1800000){engagement();session=uuid();enqueue('page_view',{});}
      lastInput=mono();
      lastAction=now();
    }
    function visibility(){
      // Account for the interval under the previous visibility state first.
      accrue();visible=doc.visibilityState==='visible';
      if(!visible){engagement();flush(true);}
    }
    function periodicFlush(){flush();later(periodicFlush,10000);}
    function periodicEngagement(){engagement();later(periodicEngagement,15000);}
    function destroy(){active=false;queue=[];pending=null;controller?.abort();for(const id of timers)cancel(id);timers.clear();for(const [target,key,fn] of listeners)target.removeEventListener(key,fn);notice?.remove();}
    function disable(){write(OPTOUT,'1');remove(VISITOR);destroy();}
    listen(doc,'pointerdown',input);listen(doc,'keydown',input);listen(doc,'touchstart',input);
    listen(doc,'visibilitychange',visibility);listen(win,'pagehide',()=>{engagement();flush(true);});
    listen(win,'storage',e=>{if(e.key===OPTOUT&&e.newValue==='1'){remove(VISITOR);destroy();}});
    enqueue('page_view',{});later(periodicFlush,10000);later(periodicEngagement,15000);
    if(doc.createElement&&doc.body){notice=doc.createElement('aside');notice.className='visitor-notice';notice.setAttribute('aria-label','Anonymous analytics');notice.append('Anonymous visit and action counts help improve CourtSide. Records expire after 90 days. ');const button=doc.createElement('button');button.type='button';button.textContent='Disable analytics';button.addEventListener('click',disable);notice.append(button);doc.body.append(notice);}
    return {track,disable,destroy};
  }
  const api={create};if(typeof module==='object'&&module.exports)module.exports=api;else root.CourtSideVisitor=api;
})(globalThis);
