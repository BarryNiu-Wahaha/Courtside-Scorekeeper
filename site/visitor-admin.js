(function(root){
  'use strict';
  function mount(container,{request,resolvePlayer=id=>id,resolveGame=id=>id}) {
    const doc=container.ownerDocument;
    const el=(tag,text,cls)=>{const node=doc.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
    let live=true,generation=0,timelineGeneration=0,range='',sessionCursor=null,eventCursor=null,selected=null;
    const title=el('h2','Visitor activity'),note=el('p','Estimated browser visits, not identified people. Counts can miss blocked or undelivered events. Active time is approximate. Refresh to request current data.','muted');
    const controls=el('div',undefined,'visitor-controls'),start=el('input'),end=el('input'),refreshButton=el('button','Refresh activity');
    for(const [input,name,label] of [[start,'start','From (UTC)'],[end,'end','Through (UTC)']]){input.type='date';input.name=name;const wrap=el('label',label);wrap.append(input);controls.append(wrap);}
    const today=new Date();end.value=today.toISOString().slice(0,10);start.value=new Date(today.getTime()-6*86400000).toISOString().slice(0,10);controls.append(refreshButton);
    const status=el('p','Loading activity…','status');status.setAttribute('role','status');
    const cards=el('div',undefined,'visitor-cards'),breakdowns=el('div',undefined,'visitor-breakdowns'),sessions=el('div'),timeline=el('div');
    const moreSessions=el('button','More visits'),moreEvents=el('button','More actions');moreSessions.hidden=moreEvents.hidden=true;
    container.replaceChildren(title,note,controls,status,cards,breakdowns,el('h3','Recent visits'),sessions,moreSessions,timeline,moreEvents);
    function dateRange(){
      const a=new Date(start.value+'T00:00:00Z'),b=new Date(end.value+'T00:00:00Z');b.setUTCDate(b.getUTCDate()+1);
      if(!Number.isFinite(+a)||!Number.isFinite(+b)||b<=a||b-a>90*86400000||b>Date.now()+86400000)throw Error('Choose a valid date range of at most 90 days, ending today or earlier.');
      return new URLSearchParams({start:a.toISOString(),end:b.toISOString()}).toString();
    }
    function local(value){return new Date(value).toLocaleString(undefined,{timeZoneName:'short'});}
    function list(title,rows,label=x=>x){const section=el('section');section.append(el('h3',title));const ul=el('ul');for(const r of rows||[])ul.append(el('li',label(r.key)+' · '+r.count));if(!rows?.length)ul.append(el('li','No activity'));section.append(ul);return section;}
    function summary(data){
      cards.replaceChildren();for(const [key,label,value] of [['visits','Visits',data.visits],['unique_visitors','Estimated visitors',data.unique_visitors],['page_views','Page openings',data.page_views],['active_ms','Active time (approx.)',Math.round(data.active_ms/1000)+' sec']]){const card=el('div',undefined,'visitor-card');const strong=el('strong',String(value));strong.dataset.metric=key;card.append(el('span',label),strong);cards.append(card);}
      breakdowns.replaceChildren(list('Daily visits (UTC)',(data.daily||[]).map(r=>({key:r.date,count:r.visits}))),list('Popular players',data.popular_players,resolvePlayer),list('Popular games',data.popular_games,resolveGame),list('Devices (visits)',data.devices),list('Browsers (visits)',data.browsers));
    }
    function renderSessions(data,append=false){
      if(!append)sessions.replaceChildren();
      if(!data.items.length&&!append)sessions.append(el('p','No visits in this date range.','muted'));
      for(const s of data.items){const button=el('button',s.label+' · '+local(s.started_at)+' · '+s.event_count+' actions · '+Math.round(s.active_ms/1000)+' sec active','visitor-session');button.type='button';button.onclick=()=>openTimeline(s.session_id);sessions.append(button);}
      sessionCursor=data.next_cursor;moreSessions.hidden=!sessionCursor;
    }
    function description(event){
      const p=event.properties||{};
      switch(event.event){
        case 'player_open':return 'Viewed player: '+resolvePlayer(p.player_id);
        case 'game_open':return 'Viewed game: '+resolveGame(p.game_id);
        case 'view_change':return 'Opened '+p.view+' view';
        case 'filter_change':return 'Changed '+p.control+' to '+p.value;
        case 'download':return 'Started '+p.kind+' download';
        case 'engagement':return 'Active for approximately '+Math.round(p.active_ms/1000)+' seconds';
        default:return 'Opened '+event.page;
      }
    }
    async function openTimeline(id,append=false){
      const token=++timelineGeneration,g=generation;
      selected=id;moreEvents.hidden=true;
      if(!append){timeline.replaceChildren(el('h3','Visit '+id.slice(0,8)),el('p','Loading actions…'));eventCursor=null;}
      try{
        const data=await request('/api/admin/visitor-activity/sessions/'+encodeURIComponent(id)+'?'+range+(append&&eventCursor?'&cursor='+encodeURIComponent(eventCursor):''));
        if(!live||g!==generation||token!==timelineGeneration)return;
        if(!append)timeline.replaceChildren(el('h3','Visit '+id.slice(0,8)));
        const ol=el('ol');for(const event of data.items)ol.append(el('li',local(event.occurred_at)+' — '+description(event)));timeline.append(ol);
        if(!data.items.length&&!append)timeline.append(el('p','No actions available in this range.'));
        eventCursor=data.next_cursor;moreEvents.hidden=!eventCursor;
      }catch(e){if(live&&g===generation&&token===timelineGeneration)timeline.append(el('p',e.message||'Could not load actions. Select the visit to retry.','status error'));}
    }
    async function refresh(){
      if(!live)return;
      const g=++generation;++timelineGeneration;
      moreSessions.hidden=moreEvents.hidden=true;timeline.replaceChildren();
      try{range=dateRange();}catch(e){status.textContent=e.message;return;}
      cards.replaceChildren();breakdowns.replaceChildren();sessions.replaceChildren();status.textContent='Loading current activity…';status.className='status';
      try{
        const [totals,visits]=await Promise.all([request('/api/admin/visitor-activity/summary?'+range),request('/api/admin/visitor-activity/sessions?'+range)]);
        if(!live||g!==generation)return;
        summary(totals);renderSessions(visits);status.textContent='Updated '+new Date().toLocaleTimeString()+'. Date boundaries use UTC; event times use your local timezone.';
      }catch(e){if(live&&g===generation){status.textContent=e.message||'Activity unavailable. Click Refresh activity to retry.';status.className='status error';}}
    }
    moreSessions.onclick=async()=>{
      if(!sessionCursor)return;const g=generation;moreSessions.disabled=true;
      try{const data=await request('/api/admin/visitor-activity/sessions?'+range+'&cursor='+encodeURIComponent(sessionCursor));if(live&&g===generation)renderSessions(data,true);}
      catch(e){if(live&&g===generation)status.textContent=e.message||'Could not load more visits. Retry.';}
      finally{if(live)moreSessions.disabled=false;}
    };
    moreEvents.onclick=()=>openTimeline(selected,true);refreshButton.onclick=refresh;start.onchange=end.onchange=refresh;
    refresh();
    return {refresh,destroy(){live=false;++generation;++timelineGeneration;container.replaceChildren();}};
  }
  root.CourtSideVisitorAdmin={mount};
})(globalThis);
