import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../discord-auth.js';
import { getStaffAccess } from '../owner-access.js';
import { hasAdminPanelAccess } from '../admin-access.js';
import { getPcsoChatbot, matchPcsoChatbotReply, savePcsoChatbot } from '../../utils/pcsoChatbot.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 100_000) throw Object.assign(new Error('Request body too large.'), { status: 413 });
  }
  return raw ? JSON.parse(raw) : {};
}

async function isAdmin(request) {
  const { sessionSecret } = getAuthConfig();
  const user = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
  if (!user) return false;
  const staffAccess = await getStaffAccess(user);
  return Boolean(staffAccess.siteAccess && hasAdminPanelAccess(user, staffAccess));
}

async function botChatbot(method, body = null) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return null;
  try {
    const upstream = await fetch(`${apiUrl}/api/pcso/chatbot`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) throw new Error(payload.error || `Bot returned HTTP ${upstream.status}`);
    return payload;
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  try {
    response.setHeader('Cache-Control', 'no-store');
    if (request.method === 'GET') {
      const adminView = String(request.query?.admin || '') === '1';
      if (adminView && !(await isAdmin(request))) return sendJson(response, 403, { error: 'Admin permission is required.' });
      const config = await botChatbot('GET') || await getPcsoChatbot();
      return sendJson(response, 200, adminView
        ? { ok: true, ...config }
        : { ok: true, greeting: config.greeting });
    }

    if (!['POST', 'PUT'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed' });
    if (!isSameSiteRequest(request)) return sendJson(response, 403, { error: 'Invalid request origin.' });
    const body = await readBody(request);

    if (request.method === 'POST') {
      const message = String(body.message || '').trim().slice(0, 500);
      if (!message) return sendJson(response, 400, { error: 'Enter a question first.' });
      const upstream = await botChatbot('POST', { message });
      if (upstream) return sendJson(response, 200, upstream);
      const config = await getPcsoChatbot();
      return sendJson(response, 200, { ok: true, ...matchPcsoChatbotReply(message, config) });
    }

    if (!(await isAdmin(request))) return sendJson(response, 403, { error: 'Admin permission is required.' });
    const upstream = await botChatbot('PUT', body);
    if (upstream) return sendJson(response, 200, upstream);
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      return sendJson(response, 502, { error: 'The chatbot data service is unavailable.' });
    }
    return sendJson(response, 200, { ok: true, ...(await savePcsoChatbot(body)) });
  } catch (error) {
    return sendJson(response, error?.status || 400, { error: error?.message || 'The website assistant is unavailable.' });
  }
}
