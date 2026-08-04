import {
  SESSION_COOKIE,
  getAuthConfig,
  isOwner,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../../lib/discord-auth.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 8192) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(request, response) {
  if (!['GET', 'PUT'].includes(request.method)) return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const session = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!session) return sendJson(response, 401, { error: 'Sign in with Discord first' });
    if (!isOwner(session)) return sendJson(response, 403, { error: 'Owner access required' });

    const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.BOT_API_KEY;
    if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'Bot connection is not configured' });

    const botResponse = await fetch(`${apiUrl}/api/config`, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(request.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
      },
      body: request.method === 'PUT' ? JSON.stringify(await readBody(request)) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    const result = await botResponse.json().catch(() => ({}));
    if (!botResponse.ok) return sendJson(response, 502, { error: result.error || 'Bot rejected the request' });
    return sendJson(response, 200, result);
  } catch {
    return sendJson(response, 502, { error: 'The bot is unavailable' });
  }
}
