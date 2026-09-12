import {
  FULL_STAFF_PANEL_ROLE_ID,
  LIMITED_STAFF_PANEL_ROLE_ID,
} from '../utils/staffRanks.js';

/** Temporary tester gate — Discord members with this role can use the site. */
export const SITE_TEST_ROLE_ID = '1514744040778760252';

/** Tester role or staff panel roles (Ownership / Management). */
export const SITE_ACCESS_ROLE_IDS = Object.freeze([
  SITE_TEST_ROLE_ID,
  FULL_STAFF_PANEL_ROLE_ID,
  LIMITED_STAFF_PANEL_ROLE_ID,
]);

export function rolesGrantSiteAccess(roleIds = []) {
  if (!Array.isArray(roleIds)) return false;
  return roleIds.some((roleId) => SITE_ACCESS_ROLE_IDS.includes(String(roleId)));
}

/** Soft check from the signed session (login-time roles). Prefer live bot checks when certain. */
export function hasSiteAccess(user) {
  if (!user?.id) return false;
  return rolesGrantSiteAccess(user.guildRoles);
}

/** Live Discord member check used by the bot status server. */
export function memberHasSiteAccess(member, { ownerDiscordIds = [] } = {}) {
  const discordId = String(member?.id || member?.user?.id || '');
  if (discordId && ownerDiscordIds.map(String).includes(discordId)) return true;
  if (!member?.roles?.cache) return false;
  return SITE_ACCESS_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
}
