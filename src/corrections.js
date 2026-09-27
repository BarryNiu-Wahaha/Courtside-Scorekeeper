(function(root){
  'use strict';
  const clone=x=>JSON.parse(JSON.stringify(x));
  function validateLinks(events,links){
    if(!Array.isArray(links))throw Error('Invalid related actions.');
    const used=new Set();
    for(const l of links){const a=events.find(e=>e.event_id===l.assistEventId),s=events.find(e=>e.event_id===l.shotEventId);
      if(!a||!s||a.is_voided||s.is_voided||a.event_type!=='ASSIST'||!['2PT_MADE','3PT_MADE'].includes(s.event_type)||a.team_side!==s.team_side||(a.team_side==='HOME'&&a.player_id===s.player_id)||used.has(a.event_id)||used.has(s.event_id))throw Error('Resolve linked assists: keep a valid made basket, or remove/unlink the assist.');
      used.add(a.event_id);used.add(s.event_id);
    }
  }
  function prepare(game,changes,links,types){
    if(!Array.isArray(changes))throw Error('Invalid corrections.');
    const events=clone(game.gameEvents),seen=new Set(),audit=[];
    for(const c of changes){const e=events.find(e=>e.event_id===c.eventId);if(!e||seen.has(c.eventId)||!c.patch||Object.keys(c.patch).some(k=>!['event_type','team_side','player_id','is_voided'].includes(k)))throw Error('Invalid correction fields.');seen.add(c.eventId);const before=clone(e);Object.assign(e,c.patch);
      if(!Object.hasOwn(types,e.event_type)||!['HOME','AWAY'].includes(e.team_side)||typeof e.is_voided!=='boolean')throw Error('Invalid statistical action.');
      e.points_value=types[e.event_type];
      if(e.team_side==='AWAY'){e.player_id='';e.player_name='';e.jersey_number='';}
      else {const p=game.roster.find(p=>p.id===e.player_id&&(!game.squad||game.squad.includes(p.id)));if(!p)throw Error('Choose a player from this game squad.');e.player_name=p.name;e.jersey_number=p.number;}
      audit.push({eventId:e.event_id,before,after:clone(e)});
    }
    validateLinks(events,links);return {events,links:clone(links),changes:audit};
  }
  const api={prepare,validateLinks};if(typeof module==='object'&&module.exports)module.exports=api;else root.EventCorrections=api;
})(globalThis);
