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
export function getStaffPanelAccess(member, { ownerDiscordIds = [] } = {}) {
  const discordId = String(member?.id || member?.user?.id || '');
  if (discordId && ownerDiscordIds.includes(discordId)) return 'full';
  if (member?.roles?.cache?.has(FULL_STAFF_PANEL_ROLE_ID)) return 'full';
  if (member?.roles?.cache?.has(LIMITED_STAFF_PANEL_ROLE_ID)) return 'limited';
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

export const CLEARWATER_PREMIUM_ROLE_ID = '1514033571160133733';
export const CLEARWATER_STAFF_BADGE_ROLE_ID = '1514744040778760252';
export const DISCORD_INTERNET_BADGES = Object.freeze(['clearwater-role', 'staff']);
export const STAFF_ASSIGNABLE_BADGES = Object.freeze(['business', 'warning']);
export const ALLOWED_INTERNET_BADGES = Object.freeze([...DISCORD_INTERNET_BADGES, ...STAFF_ASSIGNABLE_BADGES]);

const ROLE_BADGES = Object.freeze([
  { id: CLEARWATER_PREMIUM_ROLE_ID, badge: 'clearwater-role' },
  { id: CLEARWATER_STAFF_BADGE_ROLE_ID, badge: 'staff' },
]);

export function sanitizeInternetBadges(badges) {
  return Array.isArray(badges) ? [...new Set(badges.filter((badge) => ALLOWED_INTERNET_BADGES.includes(badge)))] : [];
}

export function getInternetBadges(member) {
  return ROLE_BADGES.filter((item) => member?.roles?.cache?.has(item.id)).map((item) => item.badge);
}

/** Keep staff-assigned badges when Discord role sync refreshes Discord-only badges. */
export function mergeInternetBadges(existing, discordBadges) {
  const kept = sanitizeInternetBadges(existing).filter((badge) => STAFF_ASSIGNABLE_BADGES.includes(badge));
  return sanitizeInternetBadges([...(Array.isArray(discordBadges) ? discordBadges : []), ...kept]);
}
