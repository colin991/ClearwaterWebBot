import { SESSION_COOKIE, avatarUrl, bannerUrl, getAuthConfig, parseCookies, readSessionToken, sendJson } from '../../lib/discord-auth.js';
import { getStaffAccess } from '../../lib/owner-access.js';
import { proxiedMediaUrl, publicUserId } from '../../lib/privacy.js';
import { withSiteBadges } from '../../utils/staffRanks.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const cookies = parseCookies(request.headers.cookie);
    const user = readSessionToken(cookies[SESSION_COOKIE], sessionSecret);
    if (!user) return sendJson(response, 200, { authenticated: false, siteAccess: false });

    // Live Discord role check via the bot — session guildRoles alone are not enough.
    const staffAccess = await getStaffAccess(user);
    if (!staffAccess.siteAccess) {
      return sendJson(response, 200, { authenticated: false, siteAccess: false, denied: true });
    }

    return sendJson(response, 200, {
      authenticated: true,
      siteAccess: true,
      user: {
        id: publicUserId(user.id),
        username: user.username,
        displayName: user.displayName,
        avatarUrl: proxiedMediaUrl(avatarUrl(user)),
        bannerUrl: proxiedMediaUrl(bannerUrl(user)),
        bannerColor: user.bannerColor || null,
        bio: user.bio || '',
        owner: staffAccess.allowed,
        staffPanel: staffAccess.panelAccess,
        staffRank: staffAccess.staffRank,
        badges: withSiteBadges(staffAccess.badges, user),
      },
    });
  } catch {
    return sendJson(response, 200, { authenticated: false, siteAccess: false });
  }
}
