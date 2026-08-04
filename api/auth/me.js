import { SESSION_COOKIE, avatarUrl, getAuthConfig, isOwner, parseCookies, readSessionToken, sendJson } from '../../lib/discord-auth.js';
import { hasOwnerAccess } from '../../lib/owner-access.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const cookies = parseCookies(request.headers.cookie);
    const user = readSessionToken(cookies[SESSION_COOKIE], sessionSecret);
    if (!user) return sendJson(response, 200, { authenticated: false });

    return sendJson(response, 200, {
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: avatarUrl(user),
        owner: isOwner(user) || await hasOwnerAccess(user),
      },
    });
  } catch {
    return sendJson(response, 200, { authenticated: false });
  }
}
