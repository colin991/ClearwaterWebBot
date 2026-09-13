import { isOwner } from './discord-auth.js';
import {
  FULL_STAFF_PANEL_ROLE_ID,
  LEAD_MANAGEMENT_ROLE_ID,
  LIMITED_STAFF_PANEL_ROLE_ID,
  SENIOR_MANAGEMENT_ROLE_ID,
  TRIAL_MANAGEMENT_ROLE_ID,
} from '../utils/staffRanks.js';
import { PINELLAS_COMMAND_ACCESS_ROLE_ID } from '../utils/pinellasServer.js';

/** Clearwater Discord admin / management roles that can open the PCSO admin panel. */
const CLEARWATER_ADMIN_ROLE_IDS = Object.freeze([
  FULL_STAFF_PANEL_ROLE_ID,
  LEAD_MANAGEMENT_ROLE_ID,
  SENIOR_MANAGEMENT_ROLE_ID,
  LIMITED_STAFF_PANEL_ROLE_ID,
  TRIAL_MANAGEMENT_ROLE_ID,
  '1514033381543903262', // Lead Administrator
  '1514033406231711754', // Senior Administrator
  '1514033422270464070', // Administrator
]);

function roleSet(user) {
  return new Set([
    ...(Array.isArray(user?.guildRoles) ? user.guildRoles : []),
    ...(Array.isArray(user?.pinellasRoles) ? user.pinellasRoles : []),
  ].map(String));
}

/**
 * True when the signed-in Discord user can use the PCSO admin panel.
 * Accepts Discord Administrator permission, PCSO command role, Clearwater
 * admin/management roles, website owners, or live full/limited staff panel access.
 */
export function hasAdminPanelAccess(user, staffAccess = null) {
  if (!user?.id) return false;
  if (isOwner(user)) return true;
  if (user.discordAdmin === true) return true;
  if (staffAccess?.allowed) return true;
  if (staffAccess?.panelAccess === 'full' || staffAccess?.panelAccess === 'limited') return true;

  const roles = roleSet(user);
  if (roles.has(String(PINELLAS_COMMAND_ACCESS_ROLE_ID))) return true;
  return CLEARWATER_ADMIN_ROLE_IDS.some((roleId) => roles.has(String(roleId)));
}
