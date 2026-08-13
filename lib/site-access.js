/** Temporary tester gate — only Discord members with this role can use the site. */
export const SITE_TEST_ROLE_ID = '1514744040778760252';

/** Soft check from the signed session (login-time roles). Prefer live bot checks for APIs. */
export function hasSiteAccess(user) {
  if (!user?.id) return false;
  return Array.isArray(user.guildRoles)
    && user.guildRoles.some((roleId) => String(roleId) === SITE_TEST_ROLE_ID);
}

/** Live Discord member check used by the bot status server. */
export function memberHasSiteAccess(member, { ownerDiscordIds = [] } = {}) {
  const discordId = String(member?.id || member?.user?.id || '');
  if (discordId && ownerDiscordIds.map(String).includes(discordId)) return true;
  return Boolean(member?.roles?.cache?.has(SITE_TEST_ROLE_ID));
}
