(function (root) {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function validateLinks(events, links) {
    if (!Array.isArray(links)) throw Error('Invalid related actions.');
    const linkedEventIds = new Set();
    for (const link of links) {
      const assist = events.find((event) => event.event_id === link.assistEventId),
        shot = events.find((event) => event.event_id === link.shotEventId);
      if (
        !assist ||
        !shot ||
        assist.is_voided ||
        shot.is_voided ||
        assist.event_type !== 'ASSIST' ||
        !['2PT_MADE', '3PT_MADE'].includes(shot.event_type) ||
        assist.team_side !== shot.team_side ||
        (assist.team_side === 'HOME' && assist.player_id === shot.player_id) ||
        linkedEventIds.has(assist.event_id) ||
        linkedEventIds.has(shot.event_id)
      )
        throw Error(
          'Resolve linked assists: keep a valid made basket, or remove/unlink the assist.'
        );
      linkedEventIds.add(assist.event_id);
      linkedEventIds.add(shot.event_id);
    }
  }
  function prepare(game, changes, links, types) {
    if (!Array.isArray(changes)) throw Error('Invalid corrections.');
    // Validate a copy first so a rejected correction cannot partially change the game.
    const events = clone(game.gameEvents),
      changedEventIds = new Set(),
      audit = [];
    for (const change of changes) {
      const event = events.find((event) => event.event_id === change.eventId);
      if (
        !event ||
        changedEventIds.has(change.eventId) ||
        !change.patch ||
        Object.keys(change.patch).some(
          (field) => !['event_type', 'team_side', 'player_id', 'is_voided'].includes(field)
        )
      )
        throw Error('Invalid correction fields.');
      changedEventIds.add(change.eventId);
      const before = clone(event);
      Object.assign(event, change.patch);
      if (
        !Object.hasOwn(types, event.event_type) ||
        !['HOME', 'AWAY'].includes(event.team_side) ||
        typeof event.is_voided !== 'boolean'
      )
        throw Error('Invalid statistical action.');
      event.points_value = types[event.event_type];
      if (event.team_side === 'AWAY') {
        event.player_id = '';
        event.player_name = '';
        event.jersey_number = '';
      } else {
        const player = game.roster.find(
          (player) =>
            player.id === event.player_id && (!game.squad || game.squad.includes(player.id))
        );
        if (!player) throw Error('Choose a player from this game squad.');
        event.player_name = player.name;
        event.jersey_number = player.number;
      }
      audit.push({ eventId: event.event_id, before, after: clone(event) });
    }
    validateLinks(events, links);
    return { events, links: clone(links), changes: audit };
  }
  const api = { prepare, validateLinks };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EventCorrections = api;
})(globalThis);
