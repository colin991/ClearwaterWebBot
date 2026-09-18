import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../discord-auth.js';

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
    const upstream = await fetch(`${apiUrl}/api/pcso/portal`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25_000),
    });
    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return { ok: false, status: upstream.status, error: body.error || `Bot returned HTTP ${upstream.status}` };
    }
    return { ok: true, body };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.code === 20
      || /aborted due to timeout|TimeoutError|The operation was aborted/i.test(String(error?.message || ''));
    return {
      ok: false,
      error: timedOut
        ? 'The bot host took too long to send that. Try again in a few seconds.'
        : (error?.message || 'Could not reach the bot.'),
    };
  }
}

export default async function handler(request, response) {
  const url = new URL(request.url || '/', 'http://localhost');
  const kind = url.searchParams.get('kind') || '';

  if (request.method === 'GET' && (kind === 'ticket-meta' || kind === 'calls')) {
    const posted = await postToBot({ kind, action: 'list' });
    if (posted.ok) return sendJson(response, 200, posted.body);
    if (kind === 'ticket-meta') {
      const { PINELLAS_SUPPORT_OPTIONS, websiteTicketFields } = await import('../../utils/pinellasSupport.js');
      return sendJson(response, 200, {
        ok: true,
        types: PINELLAS_SUPPORT_OPTIONS.map((option) => ({
          type: option.type,
          title: option.title,
          description: option.description,
          fields: websiteTicketFields(option.type),
        })),
      });
    }
    return sendJson(response, posted.reason === 'not_configured' ? 503 : 502, {
      error: posted.error || 'Active calls could not be loaded.',
      calls: [],
    });
  }

  if (!['GET', 'POST'].includes(request.method)) {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }
  if (request.method === 'POST' && !isSameSiteRequest(request)) {
    return sendJson(response, 403, { error: 'Invalid request origin.' });
  }

  const user = sessionUser(request);
  if (!user?.id) {
    return sendJson(response, 401, { error: 'Sign in with Discord first.' });
  }

  try {
    const body = request.method === 'GET'
      ? { kind: kind || 'ticket', action: 'list' }
      : await readBody(request);
    const payload = { ...body, user };
    const posted = await postToBot(payload);
    if (posted.ok) return sendJson(response, 200, posted.body);
    return sendJson(response, posted.status || (posted.reason === 'not_configured' ? 503 : 502), {
      error: posted.error || 'The PCSO bot host is unavailable.',
    });
  } catch (error) {
    const status = error?.status || (/Sign in/.test(error?.message || '') ? 401 : 400);
    return sendJson(response, status, { error: error?.message || 'Request failed.' });
  }
}
