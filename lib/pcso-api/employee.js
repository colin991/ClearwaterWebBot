import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../discord-auth.js';
import { handleEmployeeAction, postPcsoErlcApi } from '../../utils/pcsoEmployee.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') {
    try { return JSON.parse(request.body); } catch { return {}; }
  }
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 40_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

function sessionUser(request) {
  try {
    const { sessionSecret } = getAuthConfig();
    return readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
  } catch {
    return null;
  }
}

async function postToBot(payload) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return { ok: false, reason: 'not_configured' };
  try {
    const upstream = await fetch(`${apiUrl}/api/pcso/employee`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: body.error || `Bot returned HTTP ${upstream.status}` };
    }
    return { ok: true, body };
  } catch (error) {
    return { ok: false, error: error?.message || 'Could not reach the bot.' };
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  if (request.method === 'POST' && !isSameSiteRequest(request)) {
    return sendJson(response, 403, { error: 'Invalid request origin.' });
  }

  try {
    const user = sessionUser(request);
    const body = request.method === 'POST' ? await readBody(request) : {};
    const url = new URL(request.url || '/', 'http://localhost');
    const action = request.method === 'GET'
      ? (url.searchParams.get('action') || 'bootstrap')
      : String(body.action || 'bootstrap');
    const payload = request.method === 'GET'
      ? Object.fromEntries(url.searchParams.entries())
      : body;
    const { action: _ignored, ...fields } = payload;
    const actor = user ? {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      guildRoles: user.guildRoles || [],
      pinellasRoles: user.pinellasRoles || [],
    } : null;

    const posted = await postToBot({ action, payload: fields, user: actor });
    if (posted.ok) return sendJson(response, 200, posted.body);

    const onVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (posted.reason !== 'not_configured' && onVercel) {
      return sendJson(response, posted.status || 502, { error: posted.error || 'Employee panel could not reach the bot host.' });
    }

    const result = await handleEmployeeAction(action, fields, user, { postPcsoErlcApi });
    return sendJson(response, 200, result);
  } catch (error) {
    return sendJson(response, error.status || 400, { error: error.message || 'Employee request failed.' });
  }
}
