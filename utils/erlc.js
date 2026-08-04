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
  return {
    username: separator >= 0 ? raw.slice(0, separator) : raw,
    robloxId: separator >= 0 ? raw.slice(separator + 1) : '',
    team: player?.Team || 'Civilian',
    callsign: player?.Callsign || '',
  };
}
