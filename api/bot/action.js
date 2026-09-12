import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../../lib/discord-auth.js';

const readBody = async (request) => {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);

  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 4096) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
};

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!isSameSiteRequest(request)) return sendJson(response, 403, { error: 'Invalid request origin' });

  try {
    const { sessionSecret } = getAuthConfig();
    const session = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!session) return sendJson(response, 401, { error: 'Sign in with Discord first' });

    const body = await readBody(request);
    if (body.action !== 'ping') return sendJson(response, 400, { error: 'Unsupported action' });

    const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.BOT_API_KEY;
    if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'Bot connection is not configured' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    try {
      const botResponse = await fetch(`${apiUrl}/api/actions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'ping', requestedBy: session.id }),
        signal: controller.signal,
      });

      if (!botResponse.ok) return sendJson(response, 502, { error: 'Bot did not accept the action' });
      const result = await botResponse.json();
      return sendJson(response, 200, {
        ok: result.ok === true,
        action: 'ping',
        acknowledgedAt: result.acknowledgedAt || new Date().toISOString(),
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return sendJson(response, 502, { error: 'Bot is unavailable' });
  }
}
