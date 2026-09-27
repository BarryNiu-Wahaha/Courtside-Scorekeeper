(() => {
  'use strict';
  const E=ScoreEngine, T=TeamEngine, KEY='courtside.v2';
  const $=id=>document.getElementById(id);
  const html=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={'2PT_MADE':'2-point shot made','2PT_MISSED':'2-point shot missed','3PT_MADE':'3-point shot made','3PT_MISSED':'3-point shot missed',FT_MADE:'Free throw made',FT_MISSED:'Free throw missed',OFF_REBOUND:'Offensive rebound',DEF_REBOUND:'Defensive rebound',ASSIST:'Assist',STEAL:'Steal',BLOCK:'Block',TURNOVER:'Turnover',FOUL:'Personal foul'};
  let state={version:2,roster:DEFAULT_ROSTER.map((p,i)=>({...p,id:`P_DEFAULT_${String(i+1).padStart(3,'0')}`})),games:[],currentGameId:null};
  let selectedId=null, side='HOME', toastTimer, saveBlocked=false, rawSaved=null, confirmAction=null;
  let feedbackTimer, inputMethod='keyboard';
  document.addEventListener('pointerdown',()=>{inputMethod='pointer';document.documentElement.dataset.input='pointer';},true);
  document.addEventListener('keydown',()=>{inputMethod='keyboard';document.documentElement.dataset.input='keyboard';},true);
  function confirmPlay(event){
    const feedback=$('action-confirmation');
    clearTimeout(feedbackTimer);
    feedback.textContent=`✓ #${event.event_id} · ${event.team_side==='HOME'?'#'+event.jersey_number+' '+event.player_name:event.opponent} · ${labels[event.event_type]}`;
    feedback.classList.add('visible');
    feedbackTimer=setTimeout(()=>feedback.classList.remove('visible'),1600);
    if(event.points_value&&inputMethod==='pointer'&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const score=$(event.team_side==='HOME'?'home-score':'away-score');
      score.getAnimations().forEach(animation=>animation.cancel());
      score.animate([{transform:'scale(1.045)'},{transform:'scale(1)'}],{duration:160,easing:'cubic-bezier(0.23, 1, 0.32, 1)'});
    }
  }
  const current=()=>state.games.find(g=>g.id===state.currentGameId)||null;
  function warn(text){$('storage-warning').textContent=text;$('storage-warning').hidden=false;$('save-status').textContent='● Backup recommended';}
  function toast(message,error=false){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').classList.toggle('error',error);$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,error?6500:3000);}
  function save(){
    if(saveBlocked)return;
    try{localStorage.setItem(KEY,JSON.stringify(state));$('save-status').textContent='● Saved on this device';$('storage-warning').hidden=true;}
    catch{warn('This browser could not save your latest changes. Keep this page open and download a backup or CSV now.');}
  }
  try {
    rawSaved=localStorage.getItem(KEY);
    if(rawSaved){const loaded=JSON.parse(rawSaved);E.validateState(loaded);state=loaded;}
    else {
      // Preserve legacy roster identities without fabricating event history from totals.
      const legacy=localStorage.getItem('basketballStats');
      if(legacy){try{const old=JSON.parse(legacy);if(Array.isArray(old.players)&&old.players.length){const migrated=old.players.map(p=>({id:`P_LEGACY_${p.id}`,name:p.name,number:Number(p.number)}));E.validateState({...state,roster:migrated});state.roster=migrated;}}catch{} }
      save();
    }
  } catch {saveBlocked=true;$('recovery-button').hidden=!rawSaved;warn('Saved data could not be loaded. The original is untouched; use Download original recovery data to keep it. New changes are only in memory: use Download backup to save your new work.');}
  function open(id){$(id).showModal();}
  function confirm(title,text,action){$('confirm-title').textContent=title;$('confirm-text').textContent=text;confirmAction=action;open('confirm-dialog');}
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $('confirm-yes').addEventListener('click',()=>{const action=confirmAction;confirmAction=null;$('confirm-dialog').close();try{action?.();}catch(e){toast(e.message,true);}});
  function run(fn){try{fn();save();render();}catch(e){toast(e.message,true);}}
  const periodText=g=>g.period<=4?`QUARTER ${g.period}`:`OVERTIME ${g.period-4}`;
  function renderClock(){
    const g=current();if(!g)return;
    if(g.running&&E.remaining(g)<=0){E.pause(g);save();toast('Period complete. Advance when you are ready.');}
    $('clock-display').textContent=E.clock(g);$('clock-speed').value=String(g.clockSpeed||1);$('clock-speed').disabled=!!(g.finished||g.finalizedAt||g.remote);
    $('period-label').textContent=periodText(g);
    $('clock-status').textContent=g.finished?'FINAL':g.running?'LIVE':g.started?'PAUSED':'READY';
    $('clock-status').classList.toggle('running',g.running);
    $('clock-button').textContent=g.running?'Ⅱ Pause':g.started?'▶ Resume':'▶ Start game';
    $('clock-button').classList.toggle('paused-color',g.running);
    $('clock-button').disabled=g.finished||(!g.running&&g.remainingMs===0);
    $('adjust-button').disabled=g.running||g.finished;
    $('period-button').disabled=g.running||g.finished;
    $('period-button').textContent=g.period<4?'Next quarter →':'Next overtime →';
    if(!$('box-view').hidden)renderBox();
  }
  function render(){
    const g=current(); const roster=g?(g.lineup?g.roster.filter(p=>g.lineup.includes(p.id)):g.finished?g.roster:[]):[];
    if(!roster.some(p=>p.id===selectedId))selectedId=null;
    $('home-score').textContent=g?E.stats(g,'HOME').points:0;$('away-score').textContent=g?E.stats(g,'AWAY').points:0;
    $('opponent-name').textContent=g?g.opponent:'OPPONENT';$('game-meta').textContent=g?`${g.date}  ·  vs ${g.opponent}`:'Set up your game to get started.';
    $('roster-count').textContent=roster.length;
    $('roster-list').innerHTML=roster.map(p=>{const s=E.stats(g,'HOME',p.id);return `<button class="player-card ${p.id===selectedId&&side==='HOME'?'selected':''}" data-player="${html(p.id)}" aria-pressed="${p.id===selectedId&&side==='HOME'}" aria-label="Select ${html(p.name)}, number ${p.number}"><span class="jersey">${p.number}</span><span class="player-info"><strong>${html(p.name)}</strong><small>${g.starters?.includes(p.id)?'Starter · ':''}${p.guest?'Guest · ':''}${s.rebounds} REB · ${s.assists} AST</small></span><span class="player-points">${s.points}<small>PTS</small></span></button>`;}).join('')||'<div class="empty-state">Choose your game squad and five starters to put players on court.</div>';
    $('lineup-button').disabled=!g||g.finished;
    $('lineup-button').textContent=g?.started&&g.lineup?'Substitute':'Choose game players';
    $('participation-export-button').disabled=!g?.participation;
    $('participation-note').textContent=!g?.participation?'Minutes unavailable for games recorded before lineup tracking.':g.coverage==='partial'?'Partial minutes: tracking began when a lineup was chosen for this existing game.':'Minutes count running game-clock time only. Clock corrections do not change accumulated minutes.';
    const player=roster.find(p=>p.id===selectedId);
    const name=side==='AWAY'?(g?.opponent||'Opponent'):player?.name||'Who made the play?';
    $('selected-player').classList.toggle('has-selection',!!player||side==='AWAY');
    $('selected-player').innerHTML=`<span class="selected-avatar">${side==='AWAY'?'A':player?player.number:'—'}</span><div><div class="selected-name">${html(name)}</div><div class="selected-description">${side==='AWAY'?'Team-level recording':player?'Recording for our team':'Select a player from the roster'}</div></div><span class="selection-tag">${side==='AWAY'?'OPPONENT':'OUR TEAM'}</span>`;
    $('home-side').classList.toggle('active',side==='HOME');$('away-side').classList.toggle('active',side==='AWAY');$('home-side').setAttribute('aria-pressed',side==='HOME');$('away-side').setAttribute('aria-pressed',side==='AWAY');
    document.querySelectorAll('[data-stat]').forEach(b=>b.disabled=!g||!g.started||g.finished||(side==='HOME'&&!player));
    $('recording-hint').textContent=!g?'Create a game to start recording.':g.finished?'Game complete. Select a recorded action to correct it before export.':!g.started?'Start the game clock to enable recording.':side==='HOME'&&!player?'Select a player, then tap a stat.':'Each tap records one play at the displayed game time.';
    const events=g?.gameEvents||[];
    $('event-count').textContent=events.length;
    $('event-list').innerHTML=[...events].reverse().map(e=>{
      const category=e.event_type.endsWith('_MADE')?'made':e.event_type.endsWith('_MISSED')?'missed':['FOUL','TURNOVER'].includes(e.event_type)?'danger':'';
      const icon=e.points_value?`+${e.points_value}`:category==='missed'?'×':{OFF_REBOUND:'OR',DEF_REBOUND:'DR',ASSIST:'A',STEAL:'S',BLOCK:'B',TURNOVER:'TO',FOUL:'F'}[e.event_type]||'•';
      return `<div class="event-item" data-event="${e.event_id}" role="button" tabindex="0" aria-label="Correct play ${e.event_id}" data-void="${e.is_voided}"><span class="event-icon ${category}">${icon}</span><div class="event-body"><strong>${html(labels[e.event_type])}</strong><small>${e.team_side==='HOME'?`#${e.jersey_number} ${html(e.player_name)}`:`${html(e.opponent)} · Opponent`}${e.is_voided?' · VOIDED':''}</small></div><div class="event-time">${html(e.game_clock)}<small>${e.quarter.startsWith('OT')?html(e.quarter):'Q'+html(e.quarter)} · #${e.event_id}</small></div></div>`;
    }).join('')||'<div class="empty-state"><span class="empty-icon">◎</span>Your game starts here.<br>Record a play to see it in the feed.</div>';
    $('undo-button').disabled=!events.some(e=>!e.is_voided)||!!g?.finalizedAt||!!g?.remote;
    $('export-button').disabled=!g;$('finish-button').disabled=!g||!!g.finalizedAt||!!g.remote;
    $('finish-button').textContent=g?.finalizedAt?'Exported · locked':g?.finished?'Reopen game':'End game';
    for(const id of ['clock-button','adjust-button','period-button'])$(id).disabled=!g;
    renderClock();renderBox();renderRemote();
  }
  function renderBox(){
    const g=current();if(!g){$('box-table').innerHTML='<div class="empty-state">Create a game to see your team stats.</div>';return;}
    const cells=s=>`<td>${s.points}</td><td>${s.fgm}/${s.fga}</td><td>${s.threeMade}/${s.threeAttempts}</td><td>${s.ftm}/${s.fta}</td><td>${s.offensive}</td><td>${s.defensive}</td><td>${s.rebounds}</td><td>${s.assists}</td><td>${s.steals}</td><td>${s.blocks}</td><td>${s.turnovers}</td><td>${s.fouls}</td>`;
    const players=g.roster.filter(p=>!g.squad||g.squad.includes(p.id)||g.gameEvents.some(e=>e.player_id===p.id));
    $('box-table').innerHTML=`<table><thead><tr><th>PLAYER</th><th>MIN</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>OREB</th><th>DREB</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>${players.map(p=>`<tr><td>#${p.number} ${html(p.name)}${g.starters?.includes(p.id)?' (starter)':''}</td><td>${g.participation?.[p.id]?T.minutes(g,p.id,Date.now()).toFixed(2):'—'}</td>${cells(E.stats(g,'HOME',p.id))}</tr>`).join('')}</tbody><tfoot><tr><td>Our team</td><td>—</td>${cells(E.stats(g,'HOME'))}</tr><tr><td>${html(g.opponent)}</td><td>—</td>${cells(E.stats(g,'AWAY'))}</tr></tfoot></table>`;

    if(g.finished){
      const format=(v,d=1)=>v==null?'—':v.toFixed(d);
      $('box-table').insertAdjacentHTML('beforeend',`<h3>Player analytics</h3><p class="form-note">— means no attempts/turnovers, or incomplete historical lineup data for +/−. TS% uses a 0.44 free-throw estimate.</p><button id="player-export-button" class="button subtle">Export player statistics</button><table><thead><tr><th>PLAYER</th><th>+/−</th><th>FG%</th><th>3P%</th><th>FT%</th><th>eFG%</th><th>TS%</th><th>AST/TO</th></tr></thead><tbody>${players.map(p=>{const a=PlayerAnalytics.player(g,p.id);return `<tr><td>${html(p.name)}</td><td title="${a.plusMinusStatus}">${a.plusMinus==null?'—':a.plusMinus>0?'+'+a.plusMinus:a.plusMinus}</td>${['fgPct','threePct','ftPct','efgPct','tsPct','astTo'].map(k=>`<td>${format(a[k],k==='astTo'?2:1)}</td>`).join('')}</tr>`;}).join('')}</tbody></table>`);
      $('player-export-button').onclick=()=>exportResults('player_statistics',g=>PlayerAnalytics.csv(g));
    }
  }
  $('roster-list').addEventListener('click',event=>{const b=event.target.closest('[data-player]');if(b){selectedId=b.dataset.player;side='HOME';render();}});
  $('home-side').addEventListener('click',()=>{side='HOME';render();});$('away-side').addEventListener('click',()=>{side='AWAY';render();});
  document.querySelectorAll('[data-stat]').forEach(b=>b.addEventListener('click',()=>run(()=>{
    const g=current();const event=E.recordEvent(g,b.dataset.stat,g.roster.find(p=>p.id===selectedId),side);
    confirmPlay(event);
  })));
  $('clock-button').addEventListener('click',()=>run(()=>{const g=current();if(!g.lineup){chooseLineup();return;}g.running?E.pause(g):E.start(g);}));
  $('adjust-button').addEventListener('click',()=>{const g=current();if(!g||g.running)return;$('clock-input').value=E.clock(g);open('clock-dialog');});
  $('clock-form').addEventListener('submit',e=>{e.preventDefault();run(()=>{E.setClock(current(),$('clock-input').value.trim());$('clock-dialog').close();toast('Clock updated.');});});
  $('period-button').addEventListener('click',()=>{const g=current();if(!g||g.running)return;confirm('Advance the period?',`The clock will reset to ${g.period<4?g.minutes:g.overtimeMinutes}:00 and stay paused. All recorded plays will be kept.`,()=>run(()=>E.nextPeriod(g)));});
  $('undo-button').addEventListener('click',()=>run(()=>{const e=E.undo(current());if(e)toast(`Play #${e.event_id} voided. Stats updated.`);}));

  function exportResults(kind,prepare){
    const g=current();if(!g)return;if(!g.finished){toast('End the game before exporting final results.',true);return;}
    const action=()=>{try{ResultExport.exportGame(g,()=>prepare(g),()=>{if(saveBlocked)throw Error('Restore browser saving before finalizing.');localStorage.setItem(KEY,JSON.stringify(state));},content=>download(content,`${g.id}_${kind}.csv`,'text/csv;charset=utf-8'));render();toast('Results exported. This game is locked; you can download its results again.');}catch(error){toast(error.message,true);}};
    if(g.finalizedAt||g.remote)action();else confirm('Finalize and export?','Exporting locks this game against further edits. You can download results again. Backups do not finalize games.',action);
  }
  $('clock-speed').addEventListener('change',()=>run(()=>E.setSpeed(current(),Number($('clock-speed').value))));
  let correctionId=null;
  function editEvent(id){
    const g=current();E.assertMutable(g);if(g.running)E.pause(g);save();render();const e=g.gameEvents.find(x=>x.event_id===id);if(!e)return;correctionId=id;
    $('correction-time').textContent=`Play #${id} · ${e.quarter} · ${e.game_clock} (time stays unchanged)`;
    $('correction-side').value=e.team_side;$('correction-player').innerHTML=g.roster.filter(p=>!g.squad||g.squad.includes(p.id)).map(p=>`<option value="${html(p.id)}">#${p.number} ${html(p.name)}</option>`).join('');$('correction-player').value=e.player_id||g.roster[0]?.id;
    $('correction-type').innerHTML=Object.keys(E.TYPES).map(t=>`<option value="${t}">${html(labels[t])}</option>`).join('');$('correction-type').value=e.event_type;$('correction-delete').checked=e.is_voided;$('correction-unlink').checked=false;$('correction-error').textContent='';
    const linked=new Set((g.eventLinks||[]).flatMap(l=>l.assistEventId===id?[l.shotEventId]:l.shotEventId===id?[l.assistEventId]:[]));
    $('correction-related').innerHTML=g.gameEvents.filter(x=>x.event_id!==id&&!x.is_voided&&(Math.abs(x.event_id-id)<=5||linked.has(x.event_id))).map(x=>`<div class="related-row"><span>#${x.event_id} ${html(labels[x.event_type])} · ${html(x.player_name||g.opponent)}${linked.has(x.event_id)?' · linked':''}</span><label><input type="checkbox" data-related-delete="${x.event_id}"> Delete</label>${['ASSIST','2PT_MADE','3PT_MADE'].includes(x.event_type)?`<label><input type="checkbox" data-related-link="${x.event_id}" ${linked.has(x.event_id)?'checked':''}> Link</label>`:''}</div>`).join('');
    const tx=g.correctionAudit?.findLast(t=>!t.restored&&t.changes.some(c=>c.eventId===id&&!c.before.is_voided&&c.after.is_voided));$('correction-restore').hidden=!e.is_voided||!tx;$('correction-restore').dataset.transaction=tx?.id||'';
    $('correction-player').disabled=e.team_side==='AWAY';open('correction-dialog');
  }
  $('correction-side').addEventListener('change',()=>{$('correction-player').disabled=$('correction-side').value==='AWAY';});
  $('event-list').addEventListener('click',e=>{const item=e.target.closest('[data-event]');if(item)run(()=>editEvent(Number(item.dataset.event)));});
  $('event-list').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-event]')){e.preventDefault();run(()=>editEvent(Number(e.target.dataset.event)));}});
  $('correction-form').addEventListener('submit',event=>{event.preventDefault();try{
    const g=current(),patch={event_type:$('correction-type').value,team_side:$('correction-side').value,player_id:$('correction-player').value,is_voided:$('correction-delete').checked};
    const changes=[{eventId:correctionId,patch},...Array.from(document.querySelectorAll('[data-related-delete]:checked'),el=>({eventId:Number(el.dataset.relatedDelete),patch:{is_voided:true}}))];
    let links=(g.eventLinks||[]).filter(l=>l.assistEventId!==correctionId&&l.shotEventId!==correctionId);
    if(!$('correction-unlink').checked)for(const el of document.querySelectorAll('[data-related-link]:checked')){const other=Number(el.dataset.relatedLink);links.push(patch.event_type==='ASSIST'?{assistEventId:correctionId,shotEventId:other}:{assistEventId:other,shotEventId:correctionId});}
    const deleted=new Set(changes.filter(c=>c.patch.is_voided).map(c=>c.eventId));links=links.filter(l=>!deleted.has(l.assistEventId)&&!deleted.has(l.shotEventId));
    E.correctEvents(g,changes,links);save();render();$('correction-dialog').close();toast('Correction saved. Scores and statistics recalculated.');
  }catch(error){$('correction-error').textContent=error.message;}});
  $('correction-restore').addEventListener('click',()=>{try{E.restoreDeletion(current(),$('correction-restore').dataset.transaction);save();render();$('correction-dialog').close();toast('Deletion group restored.');}catch(error){$('correction-error').textContent=error.message;}});
  function setup(){const now=new Date();$('setup-date').value=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;$('setup-opponent').value='';$('setup-category').value='friendly';open('setup-dialog');}
  $('new-game-button').addEventListener('click',setup);
  $('setup-form').addEventListener('submit',async e=>{e.preventDefault();
    const button=$('setup-form').querySelector('[type="submit"]');if(button.disabled)return;
    if(remoteBase){button.disabled=true;button.textContent='Checking team roster…';try{await syncSharedRoster();}finally{button.disabled=false;button.textContent='Create game →';}}
    if(!$('setup-dialog').open||!$('setup-form').reportValidity())return;
    run(()=>{
    const g=E.createGame({date:$('setup-date').value,opponent:$('setup-opponent').value,category:$('setup-category').value,minutes:Number($('setup-minutes').value),overtimeMinutes:Number($('setup-ot').value)},state.roster);
    if(current()?.running)E.pause(current());state.games.push(g);state.currentGameId=g.id;selectedId=null;side='HOME';$('setup-dialog').close();chooseLineup();
  });});
  $('finish-button').addEventListener('click',()=>{
    const g=current();if(!g)return;
    if(g.finalizedAt||g.remote){toast('This game is locked for upload. Only the admin can correct the official record.',true);return;}
    if(g.finished){run(()=>{g.finished=false;toast('Game reopened. The clock is paused.');});return;}
    confirm('Finish this game?','The clock will pause and recording will stop. You can export the full event log or reopen the game for corrections.',()=>run(()=>{E.pause(g);g.finished=true;toast('Final whistle. Your event log is ready to export.');}));
  });
  function download(text,name,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
  $('export-button').addEventListener('click',()=>exportResults('events',g=>E.csv(g)));
  $('backup-button').addEventListener('click',()=>download(JSON.stringify(E.backup(state),null,2),`courtside-backup-${new Date().toISOString().slice(0,10)}.json`,'application/json'));
  $('recovery-button').addEventListener('click',()=>download(rawSaved||'',`courtside-original-recovery-${new Date().toISOString().slice(0,10)}.txt`,'text/plain;charset=utf-8'));
  $('restore-button').addEventListener('click',()=>$('restore-file').click());
  $('restore-file').addEventListener('change',async()=>{
    const file=$('restore-file').files[0];if(!file)return;
    try {
      const loaded=JSON.parse(await file.text());E.validateState(loaded);
      confirm('Restore this backup?',`Replace this device’s workspace with ${loaded.games.length} saved games and ${loaded.roster.length} players? Download a backup of your current workspace first if you need to keep it.`,()=>{
        // Verify the browser can persist the replacement before swapping the in-memory workspace.
        for(const g of loaded.games)if(g.running)E.pause(g);
        try{localStorage.setItem(KEY,JSON.stringify(loaded));}catch{toast('Restore failed: this browser could not save the backup. Current data is unchanged.',true);return;}
        state=loaded;saveBlocked=false;rawSaved=null;$('recovery-button').hidden=true;selectedId=null;save();render();toast('Backup restored. Game clocks are paused.');
      });
    }catch(error){toast(error.message,true);}finally{$('restore-file').value='';}
  });
  for(const [button,view] of [['live-tab','live-view'],['box-tab','box-view']])$(button).addEventListener('click',()=>{
    $('live-view').hidden=view!=='live-view';$('box-view').hidden=view!=='box-view';
    for(const tab of ['live-tab','box-tab']){$(tab).classList.toggle('active',tab===button);$(tab).setAttribute('aria-selected',tab===button);}if(view==='box-view')renderBox();
  });
  function manage(){
    $('manage-list').innerHTML=state.roster.map(p=>`<div class="manage-row"><span class="jersey">${p.number}</span><span>${html(p.name)}<small>${html(p.id)} · ${html(T.status(p))}${p.statusOverride?' (manual)':''}<br>Enrollment: ${p.enrollmentYear||'Unknown'}</small></span><button class="text-button" data-edit="${html(p.id)}">Edit</button></div>`).join('');
  }
  function refreshPregameRosters(){
    let changed=false;for(const g of state.games)if(T.refreshPregameRoster(g,state.roster))changed=true;return changed;
  }
  function applyRoster(roster){state.roster=roster;refreshPregameRosters();manage();}
  const rosterUpdateNote='Games that have not started use the updated roster. Games already started or finished keep their original players. Choose game players to add a new teammate to the squad.';
  function resetPlayerForm(){$('player-form').reset();$('editing-player').value='';$('save-player').textContent='Add player';$('cancel-edit').hidden=true;}
  $('roster-button').addEventListener('click',()=>{resetPlayerForm();manage();open('roster-dialog');});
  $('cancel-edit').addEventListener('click',resetPlayerForm);
  $('manage-list').addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(!b)return;const p=state.roster.find(p=>p.id===b.dataset.edit);$('editing-player').value=p.id;$('player-name').value=p.name;$('player-number').value=p.number;$('player-year').value=p.enrollmentYear||'';$('player-status').value=p.statusOverride||'';$('save-player').textContent='Save player';$('cancel-edit').hidden=false;$('player-name').focus();});
  $('player-form').addEventListener('submit',e=>{e.preventDefault();run(()=>{
    const name=$('player-name').value.trim(),number=Number($('player-number').value),id=$('editing-player').value;
    if(!name||!Number.isInteger(number)||number<0||number>99)throw Error('Enter a player name and a whole jersey number from 0 to 99.');
    const enrollmentYear=$('player-year').value===''?null:Number($('player-year').value),statusOverride=$('player-status').value||null;
    if(enrollmentYear!==null&&(!Number.isInteger(enrollmentYear)||enrollmentYear<1900||enrollmentYear>9995))throw Error('Enter an enrollment year from 1900 to 9995, or leave it blank.');
    let p=state.roster.find(p=>p.id===id);
    if(p){p.name=name;p.number=number;}else{p={id:`P_${E.uuid()}`,name,number};state.roster.push(p);}
    Object.assign(p,{enrollmentYear,statusOverride});
    applyRoster(state.roster);resetPlayerForm();toast('Roster saved. '+rosterUpdateNote);
  });});
  let lineupDraft=null;
  function chooseLineup(){
    const g=current();if(!g||g.finished)return;
    if(g.running)E.pause(g);
    save();render();
    const substitution=!!(g.started&&g.lineup);
    lineupDraft={gameId:g.id,substitution,players:g.roster.map(p=>({...p})),squad:new Set(g.squad||[]),five:new Set(substitution?g.lineup:g.starters||[])};
    $('lineup-title').textContent=substitution?'Substitute players':g.started?'Choose squad and current five':'Choose squad and starters';
    $('lineup-description').textContent=substitution?'Clock paused. Select exactly five from this game’s squad. Confirm or cancel, then resume the clock yourself.':'Select 5–15 designated players, then exactly five '+(g.started?'currently on court. Earlier minutes remain unavailable.':'starters. Guests count toward the 15-player limit.');
    $('guest-form').hidden=substitution;
    renderLineup();open('lineup-dialog');
  }
  function renderLineup(){
    const d=lineupDraft;if(!d)return;
    const players=d.players.filter(p=>!d.substitution||d.squad.has(p.id));
    $('squad-list').innerHTML=players.map(p=>`<div class="squad-row"><span class="jersey">${p.number}</span><span class="squad-name">${html(p.name)}<small>${p.guest?'Guest':html(T.status(p))}${current().lineup?.includes(p.id)?' · On court':''}</small></span>${d.substitution?`<label><input type="checkbox" data-court="${html(p.id)}" ${d.five.has(p.id)?'checked':''}> On court</label>`:`<label><input type="checkbox" data-squad="${html(p.id)}" ${d.squad.has(p.id)?'checked':''}> Squad</label><label><input type="checkbox" data-starter="${html(p.id)}" ${d.five.has(p.id)?'checked':''} ${!d.squad.has(p.id)?'disabled':''}> ${current().started?'On court':'Starter'}</label>`}</div>`).join('')||'<p class="dialog-description">The roster is empty. Close this window and add university players in Manage, or add guests below.</p>';
    $('lineup-count').textContent=`${d.squad.size}/15 designated · ${d.five.size}/5 ${d.substitution||current().started?'on court':'starters'}`;
    $('lineup-confirm').disabled=d.squad.size<5||d.squad.size>15||d.five.size!==5;
  }
  $('lineup-button').addEventListener('click',()=>run(chooseLineup));
  $('squad-list').addEventListener('change',e=>{
    const d=lineupDraft,b=e.target;if(!d)return;
    if(b.dataset.squad){const id=b.dataset.squad;if(b.checked&&d.squad.size>=15){toast('Choose at most 15 players, including guests.',true);renderLineup();return;}b.checked?d.squad.add(id):d.squad.delete(id);if(!b.checked)d.five.delete(id);}
    else {const id=b.dataset.starter||b.dataset.court;if(!id)return;b.checked?d.five.add(id):d.five.delete(id);}
    renderLineup();
  });
  $('guest-form').addEventListener('submit',e=>{e.preventDefault();run(()=>{
    const d=lineupDraft;if(!d||d.substitution)return;
    const name=$('guest-name').value.trim(),number=Number($('guest-number').value);
    if(!name||!Number.isInteger(number)||number<0||number>99)throw Error('Enter a guest name and jersey number from 0 to 99.');
    if(d.squad.size>=15)throw Error('The designated squad is full (15 players).');
    const p={id:`GUEST_${E.uuid()}`,name,number,guest:true};d.players.push(p);d.squad.add(p.id);$('guest-form').reset();renderLineup();
  });});
  $('lineup-confirm').addEventListener('click',()=>run(()=>{
    const d=lineupDraft,g=current();if(!d||g.id!==d.gameId)throw Error('Reopen player selection for this game.');
    if(d.substitution)T.substitute(g,[...d.five],Date.now());
    else {const old=g.roster;g.roster=d.players;try{T.configure(g,[...d.squad],[...d.five]);}catch(e){g.roster=old;throw e;}}
    $('lineup-dialog').close();lineupDraft=null;toast('Five players ready. Start or resume the clock when play begins.');
  }));
  $('roster-export-button').addEventListener('click',()=>run(()=>download(T.rosterCSV(state.roster),'university_roster.csv','text/csv;charset=utf-8')));
  $('roster-import-button').addEventListener('click',()=>$('roster-file').click());
  $('roster-file').addEventListener('change',async()=>{
    const file=$('roster-file').files[0];if(!file)return;
    try{const merged=T.parseRoster(await file.text(),state.roster);const added=merged.filter(p=>!state.roster.some(x=>x.id===p.id));const updated=merged.filter(p=>{const old=state.roster.find(x=>x.id===p.id);return old&&['name','number','enrollmentYear','statusOverride'].some(k=>(old[k]??null)!==(p[k]??null));});
      const fieldLabels={name:'Name',number:'Jersey',enrollmentYear:'Enrollment year',statusOverride:'Status override'};
      const display=(key,value)=>value??(key==='statusOverride'?'Automatic':'Unknown');
      const preview=[...added.map(p=>`Add ${p.id}: ${p.name} (#${p.number}), enrollment ${display('enrollmentYear',p.enrollmentYear)}, status ${display('statusOverride',p.statusOverride)}`),...updated.map(p=>{const old=state.roster.find(x=>x.id===p.id);return `Update ${p.id}:\n`+Object.keys(fieldLabels).filter(k=>(old[k]??null)!==(p[k]??null)).map(k=>`${fieldLabels[k]}: ${display(k,old[k])} → ${display(k,p[k])}`).join('\n');})].join('\n\n');
      confirm('Apply roster CSV?',`${added.length} additions and ${updated.length} updates. Players absent from this file will be retained. ${rosterUpdateNote}\n\n${preview||'No changes.'}`,()=>run(()=>{applyRoster(merged);toast('Roster imported. '+rosterUpdateNote);}));
    }catch(e){toast(e.message,true);}finally{$('roster-file').value='';}
  });
  $('participation-export-button').addEventListener('click',()=>exportResults('participation',g=>T.participationCSV(g,Date.now())));
  $('history-button').addEventListener('click',()=>{
    $('history-list').innerHTML=[...state.games].reverse().map(g=>`<div class="history-card"><div><strong>vs ${html(g.opponent)}</strong><small>${html(g.date)} · ${g.finished?'Final':g.started?'In progress':'Ready'}<br>Our team ${E.stats(g,'HOME').points} – ${E.stats(g,'AWAY').points} Opponent · ${g.gameEvents.length} events</small></div><button class="button subtle" data-game="${html(g.id)}">Open</button></div>`).join('')||'<div class="empty-state">Your games will appear here.</div>';open('history-dialog');
  });
  $('history-list').addEventListener('click',e=>{const b=e.target.closest('[data-game]');if(!b)return;run(()=>{if(current()?.running)E.pause(current());state.currentGameId=b.dataset.game;selectedId=null;side='HOME';$('history-dialog').close();});});

  // The hosted build injects only a public API address. PINs/tokens stay in memory.
  const remoteBase=globalThis.COURTSIDE_CONFIG?.apiBase||'';
  let remoteClient=null,uploadBusy=false,rosterSyncPromise=null;
  function syncSharedRoster(){
    if(!remoteBase)return Promise.resolve(false);
    if(rosterSyncPromise)return rosterSyncPromise;
    const status=$('roster-sync-status');status.hidden=false;
    if(saveBlocked){status.textContent='Roster check paused until browser saving is restored. The saved roster was kept.';return Promise.resolve(false);}
    status.textContent='Checking the latest team roster…';
    rosterSyncPromise=(async()=>{
      try{
        if(!remoteClient)remoteClient=new RemoteClient.Client(remoteBase);
        const result=await remoteClient.request('/api/roster','GET',undefined,15000);
        if(!Array.isArray(result.players)||result.players.some(p=>!p||typeof p.player_id!=='string'||!p.player_id))throw Error('Invalid shared roster response.');
        const official=T.parseRoster(RemoteClient.csv(T.ROSTER_COLUMNS,result.players),[]);
        T.applySharedRoster(state,official);save();manage();render();
        if($('lineup-dialog').open&&!lineupDraft?.substitution){$('lineup-dialog').close();chooseLineup();}
        status.textContent=`Team roster checked: ${official.length} players · ${new Date().toLocaleTimeString()}. ${current()?.started?'This game keeps its original players.':'New and unstarted games use the latest Admin roster.'}`;
        return true;
      }catch(error){status.textContent='Could not check the latest team roster. Using the saved roster. '+error.message;return false;}
    })().finally(()=>{rosterSyncPromise=null;renderRemote();});
    renderRemote();return rosterSyncPromise;
  }
  function renderRemote(){
    const g=current();$('upload-button').hidden=!remoteBase;$('server-roster-button').hidden=!remoteBase;
    $('server-roster-button').disabled=!!rosterSyncPromise;
    $('hosted-nav').hidden=!remoteBase;
    if(remoteBase)document.querySelector('.brand').href='index.html';
    $('upload-complete').disabled=!!g?.remote?.payload;
    if(g?.remote?.payload)$('upload-complete').checked=g.remote.payload.game_details?.stats_complete===true;
    $('upload-button').disabled=!g?.finished||uploadBusy||g?.remote?.state==='uploaded';
    $('upload-button').textContent=uploadBusy?'Uploading…':g?.remote?.state==='uploaded'?'Uploaded':g?.remote?.state==='pending'?'Retry upload':'Upload finished game';
    if(g?.remote){$('finish-button').disabled=true;$('finish-button').textContent=g.remote.state==='uploaded'?'Uploaded · admin edits only':'Upload pending · game locked';}
  }
  $('upload-button').addEventListener('click',()=>{if(!current()?.finished||uploadBusy)return;$('upload-pin').value='';$('upload-complete').checked=current().remote?.payload?.game_details?.stats_complete===true;$('upload-complete').disabled=!!current().remote?.payload;$('upload-status').textContent='Enter the shared scorekeeper PIN. Your game stays saved on this device.';open('upload-dialog');});
  $('upload-form').addEventListener('submit',async event=>{
    event.preventDefault();if(uploadBusy)return;const g=current();if(!g?.finished)return;
    uploadBusy=true;$('upload-submit').disabled=true;renderRemote();let submissionStarted=false,newlyPrepared=false,priorUncertainty=false;
    try{
      if(saveBlocked)throw Error('Restore saving before uploading. Download a backup to preserve this game.');
      if(!remoteClient)remoteClient=new RemoteClient.Client(remoteBase);
      const pin=$('upload-pin').value;$('upload-pin').value='';
      $('upload-status').textContent='Connecting… A sleeping backend can take about a minute to start.';
      await remoteClient.login(pin,'scorekeeper');
      newlyPrepared=!g.remote;
      const payload=RemoteClient.prepare(g,E,T,{statsComplete:$('upload-complete').checked});
      priorUncertainty=RemoteClient.begin(g);
      localStorage.setItem(KEY,JSON.stringify(state));
      submissionStarted=true;
      const result=await remoteClient.upload(payload);
      if(result.game_id!==g.id)throw Error('The server returned an unexpected game. Retry to confirm receipt.');
      g.remote.state='uploaded';g.remote.version=result.version;g.remote.publication=result.publication;
      save();$('upload-status').textContent=result.publication==='published'?'Game uploaded and statistics published.':'Game saved in the database. Public statistics are awaiting publication; your admin can retry.';
      toast('Game uploaded. Only your admin can change the official record.');
    }catch(error){if(submissionStarted)RemoteClient.failed(g,error,priorUncertainty);else if(newlyPrepared)delete g.remote;save();$('upload-status').textContent=error.message+' Your local game is retained.';toast(error.message,true);}
    finally{if(remoteClient)remoteClient.token=null;uploadBusy=false;$('upload-submit').disabled=false;render();}
  });
  $('server-roster-button').addEventListener('click',async()=>{if(await syncSharedRoster())toast('Latest Admin roster downloaded. '+rosterUpdateNote);});

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)renderClock();});
  setInterval(renderClock,200);
  if(!saveBlocked&&refreshPregameRosters())save();
  render();
  if(remoteBase)syncSharedRoster();
  if(!current()&&!saveBlocked)setup();
})();
