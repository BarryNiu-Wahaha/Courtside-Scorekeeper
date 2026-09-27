(() => {
  'use strict';
  const getElement = (id) => document.getElementById(id),
    Remote = RemoteClient;
  let client,
    detail = null,
    eventCSV = null,
    participationCSV = null,
    roster = [],
    busy = false,
    rosterLoaded = false;
  const createElement = (tag, text) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const notice = (text, error = false) => {
    getElement('admin-status').textContent = text;
    getElement('admin-status').className = 'status' + (error ? ' error' : '');
  };
  const input = (value, type = 'text', change = () => {}) => {
    const n = createElement('input');
    n.type = type;
    n.value = value ?? '';
    n.oninput = () => change(n.type === 'checkbox' ? n.checked : n.value);
    return n;
  };
  function select(options, value, change) {
    const n = createElement('select');
    for (const [v, label] of options) {
      const o = createElement('option', label);
      o.value = v;
      n.append(o);
    }
    n.value = value;
    n.onchange = () => change(n.value);
    return n;
  }
  function table(headers, rows) {
    const t = createElement('table');
    t.className = 'edit-table';
    const h = createElement('tr');
    headers.forEach((x) => h.append(createElement('th', x)));
    const head = createElement('thead');
    head.append(h);
    t.append(head);
    const b = createElement('tbody');
    for (const cells of rows) {
      const row = createElement('tr');
      for (const value of cells) {
        const c = createElement('td');
        c.append(value instanceof Node ? value : document.createTextNode(String(value ?? '')));
        row.append(c);
      }
      b.append(row);
    }
    t.append(b);
    return t;
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    const controls = [...document.querySelectorAll('button,input,select')].map((n) => [
      n,
      n.disabled
    ]);
    controls.forEach(([n]) => (n.disabled = true));
    try {
      await action();
    } catch (e) {
      notice(e.message, true);
      if (e.status === 401) {
        getElement('login-form').hidden = false;
        getElement('admin-pin').focus();
      }
    } finally {
      busy = false;
      controls.forEach(([n, disabled]) => (n.disabled = disabled));
    }
  }
  function showPublication(p) {
    const state = typeof p === 'string' ? p : p?.publication || p?.state || p?.status;
    getElement('publication').textContent =
      state === 'published'
        ? 'Public statistics are up to date.'
        : 'Public statistics are awaiting publication. Use Publish latest statistics to retry.';
  }
  async function loadGames() {
    const data = await client.request('/api/admin/games');
    showPublication(data.publication);
    getElement('admin-games').replaceChildren(
      table(
        ['Date', 'Opponent', 'State', 'Actions'],
        data.games.map((g) => {
          const actions = createElement('div');
          actions.className = 'actions';
          const edit = createElement('button', 'Edit');
          edit.onclick = () => run(() => openGame(g.game_id));
          const toggle = createElement('button', g.deleted ? 'Restore' : 'Delete');
          toggle.className = g.deleted ? 'secondary' : 'danger';
          toggle.onclick = () => {
            if (
              !confirm(
                (g.deleted ? 'Restore' : 'Delete') +
                  ' game vs ' +
                  g.opponent +
                  ' on ' +
                  g.game_date +
                  '?'
              )
            )
              return;
            run(async () => {
              const response = await client.request(
                '/api/admin/games/' +
                  encodeURIComponent(g.game_id) +
                  (g.deleted ? '/restore' : '/delete'),
                'POST',
                { version: g.version }
              );
              notice(
                (g.deleted ? 'Game restored.' : 'Game deleted from the official record.') +
                  ' Publication: ' +
                  response.publication
              );
              if (detail?.game_id === g.game_id) {
                detail = null;
                getElement('editor').hidden = true;
              }
              await loadGames();
            });
          };
          actions.append(edit, toggle);
          return [g.game_date, g.opponent, g.deleted ? 'Deleted' : 'Active', actions];
        })
      )
    );
  }
  async function loadRoster() {
    const data = await client.request('/api/admin/roster');
    roster = data.players;
    rosterLoaded = true;
    renderRoster();
  }
  function renderRoster() {
    getElement('roster-editor').replaceChildren(
      table(
        ['Player ID', 'Name', 'Jersey', 'Enrollment year', 'Status override'],
        roster.map((p) => [
          p.player_id,
          input(p.player_name, 'text', (v) => (p.player_name = v)),
          input(p.jersey_number, 'number', (v) => (p.jersey_number = v)),
          input(p.enrollment_year, 'number', (v) => (p.enrollment_year = v)),
          select(
            [
              ['', 'Automatic'],
              ['Astudent', 'Student'],
              ['graduated', 'Graduated']
            ],
            p.status_override || '',
            (v) => (p.status_override = v)
          )
        ])
      )
    );
  }
  async function openGame(id) {
    if (detail && !confirm('Discard the current unsaved game edits?')) return;
    detail = await client.request('/api/admin/games/' + encodeURIComponent(id));
    eventCSV = Remote.parseCSV(detail.upload.events_csv);
    participationCSV = Remote.parseCSV(detail.upload.participation_csv);
    const metadata = participationCSV.rows[0] || eventCSV.rows[0] || detail;
    const gd = detail.upload.game_details || {};
    getElement('edit-category').value = gd.category || '';
    getElement('edit-duration').value = gd.duration_ms == null ? '' : gd.duration_ms / 60000;
    getElement('edit-complete').checked = gd.stats_complete === true;
    getElement('edit-date').value = metadata.game_date || '';
    getElement('edit-opponent').value = metadata.opponent || '';
    getElement('legacy-participation-note').hidden = participationCSV.rows.length > 0;
    getElement('editor-title').textContent =
      'Edit ' + detail.game_id + (detail.deleted ? ' (deleted)' : '');
    getElement('editor').hidden = false;
    renderEvents();
    renderParticipation();
    getElement('editor').scrollIntoView({ behavior: 'smooth' });
  }
  const types = [
    '2PT_MADE',
    '2PT_MISSED',
    '3PT_MADE',
    '3PT_MISSED',
    'FT_MADE',
    'FT_MISSED',
    'OFF_REBOUND',
    'DEF_REBOUND',
    'ASSIST',
    'STEAL',
    'BLOCK',
    'TURNOVER',
    'FOUL'
  ];
  function setPlayer(row, id) {
    const p = participationCSV.rows.find((p) => p.player_id === id);
    row.player_id = p?.player_id || '';
    row.player_name = p?.player_name || '';
    row.jersey_number = p?.jersey_number ?? '';
  }
  function renderEvents() {
    getElement('event-editor').replaceChildren(
      table(
        ['ID', 'Side', 'Player', 'Period', 'Clock', 'Event', 'Voided'],
        eventCSV.rows.map((r) => {
          const side = select(
            [
              ['HOME', 'Our team'],
              ['AWAY', 'Opponent']
            ],
            r.team_side,
            (v) => {
              r.team_side = v;
              setPlayer(r, v === 'HOME' ? participationCSV.rows[0].player_id : '');
              renderEvents();
            }
          );
          side.disabled = !participationCSV.rows.length;
          const player = select(
            [
              ['', 'Opponent'],
              ...(!participationCSV.rows.length && r.player_id
                ? [[r.player_id, r.player_name]]
                : []),
              ...participationCSV.rows.map((p) => [
                p.player_id,
                p.player_name + ' #' + p.jersey_number
              ])
            ],
            r.player_id,
            (v) => setPlayer(r, v)
          );
          player.className = 'player-select';
          player.disabled = r.team_side === 'AWAY' || !participationCSV.rows.length;
          if (r.team_side === 'HOME') player.querySelector('option').disabled = true;
          const type = select(
            types.map((t) => [t, t]),
            r.event_type,
            (v) => {
              r.event_type = v;
              r.points_value = { '2PT_MADE': 2, '3PT_MADE': 3, FT_MADE: 1 }[v] || 0;
            }
          );
          const voided = input('', 'checkbox', (v) => (r.is_voided = String(v)));
          voided.checked = r.is_voided === 'true';
          voided.setAttribute('aria-label', 'Void event ' + r.event_id);
          return [
            r.event_id,
            side,
            player,
            input(r.quarter, 'text', (v) => (r.quarter = v)),
            input(r.game_clock, 'text', (v) => (r.game_clock = v)),
            type,
            voided
          ];
        })
      )
    );
  }
  function renderParticipation() {
    getElement('participation-editor').replaceChildren(
      table(
        ['Player', 'Designated', 'Starters', 'Played', 'Minutes'],
        participationCSV.rows.map((r) => [
          r.player_name,
          input(r.designated_count, 'number', (v) => (r.designated_count = v)),
          input(r.starter_count, 'number', (v) => (r.starter_count = v)),
          input(r.played_count, 'number', (v) => (r.played_count = v)),
          (() => {
            const n = input(
              Number(r.played_ms) / 60000,
              'number',
              (v) => (r.played_ms = String(Math.round(Number(v) * 60000)))
            );
            n.step = 'any';
            n.min = '0';
            return n;
          })()
        ])
      )
    );
  }
  getElement('login-form').onsubmit = (e) => {
    e.preventDefault();
    run(async () => {
      if (!client) client = new Remote.Client(COURTSIDE_CONFIG.apiBase);
      const pin = getElement('admin-pin').value;
      getElement('admin-pin').value = '';
      await client.login(pin, 'admin');
      getElement('login-form').hidden = true;
      getElement('admin-workspace').hidden = false;
      notice('Admin unlocked.');
      if (!detail) await loadGames();
      if (!rosterLoaded) await loadRoster();
    });
  };
  getElement('logout').onclick = () => {
    if (!confirm('Discard unsaved edits and lock admin?')) return;
    if (client) client.token = null;
    detail = null;
    rosterLoaded = false;
    getElement('editor').hidden = true;
    getElement('admin-workspace').hidden = true;
    getElement('login-form').hidden = false;
    notice('Admin locked.');
  };
  getElement('refresh').onclick = () => run(loadGames);
  getElement('publish').onclick = () =>
    run(async () => {
      notice('Publishing latest results…');
      const result = await client.request('/api/admin/publish', 'POST', {});
      showPublication(result.publication ?? result);
      notice('Publication: ' + (result.publication || result.status || 'complete'));
    });
  getElement('cancel-edit').onclick = () => {
    if (confirm('Close this editor and discard unsaved changes?')) {
      detail = null;
      getElement('editor').hidden = true;
    }
  };
  getElement('add-event').onclick = () => {
    if (!detail) return;
    if (!participationCSV.rows.length) {
      notice('Import participation for this game before adding plays.', true);
      return;
    }
    const first = participationCSV.rows[0],
      p = first;
    eventCSV.rows.push({
      game_id: detail.game_id,
      event_id: String(Math.max(0, ...eventCSV.rows.map((r) => Number(r.event_id))) + 1),
      game_date: first.game_date,
      opponent: first.opponent,
      player_id: p.player_id,
      player_name: p.player_name,
      jersey_number: p.jersey_number,
      quarter: '1',
      game_clock: '00:00',
      event_type: '2PT_MADE',
      points_value: 2,
      recorded_at: new Date().toISOString(),
      team_side: 'HOME',
      is_voided: 'false'
    });
    renderEvents();
  };
  getElement('save-game').onclick = () =>
    run(async () => {
      if (!detail) return;
      if (!participationCSV.rows.length)
        throw Error('Import participation for this game before saving corrections.');
      const date = getElement('edit-date').value,
        opponent = getElement('edit-opponent').value.trim();
      if (!date || !opponent) throw Error('Enter the game date and opponent.');
      for (const r of [...eventCSV.rows, ...participationCSV.rows]) {
        r.game_date = date;
        r.opponent = opponent;
      }
      const revision = Math.max(Date.now(), Number(participationCSV.rows[0].revision) + 1);
      participationCSV.rows.forEach((r) => (r.revision = String(revision)));
      const duration =
        getElement('edit-duration').value === ''
          ? null
          : Math.round(Number(getElement('edit-duration').value) * 60000);
      if (
        duration !== null &&
        (!Number.isSafeInteger(duration) || duration <= 0 || duration > 86400000)
      )
        throw Error('Enter a positive game duration up to 1440 minutes, or leave it blank.');
      const upload = {
        schema_version: detail.upload.schema_version,
        finished: true,
        events_csv: Remote.csv(eventCSV.columns, eventCSV.rows),
        participation_csv: Remote.csv(participationCSV.columns, participationCSV.rows),
        game_details: {
          category: getElement('edit-category').value || null,
          duration_ms: duration,
          stats_complete: getElement('edit-complete').checked
        }
      };
      if (detail.upload.schema_version === 2) {
        const old = new Map(detail.upload.lineups.snapshots.map((s) => [s.event_id, s]));
        upload.lineups = {
          version: 1,
          snapshots: eventCSV.rows.map(
            (e) =>
              old.get(Number(e.event_id)) || {
                event_id: Number(e.event_id),
                status: 'unknown',
                members: []
              }
          )
        };
      }
      const result = await client.request(
        '/api/admin/games/' + encodeURIComponent(detail.game_id),
        'PUT',
        { version: detail.version, upload }
      );
      detail.version = result.version;
      detail.upload = upload;
      notice('Corrections saved. Publication: ' + result.publication);
      await loadGames();
    });
  getElement('participation-file').onchange = () => {
    const file = getElement('participation-file').files[0];
    if (!file || !detail) return;
    run(async () => {
      const parsed = Remote.parseCSV(await file.text());
      if (!parsed.rows.length || parsed.rows.some((r) => r.game_id !== detail.game_id))
        throw Error('Choose a participation CSV for this exact game.');
      const needed = [
        'game_id',
        'game_date',
        'opponent',
        'revision',
        'coverage',
        'player_id',
        'player_name',
        'jersey_number',
        'designated_count',
        'starter_count',
        'played_count',
        'played_ms'
      ];
      if (
        parsed.columns.length !== needed.length ||
        needed.some((k) => !parsed.columns.includes(k))
      )
        throw Error('Invalid participation CSV columns.');
      participationCSV = parsed;
      getElement('legacy-participation-note').hidden = true;
      renderEvents();
      renderParticipation();
      notice('Participation loaded into the editor. Save game corrections to apply it.');
    }).finally(() => (getElement('participation-file').value = ''));
  };
  getElement('add-player').onclick = () => {
    const id = 'P_' + crypto.randomUUID();
    roster.push({
      player_id: id,
      player_name: '',
      jersey_number: 0,
      enrollment_year: null,
      status_override: null
    });
    renderRoster();
  };
  getElement('save-roster').onclick = () =>
    run(async () => {
      const result = await client.request('/api/admin/roster', 'PUT', {
        roster_csv: Remote.csv(
          ['player_id', 'player_name', 'jersey_number', 'enrollment_year', 'status_override'],
          roster
        )
      });
      notice('Roster saved. Publication: ' + (result.publication || 'pending'));
      await loadRoster();
    });
  if (!COURTSIDE_CONFIG.apiBase)
    notice('The backend address has not been configured for this deployment.', true);
})();
