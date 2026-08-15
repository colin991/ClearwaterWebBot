const notice = document.querySelector('[data-mgmt-notice]');
const shell = document.querySelector('[data-mgmt-shell]');
const mapViewport = document.querySelector('[data-server-map-viewport]');
const mapScene = document.querySelector('[data-server-map-scene]');
const mapView = document.querySelector('[data-server-map-view]');
const pinsLayer = document.querySelector('[data-server-map-pins]');
const marquee = document.querySelector('[data-server-map-marquee]');
const roster = document.querySelector('[data-mgmt-roster]');
const rosterCount = document.querySelector('[data-mgmt-roster-count]');
const countEl = document.querySelector('[data-mgmt-count]');
const maxEl = document.querySelector('[data-mgmt-max]');
const queueEl = document.querySelector('[data-mgmt-queue]');
const updatedEl = document.querySelector('[data-mgmt-updated]');
const refreshLine = document.querySelector('[data-mgmt-refresh-line]');
const selectionEl = document.querySelector('[data-mgmt-selection]');
const reasonInput = document.querySelector('[data-mgmt-reason]');
const clearBtn = document.querySelector('[data-mgmt-clear]');
const actionButtons = [...document.querySelectorAll('[data-mgmt-action]')];
const commandForm = document.querySelector('[data-mgmt-command-form]');
const commandInput = document.querySelector('[data-mgmt-command]');
const commandRunBtn = document.querySelector('[data-mgmt-command-run]');
const commandStatus = document.querySelector('[data-mgmt-command-status]');
const commandPresets = [...document.querySelectorAll('[data-mgmt-preset]')];
const searchInput = document.querySelector('[data-mgmt-search]');
const teamFilterButtons = [...document.querySelectorAll('[data-mgmt-team]')];
const selectFilteredBtn = document.querySelector('[data-mgmt-select-filtered]');
const copySelectedBtn = document.querySelector('[data-mgmt-copy-selected]');
const focusSelectedBtn = document.querySelector('[data-mgmt-focus-selected]');
const teamStatsEl = document.querySelector('[data-mgmt-team-stats]');
const logList = document.querySelector('[data-mgmt-log]');
const logClearBtn = document.querySelector('[data-mgmt-log-clear]');
const zoomInBtn = document.querySelector('[data-map-zoom-in]');
const zoomOutBtn = document.querySelector('[data-map-zoom-out]');
const zoomResetBtn = document.querySelector('[data-map-zoom-reset]');
const zoomLabel = document.querySelector('[data-map-zoom-label]');

const TEAM_TONES = [
  ['sheriff', '#8b7355'],
  ['fire', '#e23b2f'],
  ['ems', '#e23b2f'],
  ['dot', '#f0c014'],
  ['transit', '#f0c014'],
  ['police', '#3d7eff'],
  ['trooper', '#3d7eff'],
  ['highway', '#3d7eff'],
  ['fhp', '#3d7eff'],
  ['civilian', '#f4f6f8'],
  ['civ', '#f4f6f8'],
];

const TEAM_FILTERS = {
  all: () => true,
  police: (team) => /police|trooper|highway|fhp/.test(team),
  sheriff: (team) => /sheriff/.test(team),
  fire: (team) => /fire|ems/.test(team),
  dot: (team) => /dot|transit/.test(team),
  civilian: (team) => /civ|civilian/.test(team) || !/police|trooper|highway|fhp|sheriff|fire|ems|dot|transit/.test(team),
};

const REFRESH_MS = 4000;
const DRAG_THRESHOLD = 6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

let pollTimer = null;
let countdownTimer = null;
let nextRefreshAt = 0;
let playersCache = [];
let selectedIds = new Set();
let busy = false;
let dragState = null;
let panState = null;
let teamFilter = 'all';
let searchQuery = '';
let mapZoom = 1;
let mapPanX = 0;
let mapPanY = 0;
const sessionLog = [];

function teamTone(team = '') {
  const value = String(team).toLowerCase();
  for (const [needle, color] of TEAM_TONES) {
    if (value.includes(needle)) return color;
  }
  return '#c5d0de';
}

function avatarUrlFor(player) {
  if (player?.avatarUrl) return String(player.avatarUrl);
  const id = String(player?.robloxId || '').replace(/[^\d]/g, '');
  if (!id) return '';
  return `/api/roblox-avatar?userId=${encodeURIComponent(id)}`;
}

function initialsFor(player) {
  const name = String(player?.username || '?').trim();
  return (name.slice(0, 1) || '?').toUpperCase();
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

function playerMatchesFilters(player) {
  const team = String(player.team || '').toLowerCase();
  if (!(TEAM_FILTERS[teamFilter] || TEAM_FILTERS.all)(team)) return false;
  if (!searchQuery) return true;
  const hay = `${player.username || ''} ${player.callsign || ''} ${player.label || ''} ${player.team || ''}`.toLowerCase();
  return hay.includes(searchQuery);
}

function filteredPlayers() {
  return playersCache.filter(playerMatchesFilters);
}

function selectedPlayers() {
  return playersCache.filter((player) => selectedIds.has(playerKey(player)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function applyMapTransform() {
  if (!mapScene || !mapViewport) return;
  const rect = mapViewport.getBoundingClientRect();
  if (mapZoom <= 1.001) {
    mapZoom = 1;
    mapPanX = 0;
    mapPanY = 0;
  } else {
    const maxX = ((mapZoom - 1) * rect.width) / 2;
    const maxY = ((mapZoom - 1) * rect.height) / 2;
    mapPanX = clamp(mapPanX, -maxX, maxX);
    mapPanY = clamp(mapPanY, -maxY, maxY);
  }
  mapScene.style.transform = `translate(${mapPanX.toFixed(2)}px, ${mapPanY.toFixed(2)}px) scale(${mapZoom})`;
  if (zoomLabel) zoomLabel.textContent = `${Math.round(mapZoom * 100)}%`;
  mapViewport.classList.toggle('is-zoomed', mapZoom > 1.001);
}

function setMapZoom(nextZoom, { focusX = 0.5, focusY = 0.5 } = {}) {
  if (!mapViewport) return;
  const rect = mapViewport.getBoundingClientRect();
  const prev = mapZoom;
  mapZoom = clamp(Number(nextZoom) || 1, MIN_ZOOM, MAX_ZOOM);
  if (rect.width && rect.height && prev > 0) {
    const focusPxX = (focusX - 0.5) * rect.width * prev;
    const focusPxY = (focusY - 0.5) * rect.height * prev;
    mapPanX += focusPxX * (1 - mapZoom / prev);
    mapPanY += focusPxY * (1 - mapZoom / prev);
  }
  applyMapTransform();
}

function resetMapView() {
  mapZoom = 1;
  mapPanX = 0;
  mapPanY = 0;
  applyMapTransform();
}

function focusOnPlayer(player) {
  if (!player || !Number.isFinite(player.left) || !Number.isFinite(player.top)) return;
  mapZoom = Math.max(mapZoom, 2.25);
  if (!mapViewport) return;
  const rect = mapViewport.getBoundingClientRect();
  mapPanX = (0.5 - player.left) * rect.width * mapZoom;
  mapPanY = (0.5 - player.top) * rect.height * mapZoom;
  applyMapTransform();
}

function pushLog(message, isError = false) {
  if (!message) return;
  sessionLog.unshift({
    at: new Date(),
    message: String(message),
    isError: Boolean(isError),
  });
  if (sessionLog.length > 40) sessionLog.length = 40;
  renderLog();
}

function renderLog() {
  if (!logList) return;
  if (!sessionLog.length) {
    logList.innerHTML = '<li class="server-mgmt-log-empty">Actions you run here show up for this session.</li>';
    return;
  }
  logList.innerHTML = sessionLog.map((entry) => {
    const time = entry.at.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    return `<li class="${entry.isError ? 'is-error' : ''}"><time>${escapeHtml(time)}</time><span>${escapeHtml(entry.message)}</span></li>`;
  }).join('');
}

function renderTeamStats(players) {
  if (!teamStatsEl) return;
  const counts = { police: 0, sheriff: 0, fire: 0, dot: 0, civilian: 0 };
  players.forEach((player) => {
    const team = String(player.team || '').toLowerCase();
    if (TEAM_FILTERS.police(team)) counts.police += 1;
    else if (TEAM_FILTERS.sheriff(team)) counts.sheriff += 1;
    else if (TEAM_FILTERS.fire(team)) counts.fire += 1;
    else if (TEAM_FILTERS.dot(team)) counts.dot += 1;
    else counts.civilian += 1;
  });
  teamStatsEl.textContent = `PD ${counts.police} · Sheriff ${counts.sheriff} · Fire ${counts.fire} · DOT ${counts.dot} · Civ ${counts.civilian}`;
}

function updateSelectionUi() {
  const count = selectedIds.size;
  if (selectionEl) {
    selectionEl.textContent = count
      ? `${count} player${count === 1 ? '' : 's'} selected`
      : 'Drag on the map to select players.';
  }
  actionButtons.forEach((button) => {
    button.disabled = busy || count === 0;
  });
  if (clearBtn) clearBtn.disabled = busy || count === 0;
  if (reasonInput) reasonInput.disabled = busy;
  if (copySelectedBtn) copySelectedBtn.disabled = busy || count === 0;
  if (focusSelectedBtn) focusSelectedBtn.disabled = busy || count === 0;

  pinsLayer?.querySelectorAll('.server-map-pin').forEach((pin) => {
    pin.classList.toggle('is-selected', selectedIds.has(pin.dataset.playerId));
  });
  roster?.querySelectorAll('.server-roster-row').forEach((row) => {
    row.classList.toggle('is-selected', selectedIds.has(row.dataset.playerId));
  });
}

function renderMap(players) {
  if (!pinsLayer) return;
  const visible = new Set(filteredPlayers().map(playerKey));
  pinsLayer.innerHTML = players.map((player) => {
    const id = playerKey(player);
    const selected = selectedIds.has(id) ? ' is-selected' : '';
    const hidden = visible.has(id) ? '' : ' is-filtered-out';
    const title = `${player.username}${player.callsign ? ` · ${player.callsign}` : ''} · ${player.team}`;
    const avatar = avatarUrlFor(player);
    const media = avatar
      ? `<img src="${escapeAttr(avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-pin-avatar />`
      : `<span class="server-map-pin-fallback">${escapeHtml(initialsFor(player))}</span>`;
    return `<button type="button" class="server-map-pin${selected}${hidden}" data-player-id="${escapeAttr(id)}" data-initials="${escapeAttr(initialsFor(player))}" style="left:${(player.left * 100).toFixed(3)}%;top:${(player.top * 100).toFixed(3)}%;--pin:${teamTone(player.team)}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${media}</button>`;
  }).join('');
}

function renderRoster(players) {
  if (!roster) return;
  const list = players.filter(playerMatchesFilters);
  if (rosterCount) rosterCount.textContent = String(list.length);
  if (!list.length) {
    roster.innerHTML = `<li class="server-roster-empty">${players.length ? 'No players match this filter.' : 'Nobody is in-game right now.'}</li>`;
    return;
  }
  roster.innerHTML = list.map((player) => {
    const id = playerKey(player);
    const selected = selectedIds.has(id) ? ' is-selected' : '';
    const place = player.label || player.postal || 'Liberty County';
    const avatar = avatarUrlFor(player);
    const media = avatar
      ? `<img class="server-roster-avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="--pin:${teamTone(player.team)}" />`
      : `<span class="server-roster-dot" style="background:${teamTone(player.team)}"></span>`;
    return `<li><button type="button" class="server-roster-row${selected}" data-player-id="${escapeAttr(id)}">${media}<span class="server-roster-copy"><b>${escapeHtml(player.username)}</b><small>${escapeHtml(player.team)}${player.callsign ? ` · ${escapeHtml(player.callsign)}` : ''}</small><em>${escapeHtml(place)}</em></span></button></li>`;
  }).join('');
}

function refreshViews() {
  renderMap(playersCache);
  renderRoster(playersCache);
  renderTeamStats(playersCache);
  updateSelectionUi();
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

function setSelected(ids, { additive = false } = {}) {
  if (!additive) selectedIds = new Set(ids);
  else ids.forEach((id) => selectedIds.add(id));
  updateSelectionUi();
}

function clearSelection() {
  selectedIds = new Set();
  updateSelectionUi();
}

function toggleSelected(id) {
  if (!id) return;
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  updateSelectionUi();
}

function updateCountdown() {
  if (!refreshLine) return;
  if (busy) {
    refreshLine.textContent = 'Auto-refresh paused while running commands';
    return;
  }
  if (dragState || panState) {
    refreshLine.textContent = panState ? 'Auto-refresh paused while panning' : 'Auto-refresh paused while selecting';
    return;
  }
  const remaining = Math.max(0, Math.ceil((nextRefreshAt - Date.now()) / 1000));
  refreshLine.textContent = remaining > 0
    ? `Auto-refresh in ${remaining}s`
    : 'Auto-refreshing…';
}

function schedulePoll() {
  nextRefreshAt = Date.now() + REFRESH_MS;
  updateCountdown();
}

async function ensureOwnerAccess() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  const session = await response.json().catch(() => ({}));
  if (!session.authenticated) {
    setNotice('Sign in with Discord to open Server Management.');
    return false;
  }
  if (!session.user?.owner && !session.user?.serverManagement && !session.user?.staffPanel) {
    setNotice('Server Management is restricted to Management and Ownership.', true);
    return false;
  }
  return true;
}

async function loadMap(silent = false) {
  if (busy || dragState || panState) return;
  try {
    const response = await fetch('/api/owner/erlc-map', { credentials: 'same-origin' });
    const result = await response.json().catch(() => ({}));
    if (response.status === 401) {
      setNotice('Sign in with Discord to open Server Management.');
      if (shell) shell.hidden = true;
      return;
    }
    if (response.status === 403) {
      setNotice('Server Management is restricted to Management and Ownership.', true);
      if (shell) shell.hidden = true;
      return;
    }
    if (!response.ok) throw new Error(result.error || 'Could not load the in-game map');

    playersCache = Array.isArray(result.players) ? result.players : [];
    const alive = new Set(playersCache.map(playerKey).filter(Boolean));
    selectedIds = new Set([...selectedIds].filter((id) => alive.has(id)));

    if (countEl) countEl.textContent = String(Number(result.currentPlayers) || playersCache.length);
    if (maxEl) maxEl.textContent = String(Number(result.maxPlayers) || 40);
    if (queueEl) queueEl.textContent = String(Number(result.queue) || 0);
    if (updatedEl) updatedEl.textContent = formatUpdated(result.updatedAt);
    refreshViews();
    if (shell) shell.hidden = false;
    if (!silent) setNotice('');
    schedulePoll();
  } catch (error) {
    setNotice(error.message || 'Could not load the in-game map.', true);
    schedulePoll();
  }
}

function mapPointFromEvent(event) {
  const rect = mapViewport?.getBoundingClientRect();
  if (!rect?.width || !rect.height) return null;
  const x = 0.5 + ((event.clientX - rect.left - rect.width / 2 - mapPanX) / (rect.width * mapZoom));
  const y = 0.5 + ((event.clientY - rect.top - rect.height / 2 - mapPanY) / (rect.height * mapZoom));
  return {
    x: clamp(x, 0, 1),
    y: clamp(y, 0, 1),
  };
}

function updateMarquee(start, current) {
  if (!marquee || !start || !current) return;
  const left = Math.min(start.x, current.x);
  const top = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);
  marquee.hidden = false;
  marquee.style.left = `${left * 100}%`;
  marquee.style.top = `${top * 100}%`;
  marquee.style.width = `${width * 100}%`;
  marquee.style.height = `${height * 100}%`;
}

function hideMarquee() {
  if (!marquee) return;
  marquee.hidden = true;
  marquee.style.width = '0';
  marquee.style.height = '0';
}

function playersInBox(start, end) {
  const left = Math.min(start.x, end.x);
  const right = Math.max(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const bottom = Math.max(start.y, end.y);
  return filteredPlayers()
    .filter((player) => (
      player.left >= left
      && player.left <= right
      && player.top >= top
      && player.top <= bottom
    ))
    .map(playerKey)
    .filter(Boolean);
}

function endDrag(event) {
  if (!dragState) return;
  const state = dragState;
  dragState = null;
  hideMarquee();
  mapView?.classList.remove('is-selecting');
  mapViewport?.classList.remove('is-selecting');
  updateCountdown();

  const point = mapPointFromEvent(event) || state.current || state.start;
  const moved = Math.hypot(
    (point.x - state.start.x) * ((mapViewport?.clientWidth || 1) * mapZoom),
    (point.y - state.start.y) * ((mapViewport?.clientHeight || 1) * mapZoom),
  );

  if (moved < DRAG_THRESHOLD) {
    if (state.pinId) {
      if (state.additive) toggleSelected(state.pinId);
      else setSelected([state.pinId]);
    } else if (!state.additive) {
      clearSelection();
    }
    return;
  }

  const ids = playersInBox(state.start, point);
  if (state.additive) setSelected(ids, { additive: true });
  else setSelected(ids);
}

function endPan() {
  if (!panState) return;
  panState = null;
  mapViewport?.classList.remove('is-panning');
  updateCountdown();
}

mapViewport?.addEventListener('pointerdown', (event) => {
  if (busy) return;
  const wantsPan = event.altKey || event.button === 1 || event.button === 2;
  if (wantsPan) {
    if (mapZoom <= 1.001) return;
    panState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: mapPanX,
      originY: mapPanY,
    };
    mapViewport.classList.add('is-panning');
    mapViewport.setPointerCapture?.(event.pointerId);
    updateCountdown();
    event.preventDefault();
    return;
  }
  if (event.button !== 0) return;
  const point = mapPointFromEvent(event);
  if (!point) return;
  const pin = event.target.closest?.('[data-player-id]');
  dragState = {
    pointerId: event.pointerId,
    start: point,
    current: point,
    pinId: pin?.dataset?.playerId || '',
    additive: event.shiftKey || event.metaKey || event.ctrlKey,
  };
  mapView?.classList.add('is-selecting');
  mapViewport.classList.add('is-selecting');
  mapViewport.setPointerCapture?.(event.pointerId);
  updateCountdown();
  event.preventDefault();
});

mapViewport?.addEventListener('pointermove', (event) => {
  if (panState && event.pointerId === panState.pointerId) {
    mapPanX = panState.originX + (event.clientX - panState.startX);
    mapPanY = panState.originY + (event.clientY - panState.startY);
    applyMapTransform();
    return;
  }
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const point = mapPointFromEvent(event);
  if (!point) return;
  dragState.current = point;
  const moved = Math.hypot(
    (point.x - dragState.start.x) * ((mapViewport.clientWidth || 1) * mapZoom),
    (point.y - dragState.start.y) * ((mapViewport.clientHeight || 1) * mapZoom),
  );
  if (moved >= DRAG_THRESHOLD) updateMarquee(dragState.start, point);
});

mapViewport?.addEventListener('pointerup', (event) => {
  if (panState && event.pointerId === panState.pointerId) endPan();
  else endDrag(event);
});
mapViewport?.addEventListener('pointercancel', (event) => {
  if (panState && event.pointerId === panState.pointerId) endPan();
  else endDrag(event);
});
mapViewport?.addEventListener('contextmenu', (event) => {
  if (mapZoom > 1.001) event.preventDefault();
});

mapViewport?.addEventListener('wheel', (event) => {
  if (!mapViewport) return;
  event.preventDefault();
  const rect = mapViewport.getBoundingClientRect();
  const focusX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
  const focusY = clamp((event.clientY - rect.top) / rect.height, 0, 1);
  const direction = event.deltaY < 0 ? 1 : -1;
  setMapZoom(mapZoom + (direction * ZOOM_STEP), { focusX, focusY });
}, { passive: false });

zoomInBtn?.addEventListener('click', () => setMapZoom(mapZoom + ZOOM_STEP));
zoomOutBtn?.addEventListener('click', () => setMapZoom(mapZoom - ZOOM_STEP));
zoomResetBtn?.addEventListener('click', () => resetMapView());

pinsLayer?.addEventListener('dblclick', (event) => {
  const pin = event.target.closest?.('[data-player-id]');
  if (!pin) return;
  const player = playersCache.find((entry) => playerKey(entry) === pin.dataset.playerId);
  if (player) focusOnPlayer(player);
});

pinsLayer?.addEventListener('error', (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.hasAttribute('data-pin-avatar')) return;
  const pin = img.closest('.server-map-pin');
  const initials = pin?.dataset?.initials || '?';
  img.replaceWith(Object.assign(document.createElement('span'), {
    className: 'server-map-pin-fallback',
    textContent: initials,
  }));
}, true);

roster?.addEventListener('click', (event) => {
  const row = event.target.closest('[data-player-id]');
  if (!row || busy) return;
  const id = row.dataset.playerId;
  if (event.shiftKey || event.metaKey || event.ctrlKey) toggleSelected(id);
  else setSelected([id]);
  const player = playersCache.find((entry) => playerKey(entry) === id);
  if (player && mapZoom > 1.001) focusOnPlayer(player);
});

clearBtn?.addEventListener('click', () => {
  if (!busy) clearSelection();
});

searchInput?.addEventListener('input', () => {
  searchQuery = String(searchInput.value || '').trim().toLowerCase();
  refreshViews();
});

teamFilterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    teamFilter = button.dataset.mgmtTeam || 'all';
    teamFilterButtons.forEach((entry) => {
      entry.classList.toggle('is-active', entry === button);
    });
    refreshViews();
  });
});

selectFilteredBtn?.addEventListener('click', () => {
  if (busy) return;
  setSelected(filteredPlayers().map(playerKey).filter(Boolean));
});

copySelectedBtn?.addEventListener('click', async () => {
  const names = selectedPlayers().map((player) => player.username).filter(Boolean);
  if (!names.length) return;
  try {
    await navigator.clipboard.writeText(names.join(', '));
    setNotice(`Copied ${names.length} name${names.length === 1 ? '' : 's'}.`);
    pushLog(`Copied ${names.length} selected name${names.length === 1 ? '' : 's'}`);
  } catch {
    setNotice(`Could not copy. Names: ${names.join(', ')}`, true);
  }
});

focusSelectedBtn?.addEventListener('click', () => {
  const first = selectedPlayers()[0];
  if (first) focusOnPlayer(first);
});

logClearBtn?.addEventListener('click', () => {
  sessionLog.length = 0;
  renderLog();
});

async function runAction(action) {
  const targets = selectedPlayers();
  if (!targets.length || busy) return;

  const label = action.charAt(0).toUpperCase() + action.slice(1);
  const names = targets.map((player) => player.username).join(', ');
  const reason = reasonInput?.value?.trim() || '';
  if (action === 'ban') {
    const ok = window.confirm(`Ban ${targets.length} player${targets.length === 1 ? '' : 's'} from the ER:LC server?\n\n${names}`);
    if (!ok) return;
  } else if (action === 'kick') {
    const ok = window.confirm(`Kick ${targets.length} player${targets.length === 1 ? '' : 's'}?\n\n${names}`);
    if (!ok) return;
  }

  busy = true;
  updateSelectionUi();
  updateCountdown();
  actionButtons.forEach((button) => { button.disabled = true; });
  setNotice(`Running ${label.toLowerCase()} on ${targets.length} player${targets.length === 1 ? '' : 's'}…`);

  try {
    const response = await fetch('/api/owner/erlc-command', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        reason,
        players: targets.map((player) => ({
          username: player.username,
          robloxId: player.robloxId,
        })),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok && response.status !== 207) {
      throw new Error(result.error || result.message || `Could not ${action} the selected players`);
    }
    const succeeded = Number(result.succeeded) || 0;
    const failed = Number(result.failed) || 0;
    const firstError = result.results?.find((entry) => !entry.ok)?.error
      || result.error
      || result.message;
    if (failed && succeeded) {
      const message = `${label}: ${succeeded} succeeded, ${failed} failed${firstError ? ` · ${firstError}` : ''}.`;
      setNotice(message, true);
      pushLog(message, true);
    } else if (failed) {
      const message = firstError || `${label} failed.`;
      setNotice(message, true);
      pushLog(message, true);
    } else if (!succeeded && Array.isArray(result.results)) {
      const message = firstError || `${label} did not reach any players.`;
      setNotice(message, true);
      pushLog(message, true);
    } else {
      const message = `${label} sent for ${succeeded || targets.length} player${(succeeded || targets.length) === 1 ? '' : 's'}${reason ? ` · ${reason}` : ''}.`;
      setNotice(message);
      pushLog(message);
    }
    clearSelection();
    await loadMap(true);
  } catch (error) {
    const message = error.message || `Could not ${action} the selected players.`;
    setNotice(message, true);
    pushLog(message, true);
  } finally {
    busy = false;
    updateSelectionUi();
    schedulePoll();
    updateCountdown();
  }
}

actionButtons.forEach((button) => {
  button.addEventListener('click', () => {
    void runAction(button.dataset.mgmtAction);
  });
});

function setCommandStatus(message, isError = false) {
  if (!commandStatus) return;
  commandStatus.hidden = !message;
  commandStatus.textContent = message || '';
  commandStatus.classList.toggle('is-error', isError);
}

commandPresets.forEach((button) => {
  button.addEventListener('click', () => {
    if (!commandInput || busy) return;
    const preset = button.dataset.mgmtPreset || '';
    commandInput.value = preset;
    commandInput.focus();
    const end = commandInput.value.length;
    commandInput.setSelectionRange(end, end);
  });
});

commandForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (busy) return;
  let command = commandInput?.value?.trim() || '';
  if (!command) {
    setCommandStatus('Enter a command to send in-game.', true);
    commandInput?.focus();
    return;
  }
  if (!command.startsWith(':')) command = `:${command}`;

  busy = true;
  updateSelectionUi();
  updateCountdown();
  if (commandRunBtn) commandRunBtn.disabled = true;
  setCommandStatus(`Sending ${command}…`);
  setNotice(`Sending in-game command ${command}…`);

  try {
    const response = await fetch('/api/owner/erlc-command', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'command', command }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not send the in-game command');
    const sent = result.command || command;
    const message = `Sent ${sent}${result.message ? ` · ${result.message}` : ''}`;
    setCommandStatus(message);
    setNotice(`In-game command sent: ${sent}`);
    pushLog(`Command ${sent}`);
    if (commandInput) commandInput.value = '';
  } catch (error) {
    const message = error.message || 'Could not send the in-game command.';
    setCommandStatus(message, true);
    setNotice(message, true);
    pushLog(message, true);
  } finally {
    busy = false;
    updateSelectionUi();
    if (commandRunBtn) commandRunBtn.disabled = false;
    schedulePoll();
    updateCountdown();
  }
});

window.addEventListener('resize', () => applyMapTransform());

(async () => {
  const allowed = await ensureOwnerAccess();
  if (!allowed) return;
  applyMapTransform();
  await loadMap();
  pollTimer = window.setInterval(() => {
    if (Date.now() >= nextRefreshAt) void loadMap(true);
  }, 1000);
  countdownTimer = window.setInterval(updateCountdown, 500);
})();

window.addEventListener('beforeunload', () => {
  if (pollTimer) window.clearInterval(pollTimer);
  if (countdownTimer) window.clearInterval(countdownTimer);
});
