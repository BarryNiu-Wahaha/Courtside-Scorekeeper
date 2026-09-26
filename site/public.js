(()=>{
  'use strict';
  const A=CourtSideAnalytics,$=id=>document.getElementById(id);
  const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const fmt=(v,d=1)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
  const pct=v=>v==null?'—':fmt(v)+'%';
  const category=g=>g.category==='official'?'Official':g.category==='friendly'?'Friendly':'Unclassified';
  const descending=(a,b)=>b.game_date.localeCompare(a.game_date)||b.game_id.localeCompare(a.game_id);
  const names={points:'Points',rebounds:'Rebounds',offensive:'Off. rebounds',defensive:'Def. rebounds',assists:'Assists',steals:'Steals',blocks:'Blocks',turnovers:'Turnovers',fouls:'Fouls'};
  let snapshot=null,games=[],summary=null,leaderMode='total',sortKey='points',sortDirection=-1,playerId=null,playerGroup='appeared';
  const phone=matchMedia('(max-width: 700px)'), reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
  let pointerAction=false;
  document.addEventListener('pointerdown',()=>{pointerAction=true;},{capture:true});
  document.addEventListener('keydown',()=>{pointerAction=false;},{capture:true});
  function animateIn(node,kind='panel'){
    if(!pointerAction||reducedMotion.matches||!node.animate)return;
    if(!node.getClientRects().length && node.isConnected)return;
    node.getAnimations().forEach(a=>a.cancel());
    const transform=kind==='sheet'?'translateY(24px) scale(.98)':'translateY(6px)';
    node.animate([{opacity:0,transform},{opacity:1,transform:'none'}],{duration:kind==='sheet'?260:180,easing:'cubic-bezier(.23,1,.32,1)'});
  }
  function selectView(view,focus=false){
    if(!['overview','players','games'].includes(view))view='overview';
    document.body.dataset.view=view;
    for(const link of document.querySelectorAll('.main-nav a')){
      const selected=link.hash==='#'+view;
      link.classList.toggle('nav-active',selected);
      if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
    if(phone.matches&&focus){
      window.scrollTo({top:0,behavior:'instant'});
      const section=document.querySelector('[data-view="'+view+'"]:not(body)');
      if(section){animateIn(section);section.tabIndex=-1;section.focus({preventScroll:true});}
    }
  }
  document.querySelector('.main-nav').addEventListener('click',event=>{
    const link=event.target.closest('a');
    if(!link||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    if(phone.matches){event.preventDefault();if(location.hash!==link.hash)history.pushState(null,'',link.hash);selectView(link.hash.slice(1),true);}
    else selectView(link.hash.slice(1));
  });
  window.addEventListener('hashchange',()=>{if(!location.hash||['overview','players','games'].includes(location.hash.slice(1)))selectView(location.hash.slice(1),true);});
  phone.addEventListener('change',()=>selectView(location.hash.slice(1)));
  selectView(location.hash.slice(1));
  $('summary-toggle').onclick=()=>{
    const expanded=$('summary-toggle').getAttribute('aria-expanded')!=='true';
    $('summary-toggle').setAttribute('aria-expanded',String(expanded));
    $('summary-toggle').textContent=expanded?'Fewer team metrics -':'More team metrics +';
    document.body.classList.toggle('show-advanced',expanded);
  };
  function empty(title,copy){const n=el('div',undefined,'empty-state');n.append(el('strong',title),el('p',copy));return n;}
  function button(text,action,cls='player-link'){const n=el('button',text,cls);n.type='button';n.onclick=action;return n;}
  function playerButton(p){const n=button(p.player_name,()=>openPlayer(p.player_id));n.prepend(el('span',p.jersey_number??'—','jersey'));return n;}
  function table(headers,rows){const t=el('table'),h=el('tr'),head=el('thead'),body=el('tbody');
    for(const title of headers){const th=el('th');th.scope='col';th.append(title instanceof Node?title:document.createTextNode(title));h.append(th);}head.append(h);t.append(head);
    for(const cells of rows){const row=el('tr');for(const value of cells){const td=el('td');td.append(value instanceof Node?value:document.createTextNode(String(value??'—')));row.append(td);}body.append(row);}t.append(body);return t;}
  function metrics(items){return items.map(([label,value,note])=>{const n=el('div',undefined,'profile-metric');n.append(el('small',label),el('strong',value));if(note)n.append(el('span',note));return n;});}
  function periodOptions(){const current=A.currentSeason(),seasons=new Set([current]),years=new Set([String(new Date().getFullYear())]);
    for(const g of snapshot.games){seasons.add(A.season(g.game_date));years.add(g.game_date.slice(0,4));}
    const select=$('period-select');select.replaceChildren();
    const group=(label,values)=>{const n=el('optgroup');n.label=label;for(const v of values){const o=el('option',A.periodLabel(v));o.value=v;n.append(o);}select.append(n);};
    group('Seasons',[...seasons].sort((a,b)=>Number(b.split(':')[1])-Number(a.split(':')[1])||(a.startsWith('fall')?-1:1)));
    group('Calendar years',[...years].sort().reverse().map(y=>'year:'+y));group('All time',['career']);select.value=current;
  }
  function render(){
    if(!snapshot)return;
    const period=$('period-select').value,cat=$('category-select').value;
    games=A.filterGames(snapshot.games,{period,category:cat}).sort(descending);summary=A.summarize(snapshot,games);
    $('period-title').textContent=A.periodLabel(period);$('game-count').textContent=games.length;$('record').textContent=[summary.wins,summary.losses,summary.ties].join('–');$('points').textContent=fmt(summary.points,0);
    $('ppg').textContent=fmt(summary.ppg);$('oppg').textContent=fmt(summary.oppg);$('pace').textContent=fmt(summary.advanced.pace);$('off-rating').textContent=fmt(summary.advanced.offensiveRating);$('def-rating').textContent=fmt(summary.advanced.defensiveRating);
    $('pace-coverage').textContent=`${summary.advanced.paceEligible} of ${games.length} games with complete stats & duration`;
    $('rating-coverage').textContent=`${summary.advanced.eligible} of ${games.length} games with complete stats`;
    const unclassified=games.filter(g=>!g.category).length;$('filter-note').textContent=unclassified?`${unclassified} unclassified historical game${unclassified===1?'':'s'} included`:cat==='all'?'Official and friendly games included':cat==='official'?'Official games only':'Friendly games only';
    $('leader-total').textContent=period==='career'?'Career totals':period.startsWith('year:')?'Year totals':'Season totals';
    renderLatest();renderLeaders();renderChart();renderComparison();renderPlayers();renderGames();
    if($('player-dialog').open)renderPlayer(playerId);
  }
  function renderLatest(){
    const holder=$('latest-game'),g=games[0];holder.replaceChildren();
    if(!g){delete holder.dataset.gameId;holder.append(empty('Your next story starts here','No games in this selection. Choose another period or game category.'));return;}
    holder.dataset.gameId=g.game_id;
    const result=g.home_points>g.away_points?'WIN':g.home_points<g.away_points?'LOSS':'TIE';
    const top=el('div',undefined,'latest-top');top.append(el('p','LATEST GAME','eyebrow'),el('span','FINAL · '+result,'latest-result'));
    const matchup=el('div',undefined,'latest-matchup'),teams=el('div');
    teams.append(el('span','Our team','latest-team'),el('h2','vs '+g.opponent));
    matchup.append(teams,el('strong',g.home_points+' – '+g.away_points,'latest-score'));
    const info=el('p',g.game_date+' · '+category(g),'latest-meta');
    const leaders=A.leaders(A.summarize(snapshot,[g]).players,'points','total');
    const footer=el('div',undefined,'latest-footer'),performers=el('div',undefined,'latest-performers');
    if(leaders.players.length){
      performers.append(el('small',leaders.players.length===1?'POINTS LEADER':'POINTS LEADERS'));
      for(const p of leaders.players)performers.append(button(p.player_name+' · '+fmt(leaders.value,0)+' PTS',()=>openPlayer(p.player_id)));
    }
    footer.append(performers,button('Game report ↗',()=>openGame(g),'latest-report'));
    holder.append(top,matchup,info,footer);
  }
  function renderLeaders(){
    $('leader-total').setAttribute('aria-pressed',leaderMode==='total');$('leader-average').setAttribute('aria-pressed',leaderMode==='average');
    const codes={points:'PTS',rebounds:'REB',offensive:'OR',assists:'AST',steals:'STL',blocks:'BLK'};
    $('leader-grid').replaceChildren(...Object.keys(codes).map(key=>{
      const result=A.leaders(summary.players,key,leaderMode),card=el('article',undefined,'leader-card'),top=el('div',undefined,'leader-top');
      top.append(el('span',codes[key],'stat-symbol'),el('span',names[key]));card.append(top,el('strong',fmt(result.value,leaderMode==='total'?0:1),'leader-value'));
      if(!result.players.length)card.append(el('small','No recorded '+names[key].toLowerCase()+' yet'));
      for(const p of result.players){card.append(button(p.player_name,()=>openPlayer(p.player_id)),el('small',`#${p.jersey_number} · ${p.appearances} GP${leaderMode==='average'?' · per game':''}`));}
      if(result.players.length>1)card.append(el('small','Tied leaders'));
      return card;
    }));
  }
  function svgNode(tag,attrs,text){const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;}
  function renderChart(){
    const holder=$('scoring-chart');holder.replaceChildren();if(!games.length){holder.append(empty('No games in this period','Choose another season or year to explore results.'));return;}
    const data=[...games].sort((a,b)=>a.game_date.localeCompare(b.game_date)||a.game_id.localeCompare(b.game_id));
    const W=560,H=228,left=34,right=18,top=16,bottom=35,max=Math.max(20,Math.ceil(Math.max(...data.flatMap(g=>[g.home_points,g.away_points]))/20)*20);
    const x=i=>left+(W-left-right)*(data.length===1?.5:i/(data.length-1)),y=n=>top+(H-top-bottom)*(1-n/max);
    const svg=svgNode('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Points scored by our team and opponents in chronological game order'});
    svg.append(svgNode('title',{},'Scoring across selected games. Exact scores are listed in Game results.'));
    for(let i=0;i<=4;i++){const v=max*i/4;svg.append(svgNode('line',{x1:left,x2:W-right,y1:y(v),y2:y(v),stroke:'#e9eef5','stroke-dasharray':'3 5'}),svgNode('text',{x:left-9,y:y(v)+4,'text-anchor':'end'},String(v)));}
    for(const [key,color,dashed] of [['away_points','#9aaac0',true],['home_points','#285ce5',false]]){
      svg.append(svgNode('polyline',{points:data.map((g,i)=>`${x(i)},${y(g[key])}`).join(' '),fill:'none',stroke:color,'stroke-width':2.5,...(dashed?{'stroke-dasharray':'5 4'}:{})}));
      for(const [i,g] of data.entries()){const c=svgNode('circle',{cx:x(i),cy:y(g[key]),r:data.length>30?2:4,fill:color,stroke:'white','stroke-width':2});c.append(svgNode('title',{},`${g.game_date} vs ${g.opponent}: ${key==='home_points'?'Our team':'Opponent'} ${g[key]}`));svg.append(c);}
    }
    const indices=[...new Set([0,Math.floor((data.length-1)/3),Math.floor(2*(data.length-1)/3),data.length-1])];
    for(const i of indices)svg.append(svgNode('text',{x:x(i),y:H-10,'text-anchor':'middle'},data[i].game_date.slice(5).replace('-','/')));
    animateIn(svg);holder.append(svg,el('p',`${data.length} games · Chronological order · Scores shown in game reports`,'chart-footnote'));
  }
  function renderComparison(){
    const container=$('team-comparison');container.replaceChildren();const head=el('div',undefined,'comparison-head');head.append(el('span','RECORDED STAT'),el('span','OUR TEAM'),el('span','OPPONENT'));container.append(head);
    const avg=(s,k)=>s?fmt(A.ratio(s[k],games.length)):'—';
    for(const [label,h,a] of [['FG%',pct(summary.shooting.fg),pct(summary.opponentShooting?.fg)],['3PT%',pct(summary.shooting.three),pct(summary.opponentShooting?.three)],['FT%',pct(summary.shooting.ft),pct(summary.opponentShooting?.ft)],['Rebounds',avg(summary.home,'rebounds'),avg(summary.away,'rebounds')],['Off. rebounds',avg(summary.home,'offensive'),avg(summary.away,'offensive')],['Assists',avg(summary.home,'assists'),avg(summary.away,'assists')],['Turnovers',avg(summary.home,'turnovers'),avg(summary.away,'turnovers')]]){const row=el('div',undefined,'comparison-row');row.append(el('span',label),el('strong',h),el('strong',a));container.append(row);}
    container.append(el('p',`eFG ${pct(summary.shooting.efg)} · TS ${pct(summary.shooting.ts)} · OREB ${pct(summary.offensiveReboundPct)} · DREB ${pct(summary.defensiveReboundPct)}`,'section-note'));
    const more=el('details',undefined,'more-metrics');more.append(el('summary','More team metrics'));
    more.append(table(['Recorded metric','Our team','Opponent'],['defensive','steals','blocks','fouls'].map(k=>[names[k]+' / game',avg(summary.home,k),avg(summary.away,k)])));
    more.append(el('p',`Net rating: ${fmt(summary.advanced.netRating)} · ${summary.advanced.eligible} eligible games. OREB% and DREB% describe the share of available team rebounds collected.`,'section-note'));container.append(more);
    if(!summary.away&&games.length)container.append(el('p','Opponent detail is unavailable for some selected historical games.','section-note'));
  }
  function renderPlayers(){
    const groups=A.playerGroups(snapshot,summary.players),period=$('period-select').value;
    const label=period==='career'?'Career players':period.startsWith('year:')?'Selected year':period===A.currentSeason()?'This season':'Selected season';
    $('players-appeared').textContent=`${label} (${groups.appeared.length})`;
    $('players-other').textContent=`Other players (${groups.other.length})`;
    for(const group of ['appeared','other'])$('players-'+group).setAttribute('aria-pressed',playerGroup===group);
    $('player-group-note').textContent=playerGroup==='appeared'?'Players with a recorded appearance in the selected period and game category. Unused bench players are under Other players.':'No recorded appearances in this period and game category. Select a player and change their profile period to explore earlier games.';
    const search=$('player-search').value.trim().toLocaleLowerCase().replace(/^#/,'');
    const players=groups[playerGroup].filter(p=>p.player_name.toLocaleLowerCase().includes(search)||String(p.jersey_number).includes(search));
    players.sort((a,b)=>sortDirection*((sortKey==='appearances'?a.appearances:a.averages[sortKey]??-1)-(sortKey==='appearances'?b.appearances:b.averages[sortKey]??-1))||a.player_name.localeCompare(b.player_name));
    const holder=$('player-table');holder.replaceChildren();if(!players.length){holder.append(empty('No players found',search?'Try another name or jersey number.':playerGroup==='appeared'?'Players appear here after playing in a published game. Browse Other players or choose another period.':'Every known player has an appearance in the selected games, or no roster has been published yet.'));return;}
    const columns=[['GP','appearances'],['PPG','points'],['RPG','rebounds'],['APG','assists'],['SPG','steals'],['BPG','blocks'],['TOPG','turnovers']];
    const headers=['Player',...columns.map(([title,key])=>{const b=button(title+(sortKey===key?(sortDirection===-1?' ↓':' ↑'):''),()=>{sortDirection=sortKey===key?-sortDirection:-1;sortKey=key;renderPlayers();},'sort-button');b.setAttribute('aria-label','Sort by '+title);b.setAttribute('aria-pressed',sortKey===key);return b;}),'FG%','3PT%','FT%'];
    holder.append(table(headers,players.map(p=>[playerButton(p),p.appearances,...['points','rebounds','assists','steals','blocks','turnovers'].map(k=>fmt(p.averages[k])),pct(p.shooting.fg),pct(p.shooting.three),pct(p.shooting.ft)])));
  }
  function renderGames(){
    $('results-count').textContent=`${games.length} games`;
    $('game-list').replaceChildren(...games.map(g=>{const card=el('article',undefined,'game-card'),result=g.home_points>g.away_points?'W':g.home_points<g.away_points?'L':'T';
      const info=el('div'),meta=el('p',g.game_date,'game-meta');meta.append(el('span',category(g),'category-tag'));info.append(meta,el('h3','vs '+g.opponent),el('p',A.periodLabel(A.season(g.game_date)),'game-meta'));
      const end=el('div');end.append(el('p',`${g.home_points} – ${g.away_points}`,'score'),button('Game overview →',()=>openGame(g),'game-report'));
      card.append(el('span',result,'result-mark '+(result==='L'?'loss':result==='T'?'tie':'')),info,end);return card;
    }));
    if(!games.length)$('game-list').append(empty('No games in this period','Try a different period or include both game categories.'));
  }
  function openPlayer(id){playerId=id;renderPlayer(id);if(!$('player-dialog').open){$('player-dialog').showModal();animateIn($('player-dialog'),'sheet');}}
  function renderPlayer(id){
    const known=(snapshot.roster||[]).find(p=>p.player_id===id)||snapshot.games.flatMap(g=>g.players||[]).find(p=>p.player_id===id);
    const p=summary.players.find(p=>p.player_id===id)||(known?{...known,appearances:0,played_ms:null,partial:false,stats:A.empty(),averages:{},shooting:A.shooting(A.empty()),games:[]}:null);if(!p){$('player-dialog').close();return;}
    $('profile-period').replaceChildren(...[...$('period-select').children].map(n=>n.cloneNode(true)));$('profile-period').value=$('period-select').value;$('profile-category').value=$('category-select').value;
    $('player-title').textContent=`${p.player_name} · #${p.jersey_number}`;
    $('player-note').textContent=`${A.periodLabel($('period-select').value)} · ${$('category-select').selectedOptions[0].textContent} · ${p.appearances} appearances${p.player_id==='P_GUEST'?' · Combined guest group':''}`;
    $('player-summary').replaceChildren(...metrics(['points','rebounds','assists','steals','blocks','turnovers'].map(k=>[names[k].toUpperCase(),fmt(p.averages[k]),'per game'])));
    const s=p.stats;
    const totalTable=el('div',undefined,'table-wrap');totalTable.tabIndex=0;totalTable.setAttribute('role','region');totalTable.setAttribute('aria-label','Player totals');totalTable.append(table(['PTS','OREB','DREB','REB','AST','STL','BLK','TO','PF','MIN'],[[s.points,s.offensive,s.defensive,s.rebounds,s.assists,s.steals,s.blocks,s.turnovers,s.fouls,p.played_ms==null?'—':fmt(p.played_ms/60000)+(p.partial?'*':'')]]));$('player-totals').replaceChildren(totalTable);
    $('player-totals').append(el('p',`Shooting: FG ${s.fgm}/${s.fga} (${pct(p.shooting.fg)}) · 3PT ${s.threeMade}/${s.threeAttempts} (${pct(p.shooting.three)}) · FT ${s.ftm}/${s.fta} (${pct(p.shooting.ft)}) · eFG ${pct(p.shooting.efg)} · TS ${pct(p.shooting.ts)}`,'section-note'));
    if(p.partial)$('player-totals').append(el('p','* Minutes are a known subtotal; some game tracking is partial or unavailable.','section-note'));
    $('player-games').replaceChildren(table(['Game','Category','MIN','PTS','OREB','REB','AST','STL','BLK','TO'],p.games.sort((a,b)=>descending(a.game,b.game)).map(({game:g,player:q})=>{const s=q.stats||{};return [button(`${g.game_date} · vs ${g.opponent}`,()=>{$('player-dialog').close();openGame(g);}),category(g),q.played_count===0?'DNP':q.played_ms==null?'—':fmt(q.played_ms/60000)+(g.coverage==='complete'?'':'*'),...['points','offensive','rebounds','assists','steals','blocks','turnovers'].map(k=>s[k]??0)];})));
    if(!p.games.length)$('player-games').replaceChildren(empty('No games for this player','Choose another season, year or their entire career.'));
  }
  function openGame(g){
    $('box-title').textContent='vs '+g.opponent;
    $('box-note').textContent=`${g.game_date} · ${category(g)} · ${A.periodLabel(A.season(g.game_date))} · ${g.coverage==='complete'?'Complete minute tracking':'Partial or unavailable minutes'}`;
    $('game-score').replaceChildren(el('span','Our team'),el('strong',`${g.home_points} – ${g.away_points}`),el('span',g.opponent));
    const m=A.gameMetrics(g);
    $('game-metrics').replaceChildren(...metrics([['PACE',fmt(m.pace),'per 40 minutes'],['OUR OFF. RATING',fmt(m.offensiveRating),'per 100 possessions'],['OUR DEF. RATING',fmt(m.defensiveRating),'per 100 possessions'],['OUR NET RATING',fmt(m.netRating),'offense − defense'],['POSSESSIONS',fmt(m.possessions),'estimated'],['DURATION',g.duration_ms?fmt(g.duration_ms/60000):'—','recorded minutes']]));
    const total=A.summarize(snapshot,[g]),h=total.home,a=total.away;
    const teamCells=s=>s?[s.points,`${s.fgm}/${s.fga}`,pct(A.shooting(s).fg),`${s.threeMade}/${s.threeAttempts}`,`${s.ftm}/${s.fta}`,s.offensive,s.defensive,s.rebounds,s.assists,s.steals,s.blocks,s.turnovers,s.fouls]:Array(13).fill('—');
    const shootingRows=[['Field goals',s=>`${s.fgm}/${s.fga}`],['FG%',s=>pct(A.shooting(s).fg)],['3-pointers',s=>`${s.threeMade}/${s.threeAttempts}`],['3PT%',s=>pct(A.shooting(s).three)],['Free throws',s=>`${s.ftm}/${s.fta}`],['FT%',s=>pct(A.shooting(s).ft)]];
    const rows=[['Points',g.home_points,g.away_points],...shootingRows.map(([label,value])=>[label,value(h),a?value(a):'—']),...['offensive','defensive','rebounds','assists','steals','blocks','turnovers','fouls'].map(k=>[names[k],h[k],a?a[k]:'—']),['Offensive rating',fmt(m.offensiveRating),fmt(m.defensiveRating)],['Defensive rating',fmt(m.defensiveRating),fmt(m.offensiveRating)]];
    $('game-comparison').replaceChildren(table(['Recorded statistic','Our team',g.opponent],rows));
    if(m.possessions===null)$('game-comparison').append(el('p','Pace and ratings require confirmed full statistics for both teams and positive estimated possessions.','section-note'));
    else if(m.pace===null)$('game-comparison').append(el('p','Pace is unavailable because game duration was not recorded.','section-note'));
    if(!a)$('game-comparison').append(el('p','Opponent detail was not recorded for this game. Its final score is still available.','section-note'));
    $('box-table').replaceChildren(table(['Player','MIN','PTS','FG','FG%','3PT','FT','OREB','DREB','REB','AST','STL','BLK','TO','PF'],(g.players||[]).map(p=>{const s={...A.empty(),...p.stats};return [p.player_name,p.played_count===0?'DNP':p.played_ms==null?'—':fmt(p.played_ms/60000)+(g.coverage==='complete'?'':'*'),...teamCells(s)];})));
    if(!$('box-dialog').open){$('box-dialog').showModal();animateIn($('box-dialog'),'sheet');}
  }
  async function load(){
    $('retry-load').hidden=true;$('load-status').textContent='';$('published').textContent='Loading published results…';
    try{const response=await fetch('data/stats.json',{cache:'no-cache'});if(!response.ok)throw Error('Published results are not available yet.');const data=await response.json();
      if(data.schema_version!==1||!Array.isArray(data.games))throw Error('Unsupported statistics snapshot.');
      snapshot=data;periodOptions();$('period-select').disabled=false;$('category-select').disabled=false;
      $('published').textContent=data.generated_at?'Last published '+new Date(data.generated_at).toLocaleString():'No games published yet.';render();
    }catch(e){$('load-status').textContent=e.message||'Could not load statistics.';$('published').textContent='Results unavailable';$('retry-load').hidden=false;}
  }
  $('period-select').onchange=render;$('category-select').onchange=render;$('player-search').oninput=()=>{if(summary)renderPlayers();};
  for(const group of ['appeared','other'])$('players-'+group).onclick=()=>{playerGroup=group;if(summary)renderPlayers();};
  $('profile-period').onchange=()=>{$('period-select').value=$('profile-period').value;render();};$('profile-category').onchange=()=>{$('category-select').value=$('profile-category').value;render();};
  $('leader-total').onclick=()=>{leaderMode='total';if(summary)renderLeaders();};$('leader-average').onclick=()=>{leaderMode='average';if(summary)renderLeaders();};
  reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)document.getAnimations().forEach(a=>a.cancel());});
  for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('close',()=>dialog.getAnimations().forEach(a=>a.cancel()));
  $('player-close').onclick=()=>$('player-dialog').close();$('box-close').onclick=()=>$('box-dialog').close();$('retry-load').onclick=load;
  load();
})();
