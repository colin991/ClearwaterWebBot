import { SESSION_COOKIE, getAuthConfig, parseCookies, readSessionToken, sendJson } from '../../lib/discord-auth.js';
import { getStaffAccess } from '../../lib/owner-access.js';
import { hasAdminPanelAccess } from '../../lib/admin-access.js';
import { buildPcsoWeeklyReportPdf } from '../../utils/pcsoAdminData.js';

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

    const requestUrl = new URL(request.url, `https://${request.headers.host || 'localhost'}`);
    const discordId = requestUrl.searchParams.get('discordId') || '';
    const result = await buildPcsoWeeklyReportPdf({
      melonlyApiKey: process.env.MELONLY_API_KEY?.trim() || '',
      discordId,
    });

    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    response.end(result.pdf);
    return undefined;
  } catch (error) {
    const status = error?.status || 502;
    return sendJson(response, status, {
      error: error?.message || 'Weekly report PDF could not be generated.',
    });
  }
}
