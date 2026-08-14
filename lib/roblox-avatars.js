/** Resolve Roblox avatar-headshot CDN URLs for a batch of user IDs. */
export async function fetchRobloxHeadshots(userIds = []) {
  const ids = [...new Set(
    (Array.isArray(userIds) ? userIds : [])
      .map((id) => String(id || '').replace(/[^\d]/g, ''))
      .filter(Boolean),
  )].slice(0, 100);
  const map = new Map();
  if (!ids.length) return map;

  try {
    const url = new URL('https://thumbnails.roblox.com/v1/users/avatar-headshot');
    url.searchParams.set('userIds', ids.join(','));
    url.searchParams.set('size', '150x150');
    url.searchParams.set('format', 'Png');
    url.searchParams.set('isCircular', 'false');
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return map;
    const payload = await response.json().catch(() => ({}));
    for (const entry of payload.data || []) {
      const id = String(entry.targetId || entry.targetID || '');
      const imageUrl = String(entry.imageUrl || entry.imageURL || '');
      if (id && imageUrl && String(entry.state || '') === 'Completed') {
        map.set(id, imageUrl);
      }
    }
  } catch {
    // Caller keeps any existing fallback.
  }
  return map;
}

export function robloxAvatarProxyPath(robloxId) {
  const id = String(robloxId || '').replace(/[^\d]/g, '');
  return id ? `/api/roblox-avatar?userId=${encodeURIComponent(id)}` : '';
}

/** Attach working avatar URLs to map players (CDN when available, else same-origin proxy). */
export async function attachPlayerAvatars(players = []) {
  const list = Array.isArray(players) ? players : [];
  const headshots = await fetchRobloxHeadshots(list.map((player) => player?.robloxId));
  return list.map((player) => {
    const robloxId = String(player?.robloxId || '').replace(/[^\d]/g, '');
    const cdn = headshots.get(robloxId) || '';
    const proxy = robloxAvatarProxyPath(robloxId);
    return {
      ...player,
      robloxId,
      avatarUrl: cdn || proxy || '',
    };
  });
}
