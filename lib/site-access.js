/** Temporary tester gate — only Discord members with this role can use the site. */
export const SITE_TEST_ROLE_ID = '1514744040778760252';

export function hasSiteAccess(user) {
  if (!user?.id) return false;
  return Array.isArray(user.guildRoles)
    && user.guildRoles.some((roleId) => String(roleId) === SITE_TEST_ROLE_ID);
}
