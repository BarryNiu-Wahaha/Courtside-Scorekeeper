(() => {
  'use strict';
  const Analytics = CourtSideAnalytics,
    getElement = (id) => document.getElementById(id);
  const createElement = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
  const formatNumber = (v, d = 1) =>
    v == null || !Number.isFinite(v)
      ? '—'
      : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
  const formatPercent = (v) => (v == null ? '—' : formatNumber(v) + '%');
  const category = (g) =>
    g.category === 'official'
      ? 'Official'
      : g.category === 'friendly'
        ? 'Friendly'
        : 'Unclassified';
  const descending = (a, b) =>
    b.game_date.localeCompare(a.game_date) || b.game_id.localeCompare(a.game_id);
  const names = {
    points: 'Points',
    rebounds: 'Rebounds',
    offensive: 'Off. rebounds',
    defensive: 'Def. rebounds',
    assists: 'Assists',
    steals: 'Steals',
    blocks: 'Blocks',
    turnovers: 'Turnovers',
    fouls: 'Fouls'
  };
  let snapshot = null,
    games = [],
    summary = null,
    leaderMode = 'total',
    sortKey = 'points',
    sortDirection = -1,
    playerId = null,
    playerGroup = 'appeared';
  const phone = matchMedia('(max-width: 700px)'),
    reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let pointerAction = false;
  document.addEventListener(
    'pointerdown',
    () => {
      pointerAction = true;
    },
    { capture: true }
  );
  document.addEventListener(
    'keydown',
    () => {
      pointerAction = false;
    },
    { capture: true }
  );
  function animateIn(node, kind = 'panel') {
    if (!pointerAction || reducedMotion.matches || !node.animate) return;
    if (!node.getClientRects().length && node.isConnected) return;
    node.getAnimations().forEach((a) => a.cancel());
    const transform = kind === 'sheet' ? 'translateY(24px) scale(.98)' : 'translateY(6px)';
    node.animate(
      [
        { opacity: 0, transform },
        { opacity: 1, transform: 'none' }
      ],
      { duration: kind === 'sheet' ? 260 : 180, easing: 'cubic-bezier(.23,1,.32,1)' }
    );
  }
  function selectView(view, focus = false) {
    if (!['overview', 'players', 'games'].includes(view)) view = 'overview';
    document.body.dataset.view = view;
    for (const link of document.querySelectorAll('.main-nav a')) {
      const selected = link.hash === '#' + view;
      link.classList.toggle('nav-active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (phone.matches && focus) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      const section = document.querySelector('[data-view="' + view + '"]:not(body)');
      if (section) {
        animateIn(section);
        section.tabIndex = -1;
        section.focus({ preventScroll: true });
      }
    }
  }
  document.querySelector('.main-nav').addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (phone.matches) {
      event.preventDefault();
      if (location.hash !== link.hash) history.pushState(null, '', link.hash);
      selectView(link.hash.slice(1), true);
    } else selectView(link.hash.slice(1));
  });
  window.addEventListener('hashchange', () => {
    if (!location.hash || ['overview', 'players', 'games'].includes(location.hash.slice(1)))
      selectView(location.hash.slice(1), true);
  });
  phone.addEventListener('change', () => selectView(location.hash.slice(1)));
  selectView(location.hash.slice(1));
  getElement('summary-toggle').onclick = () => {
    const expanded = getElement('summary-toggle').getAttribute('aria-expanded') !== 'true';
    getElement('summary-toggle').setAttribute('aria-expanded', String(expanded));
    getElement('summary-toggle').textContent = expanded
      ? 'Fewer team metrics -'
      : 'More team metrics +';
    document.body.classList.toggle('show-advanced', expanded);
  };
  function empty(title, copy) {
    const n = createElement('div', undefined, 'empty-state');
    n.append(createElement('strong', title), createElement('p', copy));
    return n;
  }
  function button(text, action, cls = 'player-link') {
    const n = createElement('button', text, cls);
    n.type = 'button';
    n.onclick = action;
    return n;
  }
  function playerButton(p) {
    const n = button(p.player_name, () => openPlayer(p.player_id));
    n.prepend(createElement('span', p.jersey_number ?? '—', 'jersey'));
    return n;
  }
  function table(headers, rows) {
    const t = createElement('table'),
      h = createElement('tr'),
      head = createElement('thead'),
      body = createElement('tbody');
    for (const title of headers) {
      const th = createElement('th');
      th.scope = 'col';
      th.append(title instanceof Node ? title : document.createTextNode(title));
      h.append(th);
    }
    head.append(h);
    t.append(head);
    for (const cells of rows) {
      const row = createElement('tr');
      for (const value of cells) {
        const td = createElement('td');
        td.append(value instanceof Node ? value : document.createTextNode(String(value ?? '—')));
        row.append(td);
      }
      body.append(row);
    }
    t.append(body);
    return t;
  }
  function metrics(items) {
    return items.map(([label, value, note]) => {
      const n = createElement('div', undefined, 'profile-metric');
      n.append(createElement('small', label), createElement('strong', value));
      if (note) n.append(createElement('span', note));
      return n;
    });
  }
  function periodOptions() {
    const current = Analytics.currentSeason(),
      seasons = new Set([current]),
      years = new Set([String(new Date().getFullYear())]);
    for (const g of snapshot.games) {
      seasons.add(Analytics.season(g.game_date));
      years.add(g.game_date.slice(0, 4));
    }
    const select = getElement('period-select');
    select.replaceChildren();
    const group = (label, values) => {
      const n = createElement('optgroup');
      n.label = label;
      for (const v of values) {
        const o = createElement('option', Analytics.periodLabel(v));
        o.value = v;
        n.append(o);
      }
      select.append(n);
    };
    group(
      'Seasons',
      [...seasons].sort(
        (a, b) =>
          Number(b.split(':')[1]) - Number(a.split(':')[1]) || (a.startsWith('fall') ? -1 : 1)
      )
    );
    group(
      'Calendar years',
      [...years]
        .sort()
        .reverse()
        .map((y) => 'year:' + y)
    );
    group('All time', ['career']);
    select.value = current;
  }
  function render() {
    if (!snapshot) return;
    const period = getElement('period-select').value,
      cat = getElement('category-select').value;
    games = Analytics.filterGames(snapshot.games, { period, category: cat }).sort(descending);
    summary = Analytics.summarize(snapshot, games);
    getElement('period-title').textContent = Analytics.periodLabel(period);
    getElement('game-count').textContent = games.length;
    getElement('record').textContent = [summary.wins, summary.losses, summary.ties].join('–');
    getElement('points').textContent = formatNumber(summary.points, 0);
    getElement('ppg').textContent = formatNumber(summary.ppg);
    getElement('oppg').textContent = formatNumber(summary.oppg);
    getElement('pace').textContent = formatNumber(summary.advanced.pace);
    getElement('off-rating').textContent = formatNumber(summary.advanced.offensiveRating);
    getElement('def-rating').textContent = formatNumber(summary.advanced.defensiveRating);
    getElement('pace-coverage').textContent =
      `${summary.advanced.paceEligible} of ${games.length} games with complete stats & duration`;
    getElement('rating-coverage').textContent =
      `${summary.advanced.eligible} of ${games.length} games with complete stats`;
    const unclassified = games.filter((g) => !g.category).length;
    getElement('filter-note').textContent = unclassified
      ? `${unclassified} unclassified historical game${unclassified === 1 ? '' : 's'} included`
      : cat === 'all'
        ? 'Official and friendly games included'
        : cat === 'official'
          ? 'Official games only'
          : 'Friendly games only';
    getElement('leader-total').textContent =
      period === 'career'
        ? 'Career totals'
        : period.startsWith('year:')
          ? 'Year totals'
          : 'Season totals';
    renderLatest();
    renderLeaders();
    renderChart();
    renderComparison();
    renderPlayers();
    renderGames();
    if (getElement('player-dialog').open) renderPlayer(playerId);
  }
  function renderLatest() {
    const holder = getElement('latest-game'),
      g = games[0];
    holder.replaceChildren();
    if (!g) {
      delete holder.dataset.gameId;
      holder.append(
        empty(
          'Your next story starts here',
          'No games in this selection. Choose another period or game category.'
        )
      );
      return;
    }
    holder.dataset.gameId = g.game_id;
    const result =
      g.home_points > g.away_points ? 'WIN' : g.home_points < g.away_points ? 'LOSS' : 'TIE';
    const top = createElement('div', undefined, 'latest-top');
    top.append(
      createElement('p', 'LATEST GAME', 'eyebrow'),
      createElement('span', 'FINAL · ' + result, 'latest-result')
    );
    const matchup = createElement('div', undefined, 'latest-matchup'),
      teams = createElement('div');
    teams.append(
      createElement('span', 'Our team', 'latest-team'),
      createElement('h2', 'vs ' + g.opponent)
    );
    matchup.append(
      teams,
      createElement('strong', g.home_points + ' – ' + g.away_points, 'latest-score')
    );
    const info = createElement('p', g.game_date + ' · ' + category(g), 'latest-meta');
    const leaders = Analytics.leaders(
      Analytics.summarize(snapshot, [g]).players,
      'points',
      'total'
    );
    const footer = createElement('div', undefined, 'latest-footer'),
      performers = createElement('div', undefined, 'latest-performers');
    if (leaders.players.length) {
      performers.append(
        createElement('small', leaders.players.length === 1 ? 'POINTS LEADER' : 'POINTS LEADERS')
      );
      for (const p of leaders.players)
        performers.append(
          button(p.player_name + ' · ' + formatNumber(leaders.value, 0) + ' PTS', () =>
            openPlayer(p.player_id)
          )
        );
    }
    footer.append(
      performers,
      button('Game report ↗', () => openGame(g), 'latest-report')
    );
    holder.append(top, matchup, info, footer);
  }
  function renderLeaders() {
    getElement('leader-total').setAttribute('aria-pressed', leaderMode === 'total');
    getElement('leader-average').setAttribute('aria-pressed', leaderMode === 'average');
    const codes = {
      points: 'PTS',
      rebounds: 'REB',
      offensive: 'OR',
      assists: 'AST',
      steals: 'STL',
      blocks: 'BLK'
    };
    getElement('leader-grid').replaceChildren(
      ...Object.keys(codes).map((key) => {
        const result = Analytics.leaders(summary.players, key, leaderMode),
          card = createElement('article', undefined, 'leader-card'),
          top = createElement('div', undefined, 'leader-top');
        top.append(
          createElement('span', codes[key], 'stat-symbol'),
          createElement('span', names[key])
        );
        card.append(
          top,
          createElement(
            'strong',
            formatNumber(result.value, leaderMode === 'total' ? 0 : 1),
            'leader-value'
          )
        );
        if (!result.players.length)
          card.append(createElement('small', 'No recorded ' + names[key].toLowerCase() + ' yet'));
        for (const p of result.players) {
          card.append(
            button(p.player_name, () => openPlayer(p.player_id)),
            createElement(
              'small',
              `#${p.jersey_number} · ${p.appearances} GP${leaderMode === 'average' ? ' · per game' : ''}`
            )
          );
        }
        if (result.players.length > 1) card.append(createElement('small', 'Tied leaders'));
        return card;
      })
    );
  }
  function svgNode(tag, attrs, text) {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function renderChart() {
    const holder = getElement('scoring-chart');
    holder.replaceChildren();
    if (!games.length) {
      holder.append(
        empty('No games in this period', 'Choose another season or year to explore results.')
      );
      return;
    }
    const data = [...games].sort(
      (a, b) => a.game_date.localeCompare(b.game_date) || a.game_id.localeCompare(b.game_id)
    );
    const W = 560,
      H = 228,
      left = 34,
      right = 18,
      top = 16,
      bottom = 35,
      max = Math.max(
        20,
        Math.ceil(Math.max(...data.flatMap((g) => [g.home_points, g.away_points])) / 20) * 20
      );
    const x = (i) => left + (W - left - right) * (data.length === 1 ? 0.5 : i / (data.length - 1)),
      y = (n) => top + (H - top - bottom) * (1 - n / max);
    const svg = svgNode('svg', {
      viewBox: `0 0 ${W} ${H}`,
      role: 'img',
      'aria-label': 'Points scored by our team and opponents in chronological game order'
    });
    svg.append(
      svgNode(
        'title',
        {},
        'Scoring across selected games. Exact scores are listed in Game results.'
      )
    );
    for (let i = 0; i <= 4; i++) {
      const v = (max * i) / 4;
      svg.append(
        svgNode('line', {
          x1: left,
          x2: W - right,
          y1: y(v),
          y2: y(v),
          stroke: '#e9eef5',
          'stroke-dasharray': '3 5'
        }),
        svgNode('text', { x: left - 9, y: y(v) + 4, 'text-anchor': 'end' }, String(v))
      );
    }
    for (const [key, color, dashed] of [
      ['away_points', '#9aaac0', true],
      ['home_points', '#285ce5', false]
    ]) {
      svg.append(
        svgNode('polyline', {
          points: data.map((g, i) => `${x(i)},${y(g[key])}`).join(' '),
          fill: 'none',
          stroke: color,
          'stroke-width': 2.5,
          ...(dashed ? { 'stroke-dasharray': '5 4' } : {})
        })
      );
      for (const [i, g] of data.entries()) {
        const c = svgNode('circle', {
          cx: x(i),
          cy: y(g[key]),
          r: data.length > 30 ? 2 : 4,
          fill: color,
          stroke: 'white',
          'stroke-width': 2
        });
        c.append(
          svgNode(
            'title',
            {},
            `${g.game_date} vs ${g.opponent}: ${key === 'home_points' ? 'Our team' : 'Opponent'} ${g[key]}`
          )
        );
        svg.append(c);
      }
    }
    const indices = [
      ...new Set([
        0,
        Math.floor((data.length - 1) / 3),
        Math.floor((2 * (data.length - 1)) / 3),
        data.length - 1
      ])
    ];
    for (const i of indices)
      svg.append(
        svgNode(
          'text',
          { x: x(i), y: H - 10, 'text-anchor': 'middle' },
          data[i].game_date.slice(5).replace('-', '/')
        )
      );
    animateIn(svg);
    holder.append(
      svg,
      createElement(
        'p',
        `${data.length} games · Chronological order · Scores shown in game reports`,
        'chart-footnote'
      )
    );
  }
  function renderComparison() {
    const container = getElement('team-comparison');
    container.replaceChildren();
    const head = createElement('div', undefined, 'comparison-head');
    head.append(
      createElement('span', 'RECORDED STAT'),
      createElement('span', 'OUR TEAM'),
      createElement('span', 'OPPONENT')
    );
    container.append(head);
    const avg = (s, k) => (s ? formatNumber(Analytics.ratio(s[k], games.length)) : '—');
    for (const [label, h, a] of [
      ['FG%', formatPercent(summary.shooting.fg), formatPercent(summary.opponentShooting?.fg)],
      [
        '3PT%',
        formatPercent(summary.shooting.three),
        formatPercent(summary.opponentShooting?.three)
      ],
      ['FT%', formatPercent(summary.shooting.ft), formatPercent(summary.opponentShooting?.ft)],
      ['Rebounds', avg(summary.home, 'rebounds'), avg(summary.away, 'rebounds')],
      ['Off. rebounds', avg(summary.home, 'offensive'), avg(summary.away, 'offensive')],
      ['Assists', avg(summary.home, 'assists'), avg(summary.away, 'assists')],
      ['Turnovers', avg(summary.home, 'turnovers'), avg(summary.away, 'turnovers')]
    ]) {
      const row = createElement('div', undefined, 'comparison-row');
      row.append(
        createElement('span', label),
        createElement('strong', h),
        createElement('strong', a)
      );
      container.append(row);
    }
    container.append(
      createElement(
        'p',
        `eFG ${formatPercent(summary.shooting.efg)} · TS ${formatPercent(summary.shooting.ts)} · OREB ${formatPercent(summary.offensiveReboundPct)} · DREB ${formatPercent(summary.defensiveReboundPct)}`,
        'section-note'
      )
    );
    const more = createElement('details', undefined, 'more-metrics');
    more.append(createElement('summary', 'More team metrics'));
    more.append(
      table(
        ['Recorded metric', 'Our team', 'Opponent'],
        ['defensive', 'steals', 'blocks', 'fouls'].map((k) => [
          names[k] + ' / game',
          avg(summary.home, k),
          avg(summary.away, k)
        ])
      )
    );
    more.append(
      createElement(
        'p',
        `Net rating: ${formatNumber(summary.advanced.netRating)} · ${summary.advanced.eligible} eligible games. OREB% and DREB% describe the share of available team rebounds collected.`,
        'section-note'
      )
    );
    container.append(more);
    if (!summary.away && games.length)
      container.append(
        createElement(
          'p',
          'Opponent detail is unavailable for some selected historical games.',
          'section-note'
        )
      );
  }
  function renderPlayers() {
    const groups = Analytics.playerGroups(snapshot, summary.players),
      period = getElement('period-select').value;
    const label =
      period === 'career'
        ? 'Career players'
        : period.startsWith('year:')
          ? 'Selected year'
          : period === Analytics.currentSeason()
            ? 'This season'
            : 'Selected season';
    getElement('players-appeared').textContent = `${label} (${groups.appeared.length})`;
    getElement('players-other').textContent = `Other players (${groups.other.length})`;
    for (const group of ['appeared', 'other'])
      getElement('players-' + group).setAttribute('aria-pressed', playerGroup === group);
    getElement('player-group-note').textContent =
      playerGroup === 'appeared'
        ? 'Players with a recorded appearance in the selected period and game category. Unused bench players are under Other players.'
        : 'No recorded appearances in this period and game category. Select a player and change their profile period to explore earlier games.';
    const search = getElement('player-search').value.trim().toLocaleLowerCase().replace(/^#/, '');
    const players = groups[playerGroup].filter(
      (p) =>
        p.player_name.toLocaleLowerCase().includes(search) ||
        String(p.jersey_number).includes(search)
    );
    players.sort(
      (a, b) =>
        sortDirection *
          ((sortKey === 'appearances' ? a.appearances : (a.averages[sortKey] ?? -1)) -
            (sortKey === 'appearances' ? b.appearances : (b.averages[sortKey] ?? -1))) ||
        a.player_name.localeCompare(b.player_name)
    );
    const holder = getElement('player-table');
    holder.replaceChildren();
    if (!players.length) {
      holder.append(
        empty(
          'No players found',
          search
            ? 'Try another name or jersey number.'
            : playerGroup === 'appeared'
              ? 'Players appear here after playing in a published game. Browse Other players or choose another period.'
              : 'Every known player has an appearance in the selected games, or no roster has been published yet.'
        )
      );
      return;
    }
    const columns = [
      ['GP', 'appearances'],
      ['PPG', 'points'],
      ['RPG', 'rebounds'],
      ['APG', 'assists'],
      ['SPG', 'steals'],
      ['BPG', 'blocks'],
      ['TOPG', 'turnovers']
    ];
    const headers = [
      'Player',
      ...columns.map(([title, key]) => {
        const b = button(
          title + (sortKey === key ? (sortDirection === -1 ? ' ↓' : ' ↑') : ''),
          () => {
            sortDirection = sortKey === key ? -sortDirection : -1;
            sortKey = key;
            renderPlayers();
          },
          'sort-button'
        );
        b.setAttribute('aria-label', 'Sort by ' + title);
        b.setAttribute('aria-pressed', sortKey === key);
        return b;
      }),
      'FG%',
      '3PT%',
      'FT%'
    ];
    holder.append(
      table(
        headers,
        players.map((p) => [
          playerButton(p),
          p.appearances,
          ...['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'].map((k) =>
            formatNumber(p.averages[k])
          ),
          formatPercent(p.shooting.fg),
          formatPercent(p.shooting.three),
          formatPercent(p.shooting.ft)
        ])
      )
    );
  }
  function renderGames() {
    getElement('results-count').textContent = `${games.length} games`;
    getElement('game-list').replaceChildren(
      ...games.map((g) => {
        const card = createElement('article', undefined, 'game-card'),
          result = g.home_points > g.away_points ? 'W' : g.home_points < g.away_points ? 'L' : 'T';
        const info = createElement('div'),
          meta = createElement('p', g.game_date, 'game-meta');
        meta.append(createElement('span', category(g), 'category-tag'));
        info.append(
          meta,
          createElement('h3', 'vs ' + g.opponent),
          createElement('p', Analytics.periodLabel(Analytics.season(g.game_date)), 'game-meta')
        );
        const end = createElement('div');
        end.append(
          createElement('p', `${g.home_points} – ${g.away_points}`, 'score'),
          button('Game overview →', () => openGame(g), 'game-report')
        );
        card.append(
          createElement(
            'span',
            result,
            'result-mark ' + (result === 'L' ? 'loss' : result === 'T' ? 'tie' : '')
          ),
          info,
          end
        );
        return card;
      })
    );
    if (!games.length)
      getElement('game-list').append(
        empty('No games in this period', 'Try a different period or include both game categories.')
      );
  }
  function openPlayer(id) {
    playerId = id;
    renderPlayer(id);
    if (!getElement('player-dialog').open) {
      getElement('player-dialog').showModal();
      animateIn(getElement('player-dialog'), 'sheet');
    }
  }
  function renderPlayer(id) {
    const known =
      (snapshot.roster || []).find((p) => p.player_id === id) ||
      snapshot.games.flatMap((g) => g.players || []).find((p) => p.player_id === id);
    const p =
      summary.players.find((p) => p.player_id === id) ||
      (known
        ? {
            ...known,
            appearances: 0,
            played_ms: null,
            partial: false,
            stats: Analytics.empty(),
            averages: {},
            shooting: Analytics.shooting(Analytics.empty()),
            games: []
          }
        : null);
    if (!p) {
      getElement('player-dialog').close();
      return;
    }
    getElement('profile-period').replaceChildren(
      ...[...getElement('period-select').children].map((n) => n.cloneNode(true))
    );
    getElement('profile-period').value = getElement('period-select').value;
    getElement('profile-category').value = getElement('category-select').value;
    getElement('player-title').textContent = `${p.player_name} · #${p.jersey_number}`;
    getElement('player-note').textContent =
      `${Analytics.periodLabel(getElement('period-select').value)} · ${getElement('category-select').selectedOptions[0].textContent} · ${p.appearances} appearances${p.player_id === 'P_GUEST' ? ' · Combined guest group' : ''}`;
    getElement('player-summary').replaceChildren(
      ...metrics(
        ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers'].map((k) => [
          names[k].toUpperCase(),
          formatNumber(p.averages[k]),
          'per game'
        ])
      )
    );
    const s = p.stats;
    const totalTable = createElement('div', undefined, 'table-wrap');
    totalTable.tabIndex = 0;
    totalTable.setAttribute('role', 'region');
    totalTable.setAttribute('aria-label', 'Player totals');
    totalTable.append(
      table(
        ['PTS', 'OREB', 'DREB', 'REB', 'AST', 'STL', 'BLK', 'TO', 'PF', 'MIN'],
        [
          [
            s.points,
            s.offensive,
            s.defensive,
            s.rebounds,
            s.assists,
            s.steals,
            s.blocks,
            s.turnovers,
            s.fouls,
            p.played_ms == null ? '—' : formatNumber(p.played_ms / 60000) + (p.partial ? '*' : '')
          ]
        ]
      )
    );
    getElement('player-totals').replaceChildren(totalTable);
    getElement('player-totals').append(
      createElement(
        'p',
        `Shooting: FG ${s.fgm}/${s.fga} (${formatPercent(p.shooting.fg)}) · 3PT ${s.threeMade}/${s.threeAttempts} (${formatPercent(p.shooting.three)}) · FT ${s.ftm}/${s.fta} (${formatPercent(p.shooting.ft)}) · eFG ${formatPercent(p.shooting.efg)} · TS ${formatPercent(p.shooting.ts)}`,
        'section-note'
      )
    );
    if (p.partial)
      getElement('player-totals').append(
        createElement(
          'p',
          '* Minutes are a known subtotal; some game tracking is partial or unavailable.',
          'section-note'
        )
      );
    getElement('player-games').replaceChildren(
      table(
        ['Game', 'Category', 'MIN', 'PTS', 'OREB', 'REB', 'AST', 'STL', 'BLK', 'TO'],
        p.games
          .sort((a, b) => descending(a.game, b.game))
          .map(({ game: g, player: q }) => {
            const s = q.stats || {};
            return [
              button(`${g.game_date} · vs ${g.opponent}`, () => {
                getElement('player-dialog').close();
                openGame(g);
              }),
              category(g),
              q.played_count === 0
                ? 'DNP'
                : q.played_ms == null
                  ? '—'
                  : formatNumber(q.played_ms / 60000) + (g.coverage === 'complete' ? '' : '*'),
              ...[
                'points',
                'offensive',
                'rebounds',
                'assists',
                'steals',
                'blocks',
                'turnovers'
              ].map((k) => s[k] ?? 0)
            ];
          })
      )
    );
    if (!p.games.length)
      getElement('player-games').replaceChildren(
        empty('No games for this player', 'Choose another season, year or their entire career.')
      );
  }
  function openGame(g) {
    getElement('box-title').textContent = 'vs ' + g.opponent;
    getElement('box-note').textContent =
      `${g.game_date} · ${category(g)} · ${Analytics.periodLabel(Analytics.season(g.game_date))} · ${g.coverage === 'complete' ? 'Complete minute tracking' : 'Partial or unavailable minutes'}`;
    getElement('game-score').replaceChildren(
      createElement('span', 'Our team'),
      createElement('strong', `${g.home_points} – ${g.away_points}`),
      createElement('span', g.opponent)
    );
    const m = Analytics.gameMetrics(g);
    getElement('game-metrics').replaceChildren(
      ...metrics([
        ['PACE', formatNumber(m.pace), 'per 40 minutes'],
        ['OUR OFF. RATING', formatNumber(m.offensiveRating), 'per 100 possessions'],
        ['OUR DEF. RATING', formatNumber(m.defensiveRating), 'per 100 possessions'],
        ['OUR NET RATING', formatNumber(m.netRating), 'offense − defense'],
        ['POSSESSIONS', formatNumber(m.possessions), 'estimated'],
        ['DURATION', g.duration_ms ? formatNumber(g.duration_ms / 60000) : '—', 'recorded minutes']
      ])
    );
    const total = Analytics.summarize(snapshot, [g]),
      h = total.home,
      a = total.away;
    const teamCells = (s) =>
      s
        ? [
            s.points,
            `${s.fgm}/${s.fga}`,
            formatPercent(Analytics.shooting(s).fg),
            `${s.threeMade}/${s.threeAttempts}`,
            `${s.ftm}/${s.fta}`,
            s.offensive,
            s.defensive,
            s.rebounds,
            s.assists,
            s.steals,
            s.blocks,
            s.turnovers,
            s.fouls
          ]
        : Array(13).fill('—');
    const shootingRows = [
      ['Field goals', (s) => `${s.fgm}/${s.fga}`],
      ['FG%', (s) => formatPercent(Analytics.shooting(s).fg)],
      ['3-pointers', (s) => `${s.threeMade}/${s.threeAttempts}`],
      ['3PT%', (s) => formatPercent(Analytics.shooting(s).three)],
      ['Free throws', (s) => `${s.ftm}/${s.fta}`],
      ['FT%', (s) => formatPercent(Analytics.shooting(s).ft)]
    ];
    const rows = [
      ['Points', g.home_points, g.away_points],
      ...shootingRows.map(([label, value]) => [label, value(h), a ? value(a) : '—']),
      ...[
        'offensive',
        'defensive',
        'rebounds',
        'assists',
        'steals',
        'blocks',
        'turnovers',
        'fouls'
      ].map((k) => [names[k], h[k], a ? a[k] : '—']),
      ['Offensive rating', formatNumber(m.offensiveRating), formatNumber(m.defensiveRating)],
      ['Defensive rating', formatNumber(m.defensiveRating), formatNumber(m.offensiveRating)]
    ];
    getElement('game-comparison').replaceChildren(
      table(['Recorded statistic', 'Our team', g.opponent], rows)
    );
    if (m.possessions === null)
      getElement('game-comparison').append(
        createElement(
          'p',
          'Pace and ratings require confirmed full statistics for both teams and positive estimated possessions.',
          'section-note'
        )
      );
    else if (m.pace === null)
      getElement('game-comparison').append(
        createElement(
          'p',
          'Pace is unavailable because game duration was not recorded.',
          'section-note'
        )
      );
    if (!a)
      getElement('game-comparison').append(
        createElement(
          'p',
          'Opponent detail was not recorded for this game. Its final score is still available.',
          'section-note'
        )
      );
    getElement('box-table').replaceChildren(
      table(
        [
          'Player',
          'MIN',
          'PTS',
          'FG',
          'FG%',
          '3PT',
          'FT',
          'OREB',
          'DREB',
          'REB',
          'AST',
          'STL',
          'BLK',
          'TO',
          'PF',
          '+/−'
        ],
        (g.players || []).map((p) => {
          const s = { ...Analytics.empty(), ...p.stats };
          return [
            p.player_name,
            p.played_count === 0
              ? 'DNP'
              : p.played_ms == null
                ? '—'
                : formatNumber(p.played_ms / 60000) + (g.coverage === 'complete' ? '' : '*'),
            ...teamCells(s),
            p.plus_minus_status === 'complete' && Number.isFinite(p.plus_minus)
              ? p.plus_minus > 0
                ? '+' + p.plus_minus
                : String(p.plus_minus)
              : '—'
          ];
        })
      )
    );
    getElement('box-table').append(
      createElement(
        'p',
        '+/− is our scoring margin while each player was on court. — means historical lineup data is incomplete or the row combines guests.',
        'section-note'
      )
    );
    if (!getElement('box-dialog').open) {
      getElement('box-dialog').showModal();
      animateIn(getElement('box-dialog'), 'sheet');
    }
  }
  async function load() {
    getElement('retry-load').hidden = true;
    getElement('load-status').textContent = '';
    getElement('published').textContent = 'Loading published results…';
    try {
      const response = await fetch('data/stats.json', { cache: 'no-cache' });
      if (!response.ok) throw Error('Published results are not available yet.');
      const data = await response.json();
      if (data.schema_version !== 1 || !Array.isArray(data.games))
        throw Error('Unsupported statistics snapshot.');
      snapshot = data;
      periodOptions();
      getElement('period-select').disabled = false;
      getElement('category-select').disabled = false;
      getElement('published').textContent = data.generated_at
        ? 'Last published ' + new Date(data.generated_at).toLocaleString()
        : 'No games published yet.';
      render();
    } catch (e) {
      getElement('load-status').textContent = e.message || 'Could not load statistics.';
      getElement('published').textContent = 'Results unavailable';
      getElement('retry-load').hidden = false;
    }
  }
  getElement('period-select').onchange = render;
  getElement('category-select').onchange = render;
  getElement('player-search').oninput = () => {
    if (summary) renderPlayers();
  };
  for (const group of ['appeared', 'other'])
    getElement('players-' + group).onclick = () => {
      playerGroup = group;
      if (summary) renderPlayers();
    };
  getElement('profile-period').onchange = () => {
    getElement('period-select').value = getElement('profile-period').value;
    render();
  };
  getElement('profile-category').onchange = () => {
    getElement('category-select').value = getElement('profile-category').value;
    render();
  };
  getElement('leader-total').onclick = () => {
    leaderMode = 'total';
    if (summary) renderLeaders();
  };
  getElement('leader-average').onclick = () => {
    leaderMode = 'average';
    if (summary) renderLeaders();
  };
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) document.getAnimations().forEach((a) => a.cancel());
  });
  for (const dialog of document.querySelectorAll('dialog'))
    dialog.addEventListener('close', () => dialog.getAnimations().forEach((a) => a.cancel()));
  getElement('player-close').onclick = () => getElement('player-dialog').close();
  getElement('box-close').onclick = () => getElement('box-dialog').close();
  getElement('retry-load').onclick = load;
  load();
})();
