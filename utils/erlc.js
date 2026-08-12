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

export function parseErlcPlayer(player) {
  const raw = String(player?.Player || '');
  const separator = raw.lastIndexOf(':');
  const x = Number(player?.Location?.LocationX);
  const z = Number(player?.Location?.LocationZ);
  return {
    username: separator >= 0 ? raw.slice(0, separator) : raw,
    robloxId: separator >= 0 ? raw.slice(separator + 1) : '',
    team: player?.Team || 'Civilian',
    callsign: player?.Callsign || '',
    location: {
      x: Number.isFinite(x) ? x : null,
      z: Number.isFinite(z) ? z : null,
      postal: String(player?.Location?.PostalCode || ''),
      street: String(player?.Location?.StreetName || ''),
      building: String(player?.Location?.BuildingNumber || ''),
    },
  };
}

// Official Liberty County satellite map is north-up with a black frame.
// These world bounds match live ER:LC X/Z samples onto that framed landmass.
const LIBERTY_BOUNDS = Object.freeze({
  minX: -2500,
  maxX: 2500,
  minZ: -2500,
  maxZ: 2550,
  frameLeft: 0.047,
  frameTop: 0.092,
  frameWidth: 0.902,
  frameHeight: 0.826,
});

export function libertyMapPoint(x, z) {
  const nx = (Number(x) - LIBERTY_BOUNDS.minX) / (LIBERTY_BOUNDS.maxX - LIBERTY_BOUNDS.minX);
  const ny = (LIBERTY_BOUNDS.maxZ - Number(z)) / (LIBERTY_BOUNDS.maxZ - LIBERTY_BOUNDS.minZ);
  return {
    left: Number((LIBERTY_BOUNDS.frameLeft + Math.min(1, Math.max(0, nx)) * LIBERTY_BOUNDS.frameWidth).toFixed(4)),
    top: Number((LIBERTY_BOUNDS.frameTop + Math.min(1, Math.max(0, ny)) * LIBERTY_BOUNDS.frameHeight).toFixed(4)),
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
  const players = (server.Players || []).map(parseErlcPlayer);
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
