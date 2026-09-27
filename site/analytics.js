(function (root) {
  'use strict';
  const keys = [
    'points',
    'fgm',
    'fga',
    'threeMade',
    'threeAttempts',
    'ftm',
    'fta',
    'offensive',
    'defensive',
    'rebounds',
    'assists',
    'steals',
    'blocks',
    'turnovers',
    'fouls'
  ];
  const empty = () => Object.fromEntries(keys.map((k) => [k, 0]));
  const number = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const ratio = (numerator, denominator, scale = 1) =>
    denominator > 0 && Number.isFinite(numerator) && Number.isFinite(denominator)
      ? (numerator / denominator) * scale
      : null;
  const add = (to, from) => {
    for (const k of keys) to[k] += number(from?.[k]);
    return to;
  };
  function season(date) {
    const [year, month] = date.split('-').map(Number);
    if (month >= 3 && month <= 7) return `spring:${year}`;
    // January and February belong to the previous fall season.
    const fallYear = month < 3 ? year - 1 : year;
    return `fall:${fallYear}`;
  }
  function currentSeason(now = new Date()) {
    return season(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  }
  function periodLabel(period) {
    if (period === 'career') return 'Entire career';
    const [kind, year] = period.split(':');
    return kind === 'year' ? year : `${kind === 'spring' ? 'Spring' : 'Fall'} ${year}`;
  }
  function filterGames(games, { period = 'career', category = 'all' } = {}) {
    return games.filter((game) => {
      if (game.deleted) return false;
      if (category !== 'all' && game.category !== category) return false;
      if (period === 'career') return true;
      if (period.startsWith('year:')) {
        return game.game_date.slice(0, 4) === period.slice(5);
      }
      return season(game.game_date) === period;
    });
  }
  function shooting(stats) {
    return {
      fg: ratio(stats.fgm, stats.fga, 100),
      three: ratio(stats.threeMade, stats.threeAttempts, 100),
      ft: ratio(stats.ftm, stats.fta, 100),
      efg: ratio(stats.fgm + 0.5 * stats.threeMade, stats.fga, 100),
      ts: ratio(stats.points, 2 * (stats.fga + 0.44 * stats.fta), 100)
    };
  }
  function possession(stats) {
    return (
      number(stats.fga) -
      number(stats.offensive) +
      number(stats.turnovers) +
      0.44 * number(stats.fta)
    );
  }
  function gameMetrics(game) {
    const metrics = {
      possessions: null,
      pace: null,
      offensiveRating: null,
      defensiveRating: null,
      netRating: null
    };
    if (game.stats_complete !== true || !game.home_stats || !game.away_stats) return metrics;
    const homePossessions = possession(game.home_stats),
      awayPossessions = possession(game.away_stats),
      gamePossessions = (homePossessions + awayPossessions) / 2;
    if (homePossessions <= 0 || awayPossessions <= 0 || !Number.isFinite(gamePossessions))
      return metrics;
    metrics.possessions = gamePossessions;
    metrics.offensiveRating = ratio(game.home_points, gamePossessions, 100);
    metrics.defensiveRating = ratio(game.away_points, gamePossessions, 100);
    metrics.netRating = metrics.offensiveRating - metrics.defensiveRating;
    metrics.pace = ratio(gamePossessions, number(game.duration_ms) / 60000, 40);
    return metrics;
  }
  function summarize(snapshot, games) {
    const identities = new Map((snapshot.roster || []).map((player) => [player.player_id, player]));
    const players = new Map();
    let wins = 0,
      losses = 0,
      ties = 0,
      points = 0,
      allowed = 0;
    const home = empty(),
      away = empty();
    let awayKnown = games.length > 0;
    let possessions = 0,
      eligiblePointsScored = 0,
      eligiblePointsAllowed = 0,
      pacePossessions = 0,
      durationMinutes = 0,
      eligible = 0,
      paceEligible = 0;
    for (const game of games) {
      points += number(game.home_points);
      allowed += number(game.away_points);
      if (game.home_points > game.away_points) wins++;
      else if (game.home_points < game.away_points) losses++;
      else ties++;
      add(
        home,
        game.home_stats ||
          (game.players || []).reduce((stats, player) => add(stats, player.stats), empty())
      );
      if (game.away_stats) add(away, game.away_stats);
      else awayKnown = false;
      const metrics = gameMetrics(game);
      if (metrics.possessions !== null) {
        eligible++;
        possessions += metrics.possessions;
        eligiblePointsScored += game.home_points;
        eligiblePointsAllowed += game.away_points;
        if (metrics.pace !== null) {
          paceEligible++;
          pacePossessions += metrics.possessions;
          durationMinutes += game.duration_ms / 60000;
        }
      }
      for (const player of game.players || []) {
        if (!players.has(player.player_id))
          players.set(player.player_id, {
            ...player,
            ...identities.get(player.player_id),
            appearances: 0,
            played_ms: null,
            partial: false,
            stats: empty(),
            games: []
          });
        const total = players.get(player.player_id);
        if (player.player_id === 'P_GUEST') {
          total.player_name = 'Guest Player';
          total.jersey_number = 0;
        }
        total.appearances += player.played_count > 0 ? 1 : 0;
        if (player.played_count > 0 && player.played_ms != null)
          total.played_ms = (total.played_ms ?? 0) + number(player.played_ms);
        if (player.played_count > 0)
          total.partial ||= game.coverage !== 'complete' || player.played_ms == null;
        add(total.stats, player.stats);
        total.games.push({ game, player });
      }
    }
    // Team scores are authoritative, including older snapshots with partial player coverage.
    home.points = points;
    away.points = allowed;
    for (const player of players.values()) {
      player.averages = Object.fromEntries(
        keys.map((k) => [k, ratio(player.stats[k], player.appearances)])
      );
      player.shooting = shooting(player.stats);
    }
    const offensiveRating = ratio(eligiblePointsScored, possessions, 100),
      defensiveRating = ratio(eligiblePointsAllowed, possessions, 100);
    return {
      games: games.length,
      wins,
      losses,
      ties,
      points,
      allowed,
      ppg: ratio(points, games.length),
      oppg: ratio(allowed, games.length),
      home,
      away: awayKnown ? away : null,
      shooting: shooting(home),
      opponentShooting: awayKnown ? shooting(away) : null,
      players: [...players.values()],
      advanced: {
        eligible,
        paceEligible,
        possessions: eligible ? possessions : null,
        pace: ratio(pacePossessions, durationMinutes, 40),
        offensiveRating,
        defensiveRating,
        netRating: offensiveRating === null ? null : offensiveRating - defensiveRating
      },
      offensiveReboundPct: awayKnown
        ? ratio(home.offensive, home.offensive + away.defensive, 100)
        : null,
      defensiveReboundPct: awayKnown
        ? ratio(home.defensive, home.defensive + away.offensive, 100)
        : null
    };
  }
  function playerGroups(snapshot, selectedPlayers) {
    const identities = new Map();
    for (const game of snapshot.games || []) {
      if (game.deleted) continue;
      for (const player of game.players || []) {
        identities.set(player.player_id, player);
      }
    }
    for (const player of snapshot.roster || [])
      identities.set(player.player_id, { ...identities.get(player.player_id), ...player });
    const selected = new Map(selectedPlayers.map((player) => [player.player_id, player]));
    for (const player of selectedPlayers)
      if (!identities.has(player.player_id)) identities.set(player.player_id, player);
    const appeared = selectedPlayers.filter((player) => player.appearances > 0),
      other = [];
    for (const [id, identity] of identities) {
      if (selected.get(id)?.appearances > 0) continue;
      other.push(
        selected.get(id) || {
          ...identity,
          appearances: 0,
          played_ms: null,
          partial: false,
          stats: empty(),
          averages: Object.fromEntries(keys.map((k) => [k, null])),
          shooting: shooting(empty()),
          games: []
        }
      );
    }
    return { appeared, other };
  }
  function leaders(players, key, mode) {
    const eligible = players.filter(
      (player) => player.player_id !== 'P_GUEST' && player.appearances > 0
    );
    const value = (player) =>
      mode === 'average' ? player.stats[key] / player.appearances : player.stats[key];
    const best = Math.max(0, ...eligible.map(value));
    return {
      value: best > 0 ? best : null,
      players:
        best > 0
          ? eligible
              .filter((player) => Math.abs(value(player) - best) < 1e-9)
              .sort((first, second) => first.player_id.localeCompare(second.player_id))
          : []
    };
  }
  const api = {
    keys,
    empty,
    ratio,
    season,
    currentSeason,
    periodLabel,
    filterGames,
    shooting,
    gameMetrics,
    summarize,
    playerGroups,
    leaders
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.CourtSideAnalytics = api;
})(globalThis);
