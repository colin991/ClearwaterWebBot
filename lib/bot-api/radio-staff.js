import {
  RADIO_COOKIE,
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  radioCookieSecret,
  readSessionToken,
  sendJson,
} from '../discord-auth.js';

const ACTIONS = new Set(['mute', 'unmute', 'kick']);
// Website-only tools, each with what it needs: a member, some text, or a recording id.
const TOOLS = {
  warn: (body) => (/^\d{15,22}$/.test(String(body.userId || '')) && String(body.text || '').trim()
    ? { userId: String(body.userId), text: String(body.text).slice(0, 200) } : null),
  shout: (body) => (String(body.text || '').trim() ? { text: String(body.text).slice(0, 200) } : null),
  'event-open': (body) => ({ name: String(body.name || '').slice(0, 32) }),
  'event-close': () => ({}),
  recordings: () => ({}),
  recording: (body) => (/^[a-z0-9-]{4,40}$/.test(String(body.id || '')) ? { id: String(body.id) } : null),
};
const MAX_BODY = 60_000; // a full coverage map

const readBody = async (request) => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body || '{}');
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
};

/**
 * Radio staff panel on the website (cwpcso.com/radio-staff). The page always POSTs here with
 * { view } to load, { search } to find a member, { action, userId } to mute, unmute or kick, or
 * { action: 'coverage', coverage } to save the cell towers and weak-signal areas, or one of the
 * staff tools: warn, shout, event-open, event-close, recordings, recording.
 * The bot checks Administrator in the Clearwater server live on every call.
 */
export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!isSameSiteRequest(request)) return sendJson(response, 403, { error: 'Invalid request origin' });

  try {
    const { sessionSecret } = getAuthConfig(request);
    const cookies = parseCookies(request.headers.cookie);
    const session = readSessionToken(cookies[SESSION_COOKIE], sessionSecret)
      || readSessionToken(cookies[RADIO_COOKIE], radioCookieSecret(sessionSecret));
    if (!session?.id) return sendJson(response, 401, { error: 'Sign in with Discord first', signIn: true });

    let body;
    try {
      body = await readBody(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid request' });
    }

    const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.BOT_API_KEY;
    if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'The radio is not connected to the website yet.' });

    const headers = { Authorization: `Bearer ${apiKey}` };
    let botResponse;
    if (body?.action === 'coverage') {
      if (!body.coverage || typeof body.coverage !== 'object') return sendJson(response, 400, { error: 'Invalid coverage' });
      botResponse = await fetch(`${apiUrl}/api/radio/staff`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: session.id, action: 'coverage', coverage: body.coverage }),
        signal: AbortSignal.timeout(8000),
      });
    } else if (Object.hasOwn(TOOLS, String(body?.action || ''))) {
      const fields = TOOLS[body.action](body);
      if (!fields) return sendJson(response, 400, { error: 'Invalid action' });
      botResponse = await fetch(`${apiUrl}/api/radio/staff`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: session.id, action: body.action, ...fields }),
        signal: AbortSignal.timeout(body.action === 'recording' ? 15000 : 8000),
      });
    } else if (body?.action) {
      const userId = String(body.userId || '');
      if (!ACTIONS.has(body.action) || !/^\d{15,22}$/.test(userId)) return sendJson(response, 400, { error: 'Invalid action' });
      botResponse = await fetch(`${apiUrl}/api/radio/staff`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ discordId: session.id, action: body.action, userId }),
        signal: AbortSignal.timeout(8000),
      });
    } else {
      const query = new URLSearchParams({ discordId: session.id });
      const search = String(body?.search || '').trim().slice(0, 32);
      if (search) query.set('q', search);
      botResponse = await fetch(`${apiUrl}/api/radio/staff?${query}`, { headers, signal: AbortSignal.timeout(8000) });
    }
    const result = await botResponse.json().catch(() => ({}));
    if (!botResponse.ok) {
      const status = [400, 403, 404, 409].includes(botResponse.status) ? botResponse.status : 503;
      return sendJson(response, status, { error: result.error || 'The radio is offline right now.' });
    }
    return sendJson(response, 200, result);
  } catch {
    return sendJson(response, 502, { error: 'The radio is offline right now.' });
  }
}
