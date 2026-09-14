export const ENFORCEMENT_EXEMPT_ROLE = '1514033074948800683';
const VC_EXEMPT_NAMES = new Set(['coleddev13', 'notj3dah']);

export function hasEnforcementExemption(player, members, identities = {}) {
  return [...members.values()].some(member => {
    if (member.user?.bot || !member.roles?.cache?.has(ENFORCEMENT_EXEMPT_ROLE)) return false;
    if (player.robloxId && String(identities[member.id]?.robloxId || '') === String(player.robloxId)) return true;
    const username = String(player.username || '').trim().toLowerCase();
    return username.length >= 3 && [member.nickname, member.displayName, member.user?.globalName, member.user?.username]
      .some(name => String(name || '').toLowerCase().includes(username));
  });
}

export function isVcExempt(player, members, identities = {}) {
  return VC_EXEMPT_NAMES.has(String(player.username || '').trim().toLowerCase())
    || hasEnforcementExemption(player, members, identities);
}
