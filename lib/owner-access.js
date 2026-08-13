import { isOwner } from './discord-auth.js';
import { hasSiteAccess } from './site-access.js';
import { withSiteBadges } from '../utils/staffRanks.js';

function deniedAccess(user = null) {
  return {
    allowed: false,
    panelAccess: null,
    siteAccess: false,
    staffRank: null,
    badges: withSiteBadges([], user || {}),
    live: false,
  };
}

function ownerBreakGlass(user) {
  // Only the configured owner Discord ID(s) may continue when the bot is down.
  // Session guildRoles are never trusted for privilege here.
  if (!isOwner(user)) return deniedAccess(user);
  return {
    allowed: true,
    panelAccess: 'full',
    siteAccess: true,
    staffRank: null,
    badges: withSiteBadges([], user),
    live: false,
  };
}

export async function getStaffAccess(user) {
  if (!user?.id) return deniedAccess();

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return ownerBreakGlass(user);

  try {
    const url = new URL(`${apiUrl}/api/access`);
    url.searchParams.set('discordId', String(user.id));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return ownerBreakGlass(user);

    const result = await response.json();
    const panelAccess = result.panelAccess === 'full' || result.panelAccess === 'limited'
      ? result.panelAccess
      : null;
    // Prefer the live siteAccess flag from a current bot host. Older hosts omit
    // it, so fall back to Discord membership + the signed session tester role.
    const siteAccess = typeof result.siteAccess === 'boolean'
      ? (result.siteAccess || isOwner(user))
      : ((result.member === true && hasSiteAccess(user)) || isOwner(user));
    return {
      // Official-account / ownership tools stay full-panel only.
      allowed: panelAccess === 'full' || isOwner(user),
      panelAccess: panelAccess || (isOwner(user) ? 'full' : null),
      siteAccess,
      staffRank: typeof result.staffRank === 'string' ? result.staffRank : null,
      badges: withSiteBadges(result.badges, user),
      live: true,
    };
  } catch {
    return ownerBreakGlass(user);
  }
}

export async function hasOwnerAccess(user) {
  return (await getStaffAccess(user)).allowed;
}
