import { SESSION_COOKIE, getAuthConfig, parseCookies, readSessionToken, redirect, sendJson, safeNextPath } from '../../lib/discord-auth.js';
import {
  createRobloxOAuthState,
  getRobloxAuthConfig,
  robloxAuthorizeUrl,
  robloxOAuthCookies,
} from '../../lib/roblox-auth.js';

export default function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const cookies = parseCookies(request.headers.cookie);
    const session = readSessionToken(cookies[SESSION_COOKIE], sessionSecret);
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const next = safeNextPath(requestUrl.searchParams.get('next') || '/internet/wallet') || '/internet/wallet';

    if (!session?.id) {
      return redirect(response, `/signin?next=${encodeURIComponent('/internet/wallet?claimRoblox=1')}`);
    }

    const { clientId, redirectUri } = getRobloxAuthConfig();
    const state = createRobloxOAuthState();
    return redirect(response, robloxAuthorizeUrl({ clientId, redirectUri, state }), robloxOAuthCookies(state, next));
  } catch (error) {
    const message = /Missing Roblox OAuth/i.test(String(error?.message || ''))
      ? 'Roblox credit claims are not configured yet'
      : 'Could not start Roblox verification';
    return sendJson(response, 500, { error: message });
  }
}
