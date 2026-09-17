import {
  NEXT_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  clearCookie,
  createSessionToken,
  getAuthConfig,
  makeCookie,
  parseCookies,
  redirect,
  safeEqual,
  safeNextPath,
  sendJson,
} from '../../../lib/discord-auth.js';
import { rolesGrantSiteAccess } from '../../../lib/site-access.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  const siteRedirect = '/coming-soon?denied=1';

  try {
    const { clientId, clientSecret, redirectUri, sessionSecret } = getAuthConfig(request);
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const cookies = parseCookies(request.headers.cookie);

    if (!code || !state || !cookies[STATE_COOKIE] || !safeEqual(state, cookies[STATE_COOKIE])) {
      return redirect(response, siteRedirect, [clearCookie(STATE_COOKIE)]);
    }

    const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) return redirect(response, siteRedirect, [clearCookie(STATE_COOKIE)]);
    const token = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!userResponse.ok) return redirect(response, siteRedirect, [clearCookie(STATE_COOKIE)]);
    const user = await userResponse.json();

    const CLEARWATER_GUILD_ID = '1514026810348671026';
    const PINELLAS_GUILD_ID = '1514100977920245760';
    const ADMINISTRATOR = 0x8n;

    let guildMember = null;
    let pinellasMember = null;
    try {
      const memberResponse = await fetch(
        `https://discord.com/api/v10/users/@me/guilds/${CLEARWATER_GUILD_ID}/member`,
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      if (memberResponse.ok) guildMember = await memberResponse.json();
    } catch {
      // Global Discord profile remains available below.
    }
    try {
      const pinellasMemberResponse = await fetch(
        `https://discord.com/api/v10/users/@me/guilds/${PINELLAS_GUILD_ID}/member`,
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      if (pinellasMemberResponse.ok) pinellasMember = await pinellasMemberResponse.json();
    } catch {
      // Pinellas membership is enough for the PCSO website even without Clearwater.
    }

    const guildRoles = Array.isArray(guildMember?.roles) ? guildMember.roles.map(String) : [];
    const pinellasRoles = Array.isArray(pinellasMember?.roles) ? pinellasMember.roles.map(String) : [];
    const hasClearwaterAccess = Boolean(guildMember) && rolesGrantSiteAccess(guildRoles);
    const hasPcsoAccess = Boolean(pinellasMember);
    if (!hasClearwaterAccess && !hasPcsoAccess) {
      return redirect(response, '/coming-soon?denied=1', [
        clearCookie(STATE_COOKIE),
        clearCookie(NEXT_COOKIE),
        clearCookie(SESSION_COOKIE),
      ]);
    }

    let discordAdmin = false;
    try {
      const guildsResponse = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      if (guildsResponse.ok) {
        const guilds = await guildsResponse.json();
        const list = Array.isArray(guilds) ? guilds : [];
        for (const guild of list) {
          const id = String(guild?.id || '');
          if (id !== PINELLAS_GUILD_ID && id !== '1514026810348671026') continue;
          try {
            if ((BigInt(guild.permissions || 0) & ADMINISTRATOR) === ADMINISTRATOR) {
              discordAdmin = true;
              break;
            }
          } catch {
            // Ignore malformed permission bitfields.
          }
        }
      }
    } catch {
      // Guild permission lookup is best-effort.
    }

    const session = createSessionToken({
      ...user,
      guildBanner: guildMember?.banner || null,
      guildRoles,
      pinellasRoles,
      pinellasMember: hasPcsoAccess,
      discordAdmin,
    }, sessionSecret);
    const next = safeNextPath(cookies[NEXT_COOKIE] || '');
    const destination = next === '/' ? '/?login=success' : next;

    return redirect(response, destination, [
      clearCookie(STATE_COOKIE),
      clearCookie(NEXT_COOKIE),
      makeCookie(SESSION_COOKIE, session, 60 * 60 * 24 * 7),
    ]);
  } catch {
    return redirect(response, siteRedirect, [clearCookie(STATE_COOKIE)]);
  }
}
