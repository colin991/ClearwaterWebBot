/** Join-request whitelist: Clearwater Roleplay ERLC */
export const ROBLOX_JOIN_GROUP_ID = '163783791';
/** Treasury / `-funds`: Clearwater-Whitelisted */
export const ROBLOX_FUNDS_GROUP_ID = '140437562';

function numericId(value) {
  const id = String(value || '').trim();
  return /^\d+$/.test(id) ? id : '';
}

/**
 * Join-request sync always uses the ERLC whitelist group, even if the host
 * env pointed ROBLOX_GROUP_ID at the funds community by mistake.
 */
export function resolveJoinGroupId(config = {}) {
  const id = numericId(config.robloxGroupId);
  if (!id || id === ROBLOX_FUNDS_GROUP_ID) return ROBLOX_JOIN_GROUP_ID;
  return id;
}

/**
 * `-funds` always uses the treasury community, even if ROBLOX_FUNDS_GROUP_ID
 * was copied from the join-request group id.
 */
export function resolveFundsGroupId(config = {}) {
  const id = numericId(config.robloxFundsGroupId);
  if (!id || id === ROBLOX_JOIN_GROUP_ID) return ROBLOX_FUNDS_GROUP_ID;
  return id;
}
