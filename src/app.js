(() => {
  'use strict';
  const Engine = ScoreEngine,
    Team = TeamEngine,
    STORAGE_KEY = 'courtside.v2';
  const getElement = (id) => document.getElementById(id);
  const escapeHtml = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const labels = {
    '2PT_MADE': '2-point shot made',
    '2PT_MISSED': '2-point shot missed',
    '3PT_MADE': '3-point shot made',
    '3PT_MISSED': '3-point shot missed',
    FT_MADE: 'Free throw made',
    FT_MISSED: 'Free throw missed',
    OFF_REBOUND: 'Offensive rebound',
    DEF_REBOUND: 'Defensive rebound',
    ASSIST: 'Assist',
    STEAL: 'Steal',
    BLOCK: 'Block',
    TURNOVER: 'Turnover',
    FOUL: 'Personal foul'
  };
  let state = {
    version: 2,
    roster: DEFAULT_ROSTER.map((p, i) => ({
      ...p,
      id: `P_DEFAULT_${String(i + 1).padStart(3, '0')}`
    })),
    games: [],
    currentGameId: null
  };
  let selectedId = null,
    side = 'HOME',
    toastTimer,
    saveBlocked = false,
    rawSaved = null,
    confirmAction = null;
  let feedbackTimer,
    inputMethod = 'keyboard';
  document.addEventListener(
    'pointerdown',
    () => {
      inputMethod = 'pointer';
      document.documentElement.dataset.input = 'pointer';
    },
    true
  );
  document.addEventListener(
    'keydown',
    () => {
      inputMethod = 'keyboard';
      document.documentElement.dataset.input = 'keyboard';
    },
    true
  );
  function confirmPlay(event) {
    const feedback = getElement('action-confirmation');
    clearTimeout(feedbackTimer);
    feedback.textContent = `✓ #${event.event_id} · ${event.team_side === 'HOME' ? '#' + event.jersey_number + ' ' + event.player_name : event.opponent} · ${labels[event.event_type]}`;
    feedback.classList.add('visible');
    feedbackTimer = setTimeout(() => feedback.classList.remove('visible'), 1600);
    if (
      event.points_value &&
      inputMethod === 'pointer' &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      const score = getElement(event.team_side === 'HOME' ? 'home-score' : 'away-score');
      score.getAnimations().forEach((animation) => animation.cancel());
      score.animate([{ transform: 'scale(1.045)' }, { transform: 'scale(1)' }], {
        duration: 160,
        easing: 'cubic-bezier(0.23, 1, 0.32, 1)'
      });
    }
  }
  const current = () => state.games.find((g) => g.id === state.currentGameId) || null;
  function warn(text) {
    getElement('storage-warning').textContent = text;
    getElement('storage-warning').hidden = false;
    getElement('save-status').textContent = '● Backup recommended';
  }
  function toast(message, error = false) {
    clearTimeout(toastTimer);
    getElement('toast').textContent = message;
    getElement('toast').classList.toggle('error', error);
    getElement('toast').hidden = false;
    toastTimer = setTimeout(() => (getElement('toast').hidden = true), error ? 6500 : 3000);
  }
  function save() {
    if (saveBlocked) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      getElement('save-status').textContent = '● Saved on this device';
      getElement('storage-warning').hidden = true;
    } catch {
      warn(
        'This browser could not save your latest changes. Keep this page open and download a backup or CSV now.'
      );
    }
  }
  try {
    rawSaved = localStorage.getItem(STORAGE_KEY);
    if (rawSaved) {
      const loaded = JSON.parse(rawSaved);
      Engine.validateState(loaded);
      state = loaded;
    } else {
      // Preserve legacy roster identities without fabricating event history from totals.
      const legacy = localStorage.getItem('basketballStats');
      if (legacy) {
        try {
          const old = JSON.parse(legacy);
          if (Array.isArray(old.players) && old.players.length) {
            const migrated = old.players.map((p) => ({
              id: `P_LEGACY_${p.id}`,
              name: p.name,
              number: Number(p.number)
            }));
            Engine.validateState({ ...state, roster: migrated });
            state.roster = migrated;
          }
        } catch {}
      }
      save();
    }
  } catch {
    saveBlocked = true;
    getElement('recovery-button').hidden = !rawSaved;
    warn(
      'Saved data could not be loaded. The original is untouched; use Download original recovery data to keep it. New changes are only in memory: use Download backup to save your new work.'
    );
  }
  function open(id) {
    getElement(id).showModal();
  }
  function confirm(title, text, action) {
    getElement('confirm-title').textContent = title;
    getElement('confirm-text').textContent = text;
    confirmAction = action;
    open('confirm-dialog');
  }
  document
    .querySelectorAll('[data-close]')
    .forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
  getElement('confirm-yes').addEventListener('click', () => {
    const action = confirmAction;
    confirmAction = null;
    getElement('confirm-dialog').close();
    try {
      action?.();
    } catch (e) {
      toast(e.message, true);
    }
  });
  function run(fn) {
    try {
      fn();
      save();
      render();
    } catch (e) {
      toast(e.message, true);
    }
  }
  const periodText = (g) => (g.period <= 4 ? `QUARTER ${g.period}` : `OVERTIME ${g.period - 4}`);
  function renderClock() {
    const g = current();
    if (!g) return;
    if (g.running && Engine.remaining(g) <= 0) {
      Engine.pause(g);
      save();
      toast('Period complete. Advance when you are ready.');
    }
    getElement('clock-display').textContent = Engine.clock(g);
    getElement('clock-speed').value = String(g.clockSpeed || 1);
    getElement('clock-speed').disabled = !!(g.finished || g.finalizedAt || g.remote);
    getElement('period-label').textContent = periodText(g);
    getElement('clock-status').textContent = g.finished
      ? 'FINAL'
      : g.running
        ? 'LIVE'
        : g.started
          ? 'PAUSED'
          : 'READY';
    getElement('clock-status').classList.toggle('running', g.running);
    getElement('clock-button').textContent = g.running
      ? 'Ⅱ Pause'
      : g.started
        ? '▶ Resume'
        : '▶ Start game';
    getElement('clock-button').classList.toggle('paused-color', g.running);
    getElement('clock-button').disabled = g.finished || (!g.running && g.remainingMs === 0);
    getElement('adjust-button').disabled = g.running || g.finished;
    getElement('period-button').disabled = g.running || g.finished;
    getElement('period-button').textContent = g.period < 4 ? 'Next quarter →' : 'Next overtime →';
    if (!getElement('box-view').hidden && !g.finished) renderBox();
  }
  function render() {
    const g = current();
    const roster = g
      ? g.lineup
        ? g.roster.filter((p) => g.lineup.includes(p.id))
        : g.finished
          ? g.roster
          : []
      : [];
    if (!roster.some((p) => p.id === selectedId)) selectedId = null;
    getElement('home-score').textContent = g ? Engine.stats(g, 'HOME').points : 0;
    getElement('away-score').textContent = g ? Engine.stats(g, 'AWAY').points : 0;
    getElement('opponent-name').textContent = g ? g.opponent : 'OPPONENT';
    getElement('game-meta').textContent = g
      ? `${g.date}  ·  vs ${g.opponent}`
      : 'Set up your game to get started.';
    getElement('roster-count').textContent = roster.length;
    getElement('roster-list').innerHTML =
      roster
        .map((p) => {
          const s = Engine.stats(g, 'HOME', p.id);
          return `<button class="player-card ${p.id === selectedId && side === 'HOME' ? 'selected' : ''}" data-player="${escapeHtml(p.id)}" aria-pressed="${p.id === selectedId && side === 'HOME'}" aria-label="Select ${escapeHtml(p.name)}, number ${p.number}"><span class="jersey">${p.number}</span><span class="player-info"><strong>${escapeHtml(p.name)}</strong><small>${g.starters?.includes(p.id) ? 'Starter · ' : ''}${p.guest ? 'Guest · ' : ''}${s.rebounds} REB · ${s.assists} AST</small></span><span class="player-points">${s.points}<small>PTS</small></span></button>`;
        })
        .join('') ||
      '<div class="empty-state">Choose your game squad and five starters to put players on court.</div>';
    getElement('lineup-button').disabled = !g || g.finished;
    getElement('lineup-button').textContent =
      g?.started && g.lineup ? 'Substitute' : 'Choose game players';
    getElement('participation-export-button').disabled = !g?.participation;
    getElement('participation-note').textContent = !g?.participation
      ? 'Minutes unavailable for games recorded before lineup tracking.'
      : g.coverage === 'partial'
        ? 'Partial minutes: tracking began when a lineup was chosen for this existing game.'
        : 'Minutes count running game-clock time only. Clock corrections do not change accumulated minutes.';
    const player = roster.find((p) => p.id === selectedId);
    const name = side === 'AWAY' ? g?.opponent || 'Opponent' : player?.name || 'Who made the play?';
    getElement('selected-player').classList.toggle('has-selection', !!player || side === 'AWAY');
    getElement('selected-player').innerHTML =
      `<span class="selected-avatar">${side === 'AWAY' ? 'A' : player ? player.number : '—'}</span><div><div class="selected-name">${escapeHtml(name)}</div><div class="selected-description">${side === 'AWAY' ? 'Team-level recording' : player ? 'Recording for our team' : 'Select a player from the roster'}</div></div><span class="selection-tag">${side === 'AWAY' ? 'OPPONENT' : 'OUR TEAM'}</span>`;
    getElement('home-side').classList.toggle('active', side === 'HOME');
    getElement('away-side').classList.toggle('active', side === 'AWAY');
    getElement('home-side').setAttribute('aria-pressed', side === 'HOME');
    getElement('away-side').setAttribute('aria-pressed', side === 'AWAY');
    document
      .querySelectorAll('[data-stat]')
      .forEach(
        (b) => (b.disabled = !g || !g.started || g.finished || (side === 'HOME' && !player))
      );
    getElement('recording-hint').textContent = !g
      ? 'Create a game to start recording.'
      : g.finished
        ? 'Game complete. Select a recorded action to correct it before export.'
        : !g.started
          ? 'Start the game clock to enable recording.'
          : side === 'HOME' && !player
            ? 'Select a player, then tap a stat.'
            : 'Each tap records one play at the displayed game time.';
    const events = g?.gameEvents || [];
    getElement('event-count').textContent = events.length;
    getElement('event-list').innerHTML =
      [...events]
        .reverse()
        .map((e) => {
          const category = e.event_type.endsWith('_MADE')
            ? 'made'
            : e.event_type.endsWith('_MISSED')
              ? 'missed'
              : ['FOUL', 'TURNOVER'].includes(e.event_type)
                ? 'danger'
                : '';
          const icon = e.points_value
            ? `+${e.points_value}`
            : category === 'missed'
              ? '×'
              : {
                  OFF_REBOUND: 'OR',
                  DEF_REBOUND: 'DR',
                  ASSIST: 'A',
                  STEAL: 'S',
                  BLOCK: 'B',
                  TURNOVER: 'TO',
                  FOUL: 'F'
                }[e.event_type] || '•';
          return `<div class="event-item" data-event="${e.event_id}" role="button" tabindex="0" aria-label="Correct play ${e.event_id}" data-void="${e.is_voided}"><span class="event-icon ${category}">${icon}</span><div class="event-body"><strong>${escapeHtml(labels[e.event_type])}</strong><small>${e.team_side === 'HOME' ? `#${e.jersey_number} ${escapeHtml(e.player_name)}` : `${escapeHtml(e.opponent)} · Opponent`}${e.is_voided ? ' · VOIDED' : ''}</small></div><div class="event-time">${escapeHtml(e.game_clock)}<small>${e.quarter.startsWith('OT') ? escapeHtml(e.quarter) : 'Q' + escapeHtml(e.quarter)} · #${e.event_id}</small></div></div>`;
        })
        .join('') ||
      '<div class="empty-state"><span class="empty-icon">◎</span>Your game starts here.<br>Record a play to see it in the feed.</div>';
    getElement('undo-button').disabled =
      !events.some((e) => !e.is_voided) || !!g?.finalizedAt || !!g?.remote;
    getElement('export-button').disabled = !g;
    getElement('finish-button').disabled = !g || !!g.finalizedAt || !!g.remote;
    getElement('finish-button').textContent = g?.finalizedAt
      ? 'Exported · locked'
      : g?.finished
        ? 'Reopen game'
        : 'End game';
    for (const id of ['clock-button', 'adjust-button', 'period-button'])
      getElement(id).disabled = !g;
    renderClock();
    renderBox();
    renderRemote();
  }
  function renderBox() {
    const g = current();
    if (!g) {
      getElement('box-table').innerHTML =
        '<div class="empty-state">Create a game to see your team stats.</div>';
      return;
    }
    const cells = (s) =>
      `<td>${s.points}</td><td>${s.fgm}/${s.fga}</td><td>${s.threeMade}/${s.threeAttempts}</td><td>${s.ftm}/${s.fta}</td><td>${s.offensive}</td><td>${s.defensive}</td><td>${s.rebounds}</td><td>${s.assists}</td><td>${s.steals}</td><td>${s.blocks}</td><td>${s.turnovers}</td><td>${s.fouls}</td>`;
    const players = g.roster.filter(
      (p) => !g.squad || g.squad.includes(p.id) || g.gameEvents.some((e) => e.player_id === p.id)
    );
    getElement('box-table').innerHTML =
      `<table><thead><tr><th>PLAYER</th><th>MIN</th><th>PTS</th><th>FG</th><th>3PT</th><th>FT</th><th>OREB</th><th>DREB</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th>PF</th></tr></thead><tbody>${players.map((p) => `<tr><td>#${p.number} ${escapeHtml(p.name)}${g.starters?.includes(p.id) ? ' (starter)' : ''}</td><td>${g.participation?.[p.id] ? Team.minutes(g, p.id, Date.now()).toFixed(2) : '—'}</td>${cells(Engine.stats(g, 'HOME', p.id))}</tr>`).join('')}</tbody><tfoot><tr><td>Our team</td><td>—</td>${cells(Engine.stats(g, 'HOME'))}</tr><tr><td>${escapeHtml(g.opponent)}</td><td>—</td>${cells(Engine.stats(g, 'AWAY'))}</tr></tfoot></table>`;

    if (g.finished) {
      const format = (v, d = 1) => (v == null ? '—' : v.toFixed(d));
      getElement('box-table').insertAdjacentHTML(
        'beforeend',
        `<h3>Player analytics</h3><p class="form-note">— means no attempts/turnovers, or incomplete historical lineup data for +/−. TS% uses a 0.44 free-throw estimate.</p><button id="player-export-button" class="button subtle">Export player statistics</button><table><thead><tr><th>PLAYER</th><th>+/−</th><th>FG%</th><th>3P%</th><th>FT%</th><th>eFG%</th><th>TS%</th><th>AST/TO</th></tr></thead><tbody>${players
          .map((p) => {
            const a = PlayerAnalytics.player(g, p.id);
            return `<tr><td>${escapeHtml(p.name)}</td><td title="${a.plusMinusStatus}">${a.plusMinus == null ? '—' : a.plusMinus > 0 ? '+' + a.plusMinus : a.plusMinus}</td>${['fgPct', 'threePct', 'ftPct', 'efgPct', 'tsPct', 'astTo'].map((k) => `<td>${format(a[k], k === 'astTo' ? 2 : 1)}</td>`).join('')}</tr>`;
          })
          .join('')}</tbody></table>`
      );
      getElement('player-export-button').onclick = () =>
        exportResults('player_statistics', (g) => PlayerAnalytics.csv(g));
    }
  }
  getElement('roster-list').addEventListener('click', (event) => {
    const b = event.target.closest('[data-player]');
    if (b) {
      selectedId = b.dataset.player;
      side = 'HOME';
      render();
    }
  });
  getElement('home-side').addEventListener('click', () => {
    side = 'HOME';
    render();
  });
  getElement('away-side').addEventListener('click', () => {
    side = 'AWAY';
    render();
  });
  document.querySelectorAll('[data-stat]').forEach((b) =>
    b.addEventListener('click', () =>
      run(() => {
        const g = current();
        const event = Engine.recordEvent(
          g,
          b.dataset.stat,
          g.roster.find((p) => p.id === selectedId),
          side
        );
        confirmPlay(event);
      })
    )
  );
  getElement('clock-button').addEventListener('click', () =>
    run(() => {
      const g = current();
      if (!g.lineup) {
        chooseLineup();
        return;
      }
      g.running ? Engine.pause(g) : Engine.start(g);
    })
  );
  getElement('adjust-button').addEventListener('click', () => {
    const g = current();
    if (!g || g.running) return;
    getElement('clock-input').value = Engine.clock(g);
    open('clock-dialog');
  });
  getElement('clock-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => {
      Engine.setClock(current(), getElement('clock-input').value.trim());
      getElement('clock-dialog').close();
      toast('Clock updated.');
    });
  });
  getElement('period-button').addEventListener('click', () => {
    const g = current();
    if (!g || g.running) return;
    confirm(
      'Advance the period?',
      `The clock will reset to ${g.period < 4 ? g.minutes : g.overtimeMinutes}:00 and stay paused. All recorded plays will be kept.`,
      () => run(() => Engine.nextPeriod(g))
    );
  });
  getElement('undo-button').addEventListener('click', () =>
    run(() => {
      const e = Engine.undo(current());
      if (e) toast(`Play #${e.event_id} voided. Stats updated.`);
    })
  );

  function exportResults(kind, prepare) {
    const g = current();
    if (!g) return;
    if (!g.finished) {
      toast('End the game before exporting final results.', true);
      return;
    }
    const action = () => {
      try {
        ResultExport.exportGame(
          g,
          () => prepare(g),
          () => {
            if (saveBlocked) throw Error('Restore browser saving before finalizing.');
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          },
          (content) => download(content, `${g.id}_${kind}.csv`, 'text/csv;charset=utf-8')
        );
        render();
        toast('Results exported. This game is locked; you can download its results again.');
      } catch (error) {
        toast(error.message, true);
      }
    };
    if (g.finalizedAt) action();
    else
      confirm(
        'Finalize and export?',
        'Exporting locks this game against further edits. You can download results again. Backups do not finalize games.',
        action
      );
  }
  getElement('clock-speed').addEventListener('change', () =>
    run(() => Engine.setSpeed(current(), Number(getElement('clock-speed').value)))
  );
  let correctionId = null;
  function editEvent(id) {
    const g = current();
    Engine.assertMutable(g);
    if (g.running) Engine.pause(g);
    save();
    render();
    const e = g.gameEvents.find((x) => x.event_id === id);
    if (!e) return;
    correctionId = id;
    getElement('correction-time').textContent =
      `Play #${id} · ${e.quarter} · ${e.game_clock} (time stays unchanged)`;
    getElement('correction-side').value = e.team_side;
    getElement('correction-player').innerHTML = g.roster
      .filter((p) => !g.squad || g.squad.includes(p.id))
      .map((p) => `<option value="${escapeHtml(p.id)}">#${p.number} ${escapeHtml(p.name)}</option>`)
      .join('');
    getElement('correction-player').value = e.player_id || g.roster[0]?.id;
    getElement('correction-type').innerHTML = Object.keys(Engine.TYPES)
      .map((t) => `<option value="${t}">${escapeHtml(labels[t])}</option>`)
      .join('');
    getElement('correction-type').value = e.event_type;
    getElement('correction-delete').checked = e.is_voided;
    getElement('correction-unlink').checked = false;
    getElement('correction-error').textContent = '';
    const linked = new Set(
      (g.eventLinks || []).flatMap((l) =>
        l.assistEventId === id ? [l.shotEventId] : l.shotEventId === id ? [l.assistEventId] : []
      )
    );
    getElement('correction-related').innerHTML = g.gameEvents
      .filter(
        (x) =>
          x.event_id !== id &&
          !x.is_voided &&
          (Math.abs(x.event_id - id) <= 5 || linked.has(x.event_id))
      )
      .map(
        (x) =>
          `<div class="related-row"><span>#${x.event_id} ${escapeHtml(labels[x.event_type])} · ${escapeHtml(x.player_name || g.opponent)}${linked.has(x.event_id) ? ' · linked' : ''}</span><label><input type="checkbox" data-related-delete="${x.event_id}"> Delete</label>${['ASSIST', '2PT_MADE', '3PT_MADE'].includes(x.event_type) ? `<label><input type="checkbox" data-related-link="${x.event_id}" ${linked.has(x.event_id) ? 'checked' : ''}> Link</label>` : ''}</div>`
      )
      .join('');
    const tx = g.correctionAudit?.findLast(
      (t) =>
        !t.restored &&
        t.changes.some((c) => c.eventId === id && !c.before.is_voided && c.after.is_voided)
    );
    getElement('correction-restore').hidden = !e.is_voided || !tx;
    getElement('correction-restore').dataset.transaction = tx?.id || '';
    getElement('correction-player').disabled = e.team_side === 'AWAY';
    open('correction-dialog');
  }
  getElement('correction-side').addEventListener('change', () => {
    getElement('correction-player').disabled = getElement('correction-side').value === 'AWAY';
  });
  getElement('event-list').addEventListener('click', (e) => {
    const item = e.target.closest('[data-event]');
    if (item) run(() => editEvent(Number(item.dataset.event)));
  });
  getElement('event-list').addEventListener('keydown', (e) => {
    if (['Enter', ' '].includes(e.key) && e.target.matches('[data-event]')) {
      e.preventDefault();
      run(() => editEvent(Number(e.target.dataset.event)));
    }
  });
  getElement('correction-form').addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const g = current(),
        patch = {
          event_type: getElement('correction-type').value,
          team_side: getElement('correction-side').value,
          player_id: getElement('correction-player').value,
          is_voided: getElement('correction-delete').checked
        };
      const changes = [
        { eventId: correctionId, patch },
        ...Array.from(document.querySelectorAll('[data-related-delete]:checked'), (el) => ({
          eventId: Number(el.dataset.relatedDelete),
          patch: { is_voided: true }
        }))
      ];
      let links = (g.eventLinks || []).filter(
        (l) => l.assistEventId !== correctionId && l.shotEventId !== correctionId
      );
      if (!getElement('correction-unlink').checked)
        for (const el of document.querySelectorAll('[data-related-link]:checked')) {
          const other = Number(el.dataset.relatedLink);
          links.push(
            patch.event_type === 'ASSIST'
              ? { assistEventId: correctionId, shotEventId: other }
              : { assistEventId: other, shotEventId: correctionId }
          );
        }
      const deleted = new Set(changes.filter((c) => c.patch.is_voided).map((c) => c.eventId));
      links = links.filter((l) => !deleted.has(l.assistEventId));
      Engine.correctEvents(g, changes, links);
      save();
      render();
      getElement('correction-dialog').close();
      toast('Correction saved. Scores and statistics recalculated.');
    } catch (error) {
      getElement('correction-error').textContent = error.message;
    }
  });
  getElement('correction-restore').addEventListener('click', () => {
    try {
      Engine.restoreDeletion(current(), getElement('correction-restore').dataset.transaction);
      save();
      render();
      getElement('correction-dialog').close();
      toast('Deletion group restored.');
    } catch (error) {
      getElement('correction-error').textContent = error.message;
    }
  });
  function setup() {
    const now = new Date();
    getElement('setup-date').value =
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    getElement('setup-opponent').value = '';
    getElement('setup-category').value = 'friendly';
    open('setup-dialog');
  }
  getElement('new-game-button').addEventListener('click', setup);
  getElement('setup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = getElement('setup-form').querySelector('[type="submit"]');
    if (button.disabled) return;
    if (remoteBase) {
      button.disabled = true;
      button.textContent = 'Checking team roster…';
      try {
        await syncSharedRoster();
      } finally {
        button.disabled = false;
        button.textContent = 'Create game →';
      }
    }
    if (!getElement('setup-dialog').open || !getElement('setup-form').reportValidity()) return;
    run(() => {
      const g = Engine.createGame(
        {
          date: getElement('setup-date').value,
          opponent: getElement('setup-opponent').value,
          category: getElement('setup-category').value,
          minutes: Number(getElement('setup-minutes').value),
          overtimeMinutes: Number(getElement('setup-ot').value)
        },
        state.roster
      );
      if (current()?.running) Engine.pause(current());
      state.games.push(g);
      state.currentGameId = g.id;
      selectedId = null;
      side = 'HOME';
      getElement('setup-dialog').close();
      chooseLineup();
    });
  });
  getElement('finish-button').addEventListener('click', () => {
    const g = current();
    if (!g) return;
    if (g.finalizedAt || g.remote) {
      toast(
        'This game is locked for upload. Only the admin can correct the official record.',
        true
      );
      return;
    }
    if (g.finished) {
      run(() => {
        g.finished = false;
        toast('Game reopened. The clock is paused.');
      });
      return;
    }
    confirm(
      'Finish this game?',
      'The clock will pause and recording will stop. You can export the full event log or reopen the game for corrections.',
      () =>
        run(() => {
          Engine.pause(g);
          g.finished = true;
          toast('Final whistle. Your event log is ready to export.');
        })
    );
  });
  function download(text, name, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  getElement('export-button').addEventListener('click', () =>
    exportResults('events', (g) => Engine.csv(g))
  );
  getElement('backup-button').addEventListener('click', () =>
    download(
      JSON.stringify(Engine.backup(state), null, 2),
      `courtside-backup-${new Date().toISOString().slice(0, 10)}.json`,
      'application/json'
    )
  );
  getElement('recovery-button').addEventListener('click', () =>
    download(
      rawSaved || '',
      `courtside-original-recovery-${new Date().toISOString().slice(0, 10)}.txt`,
      'text/plain;charset=utf-8'
    )
  );
  getElement('restore-button').addEventListener('click', () => getElement('restore-file').click());
  getElement('restore-file').addEventListener('change', async () => {
    const file = getElement('restore-file').files[0];
    if (!file) return;
    try {
      const loaded = JSON.parse(await file.text());
      Engine.validateState(loaded);
      confirm(
        'Restore this backup?',
        `Replace this device’s workspace with ${loaded.games.length} saved games and ${loaded.roster.length} players? Download a backup of your current workspace first if you need to keep it.`,
        () => {
          // Verify the browser can persist the replacement before swapping the in-memory workspace.
          for (const g of loaded.games) if (g.running) Engine.pause(g);
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
          } catch {
            toast(
              'Restore failed: this browser could not save the backup. Current data is unchanged.',
              true
            );
            return;
          }
          state = loaded;
          saveBlocked = false;
          rawSaved = null;
          getElement('recovery-button').hidden = true;
          selectedId = null;
          save();
          render();
          toast('Backup restored. Game clocks are paused.');
        }
      );
    } catch (error) {
      toast(error.message, true);
    } finally {
      getElement('restore-file').value = '';
    }
  });
  for (const [button, view] of [
    ['live-tab', 'live-view'],
    ['box-tab', 'box-view']
  ])
    getElement(button).addEventListener('click', () => {
      getElement('live-view').hidden = view !== 'live-view';
      getElement('box-view').hidden = view !== 'box-view';
      for (const tab of ['live-tab', 'box-tab']) {
        getElement(tab).classList.toggle('active', tab === button);
        getElement(tab).setAttribute('aria-selected', tab === button);
      }
      if (view === 'box-view') renderBox();
    });
  function manage() {
    getElement('manage-list').innerHTML = state.roster
      .map(
        (p) =>
          `<div class="manage-row"><span class="jersey">${p.number}</span><span>${escapeHtml(p.name)}<small>${escapeHtml(p.id)} · ${escapeHtml(Team.status(p))}${p.statusOverride ? ' (manual)' : ''}<br>Enrollment: ${p.enrollmentYear || 'Unknown'}</small></span><button class="text-button" data-edit="${escapeHtml(p.id)}">Edit</button></div>`
      )
      .join('');
  }
  function refreshPregameRosters() {
    let changed = false;
    for (const g of state.games) if (Team.refreshPregameRoster(g, state.roster)) changed = true;
    return changed;
  }
  function applyRoster(roster) {
    state.roster = roster;
    refreshPregameRosters();
    manage();
  }
  const rosterUpdateNote =
    'Games that have not started use the updated roster. Games already started or finished keep their original players. Choose game players to add a new teammate to the squad.';
  function resetPlayerForm() {
    getElement('player-form').reset();
    getElement('editing-player').value = '';
    getElement('save-player').textContent = 'Add player';
    getElement('cancel-edit').hidden = true;
  }
  getElement('roster-button').addEventListener('click', () => {
    resetPlayerForm();
    manage();
    open('roster-dialog');
  });
  getElement('cancel-edit').addEventListener('click', resetPlayerForm);
  getElement('manage-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    const p = state.roster.find((p) => p.id === b.dataset.edit);
    getElement('editing-player').value = p.id;
    getElement('player-name').value = p.name;
    getElement('player-number').value = p.number;
    getElement('player-year').value = p.enrollmentYear || '';
    getElement('player-status').value = p.statusOverride || '';
    getElement('save-player').textContent = 'Save player';
    getElement('cancel-edit').hidden = false;
    getElement('player-name').focus();
  });
  getElement('player-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => {
      const name = getElement('player-name').value.trim(),
        number = Number(getElement('player-number').value),
        id = getElement('editing-player').value;
      if (!name || !Number.isInteger(number) || number < 0 || number > 99)
        throw Error('Enter a player name and a whole jersey number from 0 to 99.');
      const enrollmentYear =
          getElement('player-year').value === '' ? null : Number(getElement('player-year').value),
        statusOverride = getElement('player-status').value || null;
      if (
        enrollmentYear !== null &&
        (!Number.isInteger(enrollmentYear) || enrollmentYear < 1900 || enrollmentYear > 9995)
      )
        throw Error('Enter an enrollment year from 1900 to 9995, or leave it blank.');
      let p = state.roster.find((p) => p.id === id);
      if (p) {
        p.name = name;
        p.number = number;
      } else {
        p = { id: `P_${Engine.uuid()}`, name, number };
        state.roster.push(p);
      }
      Object.assign(p, { enrollmentYear, statusOverride });
      applyRoster(state.roster);
      resetPlayerForm();
      toast('Roster saved. ' + rosterUpdateNote);
    });
  });
  let lineupDraft = null;
  function chooseLineup() {
    const g = current();
    if (!g || g.finished) return;
    if (g.running) Engine.pause(g);
    save();
    render();
    const substitution = !!(g.started && g.lineup);
    lineupDraft = {
      gameId: g.id,
      substitution,
      players: g.roster.map((p) => ({ ...p })),
      squad: new Set(g.squad || []),
      five: new Set(substitution ? g.lineup : g.starters || [])
    };
    getElement('lineup-title').textContent = substitution
      ? 'Substitute players'
      : g.started
        ? 'Choose squad and current five'
        : 'Choose squad and starters';
    getElement('lineup-description').textContent = substitution
      ? 'Clock paused. Select exactly five from this game’s squad. Confirm or cancel, then resume the clock yourself.'
      : 'Select 5–15 designated players, then exactly five ' +
        (g.started
          ? 'currently on court. Earlier minutes remain unavailable.'
          : 'starters. Guests count toward the 15-player limit.');
    getElement('guest-form').hidden = substitution;
    renderLineup();
    open('lineup-dialog');
  }
  function renderLineup() {
    const d = lineupDraft;
    if (!d) return;
    const players = d.players.filter((p) => !d.substitution || d.squad.has(p.id));
    getElement('squad-list').innerHTML =
      players
        .map(
          (p) =>
            `<div class="squad-row"><span class="jersey">${p.number}</span><span class="squad-name">${escapeHtml(p.name)}<small>${p.guest ? 'Guest' : escapeHtml(Team.status(p))}${current().lineup?.includes(p.id) ? ' · On court' : ''}</small></span>${d.substitution ? `<label><input type="checkbox" data-court="${escapeHtml(p.id)}" ${d.five.has(p.id) ? 'checked' : ''}> On court</label>` : `<label><input type="checkbox" data-squad="${escapeHtml(p.id)}" ${d.squad.has(p.id) ? 'checked' : ''}> Squad</label><label><input type="checkbox" data-starter="${escapeHtml(p.id)}" ${d.five.has(p.id) ? 'checked' : ''} ${!d.squad.has(p.id) ? 'disabled' : ''}> ${current().started ? 'On court' : 'Starter'}</label>`}</div>`
        )
        .join('') ||
      '<p class="dialog-description">The roster is empty. Close this window and add university players in Manage, or add guests below.</p>';
    getElement('lineup-count').textContent =
      `${d.squad.size}/15 designated · ${d.five.size}/5 ${d.substitution || current().started ? 'on court' : 'starters'}`;
    getElement('lineup-confirm').disabled =
      d.squad.size < 5 || d.squad.size > 15 || d.five.size !== 5;
  }
  getElement('lineup-button').addEventListener('click', () => run(chooseLineup));
  getElement('squad-list').addEventListener('change', (e) => {
    const d = lineupDraft,
      b = e.target;
    if (!d) return;
    if (b.dataset.squad) {
      const id = b.dataset.squad;
      if (b.checked && d.squad.size >= 15) {
        toast('Choose at most 15 players, including guests.', true);
        renderLineup();
        return;
      }
      b.checked ? d.squad.add(id) : d.squad.delete(id);
      if (!b.checked) d.five.delete(id);
    } else {
      const id = b.dataset.starter || b.dataset.court;
      if (!id) return;
      b.checked ? d.five.add(id) : d.five.delete(id);
    }
    renderLineup();
  });
  getElement('guest-form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(() => {
      const d = lineupDraft;
      if (!d || d.substitution) return;
      const name = getElement('guest-name').value.trim(),
        number = Number(getElement('guest-number').value);
      if (!name || !Number.isInteger(number) || number < 0 || number > 99)
        throw Error('Enter a guest name and jersey number from 0 to 99.');
      if (d.squad.size >= 15) throw Error('The designated squad is full (15 players).');
      const p = { id: `GUEST_${Engine.uuid()}`, name, number, guest: true };
      d.players.push(p);
      d.squad.add(p.id);
      getElement('guest-form').reset();
      renderLineup();
    });
  });
  getElement('lineup-confirm').addEventListener('click', () =>
    run(() => {
      const d = lineupDraft,
        g = current();
      if (!d || g.id !== d.gameId) throw Error('Reopen player selection for this game.');
      if (d.substitution) Team.substitute(g, [...d.five], Date.now());
      else {
        const old = g.roster;
        g.roster = d.players;
        try {
          Team.configure(g, [...d.squad], [...d.five]);
        } catch (e) {
          g.roster = old;
          throw e;
        }
      }
      getElement('lineup-dialog').close();
      lineupDraft = null;
      toast('Five players ready. Start or resume the clock when play begins.');
    })
  );
  getElement('roster-export-button').addEventListener('click', () =>
    run(() =>
      download(Team.rosterCSV(state.roster), 'university_roster.csv', 'text/csv;charset=utf-8')
    )
  );
  getElement('roster-import-button').addEventListener('click', () =>
    getElement('roster-file').click()
  );
  getElement('roster-file').addEventListener('change', async () => {
    const file = getElement('roster-file').files[0];
    if (!file) return;
    try {
      const merged = Team.parseRoster(await file.text(), state.roster);
      const added = merged.filter((p) => !state.roster.some((x) => x.id === p.id));
      const updated = merged.filter((p) => {
        const old = state.roster.find((x) => x.id === p.id);
        return (
          old &&
          ['name', 'number', 'enrollmentYear', 'statusOverride'].some(
            (k) => (old[k] ?? null) !== (p[k] ?? null)
          )
        );
      });
      const fieldLabels = {
        name: 'Name',
        number: 'Jersey',
        enrollmentYear: 'Enrollment year',
        statusOverride: 'Status override'
      };
      const display = (key, value) => value ?? (key === 'statusOverride' ? 'Automatic' : 'Unknown');
      const preview = [
        ...added.map(
          (p) =>
            `Add ${p.id}: ${p.name} (#${p.number}), enrollment ${display('enrollmentYear', p.enrollmentYear)}, status ${display('statusOverride', p.statusOverride)}`
        ),
        ...updated.map((p) => {
          const old = state.roster.find((x) => x.id === p.id);
          return (
            `Update ${p.id}:\n` +
            Object.keys(fieldLabels)
              .filter((k) => (old[k] ?? null) !== (p[k] ?? null))
              .map((k) => `${fieldLabels[k]}: ${display(k, old[k])} → ${display(k, p[k])}`)
              .join('\n')
          );
        })
      ].join('\n\n');
      confirm(
        'Apply roster CSV?',
        `${added.length} additions and ${updated.length} updates. Players absent from this file will be retained. ${rosterUpdateNote}\n\n${preview || 'No changes.'}`,
        () =>
          run(() => {
            applyRoster(merged);
            toast('Roster imported. ' + rosterUpdateNote);
          })
      );
    } catch (e) {
      toast(e.message, true);
    } finally {
      getElement('roster-file').value = '';
    }
  });
  getElement('participation-export-button').addEventListener('click', () =>
    exportResults('participation', (g) => Team.participationCSV(g, Date.now()))
  );
  getElement('history-button').addEventListener('click', () => {
    getElement('history-list').innerHTML =
      [...state.games]
        .reverse()
        .map(
          (g) =>
            `<div class="history-card"><div><strong>vs ${escapeHtml(g.opponent)}</strong><small>${escapeHtml(g.date)} · ${g.finished ? 'Final' : g.started ? 'In progress' : 'Ready'}<br>Our team ${Engine.stats(g, 'HOME').points} – ${Engine.stats(g, 'AWAY').points} Opponent · ${g.gameEvents.length} events</small></div><button class="button subtle" data-game="${escapeHtml(g.id)}">Open</button></div>`
        )
        .join('') || '<div class="empty-state">Your games will appear here.</div>';
    open('history-dialog');
  });
  getElement('history-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-game]');
    if (!b) return;
    run(() => {
      if (current()?.running) Engine.pause(current());
      state.currentGameId = b.dataset.game;
      selectedId = null;
      side = 'HOME';
      getElement('history-dialog').close();
    });
  });

  // The hosted build injects only a public API address. PINs/tokens stay in memory.
  const remoteBase = globalThis.COURTSIDE_CONFIG?.apiBase || '';
  let remoteClient = null,
    uploadBusy = false,
    rosterSyncPromise = null;
  function syncSharedRoster() {
    if (!remoteBase) return Promise.resolve(false);
    if (rosterSyncPromise) return rosterSyncPromise;
    const status = getElement('roster-sync-status');
    status.hidden = false;
    if (saveBlocked) {
      status.textContent =
        'Roster check paused until browser saving is restored. The saved roster was kept.';
      return Promise.resolve(false);
    }
    status.textContent = 'Checking the latest team roster…';
    rosterSyncPromise = (async () => {
      try {
        if (!remoteClient) remoteClient = new RemoteClient.Client(remoteBase);
        const result = await remoteClient.request('/api/roster', 'GET', undefined, 15000);
        if (
          !Array.isArray(result.players) ||
          result.players.some((p) => !p || typeof p.player_id !== 'string' || !p.player_id)
        )
          throw Error('Invalid shared roster response.');
        const official = Team.parseRoster(
          RemoteClient.csv(Team.ROSTER_COLUMNS, result.players),
          []
        );
        Team.applySharedRoster(state, official);
        save();
        manage();
        render();
        if (getElement('lineup-dialog').open && !lineupDraft?.substitution) {
          getElement('lineup-dialog').close();
          chooseLineup();
        }
        status.textContent = `Team roster checked: ${official.length} players · ${new Date().toLocaleTimeString()}. ${current()?.started ? 'This game keeps its original players.' : 'New and unstarted games use the latest Admin roster.'}`;
        return true;
      } catch (error) {
        status.textContent =
          'Could not check the latest team roster. Using the saved roster. ' + error.message;
        return false;
      }
    })().finally(() => {
      rosterSyncPromise = null;
      renderRemote();
    });
    renderRemote();
    return rosterSyncPromise;
  }
  function renderRemote() {
    const g = current();
    getElement('upload-button').hidden = !remoteBase;
    getElement('server-roster-button').hidden = !remoteBase;
    getElement('server-roster-button').disabled = !!rosterSyncPromise;
    getElement('hosted-nav').hidden = !remoteBase;
    if (remoteBase) document.querySelector('.brand').href = 'index.html';
    getElement('upload-complete').disabled = !!g?.remote?.payload;
    if (g?.remote?.payload)
      getElement('upload-complete').checked =
        g.remote.payload.game_details?.stats_complete === true;
    getElement('upload-button').disabled =
      !g?.finished || uploadBusy || g?.remote?.state === 'uploaded';
    getElement('upload-button').textContent = uploadBusy
      ? 'Uploading…'
      : g?.remote?.state === 'uploaded'
        ? 'Uploaded'
        : g?.remote?.state === 'pending'
          ? 'Retry upload'
          : 'Upload finished game';
    if (g?.remote) {
      getElement('finish-button').disabled = true;
      getElement('finish-button').textContent =
        g.remote.state === 'uploaded'
          ? 'Uploaded · admin edits only'
          : 'Upload pending · game locked';
    }
  }
  getElement('upload-button').addEventListener('click', () => {
    if (!current()?.finished || uploadBusy) return;
    getElement('upload-pin').value = '';
    getElement('upload-complete').checked =
      current().remote?.payload?.game_details?.stats_complete === true;
    getElement('upload-complete').disabled = !!current().remote?.payload;
    getElement('upload-status').textContent =
      'Enter the shared scorekeeper PIN. Your game stays saved on this device.';
    open('upload-dialog');
  });
  getElement('upload-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (uploadBusy) return;
    const g = current();
    if (!g?.finished) return;
    uploadBusy = true;
    getElement('upload-submit').disabled = true;
    renderRemote();
    let submissionStarted = false,
      newlyPrepared = false,
      priorUncertainty = false;
    try {
      if (saveBlocked)
        throw Error('Restore saving before uploading. Download a backup to preserve this game.');
      if (!remoteClient) remoteClient = new RemoteClient.Client(remoteBase);
      const pin = getElement('upload-pin').value;
      getElement('upload-pin').value = '';
      getElement('upload-status').textContent =
        'Connecting… A sleeping backend can take about a minute to start.';
      await remoteClient.login(pin, 'scorekeeper');
      newlyPrepared = !g.remote;
      const payload = RemoteClient.prepare(g, Engine, Team, {
        statsComplete: getElement('upload-complete').checked
      });
      priorUncertainty = RemoteClient.begin(g);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      submissionStarted = true;
      const result = await remoteClient.upload(payload);
      if (result.game_id !== g.id)
        throw Error('The server returned an unexpected game. Retry to confirm receipt.');
      g.remote.state = 'uploaded';
      g.remote.version = result.version;
      g.remote.publication = result.publication;
      save();
      getElement('upload-status').textContent =
        result.publication === 'published'
          ? 'Game uploaded and statistics published.'
          : 'Game saved in the database. Public statistics are awaiting publication; your admin can retry.';
      toast('Game uploaded. Only your admin can change the official record.');
    } catch (error) {
      if (submissionStarted) RemoteClient.failed(g, error, priorUncertainty);
      else if (newlyPrepared) delete g.remote;
      save();
      getElement('upload-status').textContent = error.message + ' Your local game is retained.';
      toast(error.message, true);
    } finally {
      if (remoteClient) remoteClient.token = null;
      uploadBusy = false;
      getElement('upload-submit').disabled = false;
      render();
    }
  });
  getElement('server-roster-button').addEventListener('click', async () => {
    if (await syncSharedRoster()) toast('Latest Admin roster downloaded. ' + rosterUpdateNote);
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) renderClock();
  });
  setInterval(renderClock, 200);
  if (!saveBlocked && refreshPregameRosters()) save();
  render();
  if (remoteBase) syncSharedRoster();
  if (!current() && !saveBlocked) setup();
})();
