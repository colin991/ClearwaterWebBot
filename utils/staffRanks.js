export const CLEARWATER_GUILD_ID = '1514026810348671026';

export const STAFF_RANKS = Object.freeze([
  { id: '1514033074948800683', name: 'Ownership', owner: true },
  { id: '1525019105432965181', name: 'Lead Management' },
  { id: '1514033299524292668', name: 'Senior Management' },
  { id: '1514033321024426154', name: 'Management' },
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
