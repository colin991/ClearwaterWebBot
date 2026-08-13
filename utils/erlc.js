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
  // Official docs: LocationX/LocationZ use the centre of the map as origin.
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

// Official map images are 3121². API X/Z are studs from the map centre:
// +X right, +Z down, -X left, -Z up. Full span is treated as 3120 studs.
const LIBERTY_WORLD = 3120;

export function libertyMapPoint(x, z) {
  const left = 0.5 + (Number(x) / LIBERTY_WORLD);
  const top = 0.5 + (Number(z) / LIBERTY_WORLD);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return {
    left: Number(Math.min(1, Math.max(0, left)).toFixed(5)),
    top: Number(Math.min(1, Math.max(0, top)).toFixed(5)),
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
