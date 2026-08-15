import {
  FULL_STAFF_PANEL_ROLE_ID,
  LIMITED_STAFF_PANEL_ROLE_ID,
} from '../utils/staffRanks.js';

/** @deprecated Tester-only gate removed — kept so older imports do not break. */
export const SITE_TEST_ROLE_ID = '1514744040778760252';

/** Staff panel roles (Ownership / Management). Not required for site login. */
export const SITE_ACCESS_ROLE_IDS = Object.freeze([
  FULL_STAFF_PANEL_ROLE_ID,
  LIMITED_STAFF_PANEL_ROLE_ID,
]);

/**
 * Any confirmed Clearwater Discord member may use the site.
 * Staff/tester roles are not required for login or Clearwater Internet.
 */
export function rolesGrantSiteAccess(roleIds = []) {
  return Array.isArray(roleIds);
}

/** Soft check from the signed session (login already required Discord membership). */
export function hasSiteAccess(user) {
  return Boolean(user?.id);
}

/** Live Discord member check used by the bot status server. */
export function memberHasSiteAccess(member, { ownerDiscordIds = [] } = {}) {
  const discordId = String(member?.id || member?.user?.id || '');
  if (discordId && ownerDiscordIds.map(String).includes(discordId)) return true;
  return Boolean(member);
}
