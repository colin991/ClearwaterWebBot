import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../../lib/discord-auth.js';
import { getStaffAccess } from '../../lib/owner-access.js';
import { hasAdminPanelAccess } from '../../lib/admin-access.js';
import {
  addPcsoEventItem,
  addPcsoNewsItem,
  deletePcsoContentItem,
  getPcsoSiteContent,
} from '../../utils/pcsoSiteContent.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 50_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

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

export default async function handler(request, response) {
  try {
    if (request.method === 'GET') {
      const content = await getPcsoSiteContent();
      response.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
      return sendJson(response, 200, { ok: true, ...content });
    }

    if (!['POST', 'DELETE'].includes(request.method)) {
      return sendJson(response, 405, { error: 'Method not allowed' });
    }
    if (!isSameSiteRequest(request)) {
      return sendJson(response, 403, { error: 'Invalid request origin.' });
    }
    if (!(await requireAdmin(request, response))) return undefined;

    const body = await readBody(request);

    if (request.method === 'DELETE') {
      const kind = body.kind === 'event' ? 'event' : 'news';
      const id = String(body.id || '').trim();
      if (!id) return sendJson(response, 400, { error: 'Content id is required.' });
      const content = await deletePcsoContentItem(kind, id);
      return sendJson(response, 200, { ok: true, ...content });
    }

    if (body.kind === 'event') {
      if (!String(body.title || '').trim()) {
        return sendJson(response, 400, { error: 'Event title is required.' });
      }
      const content = await addPcsoEventItem(body);
      return sendJson(response, 200, { ok: true, ...content });
    }

    if (!String(body.title || '').trim()) {
      return sendJson(response, 400, { error: 'News title is required.' });
    }
    const content = await addPcsoNewsItem(body);
    return sendJson(response, 200, { ok: true, ...content });
  } catch (error) {
    return sendJson(response, 502, {
      error: error?.message || 'PCSO content could not be updated.',
      news: [],
      events: [],
    });
  }
}
