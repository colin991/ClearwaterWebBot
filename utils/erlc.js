import { attachPlayerAvatars, robloxAvatarProxyPath } from '../lib/roblox-avatars.js';

export async function fetchErlcServer(serverKey) {
  if (!serverKey) throw new Error('ERLC_SERVER_KEY is not configured');
  const url = new URL('https://api.erlc.gg/v2/server');
  for (const field of ['Players', 'Queue']) url.searchParams.set(field, 'true');
  const response = await fetch(url, {
    headers: { 'server-key': serverKey },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`ER:LC request failed (${response.status})`);
  return response.json();
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
    robloxId: separator >= 0 ? raw.slice(separator + 1) : String(player?.PlayerId || player?.id || ''),
    team: player?.Team || player?.team || 'Civilian',
    callsign: player?.Callsign || player?.callsign || '',
    location: {
      x,
      z,
      postal: String(loc.PostalCode || player?.postal || loc.postal || ''),
      street: String(loc.StreetName || player?.street || loc.street || ''),
      building: String(loc.BuildingNumber || player?.building || loc.building || ''),
    },
  };
}

// Official map images are 3121² and cover the in-game 3120² stud plane.
// Live /v2/server player payloads use northwest-origin studs (0..3120):
// +X east/right, +Z south/down. Docs also describe a centre-origin variant
// (negative values allowed); support both so pins never fall off the map.
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Run one in-game command through the ER:LC private server API. */
export async function executeErlcCommand(serverKey, command) {
  if (!serverKey) throw new Error('ERLC_SERVER_KEY is not configured');
  const text = String(command || '').trim();
  if (!text.startsWith(':')) throw new Error('Invalid ER:LC command');
  const response = await fetch('https://api.erlc.gg/v2/server/command', {
    method: 'POST',
    headers: {
      'server-key': serverKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ command: text }),
    signal: AbortSignal.timeout(12000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = result.message || result.error || `ER:LC command failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.commandId = result.commandId;
    throw error;
  }
  return result;
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

  const response = await executeErlcCommand(serverKey, text);
  return {
    action: 'command',
    ok: true,
    command: text,
    message: response.message || 'Success',
    commandId: response.commandId || null,
  };
}

/**
 * Run kick / jail / unjail / ban against one or more in-game players.
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
      const response = await executeErlcCommand(serverKey, command);
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
