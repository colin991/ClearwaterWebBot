import {
  SESSION_COOKIE,
  getAuthConfig,
  parseCookies,
  readSessionToken,
  sendJson,
} from '../../lib/discord-auth.js';
import { hasOwnerAccess } from '../../lib/owner-access.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const session = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!session) return sendJson(response, 401, { error: 'Sign in with Discord first' });
    if (!await hasOwnerAccess(session)) return sendJson(response, 403, { error: 'Ownership access required' });

    const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.BOT_API_KEY;
    if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'Bot connection is not configured' });

    const botResponse = await fetch(`${apiUrl}/api/erlc-map`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const result = await botResponse.json().catch(() => ({}));
    if (!botResponse.ok) {
      return sendJson(response, botResponse.status === 503 ? 503 : 502, {
        error: result.error || 'Could not load the in-game map',
        online: false,
        players: [],
      });
    }
    return sendJson(response, 200, result);
  } catch {
    return sendJson(response, 502, { error: 'The bot is unavailable', online: false, players: [] });
  }
}
