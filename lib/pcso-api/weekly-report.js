import { SESSION_COOKIE, getAuthConfig, parseCookies, readSessionToken, sendJson } from '../discord-auth.js';
import { getStaffAccess } from '../owner-access.js';
import { hasAdminPanelAccess } from '../admin-access.js';
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
    if (status === 429) response.setHeader('Retry-After', String(Math.max(1, Math.ceil(error.retryAfter || 60))));
    // Direct browser visits (including older cached download links) need a page, not raw JSON.
    if (String(request.headers.accept || '').includes('text/html')) {
      response.statusCode = status;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      return response.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Report temporarily unavailable</title><body style="margin:0;background:#121316;color:#f1f2f4;font:18px system-ui;line-height:1.6"><main style="max-width:560px;margin:15vh auto;padding:24px"><h1>Report temporarily unavailable</h1><p>${status === 429 ? 'The report service is busy. Please wait a minute, then try downloading your report again.' : 'Your report could not be generated. Please return to the admin panel and try again.'}</p><a style="color:#a8bff0" href="/admin">Return to admin panel</a></main></body></html>`);
    }
    return sendJson(response, status, {
      error: error?.message || 'Weekly report PDF could not be generated.',
    });
  }
}
