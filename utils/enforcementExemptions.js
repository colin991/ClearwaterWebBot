import { robloxNameMatchesText } from './robloxDiscordMatch.js';
import { isOnVcWhitelist } from './vcWhitelist.js';

export const ENFORCEMENT_EXEMPT_ROLE = '1514033074948800683';
export const ENFORCEMENT_EXEMPT_ROLE_IDS = Object.freeze([
  ENFORCEMENT_EXEMPT_ROLE,
  '1514033321024426154',
]);
const VC_EXEMPT_NAMES = new Set(['coleddev13', 'notj3dah']);

function memberHasExemptRole(member) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  const has = (id) => (typeof cache.has === 'function' ? cache.has(id) : false);
  return ENFORCEMENT_EXEMPT_ROLE_IDS.some((id) => has(id));
}

export function hasEnforcementExemption(player, members, identities = {}) {
  return [...members.values()].some(member => {
    if (member.user?.bot || !memberHasExemptRole(member)) return false;
    if (player.robloxId && String(identities[member.id]?.robloxId || '') === String(player.robloxId)) return true;
    const username = String(player.username || '').trim().toLowerCase();
    return username.length >= 3 && [member.nickname, member.displayName, member.user?.globalName, member.user?.username]
      .some(name => robloxNameMatchesText(name, username));
  });
}

export function isVcExempt(player, members, identities = {}) {
  return VC_EXEMPT_NAMES.has(String(player.username || '').trim().toLowerCase())
    || isOnVcWhitelist(player, members, identities)
    || hasEnforcementExemption(player, members, identities);
}
