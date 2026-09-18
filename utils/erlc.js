import { attachPlayerAvatars, robloxAvatarProxyPath } from '../lib/roblox-avatars.js';
import { logger } from './logger.js';

/** PRC shares one HTTP bucket for server snapshots and in-game commands. */
export const ERLC_MIN_INTERVAL_MS = 5_000;
export const ERLC_MAX_RETRY_AFTER_SEC = 15;
const ERLC_SERVER_CACHE_TTL_MS = 5_000;
let erlcMinIntervalMs = ERLC_MIN_INTERVAL_MS;
let erlcAvailableAt = 0;
let erlcNetworkQueue = Promise.resolve();
let erlcSlotDepth = 0;
let queuedCommands = 0;
let idleRefreshEnabled = true;
let idleRefreshTimer = null;
let idleRefreshServerKey = null;
let bundleCache = { value: null, expiresAt: 0, inflight: null };
let erlcHaltUntil = 0;
let erlcHaltError = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeErlcRetryAfterSeconds(retryAfterSeconds = 0) {
  let seconds = Number(retryAfterSeconds);
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  // Unix timestamps are sometimes sent instead of delta-seconds.
  if (seconds > 1e9) seconds = Math.max(0, seconds - Date.now() / 1000);
  if (seconds > ERLC_MAX_RETRY_AFTER_SEC) {
    logger.warn(`ER:LC Retry-After ${Math.round(seconds)}s capped at ${ERLC_MAX_RETRY_AFTER_SEC}s`);
    return ERLC_MAX_RETRY_AFTER_SEC;
  }
  return seconds;
}

function rememberErlcCooldown(retryAfterSeconds = 0) {
  const extra = normalizeErlcRetryAfterSeconds(retryAfterSeconds) * 1000;
  erlcAvailableAt = Date.now() + Math.max(erlcMinIntervalMs, extra);
}

function haltErlc(error, ms) {
  erlcHaltError = error;
  erlcHaltUntil = Date.now() + Math.max(0, Number(ms) || 0);
}

function throwIfErlcHalted() {
  if (erlcHaltError && Date.now() < erlcHaltUntil) throw erlcHaltError;
}

export function erlcCooldownRemainingMs(now = Date.now()) {
  return Math.max(0, erlcAvailableAt - now);
}

export function getErlcRateLimitStatus(now = Date.now()) {
  const cooldownMs = erlcCooldownRemainingMs(now);
  const halted = Boolean(erlcHaltError && now < erlcHaltUntil);
  const haltMs = halted ? Math.max(0, erlcHaltUntil - now) : 0;
  const cacheExpiresAt = Number(bundleCache.expiresAt) || 0;
  const cacheAgeMs = bundleCache.value && cacheExpiresAt
    ? Math.max(0, now - (cacheExpiresAt - ERLC_SERVER_CACHE_TTL_MS))
    : null;
  let state = 'ready';
  if (halted) state = 'key_rejected';
  else if (cooldownMs > 400) state = 'cooling_down';
  else if (erlcSlotDepth > 0 || bundleCache.inflight) state = 'in_flight';
  return {
    state,
    cooldownMs,
    halted,
    haltMs,
    haltMessage: halted ? String(erlcHaltError?.message || 'ER:LC is blocked.') : null,
    queuedCommands,
    slotBusy: erlcSlotDepth > 0,
    snapshotInFlight: Boolean(bundleCache.inflight),
    hasRosterCache: Boolean(bundleCache.value),
    cacheAgeMs,
    minIntervalMs: erlcMinIntervalMs,
    maxRetryAfterSec: ERLC_MAX_RETRY_AFTER_SEC,
  };
}

function secondsLabel(ms) {
  const seconds = Math.max(0, Math.ceil(Number(ms) / 1000));
  return seconds === 1 ? '1 second' : `${seconds} seconds`;
}

export function formatErlcRateLimitReport(status = getErlcRateLimitStatus()) {
  const lines = [];
  if (status.state === 'key_rejected') {
    lines.push(`**Status:** Key rejected — ${status.haltMessage}`);
    lines.push(`**Blocked for:** ${secondsLabel(status.haltMs)}`);
  } else if (status.state === 'cooling_down') {
    lines.push(`**Status:** Cooling down`);
    lines.push(`**Next request:** in ${secondsLabel(status.cooldownMs)}`);
  } else if (status.state === 'in_flight') {
    lines.push('**Status:** A request is in flight');
    lines.push('**Next request:** as soon as the current call finishes, then the 5s PRC gap');
  } else {
    lines.push('**Status:** Ready');
    lines.push('**Next request:** now');
  }
  lines.push(`**PRC gap:** ${secondsLabel(status.minIntervalMs)} (Retry-After capped at ${status.maxRetryAfterSec}s)`);
  lines.push(`**Queued in-game commands:** ${status.queuedCommands}`);
  lines.push(`**Snapshot in flight:** ${status.snapshotInFlight || status.slotBusy ? 'yes' : 'no'}`);
  if (status.hasRosterCache) {
    lines.push(`**Cached roster:** yes (${secondsLabel(status.cacheAgeMs)} old)`);
  } else {
    lines.push('**Cached roster:** none');
  }
  return lines.join('\n');
}

function erlcTimeoutError() {
  const wait = erlcCooldownRemainingMs();
  const error = new Error(wait > 400
    ? `ER:LC is rate-limited. Try again in ${Math.ceil(wait / 1000)} seconds.`
    : 'Could not reach the ER:LC API in time. Check ERLC_SERVER_KEY and that the bot host can reach api.erlc.gg.');
  error.code = 'ERLC_TIMEOUT';
  return error;
}

function shouldSkipSnapshotHttp() {
  if (bundleCache.value && Date.now() < bundleCache.expiresAt) return true;
  return queuedCommands > 0 && Boolean(bundleCache.value);
}

/** One-at-a-time ER:LC HTTP: snapshots and commands share this line. */
export function withErlcNetworkSlot(task, { kind = 'snapshot' } = {}) {
  if (kind === 'command') queuedCommands += 1;
  const run = erlcNetworkQueue.then(async () => {
    try {
      throwIfErlcHalted();
      if (kind === 'snapshot' && shouldSkipSnapshotHttp()) return bundleCache.value;
      const waitMs = Math.max(0, erlcAvailableAt - Date.now());
      if (waitMs) await sleep(waitMs);
      throwIfErlcHalted();
      if (kind === 'snapshot' && shouldSkipSnapshotHttp()) return bundleCache.value;
      erlcSlotDepth += 1;
      try {
        return await task();
      } finally {
        erlcSlotDepth -= 1;
      }
    } finally {
      if (kind === 'command') queuedCommands -= 1;
    }
  });
  erlcNetworkQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function fetchErlcBundle(serverKey) {
  const url = new URL('https://api.erlc.gg/v2/server');
  url.searchParams.set('Players', 'true');
  url.searchParams.set('Queue', 'true');
  url.searchParams.set('Vehicles', 'true');
  url.searchParams.set('KillLogs', 'true');
  url.searchParams.set('ModCalls', 'true');
  url.searchParams.set('Staff', 'true');

  throwIfErlcHalted();
  const waitMs = Math.max(0, erlcAvailableAt - Date.now());
  if (waitMs) await sleep(waitMs);
  const response = await fetch(url, {
    headers: { 'server-key': serverKey },
    signal: AbortSignal.timeout(8000),
  }).catch((error) => {
    const wrapped = new Error('Could not reach the ER:LC API in time. Check ERLC_SERVER_KEY and that the bot host can reach api.erlc.gg.');
    wrapped.cause = error;
    wrapped.code = 'ERLC_TIMEOUT';
    throw wrapped;
  });
  const retryAfter = Number(response.headers.get('retry-after') || 0);
  if (response.status === 401 || response.status === 403) {
    const error = erlcKeyError(response.status);
    haltErlc(error, 10 * 60 * 1000);
    throw error;
  }
  if (!response.ok) {
    const retrySec = normalizeErlcRetryAfterSeconds(retryAfter || (response.status === 429 ? 5 : 0));
    rememberErlcCooldown(retrySec);
    const error = new Error(response.status === 429
      ? `ER:LC is rate-limited. Try again in ${Math.ceil(Math.max(retrySec, 5))} seconds.`
      : `ER:LC request failed (${response.status})`);
    error.status = response.status;
    error.retryAfter = retrySec || (response.status === 429 ? 5 : null);
    throw error;
  }
  rememberErlcCooldown(retryAfter);
  const json = await response.json();
  bundleCache = { value: json, expiresAt: Date.now() + ERLC_SERVER_CACHE_TTL_MS, inflight: null };
  return json;
}

function stopIdleRefreshTimer() {
  if (!idleRefreshTimer) return;
  clearInterval(idleRefreshTimer);
  idleRefreshTimer = null;
}

function ensureIdleRefresh(serverKey) {
  idleRefreshServerKey = serverKey;
  if (!idleRefreshEnabled || idleRefreshTimer) return;
  idleRefreshTimer = setInterval(() => {
    if (erlcHaltError && Date.now() < erlcHaltUntil) return;
    if (!idleRefreshServerKey || erlcSlotDepth > 0) return;
    if (queuedCommands > 0 && bundleCache.value) return;
    if (bundleCache.inflight) return;
    if (bundleCache.value && Date.now() < bundleCache.expiresAt) return;
    loadErlcServer(idleRefreshServerKey);
  }, 250);
  idleRefreshTimer.unref?.();
}

function trackInflight(pending) {
  bundleCache.inflight = pending;
  void pending.then(
    () => {
      if (bundleCache.inflight === pending) bundleCache.inflight = null;
    },
    () => {
      if (bundleCache.inflight === pending) bundleCache.inflight = null;
    },
  );
  return pending;
}

function scheduleBundleRefresh(serverKey) {
  if (bundleCache.inflight) return bundleCache.inflight;
  if (shouldSkipSnapshotHttp() && bundleCache.value) {
    return Promise.resolve(bundleCache.value);
  }
  return trackInflight(withErlcNetworkSlot(async () => {
    if (shouldSkipSnapshotHttp()) return bundleCache.value;
    return fetchErlcBundle(serverKey);
  }, { kind: 'snapshot' }));
}

function loadErlcServer(serverKey) {
  throwIfErlcHalted();
  ensureIdleRefresh(serverKey);
  if (bundleCache.value) return Promise.resolve(bundleCache.value);
  if (bundleCache.inflight) return bundleCache.inflight;
  return scheduleBundleRefresh(serverKey);
}

function withTimeout(promise, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(erlcTimeoutError());
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Snapshot the private server. `timeoutMs` fails fast for Discord commands. */
export async function fetchErlcServer(serverKey, options = {}) {
  if (!serverKey) throw new Error('ERLC_SERVER_KEY is not configured');
  throwIfErlcHalted();
  const pending = loadErlcServer(serverKey);
  const timeoutMs = Number(options.timeoutMs);
  if (Number.isFinite(timeoutMs) && timeoutMs > 0) pending.catch(() => {});
  try {
    return await withTimeout(pending, timeoutMs);
  } catch (error) {
    if (error?.code === 'ERLC_TIMEOUT' && bundleCache.value) return bundleCache.value;
    throw error;
  }
}

export function erlcKeyError(status = 401) {
  const error = new Error(
    'The ER:LC server key on the bot host is invalid or expired. Update ERLC_SERVER_KEY in the host .env and restart the bot.',
  );
  error.status = status;
  error.code = 'ERLC_KEY';
  return error;
}

export function resetErlcNetworkForTests({ minIntervalMs = 0, idleRefresh = false } = {}) {
  stopIdleRefreshTimer();
  idleRefreshEnabled = Boolean(idleRefresh);
  idleRefreshServerKey = null;
  erlcMinIntervalMs = Number.isFinite(minIntervalMs) ? minIntervalMs : 0;
  erlcAvailableAt = 0;
  erlcNetworkQueue = Promise.resolve();
  erlcSlotDepth = 0;
  queuedCommands = 0;
  bundleCache = { value: null, expiresAt: 0, inflight: null };
  erlcHaltUntil = 0;
  erlcHaltError = null;
}

export function expireErlcBundleCacheForTests() {
  if (bundleCache.value) bundleCache.expiresAt = 0;
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

export function parseErlcPlayer(player) {
  const raw = String(player?.Player || player?.player || '');
  const separator = raw.lastIndexOf(':');
  const loc = player?.Location && typeof player.Location === 'object' ? player.Location : {};
  const position = Array.isArray(player?.position)
    ? player.position
    : (Array.isArray(loc.position) ? loc.position : null);
  const x = firstFinite(loc.LocationX, loc.x, player?.x, player?.X, position?.[0]);
  const z = firstFinite(loc.LocationZ, loc.z, player?.z, player?.Z, position?.[1]);
  return {
    username: separator >= 0 ? raw.slice(0, separator) : raw,
    displayName: String(player?.PlayerDisplayName || player?.DisplayName || player?.displayName || '').trim(),
    robloxId: separator >= 0 ? raw.slice(separator + 1) : String(player?.PlayerId || player?.id || ''),
    team: player?.Team || player?.team || 'Civilian',
    callsign: player?.Callsign || player?.callsign || '',
    speed: firstFinite(player?.Speed, player?.speed, player?.VehicleSpeed, player?.vehicleSpeed, loc.Speed, loc.speed),
    location: {
      x,
      z,
      postal: String(loc.PostalCode || player?.postal || loc.postal || ''),
      street: String(loc.StreetName || player?.street || loc.street || ''),
      building: String(loc.BuildingNumber || player?.building || loc.building || ''),
    },
  };
}

function splitOwner(owner) {
  const raw = String(owner || '');
  const separator = raw.lastIndexOf(':');
  return {
    username: separator >= 0 ? raw.slice(0, separator) : raw,
    robloxId: separator >= 0 ? raw.slice(separator + 1) : '',
  };
}

export function parseErlcVehicle(vehicle) {
  const owner = splitOwner(vehicle?.Owner || vehicle?.owner);
  return {
    name: String(vehicle?.Name || vehicle?.name || '').trim(),
    ownerUsername: owner.username,
    ownerRobloxId: owner.robloxId,
    texture: String(vehicle?.Texture || vehicle?.texture || '').trim(),
    colorName: String(vehicle?.ColorName || vehicle?.colorName || '').trim(),
    plate: String(vehicle?.Plate || vehicle?.LicensePlate || vehicle?.plate || '').trim(),
  };
}

export function formatPriorityVehicle(vehicle) {
  const color = vehicle?.texture && !/^standard$/i.test(vehicle.texture)
    ? vehicle.texture
    : (vehicle?.colorName || '');
  const label = [color, vehicle?.name].filter(Boolean).join(' ').trim();
  const plate = vehicle?.plate ? ` [${vehicle.plate}]` : '';
  return `${label || 'Unknown vehicle'}${plate}`;
}

export function civilianVehicles(vehicles, players) {
  const civ = new Set();
  for (const player of Array.isArray(players) ? players : []) {
    if (!/civilian/i.test(String(player?.team || ''))) continue;
    if (player.robloxId) civ.add(`id:${player.robloxId}`);
    if (player.username) civ.add(`name:${String(player.username).toLowerCase()}`);
  }
  return (Array.isArray(vehicles) ? vehicles : []).filter((vehicle) => {
    const parsed = vehicle?.name ? vehicle : parseErlcVehicle(vehicle);
    return (parsed.ownerRobloxId && civ.has(`id:${parsed.ownerRobloxId}`))
      || (parsed.ownerUsername && civ.has(`name:${parsed.ownerUsername.toLowerCase()}`));
  }).map((vehicle) => (vehicle?.name ? vehicle : parseErlcVehicle(vehicle)));
}

export function parseErlcKill(entry) {
  const killed = splitOwner(entry?.Killed || entry?.killed);
  const raw = Number(entry?.Timestamp || entry?.timestamp || 0);
  const at = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
  return { username: killed.username, robloxId: killed.robloxId, at };
}

// Official map images are 3121Â² and cover the in-game 3120Â² stud plane.
// Live /v2/server player payloads use northwest-origin studs (0..3120):
// +X east/right, +Z south/down. Docs also describe a centre-origin variant
// (negative values allowed); support both so pins never fall off the map.

/** True for DOT / Fire / Police / Sheriff teams — excluded from jail roster + zone drag. */
export function isEmergencyServiceTeam(team) {
  return /\b(dot|fire|police|sheriff)\b/i.test(String(team || '').replace(/[_-]+/g, ' '));
}
export const LIBERTY_WORLD = 3120;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function libertyMapPoint(x, z) {
  const nx = Number(x);
  const nz = Number(z);
  if (!Number.isFinite(nx) || !Number.isFinite(nz)) return null;

  // Centre-origin only when a negative axis appears. Otherwise treat as the
  // northwest-origin values that live servers still return (e.g. 1084, 2302).
  const centreOrigin = nx < 0 || nz < 0;
  const left = centreOrigin ? 0.5 + (nx / LIBERTY_WORLD) : nx / LIBERTY_WORLD;
  const top = centreOrigin ? 0.5 + (nz / LIBERTY_WORLD) : nz / LIBERTY_WORLD;
  return {
    left: Number(clamp01(left).toFixed(5)),
    top: Number(clamp01(top).toFixed(5)),
  };
}

export function dropLocationNameCandidates(...values) {
  const names = new Set();
  for (const value of values) {
    let raw = String(value || '').trim();
    if (!raw) continue;
    names.add(raw);
    while (/^\[[^\]]+\]\s*/.test(raw) || /^\([^)]+\)\s*/.test(raw)) {
      raw = raw.replace(/^\[[^\]]+\]\s*/, '').replace(/^\([^)]+\)\s*/, '').trim();
      if (raw) names.add(raw);
    }
    const compact = raw.replace(/\s+/g, '');
    if (compact) names.add(compact);
  }
  return [...names];
}

export async function findPlayerDropLocation({ serverKey, robloxId, username, usernames = [] }) {
  const server = await fetchErlcServer(serverKey);
  const players = (server.Players || server.players || []).map(parseErlcPlayer);
  const id = String(robloxId || '');
  const handles = new Set(
    dropLocationNameCandidates(username, ...usernames).map((name) => name.toLowerCase()),
  );
  const player = players.find((entry) => handles.has(entry.username.toLowerCase()))
    || players.find((entry) => id && entry.robloxId === id);
  if (!player) return null;
  if (!Number.isFinite(player.location?.x) || !Number.isFinite(player.location?.z)) {
    throw new Error('Your in-game location is not available yet. Move a little in ER:LC and try again.');
  }
  const pin = libertyMapPoint(player.location.x, player.location.z);
  if (!pin) throw new Error('Could not place your location on the Liberty County map.');
  const label = [player.location.building, player.location.street].filter(Boolean).join(' ')
    || (player.location.postal ? `Postal ${player.location.postal}` : 'Liberty County');
  return {
    x: Math.round(player.location.x * 10) / 10,
    z: Math.round(player.location.z * 10) / 10,
    postal: player.location.postal,
    street: player.location.street,
    building: player.location.building,
    team: player.team,
    username: player.username,
    label,
    left: pin.left,
    top: pin.top,
  };
}

/** Ownership map payload: every in-game player that has a placeable location. */
export function playersOnLibertyMap(players = []) {
  return (Array.isArray(players) ? players : [])
    .map((player) => {
      const entry = player?.location ? player : parseErlcPlayer(player);
      const pin = libertyMapPoint(entry.location?.x, entry.location?.z);
      if (!pin) return null;
      const label = [entry.location.building, entry.location.street].filter(Boolean).join(' ')
        || (entry.location.postal ? `Postal ${entry.location.postal}` : 'Liberty County');
      const robloxId = String(entry.robloxId || '').replace(/[^\d]/g, '');
      return {
        username: entry.username,
        robloxId,
        avatarUrl: robloxAvatarProxyPath(robloxId),
        team: entry.team || 'Civilian',
        callsign: entry.callsign || '',
        postal: entry.location.postal || '',
        street: entry.location.street || '',
        building: entry.location.building || '',
        label,
        left: pin.left,
        top: pin.top,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.username.localeCompare(right.username));
}

/** Attach Roblox headshots onto mapped players. */
export async function fetchErlcPlayersOnMap(serverKey) {
  const server = await fetchErlcServer(serverKey);
  const players = (server.Players || server.players || []).map(parseErlcPlayer);
  const mapped = await attachPlayerAvatars(playersOnLibertyMap(players));
  return {
    online: true,
    name: server.Name || server.name || 'Clearwater',
    currentPlayers: Number.isInteger(server.CurrentPlayers) ? server.CurrentPlayers : players.length,
    maxPlayers: Number.isInteger(server.MaxPlayers) ? server.MaxPlayers : 40,
    queue: Array.isArray(server.Queue) ? server.Queue.length : (Number(server.Queue) || 0),
    players: mapped,
    updatedAt: new Date().toISOString(),
  };
}

const ERLC_MOD_ACTIONS = new Set(['load', 'kick', 'jail', 'unjail', 'ban']);

function sanitizeErlcTarget(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 64);
}

function sanitizeErlcReason(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Run one in-game command through the ER:LC private server API. */
export async function executeErlcCommand(serverKey, command, options = {}) {
  return withErlcCommandSession(serverKey, send => send(command, options));
}

/** Reserve the shared command queue for a short grant/revoke transaction. */
export function withErlcCommandSession(serverKey, action) {
  return withErlcNetworkSlot(
    () => action((command, options) => sendErlcCommand(serverKey, command, options)),
    { kind: 'command' },
  );
}

async function sendErlcCommand(serverKey, command, { shouldExecute, allowLoad = false, allowJail = false, allowKick = false } = {}) {
    if (!serverKey) throw new Error('ERLC_SERVER_KEY is not configured');
    const text = String(command || '').trim();
    if (!text.startsWith(':')) throw new Error('Invalid ER:LC command');
    if (!allowLoad && /^:load\b/i.test(text)) {
      logger.warn(`Blocked automatic ER:LC :load (${text.slice(0, 80)})`);
      return false;
    }
    if (!allowJail && /^:jail\b/i.test(text)) {
      logger.warn(`Blocked automatic ER:LC :jail (${text.slice(0, 80)})`);
      return false;
    }
    if (!allowKick && /^:kick\b/i.test(text)) {
      logger.warn(`Blocked automatic ER:LC :kick (${text.slice(0, 80)})`);
      return false;
    }

    throwIfErlcHalted();
    const waitMs = Math.max(0, erlcAvailableAt - Date.now());
    if (waitMs) await sleep(waitMs);
    throwIfErlcHalted();
    if (shouldExecute && !await shouldExecute()) return false;
    const response = await fetch('https://api.erlc.gg/v2/server/command', {
      method: 'POST',
      headers: {
        'server-key': serverKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ command: text }),
      signal: AbortSignal.timeout(8000),
    });
    const result = await response.json().catch(() => ({}));
    const retryAfterSeconds = normalizeErlcRetryAfterSeconds(result.retry_after || response.headers.get('retry-after') || 0);
    rememberErlcCooldown(retryAfterSeconds);
    if (response.ok) return result;
    if (response.status === 401 || response.status === 403) {
      const error = erlcKeyError(response.status);
      haltErlc(error, 10 * 60 * 1000);
      throw error;
    }
    const message = result.message || result.error || `ER:LC command failed (${response.status})`;
    const error = new Error(response.status === 429
      ? `${message} Retry after ${Math.ceil(Math.max(retryAfterSeconds, 5))} seconds.`
      : message);
    error.status = response.status;
    error.commandId = result.commandId;
    error.retryAfter = retryAfterSeconds || (response.status === 429 ? 5 : null);
    if (response.status === 429) {
      logger.warn(`ER:LC command 429 on ${text.slice(0, 80)}; leaving the queue for ${error.retryAfter}s`);
    }
    throw error;
}

function buildErlcModCommand(action, player, reason) {
  const username = sanitizeErlcTarget(player?.username);
  const robloxId = sanitizeErlcTarget(player?.robloxId).replace(/[^\d]/g, '');
  const target = action === 'ban'
    ? (robloxId || username)
    : (username || robloxId);
  if (!target) return null;
  if (action === 'kick') {
    const note = sanitizeErlcReason(reason) || 'Removed by Ownership';
    return `:kick ${target} ${note}`;
  }
  if (action === 'load') return `:load ${target}`;
  if (action === 'jail') return `:jail ${target}`;
  if (action === 'unjail') return `:unjail ${target}`;
  if (action === 'ban') {
    const note = sanitizeErlcReason(reason);
    return note ? `:ban ${target} ${note}` : `:ban ${target}`;
  }
  return null;
}

/** Run a single raw in-game command (must start with ':'). */
export async function runErlcRawCommand({ serverKey, command } = {}) {
  if (!serverKey) throw new Error('ER:LC is not configured on the bot host yet.');
  let text = String(command || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Enter a command to run in-game');
  if (!text.startsWith(':')) text = `:${text}`;
  if (text.length > 200) throw new Error('Command is too long');
  if (!/^:[A-Za-z]/.test(text)) throw new Error('Command must look like :h Hello or :kick Player');

  const response = await executeErlcCommand(serverKey, text, {
    allowLoad: /^:load\b/i.test(text),
    allowJail: /^:jail\b/i.test(text),
    allowKick: /^:kick\b/i.test(text),
  });
  return {
    action: 'command',
    ok: true,
    command: text,
    message: response.message || 'Success',
    commandId: response.commandId || null,
  };
}

/**
 * Run load / kick / jail / unjail / ban against one or more in-game players.
 * Commands are sent sequentially to stay within ER:LC rate limits.
 */
export async function runErlcModeration({ serverKey, action, players = [], reason = '' } = {}) {
  if (!ERLC_MOD_ACTIONS.has(action)) throw new Error('Unsupported moderation action');
  if (!serverKey) throw new Error('ER:LC is not configured on the bot host yet.');
  const list = (Array.isArray(players) ? players : [])
    .map((player) => ({
      username: sanitizeErlcTarget(player?.username),
      robloxId: sanitizeErlcTarget(player?.robloxId).replace(/[^\d]/g, ''),
    }))
    .filter((player) => player.username || player.robloxId)
    .slice(0, 40);
  if (!list.length) throw new Error('Select at least one player on the map');

  const results = [];
  for (let index = 0; index < list.length; index += 1) {
    const player = list[index];
    const command = buildErlcModCommand(action, player, reason);
    if (!command) {
      results.push({ ...player, ok: false, error: 'Missing player name' });
      continue;
    }
    try {
      const response = await executeErlcCommand(serverKey, command, {
        allowLoad: action === 'load',
        allowJail: action === 'jail',
        allowKick: action === 'kick',
      });
      results.push({
        ...player,
        ok: true,
        command,
        message: response.message || 'Success',
      });
    } catch (error) {
      results.push({
        ...player,
        ok: false,
        command,
        error: error?.message || 'Command failed',
      });
    }
    if (index < list.length - 1) await sleep(400);
  }

  const succeeded = results.filter((entry) => entry.ok).length;
  const failed = results.length - succeeded;
  return {
    action,
    ok: failed === 0,
    succeeded,
    failed,
    total: results.length,
    results,
  };
}
