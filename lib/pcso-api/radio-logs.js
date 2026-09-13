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

function isVercelRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

export async function requireAdmin(request, response) {
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
  if (!apiUrl || !apiKey) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const upstream = await fetch(`${apiUrl}/api/pcso/radio-logs?limit=${limit}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      return {
        ok: false,
        reason: 'upstream_error',
        status: upstream.status,
        error: `Bot radio-logs returned HTTP ${upstream.status}.`,
      };
    }
    const body = await upstream.json().catch(() => null);
    if (!body || !Array.isArray(body.entries)) {
      return { ok: false, reason: 'bad_payload', error: 'Bot radio-logs response was invalid.' };
    }
    return { ok: true, body };
  } catch (error) {
    return {
      ok: false,
      reason: 'unreachable',
      error: error?.message || 'Could not reach the bot radio-logs API.',
    };
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  if (!(await requireAdmin(request, response))) return undefined;

  const url = new URL(request.url || '/', 'http://localhost');
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50));

  const fromBot = await fetchFromBotApi(limit);
  if (fromBot.ok) {
    return sendJson(response, 200, {
      ok: true,
      source: 'bot',
      updatedAt: fromBot.body.updatedAt || null,
      radioMonitor: fromBot.body.radioMonitor || null,
      entries: fromBot.body.entries,
    });
  }

  // Production website has no shared disk with the bot. Never pretend empty local
  // storage means "no transmits yet" when the bot bridge is missing or failing.
  if (isVercelRuntime() || fromBot.reason !== 'not_configured') {
    const error = fromBot.reason === 'not_configured'
      ? 'Radio talk logs need BOT_API_URL and BOT_API_KEY on Vercel pointing at the bot host.'
      : (fromBot.error || 'Radio talk logs could not be loaded from the bot.');
    return sendJson(response, 502, {
      ok: false,
      source: 'unavailable',
      reason: fromBot.reason,
      error,
      entries: [],
    });
  }

  try {
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
      ok: false,
      source: 'local',
      error: error?.message || 'Radio talk logs could not be loaded.',
      entries: [],
    });
  }
}
