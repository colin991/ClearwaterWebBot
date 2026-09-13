import {
  SESSION_COOKIE,
  getAuthConfig,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../discord-auth.js';
import { getStaffAccess } from '../owner-access.js';
import { hasAdminPanelAccess } from '../admin-access.js';
import { formatTalkDuration, getRadioTalkLogs } from '../../utils/pcsoRadioTalkLogs.js';

async function requireAdmin(request, response) {
  try {
    const { sessionSecret } = getAuthConfig();
    const user = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!user) {
      sendJson(response, 401, { error: 'Sign in with Discord first.' });
      return null;
    }
    const staffAccess = await getStaffAccess(user);
    if (!staffAccess.siteAccess || !hasAdminPanelAccess(user, staffAccess)) {
      sendJson(response, 403, { error: 'Admin permission is required.' });
      return null;
    }
    return user;
  } catch {
    sendJson(response, 503, { error: 'Authentication is unavailable right now.' });
    return null;
  }
}

async function fetchFromBotApi(limit) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return null;
  const upstream = await fetch(`${apiUrl}/api/pcso/radio-logs?limit=${limit}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!upstream.ok) return null;
  return upstream.json().catch(() => null);
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  if (!(await requireAdmin(request, response))) return undefined;

  const url = new URL(request.url || '/', 'http://localhost');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  try {
    const fromBot = await fetchFromBotApi(limit);
    if (fromBot && Array.isArray(fromBot.entries)) {
      return sendJson(response, 200, {
        ok: true,
        source: 'bot',
        updatedAt: fromBot.updatedAt || null,
        entries: fromBot.entries,
      });
    }

    const store = await getRadioTalkLogs();
    return sendJson(response, 200, {
      ok: true,
      source: 'local',
      updatedAt: store.updatedAt,
      entries: store.entries.slice(0, limit).map((entry) => ({
        ...entry,
        durationLabel: formatTalkDuration(entry.durationMs),
      })),
    });
  } catch (error) {
    return sendJson(response, 502, {
      error: error?.message || 'Radio talk logs could not be loaded.',
      entries: [],
    });
  }
}
