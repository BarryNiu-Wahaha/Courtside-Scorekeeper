(function (root) {
  'use strict';
  const Engine =
    typeof module === 'object' && module.exports ? require('./engine.js') : root.ScoreEngine;
  const ratio = (numerator, denominator, scale = 1) =>
    denominator ? (scale * numerator) / denominator : null;
  function player(game, id) {
    const stats = Engine.stats(game, 'HOME', id);
    let plusMinus = 0,
      plusMinusStatus = 'complete';
    for (const event of game.gameEvents) {
      if (event.is_voided || !event.points_value) continue;
      const lineup = event.lineupSnapshot;
      if (!lineup || lineup.status !== 'complete') {
        // Once any scoring lineup is unknown, later partial coverage cannot repair it.
        if (lineup?.status === 'partial' && plusMinusStatus !== 'unknown') {
          plusMinusStatus = 'partial';
        } else {
          plusMinusStatus = 'unknown';
        }
        continue;
      }
      if (lineup.playerIds.includes(id))
        plusMinus += (event.team_side === 'HOME' ? 1 : -1) * event.points_value;
    }
    return {
      fgPct: ratio(stats.fgm, stats.fga, 100),
      threePct: ratio(stats.threeMade, stats.threeAttempts, 100),
      ftPct: ratio(stats.ftm, stats.fta, 100),
      efgPct: ratio(stats.fgm + 0.5 * stats.threeMade, stats.fga, 100),
      tsPct: ratio(stats.points, 2 * (stats.fga + 0.44 * stats.fta), 100),
      astTo: ratio(stats.assists, stats.turnovers),
      plusMinus: plusMinusStatus === 'complete' ? plusMinus : null,
      plusMinusStatus
    };
  }
  function csv(game) {
    const columns = [
      'player_id',
      'player_name',
      'jersey_number',
      'points',
      'fgm',
      'fga',
      'threeMade',
      'threeAttempts',
      'ftm',
      'fta',
      'rebounds',
      'assists',
      'steals',
      'blocks',
      'turnovers',
      'fouls',
      'fgPct',
      'threePct',
      'ftPct',
      'efgPct',
      'tsPct',
      'astTo',
      'plusMinus',
      'plus_minus_status'
    ];
    const escape = (value) =>
      /[",\r\n]/.test(String(value ?? ''))
        ? '"' + String(value).replaceAll('"', '""') + '"'
        : String(value ?? '');
    const rows = game.roster
      .filter((rosterPlayer) => !game.squad || game.squad.includes(rosterPlayer.id))
      .map((rosterPlayer) => {
        const analytics = player(game, rosterPlayer.id);
        return {
          player_id: rosterPlayer.id,
          player_name: rosterPlayer.name,
          jersey_number: rosterPlayer.number,
          ...Engine.stats(game, 'HOME', rosterPlayer.id),
          ...analytics,
          plus_minus_status: analytics.plusMinusStatus
        };
      });
    return (
      '\uFEFF' +
      columns.join(',') +
      '\r\n' +
      rows.map((row) => columns.map((column) => escape(row[column])).join(',') + '\r\n').join('')
    );
  }
  const api = { player, csv };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerAnalytics = api;
})(globalThis);
