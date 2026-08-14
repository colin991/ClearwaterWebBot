import {
  SESSION_COOKIE,
  getAuthConfig,
  isSameSiteRequest,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../../lib/discord-auth.js';
import { hasOwnerAccess } from '../../lib/owner-access.js';

async function readBody(request) {
  if (request.body && typeof request.body === 'object') return request.body;
  if (typeof request.body === 'string') return JSON.parse(request.body);
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 16384) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!isSameSiteRequest(request)) return sendJson(response, 403, { error: 'Invalid request origin' });

  try {
    const { sessionSecret } = getAuthConfig();
    const session = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!session) return sendJson(response, 401, { error: 'Sign in with Discord first' });
    if (!await hasOwnerAccess(session)) return sendJson(response, 403, { error: 'Ownership access required' });

    const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.BOT_API_KEY;
    if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'Bot connection is not configured' });

    const body = await readBody(request);
    const botResponse = await fetch(`${apiUrl}/api/erlc-command`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: body.action,
        reason: body.reason,
        players: Array.isArray(body.players) ? body.players : [],
        actorDiscordId: session.id || session.userId || '',
        actorTag: session.username || session.globalName || '',
      }),
      signal: AbortSignal.timeout(60000),
    });
    const result = await botResponse.json().catch(() => ({}));
    if (!botResponse.ok) {
      return sendJson(response, botResponse.status >= 400 && botResponse.status < 600 ? botResponse.status : 502, {
        error: result.error || 'Could not run the in-game command',
        ...result,
      });
    }
    return sendJson(response, 200, result);
  } catch {
    return sendJson(response, 502, { error: 'The bot is unavailable' });
  }
}
