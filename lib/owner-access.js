import { isOwner } from './discord-auth.js';
import { hasSiteAccess } from './site-access.js';
import {
  getSessionPanelAccess,
  hasFullWebsiteAccess,
  isDeveloperAccount,
  rolesAllowServerManagement,
  withSiteBadges,
} from '../utils/staffRanks.js';

function ownerRoleIdsFromEnv() {
  return (process.env.OWNER_ROLE_IDS || '1514033074948800683')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function deniedAccess(user = null) {
  return {
    allowed: false,
    panelAccess: null,
    siteAccess: false,
    staffRank: null,
    badges: withSiteBadges([], user || {}),
    roles: [],
    live: false,
    serverManagement: false,
    governmentAccess: false,
    governmentReview: false,
    governmentRoles: [],
  };
}

function fullPanelUser(user) {
  return isOwner(user) || isDeveloperAccount(user);
}

/** Full website permissions for Ownership and Developer badge accounts. */
function developerFullAccess(user) {
  return {
    allowed: true,
    panelAccess: 'full',
    siteAccess: true,
    staffRank: 'Developer',
    badges: withSiteBadges(['developer'], user),
    roles: Array.isArray(user?.guildRoles) ? user.guildRoles.map(String) : [],
    live: false,
    serverManagement: true,
    governmentAccess: true,
    governmentReview: true,
    governmentRoles: [],
  };
}

function sessionPanelFor(user) {
  return getSessionPanelAccess(user, { ownerRoleIds: ownerRoleIdsFromEnv() })
    || (fullPanelUser(user) ? 'full' : null);
}

function canUseServerManagement(access, user) {
  if (fullPanelUser(user)) return true;
  if (access?.allowed || access?.panelAccess === 'full' || access?.panelAccess === 'limited') return true;
  const roles = Array.isArray(access?.roles) && access.roles.length
    ? access.roles
    : (Array.isArray(user?.guildRoles) ? user.guildRoles : []);
  return rolesAllowServerManagement(roles);
}

function sessionFallback(user) {
  // Bot unreachable / uncertain: trust signed Discord OAuth roles from login.
  // Never invent privileges from client-supplied flags.
  if (hasFullWebsiteAccess(user)) return developerFullAccess(user);
  const siteAccess = hasSiteAccess(user) || fullPanelUser(user);
  if (!siteAccess) return deniedAccess(user);
  const panelAccess = sessionPanelFor(user);
  const access = {
    allowed: panelAccess === 'full' || fullPanelUser(user),
    panelAccess,
    siteAccess: true,
    staffRank: null,
    badges: withSiteBadges([], user),
    roles: Array.isArray(user.guildRoles) ? user.guildRoles.map(String) : [],
    live: false,
  };
  return {
    ...access,
    serverManagement: canUseServerManagement(access, user),
    // Without a live bot check we only trust ownership for government tools.
    governmentAccess: access.allowed,
    governmentReview: access.allowed,
    governmentRoles: [],
  };
}

export async function getStaffAccess(user) {
  if (!user?.id) return deniedAccess();
  // Only trust an explicit developer badge on the session object here.
  // Hardcoded developer IDs wait for the live bot/store badge check below so
  // Ownership can revoke the badge and cut site permissions.
  if (Array.isArray(user.badges) && hasFullWebsiteAccess(user)) return developerFullAccess(user);

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return sessionFallback(user);

  try {
    const url = new URL(`${apiUrl}/api/access`);
    url.searchParams.set('discordId', String(user.id));
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return sessionFallback(user);

    const result = await response.json();
    // Live store/Discord badges decide developer access (owner grant/revoke).
    const liveBadges = Array.isArray(result.badges) ? result.badges : [];
    if (hasFullWebsiteAccess({ ...user, badges: liveBadges })) {
      const liveRoles = Array.isArray(result.roles)
        ? result.roles.map(String).filter((id) => /^\d{16,22}$/.test(id))
        : [];
      return {
        ...developerFullAccess(user),
        live: result.member === true,
        roles: liveRoles.length
          ? liveRoles
          : (Array.isArray(user.guildRoles) ? user.guildRoles.map(String) : []),
        badges: withSiteBadges(liveBadges, { ...user, badges: liveBadges }),
      };
    }
    const livePanel = result.panelAccess === 'full' || result.panelAccess === 'limited'
      ? result.panelAccess
      : null;
    const memberFound = result.member === true;

    // Any confirmed Clearwater Discord member may use the site.
    // Ignore legacy bot siteAccess flags that still reflected tester/staff-only gates.
    let siteAccess;
    if (memberFound) {
      siteAccess = true;
    } else if (typeof result.member === 'boolean' && result.member === false) {
      siteAccess = fullPanelUser(user);
    } else {
      siteAccess = hasSiteAccess(user) || fullPanelUser(user);
    }
    if (!siteAccess) return deniedAccess(user);

    // Developers/owners keep full panel even when Discord omits Ownership.
    // When membership is uncertain, fall back to signed login roles.
    // Prefer live Discord panel access; fall back to signed login roles so
    // Management ranks still work before the bot host is restarted.
    const panelAccess = livePanel
      || (fullPanelUser(user) ? 'full' : null)
      || sessionPanelFor(user);
    const liveRoles = Array.isArray(result.roles) ? result.roles.map(String).filter((id) => /^\d{16,22}$/.test(id)) : [];
    const sessionRoles = Array.isArray(user.guildRoles) ? user.guildRoles.map(String) : [];

    const access = {
      // Official-account / ownership tools stay full-panel only.
      allowed: panelAccess === 'full' || fullPanelUser(user),
      panelAccess,
      siteAccess: true,
      staffRank: typeof result.staffRank === 'string' ? result.staffRank : null,
      badges: withSiteBadges(result.badges, user),
      roles: liveRoles.length ? liveRoles : sessionRoles,
      live: memberFound,
    };
    const ownership = access.allowed;
    return {
      ...access,
      serverManagement: canUseServerManagement(access, user),
      governmentAccess: ownership || result.governmentAccess === true,
      governmentReview: ownership || result.governmentReview === true,
      governmentRoles: Array.isArray(result.governmentRoles)
        ? result.governmentRoles.map(String).filter((id) => /^\d{16,22}$/.test(id))
        : [],
    };
  } catch {
    return sessionFallback(user);
  }
}

export async function hasOwnerAccess(user) {
  return (await getStaffAccess(user)).allowed;
}

/** Ownership + Management track can open the live ER:LC Server Management panel. */
export async function hasServerManagementAccess(user) {
  return (await getStaffAccess(user)).serverManagement === true;
}
