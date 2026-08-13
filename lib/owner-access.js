import { isOwner } from './discord-auth.js';
import { hasSiteAccess } from './site-access.js';
import { getSessionPanelAccess, isDeveloperAccount, withSiteBadges } from '../utils/staffRanks.js';

function deniedAccess(user = null) {
  return {
    allowed: false,
    panelAccess: null,
    siteAccess: false,
    staffRank: null,
    badges: withSiteBadges([], user || {}),
    roles: [],
    live: false,
  };
}

function fullPanelUser(user) {
  return isOwner(user) || isDeveloperAccount(user);
}

function sessionFallback(user) {
  // Bot unreachable / uncertain: trust signed Discord OAuth roles from login.
  // Never invent privileges from client-supplied flags.
  const siteAccess = hasSiteAccess(user) || fullPanelUser(user);
  if (!siteAccess) return deniedAccess(user);
  const panelAccess = getSessionPanelAccess(user) || (fullPanelUser(user) ? 'full' : null);
  return {
    allowed: panelAccess === 'full' || fullPanelUser(user),
    panelAccess,
    siteAccess: true,
    staffRank: null,
    badges: withSiteBadges([], user),
    roles: Array.isArray(user.guildRoles) ? user.guildRoles.map(String) : [],
    live: false,
  };
}

export async function getStaffAccess(user) {
  if (!user?.id) return deniedAccess();

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return sessionFallback(user);

  try {
    const url = new URL(`${apiUrl}/api/access`);
    url.searchParams.set('discordId', String(user.id));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!response.ok) return sessionFallback(user);

    const result = await response.json();
    const livePanel = result.panelAccess === 'full' || result.panelAccess === 'limited'
      ? result.panelAccess
      : null;
    const memberFound = result.member === true;

    // Only hard-deny site access when Discord membership was confirmed without
    // the required roles. Member-fetch failures used to return siteAccess:false
    // and bounce everyone into an infinite Discord re-verify loop.
    let siteAccess;
    if (typeof result.siteAccess === 'boolean' && memberFound) {
      siteAccess = result.siteAccess || fullPanelUser(user);
    } else {
      siteAccess = hasSiteAccess(user) || fullPanelUser(user)
        || (typeof result.siteAccess === 'boolean' && result.siteAccess);
    }
    if (!siteAccess) return deniedAccess(user);

    // Developers/owners keep full panel even when Discord omits Ownership.
    // When membership is uncertain, fall back to signed login roles.
    const panelAccess = livePanel
      || (fullPanelUser(user) ? 'full' : null)
      || (!memberFound ? getSessionPanelAccess(user) : null);
    const liveRoles = Array.isArray(result.roles) ? result.roles.map(String).filter((id) => /^\d{16,22}$/.test(id)) : [];
    const sessionRoles = Array.isArray(user.guildRoles) ? user.guildRoles.map(String) : [];

    return {
      // Official-account / ownership tools stay full-panel only.
      allowed: panelAccess === 'full' || fullPanelUser(user),
      panelAccess,
      siteAccess: true,
      staffRank: typeof result.staffRank === 'string' ? result.staffRank : null,
      badges: withSiteBadges(result.badges, user),
      roles: liveRoles.length ? liveRoles : sessionRoles,
      live: memberFound,
    };
  } catch {
    return sessionFallback(user);
  }
}

export async function hasOwnerAccess(user) {
  return (await getStaffAccess(user)).allowed;
}
