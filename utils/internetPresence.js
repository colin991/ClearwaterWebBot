const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const presenceByUserId = new Map();

function isDiscordUserId(id) {
  return /^\d{16,22}$/.test(String(id || ''));
}

/**
 * Track a logged-in browser session in memory (fast Active tab source).
 * Persisted lastSeenAt is updated separately via touchInternetUser.
 */
export function markInternetPresence(actor = {}, view = 'home') {
  const id = String(actor?.id || '').trim();
  if (!isDiscordUserId(id)) return null;
  if (/^biz_/i.test(id)) return null;

  const entry = {
    id,
    discordId: id,
    username: String(actor.username || '').trim().slice(0, 80) || 'member',
    discordUsername: String(actor.username || '').trim().replace(/^@/, '').slice(0, 80) || 'member',
    displayName: String(actor.displayName || actor.username || 'Discord user').trim().slice(0, 80) || 'Discord user',
    avatarUrl: actor.avatarUrl ? String(actor.avatarUrl).slice(0, 300) : null,
    staffRank: actor.staffRank ? String(actor.staffRank).slice(0, 80) : null,
    view: String(view || 'home').trim().slice(0, 40) || 'home',
    at: Date.now(),
    lastSeenAt: new Date().toISOString(),
  };
  presenceByUserId.set(id, entry);
  return entry;
}

export function listActiveInternetPresence(windowMs = ACTIVE_WINDOW_MS) {
  const now = Date.now();
  const maxAge = Math.max(15_000, Number(windowMs) || ACTIVE_WINDOW_MS);
  const active = [];
  for (const [id, entry] of presenceByUserId.entries()) {
    if (!entry || (now - Number(entry.at || 0)) > maxAge) {
      presenceByUserId.delete(id);
      continue;
    }
    active.push(entry);
  }
  return active.sort((left, right) => Number(right.at || 0) - Number(left.at || 0));
}

export function activePresenceWindowMs() {
  return ACTIVE_WINDOW_MS;
}
