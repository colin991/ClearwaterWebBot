import { NEXT_COOKIE, STATE_COOKIE, createState, getAuthConfig, makeCookie, redirect, safeNextPath, sendJson } from '../../lib/discord-auth.js';

export default function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const next = safeNextPath(requestUrl.searchParams.get('next') || '');
    if (requestUrl.searchParams.get('agreed') !== '1') {
      return redirect(response, `/signin?next=${encodeURIComponent(next)}`);
    }

    const { clientId, redirectUri } = getAuthConfig();
    const state = createState();
    const authorizationUrl = new URL('https://discord.com/oauth2/authorize');
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      // This lets the site read the signed-in person's Clearwater server
      // profile, including its server-specific banner when they have one.
      scope: 'identify guilds guilds.members.read',
      state,
    }).toString();

    return redirect(response, authorizationUrl.toString(), [
      makeCookie(STATE_COOKIE, state, 600),
      makeCookie(NEXT_COOKIE, next, 600),
    ]);
  } catch {
    return sendJson(response, 500, { error: 'Discord login is not configured' });
  }
}
