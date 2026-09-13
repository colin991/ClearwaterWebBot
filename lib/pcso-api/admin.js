import { SESSION_COOKIE, getAuthConfig, parseCookies, readSessionToken, sendJson } from '../discord-auth.js';
import { getStaffAccess } from '../owner-access.js';
import { hasAdminPanelAccess } from '../admin-access.js';
import { buildPcsoAdminRoster } from '../../utils/pcsoAdminData.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const cookies = parseCookies(request.headers.cookie);
    const user = readSessionToken(cookies[SESSION_COOKIE], sessionSecret);
    if (!user) return sendJson(response, 401, { error: 'Sign in with Discord to continue.' });

    const staffAccess = await getStaffAccess(user);
    if (!staffAccess.siteAccess || !hasAdminPanelAccess(user, staffAccess)) {
      return sendJson(response, 403, { error: 'Admin permission is required for this panel.' });
    }

    const roster = await buildPcsoAdminRoster({
      melonlyApiKey: process.env.MELONLY_API_KEY?.trim() || '',
    });

    return sendJson(response, 200, {
      ok: true,
      viewer: {
        id: user.id,
        displayName: user.displayName || user.username,
      },
      ...roster,
    });
  } catch (error) {
    const status = error?.status === 429 ? 429 : 502;
    return sendJson(response, status, {
      error: error?.message || 'Admin roster could not be loaded.',
      people: [],
    });
  }
}
