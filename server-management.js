const notice = document.querySelector('[data-mgmt-notice]');
const shell = document.querySelector('[data-mgmt-shell]');
const pinsLayer = document.querySelector('[data-server-map-pins]');
const roster = document.querySelector('[data-mgmt-roster]');
const rosterCount = document.querySelector('[data-mgmt-roster-count]');
const countEl = document.querySelector('[data-mgmt-count]');
const maxEl = document.querySelector('[data-mgmt-max]');
const queueEl = document.querySelector('[data-mgmt-queue]');
const updatedEl = document.querySelector('[data-mgmt-updated]');
const refreshBtn = document.querySelector('[data-mgmt-refresh]');

const TEAM_TONES = [
  ['sheriff', '#f0c14a'],
  ['police', '#5b9dff'],
  ['trooper', '#6ea3ff'],
  ['highway', '#6ea3ff'],
  ['fire', '#ff6b4a'],
  ['ems', '#ff7a9a'],
  ['dot', '#f0c14a'],
  ['civilian', '#9eb2cc'],
];

let pollTimer = null;
let selectedId = '';

function teamTone(team = '') {
  const value = String(team).toLowerCase();
  for (const [needle, color] of TEAM_TONES) {
    if (value.includes(needle)) return color;
  }
  return '#7dd3fc';
}

function setNotice(message, isError = false) {
  if (!notice) return;
  notice.hidden = !message;
  notice.textContent = message || '';
  notice.classList.toggle('is-error', isError);
}

function formatUpdated(iso) {
  if (!iso) return 'Updated just now';
  const stamp = new Date(iso);
  if (Number.isNaN(stamp.getTime())) return 'Updated just now';
  return `Updated ${stamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}`;
}

function playerKey(player) {
  return String(player.robloxId || player.username || '');
}

function renderMap(players) {
  if (!pinsLayer) return;
  pinsLayer.innerHTML = players.map((player) => {
    const id = playerKey(player);
    const selected = id && id === selectedId ? ' is-selected' : '';
    const title = `${player.username}${player.callsign ? ` · ${player.callsign}` : ''} · ${player.team}`;
    return `<button type="button" class="server-map-pin${selected}" data-player-id="${escapeAttr(id)}" style="left:${(player.left * 100).toFixed(3)}%;top:${(player.top * 100).toFixed(3)}%;--pin:${teamTone(player.team)}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}"><span></span></button>`;
  }).join('');
}

function renderRoster(players) {
  if (!roster) return;
  if (rosterCount) rosterCount.textContent = String(players.length);
  if (!players.length) {
    roster.innerHTML = '<li class="server-roster-empty">Nobody is in-game right now.</li>';
    return;
  }
  roster.innerHTML = players.map((player) => {
    const id = playerKey(player);
    const selected = id && id === selectedId ? ' is-selected' : '';
    const place = player.label || player.postal || 'Liberty County';
    return `<li><button type="button" class="server-roster-row${selected}" data-player-id="${escapeAttr(id)}"><span class="server-roster-dot" style="background:${teamTone(player.team)}"></span><span class="server-roster-copy"><b>${escapeHtml(player.username)}</b><small>${escapeHtml(player.team)}${player.callsign ? ` · ${escapeHtml(player.callsign)}` : ''}</small><em>${escapeHtml(place)}</em></span></button></li>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, '&#39;');
}

async function ensureOwnerAccess() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  const session = await response.json().catch(() => ({}));
  if (!session.authenticated) {
    setNotice('Sign in with Discord to open Server Management.');
    return false;
  }
  if (!session.user?.owner) {
    setNotice('Server Management is restricted to Ownership.', true);
    return false;
  }
  return true;
}

async function loadMap(silent = false) {
  if (!silent) refreshBtn && (refreshBtn.disabled = true);
  try {
    const response = await fetch('/api/owner/erlc-map', { credentials: 'same-origin' });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setNotice('Sign in with Discord to open Server Management.');
      if (shell) shell.hidden = true;
      return;
    }
    if (response.status === 403) {
      setNotice('Server Management is restricted to Ownership.', true);
      if (shell) shell.hidden = true;
      return;
    }
    if (!response.ok) throw new Error(result.error || 'Could not load the in-game map');

    const players = Array.isArray(result.players) ? result.players : [];
    if (selectedId && !players.some((player) => playerKey(player) === selectedId)) selectedId = '';
    if (countEl) countEl.textContent = String(Number(result.currentPlayers) || players.length);
    if (maxEl) maxEl.textContent = String(Number(result.maxPlayers) || 40);
    if (queueEl) queueEl.textContent = String(Number(result.queue) || 0);
    if (updatedEl) updatedEl.textContent = formatUpdated(result.updatedAt);
    renderMap(players);
    renderRoster(players);
    if (shell) shell.hidden = false;
    setNotice('');
  } catch (error) {
    setNotice(error.message || 'Could not load the in-game map.', true);
  } finally {
    if (refreshBtn) refreshBtn.disabled = false;
  }
}

function selectPlayer(id) {
  selectedId = String(id || '');
  pinsLayer?.querySelectorAll('.server-map-pin').forEach((pin) => {
    pin.classList.toggle('is-selected', pin.dataset.playerId === selectedId);
  });
  roster?.querySelectorAll('.server-roster-row').forEach((row) => {
    row.classList.toggle('is-selected', row.dataset.playerId === selectedId);
  });
}

pinsLayer?.addEventListener('click', (event) => {
  const pin = event.target.closest('[data-player-id]');
  if (pin) selectPlayer(pin.dataset.playerId);
});

roster?.addEventListener('click', (event) => {
  const row = event.target.closest('[data-player-id]');
  if (!row) return;
  selectPlayer(row.dataset.playerId);
  const pin = pinsLayer?.querySelector(`[data-player-id="${CSS.escape(row.dataset.playerId)}"]`);
  pin?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
});

refreshBtn?.addEventListener('click', () => { void loadMap(); });

(async () => {
  const allowed = await ensureOwnerAccess();
  if (!allowed) return;
  await loadMap();
  pollTimer = window.setInterval(() => { void loadMap(true); }, 15000);
})();

window.addEventListener('beforeunload', () => {
  if (pollTimer) window.clearInterval(pollTimer);
});
