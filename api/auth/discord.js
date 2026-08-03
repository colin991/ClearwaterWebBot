import { STATE_COOKIE, createState, getAuthConfig, makeCookie, redirect, sendJson } from '../../lib/discord-auth.js';

export default function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { clientId, redirectUri } = getAuthConfig();
    const state = createState();
    const authorizationUrl = new URL('https://discord.com/oauth2/authorize');
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify',
      state,
    }).toString();

    return redirect(response, authorizationUrl.toString(), [makeCookie(STATE_COOKIE, state, 600)]);
  } catch {
    return sendJson(response, 500, { error: 'Discord login is not configured' });
  }
}
