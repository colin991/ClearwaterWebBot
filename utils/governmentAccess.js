/** Clearwater Government Discord (separate from the main RP guild). */

export const GOVERNMENT_GUILD_ID = '1526016190642651307';
export const GOVERNMENT_ACCESS_ROLE_ID = '1533015034643615847';
export const GOVERNMENT_LOG_CHANNEL_ID = '1538291625447661768';

/** Can approve / deny fine requests (plus Ownership on the main guild). */
export const GOVERNMENT_REVIEW_ROLE_IDS = Object.freeze([
  '1526018657778667730',
  '1526019240979861564',
  '1526019269924749404',
]);

export function rolesAllowGovernmentAccess(roleIds = []) {
  const ids = new Set((Array.isArray(roleIds) ? roleIds : []).map(String));
  return ids.has(GOVERNMENT_ACCESS_ROLE_ID)
    || GOVERNMENT_REVIEW_ROLE_IDS.some((id) => ids.has(id));
}

export function rolesAllowGovernmentReview(roleIds = []) {
  const ids = new Set((Array.isArray(roleIds) ? roleIds : []).map(String));
  return GOVERNMENT_REVIEW_ROLE_IDS.some((id) => ids.has(id));
}
