(function (root) {
  'use strict';
  const Team =
    typeof module !== 'undefined' && module.exports ? require('./team.js') : root.TeamEngine;
  const Corrections =
    typeof module !== 'undefined' && module.exports
      ? require('./corrections.js')
      : root.EventCorrections;
  function assertMutable(game) {
    Team.assertMutable(game);
  }
  function finalize(game, now = Date.now()) {
    if (!game.finished || game.running) throw Error('End the game before exporting final results.');
    if (!game.finalizedAt) game.finalizedAt = new Date(now).toISOString();
  }
  function correctEvents(game, changes, links = game.eventLinks || [], now = Date.now()) {
    assertMutable(game);
    const result = Corrections.prepare(game, changes, links, TYPES),
      id = uuid();
    const audit = {
      id,
      at: new Date(now).toISOString(),
      changes: result.changes,
      linksBefore: game.eventLinks || [],
      linksAfter: result.links
    };
    game.gameEvents = result.events;
    game.eventLinks = result.links;
    (game.correctionAudit ??= []).push(audit);
    for (const e of game.gameEvents)
      if (!e.is_voided && e.team_side === 'HOME' && game.participation?.[e.player_id])
        game.participation[e.player_id].played = true;
    return id;
  }
  function restoreDeletion(game, id, now = Date.now()) {
    assertMutable(game);
    const tx = game.correctionAudit?.find((t) => t.id === id);
    if (!tx || tx.restored) throw Error('This deletion cannot be restored.');
    const changes = tx.changes.filter((c) => !c.before.is_voided && c.after.is_voided);
    if (
      !changes.length ||
      changes.some(
        (c) =>
          JSON.stringify(game.gameEvents.find((e) => e.event_id === c.eventId)) !==
          JSON.stringify(c.after)
      )
    )
      throw Error('An action changed after deletion; restore would overwrite a correction.');
    const ids = new Set(changes.map((c) => c.eventId));
    const links = [
      ...(game.eventLinks || []),
      ...tx.linksBefore.filter(
        (l) =>
          (ids.has(l.assistEventId) || ids.has(l.shotEventId)) &&
          !(game.eventLinks || []).some(
            (x) => x.assistEventId === l.assistEventId && x.shotEventId === l.shotEventId
          )
      )
    ];
    correctEvents(
      game,
      changes.map((c) => ({ eventId: c.eventId, patch: { is_voided: false } })),
      links,
      now
    );
    tx.restored = true;
  }
  const TYPES = Object.freeze({
    '2PT_MADE': 2,
    '2PT_MISSED': 0,
    '3PT_MADE': 3,
    '3PT_MISSED': 0,
    FT_MADE: 1,
    FT_MISSED: 0,
    OFF_REBOUND: 0,
    DEF_REBOUND: 0,
    ASSIST: 0,
    STEAL: 0,
    BLOCK: 0,
    TURNOVER: 0,
    FOUL: 0
  });
  const COLUMNS = [
    'game_id',
    'event_id',
    'game_date',
    'opponent',
    'player_id',
    'player_name',
    'jersey_number',
    'quarter',
    'game_clock',
    'event_type',
    'points_value',
    'recorded_at',
    'team_side',
    'is_voided'
  ];
  function uuid() {
    if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  function createGame(config, roster) {
    const { date, opponent, minutes, overtimeMinutes } = config;
    const category = config.category ?? null;
    if (category !== null && !['official', 'friendly'].includes(category))
      throw Error('Choose an official or friendly game category.');
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw Error('Choose a valid game date.');
    if (typeof opponent !== 'string' || !opponent.trim()) throw Error('Enter an opponent name.');
    if (![minutes, overtimeMinutes].every((n) => Number.isInteger(n) && n >= 1 && n <= 99))
      throw Error('Period lengths must be whole minutes from 1 to 99.');
    return {
      id: `G${date.replaceAll('-', '')}_${uuid()}`,
      date,
      opponent: opponent.trim(),
      minutes,
      overtimeMinutes,
      category,
      quarter: '1',
      period: 1,
      started: false,
      finished: false,
      running: false,
      remainingMs: minutes * 60000,
      deadline: null,
      clockSpeed: 1,
      roster: roster.map((p) => ({ ...p })),
      gameEvents: []
    };
  }
  function remaining(game, now = Date.now()) {
    return Math.max(
      0,
      game.running ? Math.round((game.deadline - now) * (game.clockSpeed || 1)) : game.remainingMs
    );
  }
  function setSpeed(game, speed, now = Date.now()) {
    assertMutable(game);
    if (![1, 1.5, 2, 4].includes(speed)) throw Error('Choose 1x, 1.5x, 2x or 4x speed.');
    const running = game.running;
    if (running) pause(game, now);
    game.clockSpeed = speed;
    if (running && game.remainingMs > 0) start(game, now);
  }
  function clock(game, now = Date.now()) {
    const seconds = Math.ceil(remaining(game, now) / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function start(game, now = Date.now()) {
    assertMutable(game);
    if (game.finished) throw Error('Reopen the game before starting the clock.');
    if (game.running) return;
    if (game.remainingMs <= 0) throw Error('Advance the period or adjust the clock first.');
    Team.start(game, now);
    game.started = true;
    game.running = true;
    game.deadline = now + game.remainingMs / (game.clockSpeed || 1);
  }
  function pause(game, now = Date.now()) {
    assertMutable(game);
    Team.settle(game, now);
    game.remainingMs = remaining(game, now);
    game.running = false;
    game.deadline = null;
    if (game.squad) game.timingAnchor = null;
  }
  function setClock(game, value) {
    assertMutable(game);
    if (game.running) throw Error('Pause the clock before adjusting it.');
    if (!/^\d{1,2}:[0-5]\d$/.test(value)) throw Error('Enter a time such as 06:31 (00:00–99:59).');
    const [m, s] = value.split(':').map(Number);
    game.remainingMs = (m * 60 + s) * 1000;
  }
  function nextPeriod(game) {
    assertMutable(game);
    if (game.running) throw Error('Pause the clock before changing periods.');
    if (game.finished) throw Error('Reopen the game before changing periods.');
    game.period++;
    game.quarter = game.period <= 4 ? String(game.period) : `OT${game.period - 4}`;
    game.remainingMs = (game.period <= 4 ? game.minutes : game.overtimeMinutes) * 60000;
    game.deadline = null;
  }
  function recordEvent(game, type, player, side = 'HOME', now = Date.now()) {
    assertMutable(game);
    if (!game.started || game.finished)
      throw Error('Start or reopen the game before recording stats.');
    if (!Object.hasOwn(TYPES, type) || !['HOME', 'AWAY'].includes(side))
      throw Error('Invalid stat action.');
    if (side === 'HOME' && (!player || !game.roster.some((p) => p.id === player.id)))
      throw Error('Select a player first.');
    if (side === 'HOME' && game.lineup && !game.lineup.includes(player.id))
      throw Error('Select a player currently on court.');
    const p = side === 'HOME' ? game.roster.find((p) => p.id === player.id) : null;
    const event = {
      game_id: game.id,
      event_id: (game.gameEvents.at(-1)?.event_id || 0) + 1,
      game_date: game.date,
      opponent: game.opponent,
      player_id: p?.id ?? '',
      player_name: p?.name ?? '',
      jersey_number: p?.number ?? '',
      quarter: game.quarter,
      game_clock: clock(game, now),
      event_type: type,
      points_value: TYPES[type],
      recorded_at: new Date(now).toISOString(),
      team_side: side,
      is_voided: false,
      lineupSnapshot: Team.snapshotLineup(game)
    };
    game.gameEvents.push(event);
    if (p && game.participation?.[p.id]) game.participation[p.id].played = true;
    return event;
  }
  function undo(game) {
    assertMutable(game);
    const e = game.gameEvents.findLast((e) => !e.is_voided);
    if (!e) return null;
    const ids = new Set([
      e.event_id,
      ...(game.eventLinks || [])
        .filter((l) => l.shotEventId === e.event_id)
        .map((l) => l.assistEventId)
    ]);
    correctEvents(
      game,
      [...ids].map((eventId) => ({ eventId, patch: { is_voided: true } })),
      (game.eventLinks || []).filter((l) => !ids.has(l.assistEventId) && !ids.has(l.shotEventId))
    );
    return game.gameEvents.find((x) => x.event_id === e.event_id);
  }
  function stats(game, side, playerId) {
    const s = {
      points: 0,
      fgm: 0,
      fga: 0,
      twoMade: 0,
      twoAttempts: 0,
      threeMade: 0,
      threeAttempts: 0,
      ftm: 0,
      fta: 0,
      offensive: 0,
      defensive: 0,
      rebounds: 0,
      assists: 0,
      steals: 0,
      blocks: 0,
      turnovers: 0,
      fouls: 0
    };
    const mapping = {
      OFF_REBOUND: 'offensive',
      DEF_REBOUND: 'defensive',
      ASSIST: 'assists',
      STEAL: 'steals',
      BLOCK: 'blocks',
      TURNOVER: 'turnovers',
      FOUL: 'fouls'
    };
    for (const e of game.gameEvents) {
      if (
        e.is_voided ||
        e.team_side !== side ||
        (playerId !== undefined && e.player_id !== playerId)
      )
        continue;
      s.points += e.points_value;
      if (e.event_type.startsWith('2PT_')) {
        s.twoAttempts++;
        s.fga++;
        if (e.event_type === '2PT_MADE') {
          s.twoMade++;
          s.fgm++;
        }
      } else if (e.event_type.startsWith('3PT_')) {
        s.threeAttempts++;
        s.fga++;
        if (e.event_type === '3PT_MADE') {
          s.threeMade++;
          s.fgm++;
        }
      } else if (e.event_type.startsWith('FT_')) {
        s.fta++;
        if (e.event_type === 'FT_MADE') s.ftm++;
      } else if (mapping[e.event_type]) s[mapping[e.event_type]]++;
    }
    s.rebounds = s.offensive + s.defensive;
    return s;
  }
  function csv(game) {
    const escape = (v) =>
      /[",\r\n]/.test(String(v)) ? '"' + String(v).replaceAll('"', '""') + '"' : String(v);
    return (
      '\uFEFF' +
      COLUMNS.join(',') +
      '\r\n' +
      game.gameEvents
        .map((original) => {
          const e = Team.exportEvent(game, original);
          return COLUMNS.map((c) => escape(e[c])).join(',') + '\r\n';
        })
        .join('')
    );
  }
  function validateState(state) {
    const check = (ok) => {
      if (!ok)
        throw Error(
          'This is not a valid CourtSide backup. Your current data has not been replaced.'
        );
    };
    const str = (x) => typeof x === 'string' && x.length > 0;
    const roster = (rs) => {
      check(Array.isArray(rs));
      const ids = new Set();
      for (const p of rs) {
        check(
          p &&
            str(p.id) &&
            str(p.name) &&
            Number.isInteger(p.number) &&
            p.number >= 0 &&
            p.number <= 99 &&
            !ids.has(p.id)
        );
        Team.validatePlayer(p);
        ids.add(p.id);
      }
    };
    check(state && state.version === 2 && Array.isArray(state.games));
    roster(state.roster);
    if (state.localRosterArchive !== undefined) roster(state.localRosterArchive);
    const ids = new Set();
    for (const g of state.games) {
      check(g && str(g.id) && !ids.has(g.id));
      ids.add(g.id);
      roster(g.roster);
      Team.validateGame(g);
      check(
        g.finalizedAt === undefined ||
          (g.finished &&
            !g.running &&
            typeof g.finalizedAt === 'string' &&
            Number.isFinite(Date.parse(g.finalizedAt)))
      );
      if (g.eventLinks !== undefined) Corrections.validateLinks(g.gameEvents, g.eventLinks);
      if (g.correctionAudit !== undefined)
        check(
          Array.isArray(g.correctionAudit) &&
            g.correctionAudit.every(
              (t) =>
                t &&
                typeof t.id === 'string' &&
                Array.isArray(t.changes) &&
                Array.isArray(t.linksBefore) &&
                Array.isArray(t.linksAfter) &&
                t.changes.every(
                  (c) =>
                    g.gameEvents.some((e) => e.event_id === c.eventId) &&
                    c.before?.event_id === c.eventId &&
                    c.after?.event_id === c.eventId
                )
            )
        );
      check(g.clockSpeed === undefined || [1, 1.5, 2, 4].includes(g.clockSpeed));
      check(
        typeof g.date === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(g.date) &&
          Number.isFinite(Date.parse(g.date)) &&
          new Date(g.date).toISOString().slice(0, 10) === g.date &&
          str(g.opponent)
      );
      check(g.category == null || ['official', 'friendly'].includes(g.category));
      check([g.minutes, g.overtimeMinutes].every((n) => Number.isInteger(n) && n >= 1 && n <= 99));
      check(
        Number.isInteger(g.period) &&
          g.period >= 1 &&
          g.quarter === (g.period <= 4 ? String(g.period) : `OT${g.period - 4}`)
      );
      check(
        ['started', 'finished', 'running'].every((k) => typeof g[k] === 'boolean') &&
          !(g.finished && g.running) &&
          (!g.running || g.started)
      );
      check(
        Number.isFinite(g.remainingMs) &&
          g.remainingMs >= 0 &&
          g.remainingMs <= 5999000 &&
          (g.running ? Number.isFinite(g.deadline) : g.deadline === null)
      );
      check(Array.isArray(g.gameEvents));
      let previous = 0;
      for (const e of g.gameEvents) {
        if (e.lineupSnapshot !== undefined) Team.validateSnapshot(g, e.lineupSnapshot);
        check(
          e &&
            COLUMNS.every((c) => Object.hasOwn(e, c)) &&
            Number.isInteger(e.event_id) &&
            e.event_id > previous
        );
        previous = e.event_id;
        check(
          e.game_id === g.id &&
            e.game_date === g.date &&
            e.opponent === g.opponent &&
            Object.hasOwn(TYPES, e.event_type) &&
            e.points_value === TYPES[e.event_type] &&
            typeof e.is_voided === 'boolean'
        );
        check(
          ['HOME', 'AWAY'].includes(e.team_side) &&
            typeof e.quarter === 'string' &&
            /^(?:[1-4]|OT[1-9]\d*)$/.test(e.quarter) &&
            typeof e.game_clock === 'string' &&
            /^\d{2}:[0-5]\d$/.test(e.game_clock)
        );
        check(typeof e.recorded_at === 'string' && Number.isFinite(Date.parse(e.recorded_at)));
        if (e.team_side === 'HOME')
          check(
            g.roster.some((p) => p.id === e.player_id) &&
              str(e.player_name) &&
              Number.isInteger(e.jersey_number) &&
              e.jersey_number >= 0 &&
              e.jersey_number <= 99
          );
        else check(e.player_id === '' && e.player_name === '' && e.jersey_number === '');
      }
    }
    check(state.currentGameId === null || ids.has(state.currentGameId));
    return true;
  }
  function backup(state, now = Date.now()) {
    const snapshot = JSON.parse(JSON.stringify(state));
    for (const game of snapshot.games) if (game.running) pause(game, now);
    return snapshot;
  }
  const api = {
    TYPES,
    COLUMNS,
    uuid,
    createGame,
    remaining,
    clock,
    start,
    pause,
    setClock,
    setSpeed,
    nextPeriod,
    recordEvent,
    undo,
    stats,
    csv,
    validateState,
    backup,
    assertMutable,
    finalize,
    correctEvents,
    restoreDeletion
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScoreEngine = api;
})(globalThis);
