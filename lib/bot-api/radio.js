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

/**
 * Web radio sign-in (cwpcso.com/radio): trades the site's Discord session for a radio key and the
 * bot's secure relay address. The relay itself checks Clearwater membership when the page connects.
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

    const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.BOT_API_KEY;
    if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'The radio is not connected to the website yet.' });

    const botResponse = await fetch(`${apiUrl}/api/radio/web-session?discordId=${encodeURIComponent(session.id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const result = await botResponse.json().catch(() => ({}));
    if (!botResponse.ok || !result.key || !result.url) {
      return sendJson(response, 503, { error: result.error || 'The radio is offline right now.' });
    }
    return sendJson(response, 200, {
      key: result.key,
      url: result.url,
      name: session.displayName || session.global_name || session.username || 'Member',
    });
  } catch {
    return sendJson(response, 502, { error: 'The radio is offline right now.' });
  }
}
