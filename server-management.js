const notice = document.querySelector('[data-mgmt-notice]');
const shell = document.querySelector('[data-mgmt-shell]');
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
const refreshBtn = document.querySelector('[data-mgmt-refresh]');
const selectionEl = document.querySelector('[data-mgmt-selection]');
const reasonInput = document.querySelector('[data-mgmt-reason]');
const clearBtn = document.querySelector('[data-mgmt-clear]');
const actionButtons = [...document.querySelectorAll('[data-mgmt-action]')];
const commandForm = document.querySelector('[data-mgmt-command-form]');
const commandInput = document.querySelector('[data-mgmt-command]');
const commandRunBtn = document.querySelector('[data-mgmt-command-run]');
const commandStatus = document.querySelector('[data-mgmt-command-status]');
const commandPresets = [...document.querySelectorAll('[data-mgmt-preset]')];

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

const REFRESH_MS = 8000;
const DRAG_THRESHOLD = 6;

let pollTimer = null;
let countdownTimer = null;
let nextRefreshAt = 0;
let playersCache = [];
let selectedIds = new Set();
let busy = false;
let dragState = null;

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
  // Same-origin proxy resolves the live Roblox CDN headshot (old roblox.com thumbnail URL is dead).
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

function selectedPlayers() {
  return playersCache.filter((player) => selectedIds.has(playerKey(player)));
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

  pinsLayer?.querySelectorAll('.server-map-pin').forEach((pin) => {
    pin.classList.toggle('is-selected', selectedIds.has(pin.dataset.playerId));
  });
  roster?.querySelectorAll('.server-roster-row').forEach((row) => {
    row.classList.toggle('is-selected', selectedIds.has(row.dataset.playerId));
  });
}

function renderMap(players) {
  if (!pinsLayer) return;
  pinsLayer.innerHTML = players.map((player) => {
    const id = playerKey(player);
    const selected = selectedIds.has(id) ? ' is-selected' : '';
    const title = `${player.username}${player.callsign ? ` · ${player.callsign}` : ''} · ${player.team}`;
    const avatar = avatarUrlFor(player);
    const media = avatar
      ? `<img src="${escapeAttr(avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-pin-avatar />`
      : `<span class="server-map-pin-fallback">${escapeHtml(initialsFor(player))}</span>`;
    return `<button type="button" class="server-map-pin${selected}" data-player-id="${escapeAttr(id)}" data-initials="${escapeAttr(initialsFor(player))}" style="left:${(player.left * 100).toFixed(3)}%;top:${(player.top * 100).toFixed(3)}%;--pin:${teamTone(player.team)}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${media}</button>`;
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
    const selected = selectedIds.has(id) ? ' is-selected' : '';
    const place = player.label || player.postal || 'Liberty County';
    const avatar = avatarUrlFor(player);
    const media = avatar
      ? `<img class="server-roster-avatar" src="${escapeAttr(avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="--pin:${teamTone(player.team)}" />`
      : `<span class="server-roster-dot" style="background:${teamTone(player.team)}"></span>`;
    return `<li><button type="button" class="server-roster-row${selected}" data-player-id="${escapeAttr(id)}">${media}<span class="server-roster-copy"><b>${escapeHtml(player.username)}</b><small>${escapeHtml(player.team)}${player.callsign ? ` · ${escapeHtml(player.callsign)}` : ''}</small><em>${escapeHtml(place)}</em></span></button></li>`;
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
  if (dragState) {
    refreshLine.textContent = 'Auto-refresh paused while selecting';
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
  if (busy || dragState) return;
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
    renderMap(playersCache);
    renderRoster(playersCache);
    updateSelectionUi();
    if (shell) shell.hidden = false;
    if (!silent) setNotice('');
    schedulePoll();
  } catch (error) {
    setNotice(error.message || 'Could not load the in-game map.', true);
    schedulePoll();
  } finally {
    if (refreshBtn) refreshBtn.disabled = busy;
  }
}

function mapPointFromEvent(event) {
  const rect = mapView.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
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
  return playersCache
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
  updateCountdown();

  const point = mapPointFromEvent(event) || state.current || state.start;
  const moved = Math.hypot(
    (point.x - state.start.x) * (mapView?.clientWidth || 1),
    (point.y - state.start.y) * (mapView?.clientHeight || 1),
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

mapView?.addEventListener('pointerdown', (event) => {
  if (busy || event.button !== 0) return;
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
  mapView.classList.add('is-selecting');
  mapView.setPointerCapture?.(event.pointerId);
  updateCountdown();
  event.preventDefault();
});

mapView?.addEventListener('pointermove', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const point = mapPointFromEvent(event);
  if (!point) return;
  dragState.current = point;
  const moved = Math.hypot(
    (point.x - dragState.start.x) * (mapView.clientWidth || 1),
    (point.y - dragState.start.y) * (mapView.clientHeight || 1),
  );
  if (moved >= DRAG_THRESHOLD) updateMarquee(dragState.start, point);
});

mapView?.addEventListener('pointerup', endDrag);
mapView?.addEventListener('pointercancel', endDrag);

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
  const pin = pinsLayer?.querySelector(`[data-player-id="${CSS.escape(id)}"]`);
  pin?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
});

clearBtn?.addEventListener('click', () => {
  if (!busy) clearSelection();
});

refreshBtn?.addEventListener('click', () => { void loadMap(); });

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
  if (refreshBtn) refreshBtn.disabled = true;
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
      setNotice(`${label}: ${succeeded} succeeded, ${failed} failed${firstError ? ` · ${firstError}` : ''}.`, true);
    } else if (failed) {
      setNotice(firstError || `${label} failed.`, true);
    } else if (!succeeded && Array.isArray(result.results)) {
      setNotice(firstError || `${label} did not reach any players.`, true);
    } else {
      setNotice(`${label} sent for ${succeeded || targets.length} player${(succeeded || targets.length) === 1 ? '' : 's'}.`);
    }
    clearSelection();
    await loadMap(true);
  } catch (error) {
    setNotice(error.message || `Could not ${action} the selected players.`, true);
  } finally {
    busy = false;
    updateSelectionUi();
    if (refreshBtn) refreshBtn.disabled = false;
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
  if (refreshBtn) refreshBtn.disabled = true;
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
    setCommandStatus(`Sent ${sent}${result.message ? ` · ${result.message}` : ''}`);
    setNotice(`In-game command sent: ${sent}`);
    if (commandInput) commandInput.value = '';
  } catch (error) {
    const message = error.message || 'Could not send the in-game command.';
    setCommandStatus(message, true);
    setNotice(message, true);
  } finally {
    busy = false;
    updateSelectionUi();
    if (commandRunBtn) commandRunBtn.disabled = false;
    if (refreshBtn) refreshBtn.disabled = false;
    schedulePoll();
    updateCountdown();
  }
});

(async () => {
  const allowed = await ensureOwnerAccess();
  if (!allowed) return;
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
