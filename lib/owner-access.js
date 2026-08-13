import { isOwner } from './discord-auth.js';
import { sanitizeInternetBadges } from '../utils/staffRanks.js';

export async function getStaffAccess(user) {
  if (!user?.id) return { allowed: false, panelAccess: null, staffRank: null, badges: [] };

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) {
    const full = isOwner(user);
    return { allowed: full, panelAccess: full ? 'full' : null, staffRank: null, badges: [] };
  }

  try {
    const url = new URL(`${apiUrl}/api/access`);
    url.searchParams.set('discordId', String(user.id));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) {
      const full = isOwner(user);
      return { allowed: full, panelAccess: full ? 'full' : null, staffRank: null, badges: [] };
    }
    const result = await response.json();
    const panelAccess = result.panelAccess === 'full' || result.panelAccess === 'limited'
      ? result.panelAccess
      : (isOwner(user) || result.allowed === true ? 'full' : null);
    return {
      // Official-account / ownership tools stay full-panel only.
      allowed: panelAccess === 'full' || isOwner(user),
      panelAccess: panelAccess || (isOwner(user) ? 'full' : null),
      staffRank: typeof result.staffRank === 'string' ? result.staffRank : null,
      badges: sanitizeInternetBadges(result.badges),
    };
  } catch {
    const full = isOwner(user);
    return { allowed: full, panelAccess: full ? 'full' : null, staffRank: null, badges: [] };
  }
}

export async function hasOwnerAccess(user) {
  return (await getStaffAccess(user)).allowed;
}
