export const CLEARWATER_GUILD_ID = '1514026810348671026';
export const FULL_STAFF_PANEL_ROLE_ID = '1514033074948800683';
export const LIMITED_STAFF_PANEL_ROLE_ID = '1514033321024426154';

export const STAFF_RANKS = Object.freeze([
  { id: FULL_STAFF_PANEL_ROLE_ID, name: 'Ownership', owner: true, panel: 'full' },
  { id: '1525019105432965181', name: 'Lead Management' },
  { id: '1514033299524292668', name: 'Senior Management' },
  { id: LIMITED_STAFF_PANEL_ROLE_ID, name: 'Management', panel: 'limited' },
  { id: '1516923344685895721', name: 'Trial Management' },
  { id: '1514033336505335969', name: 'Senior Supervisor' },
  { id: '1514033351655293020', name: 'Supervisor' },
  { id: '1514033381543903262', name: 'Lead Administrator' },
  { id: '1514033406231711754', name: 'Senior Administrator' },
  { id: '1514033422270464070', name: 'Administrator' },
  { id: '1514033441681703042', name: 'Lead Moderator' },
  { id: '1514033464872009891', name: 'Senior Moderator' },
  { id: '1514033477413114036', name: 'Moderator' },
]);

export function getHighestStaffRank(member) {
  return STAFF_RANKS.find((rank) => member?.roles?.cache?.has(rank.id)) || null;
}

/** Internet staff desk access. Ownership = full, Management = limited. */
export function getStaffPanelAccess(member, { ownerDiscordIds = [], ownerRoleIds = [] } = {}) {
  const discordId = String(member?.id || member?.user?.id || '');
  if (discordId && ownerDiscordIds.map(String).includes(discordId)) return 'full';
  if (isDeveloperAccount({
    id: discordId,
    username: member?.user?.username || member?.username,
  })) return 'full';
  const roleCache = member?.roles?.cache;
  for (const roleId of ownerRoleIds.map(String)) {
    if (roleId && roleCache?.has(roleId)) return 'full';
  }
  if (roleCache?.has(FULL_STAFF_PANEL_ROLE_ID)) return 'full';
  if (roleCache?.has(LIMITED_STAFF_PANEL_ROLE_ID)) return 'limited';
  const rank = getHighestStaffRank(member);
  if (rank?.panel === 'full' || rank?.owner) return 'full';
  if (rank?.panel === 'limited') return 'limited';
  return null;
}

/** Panel access from signed session guild roles (Discord OAuth at login). */
export function getSessionPanelAccess(user, { ownerDiscordIds = [], ownerRoleIds = [] } = {}) {
  const discordId = String(user?.id || '');
  if (discordId && ownerDiscordIds.map(String).includes(discordId)) return 'full';
  if (isDeveloperAccount(user)) return 'full';
  const roles = Array.isArray(user?.guildRoles) ? user.guildRoles.map(String) : [];
  for (const roleId of ownerRoleIds.map(String)) {
    if (roleId && roles.includes(roleId)) return 'full';
  }
  if (roles.includes(FULL_STAFF_PANEL_ROLE_ID)) return 'full';
  if (roles.includes(LIMITED_STAFF_PANEL_ROLE_ID)) return 'limited';
  return null;
}

export const LIMITED_STAFF_FORBIDDEN_ACTIONS = Object.freeze([
  'verify',
  'unverify',
  'ip-ban',
  'clear-ip-ban',
  'badge-business',
  'unbadge-business',
]);

export const CLEARWATER_SUPPORTER_ROLE_ID = '1514033599417159750';
export const CLEARWATER_PREMIUM_ROLE_ID = '1514033571160133733';
export const CLEARWATER_STAFF_BADGE_ROLE_ID = '1514744040778760252';
export const DISCORD_INTERNET_BADGES = Object.freeze(['clearwater-role', 'staff']);
export const STAFF_ASSIGNABLE_BADGES = Object.freeze(['business', 'warning']);
export const SITE_FIXED_BADGES = Object.freeze(['developer']);
export const ALLOWED_INTERNET_BADGES = Object.freeze([
  ...DISCORD_INTERNET_BADGES,
  ...STAFF_ASSIGNABLE_BADGES,
  ...SITE_FIXED_BADGES,
]);

/** Highest matching Discord role wins. Default members still get the base daily. */
export const DAILY_CREDIT_ROLE_TIERS = Object.freeze([
  { id: CLEARWATER_STAFF_BADGE_ROLE_ID, amount: 300, label: 'Staff' },
  { id: CLEARWATER_PREMIUM_ROLE_ID, amount: 250, label: 'Clearwater+' },
  { id: CLEARWATER_SUPPORTER_ROLE_ID, amount: 200, label: 'Supporter' },
]);
export const BASE_DAILY_CREDITS = 75;

export function dailyCreditTierForRoles(roles = [], badges = []) {
  const roleSet = new Set((Array.isArray(roles) ? roles : []).map(String));
  for (const tier of DAILY_CREDIT_ROLE_TIERS) {
    if (roleSet.has(tier.id)) return { ...tier };
  }
  const badgeSet = new Set((Array.isArray(badges) ? badges : []).map(String));
  if (badgeSet.has('staff')) {
    return { ...DAILY_CREDIT_ROLE_TIERS.find((tier) => tier.id === CLEARWATER_STAFF_BADGE_ROLE_ID) };
  }
  if (badgeSet.has('clearwater-role')) {
    return { ...DAILY_CREDIT_ROLE_TIERS.find((tier) => tier.id === CLEARWATER_PREMIUM_ROLE_ID) };
  }
  return { id: null, amount: BASE_DAILY_CREDITS, label: 'Member' };
}

/** Colin (owner) + Pixel — hardcoded developer badge accounts. */
export const DEVELOPER_DISCORD_IDS = Object.freeze([
  '1044686997194805280',
]);
export const DEVELOPER_USERNAMES = Object.freeze([
  'colin',
  'colinxyz',
  'pixel',
  'pixelnovaa',
  'pixelxnovaa',
  'plxelnovaa',
]);

const ROLE_BADGES = Object.freeze([
  { id: CLEARWATER_PREMIUM_ROLE_ID, badge: 'clearwater-role' },
  { id: CLEARWATER_STAFF_BADGE_ROLE_ID, badge: 'staff' },
]);

export function sanitizeInternetBadges(badges) {
  return Array.isArray(badges) ? [...new Set(badges.filter((badge) => ALLOWED_INTERNET_BADGES.includes(badge)))] : [];
}

export function isDeveloperAccount(user = {}) {
  const id = String(user.id || '').trim();
  if (id && DEVELOPER_DISCORD_IDS.includes(id)) return true;
  const username = String(user.username || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  return Boolean(username && DEVELOPER_USERNAMES.includes(username));
}

/** Apply fixed site badges (developer) after role/store sanitization. */
export function withSiteBadges(badges, user = {}) {
  const next = sanitizeInternetBadges(badges);
  if (isDeveloperAccount(user) && !next.includes('developer')) next.push('developer');
  return next;
}

export function getInternetBadges(member) {
  const roleBadges = ROLE_BADGES.filter((item) => member?.roles?.cache?.has(item.id)).map((item) => item.badge);
  return withSiteBadges(roleBadges, {
    id: member?.id || member?.user?.id,
    username: member?.user?.username || member?.username,
  });
}

/** Keep staff-assigned + fixed badges when Discord role sync refreshes Discord-only badges. */
export function mergeInternetBadges(existing, discordBadges, user = {}) {
  const kept = sanitizeInternetBadges(existing).filter((badge) => (
    STAFF_ASSIGNABLE_BADGES.includes(badge) || SITE_FIXED_BADGES.includes(badge)
  ));
  return withSiteBadges([...(Array.isArray(discordBadges) ? discordBadges : []), ...kept], user);
}
