import {
  NEXT_COOKIE,
  RADIO_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  clearCookie,
  createSessionToken,
  getAuthConfig,
  makeCookie,
  parseCookies,
  radioCookieSecret,
  redirect,
  safeEqual,
  safeNextPath,
  sendJson,
} from '../../../lib/discord-auth.js';
import { rolesGrantSiteAccess } from '../../../lib/site-access.js';

const CLEARWATER_GUILD_ID = '1514026810348671026';
const PINELLAS_GUILD_ID = '1514100977920245760';
const ADMINISTRATOR = 0x8n;

/** Where a finished or failed sign-in lands. PCSO is the website, so errors stay on its sign-in page. */
export function signinErrorPath(error, next = '/') {
  const params = new URLSearchParams({ error });
  if (next && next !== '/') params.set('next', next);
  return `/signin?${params.toString()}`;
}

/**
 * Discord rate-limits the per-guild member lookup hard, and two back-to-back
 * calls (Clearwater, then Pinellas) often 429 on the second one. Retry once
 * after Discord's retry_after so a rate limit is not mistaken for "not a member".
 */
async function discordGet(path, accessToken) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`https://discord.com/api/v10${path}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status !== 429 || attempt === 1) return response;
    let waitMs = 1000;
    try {
      const body = await response.json();
      if (Number.isFinite(Number(body?.retry_after))) waitMs = Number(body.retry_after) * 1000;
    } catch {
      // Use the default wait.
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(Math.max(waitMs, 250), 3000)));
  }
  return null;
}

async function discordJson(path, accessToken) {
  try {
    const response = await discordGet(path, accessToken);
    return response?.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  let next = '/';

  try {
    const { clientId, clientSecret, redirectUri, sessionSecret } = getAuthConfig(request);
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const cookies = parseCookies(request.headers.cookie);
    next = safeNextPath(cookies[NEXT_COOKIE] || '');
    const failed = () => redirect(response, signinErrorPath('failed', next), [clearCookie(STATE_COOKIE)]);

    if (!code || !state || !cookies[STATE_COOKIE] || !safeEqual(state, cookies[STATE_COOKIE])) {
      return failed();
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

    if (!tokenResponse.ok) return failed();
    const token = await tokenResponse.json();
    const accessToken = token.access_token;

    const user = await discordJson('/users/@me', accessToken);
    if (!user?.id) return failed();

    // One call lists every server they are in. Being in the Pinellas server is
    // what opens the PCSO website, so this list is the membership check; the
    // per-guild member calls below only add roles and server banners.
    const guilds = await discordJson('/users/@me/guilds', accessToken);
    const guildList = Array.isArray(guilds) ? guilds : [];
    const guildIds = new Set(guildList.map((guild) => String(guild?.id || '')));

    let discordAdmin = false;
    for (const guild of guildList) {
      const id = String(guild?.id || '');
      if (id !== PINELLAS_GUILD_ID && id !== CLEARWATER_GUILD_ID) continue;
      try {
        if ((BigInt(guild.permissions || 0) & ADMINISTRATOR) === ADMINISTRATOR) discordAdmin = true;
      } catch {
        // Ignore malformed permission bitfields.
      }
    }

    // Skip a member lookup only when the guild list loaded and says they are not there.
    const guildListLoaded = Array.isArray(guilds);
    const guildMember = !guildListLoaded || guildIds.has(CLEARWATER_GUILD_ID)
      ? await discordJson(`/users/@me/guilds/${CLEARWATER_GUILD_ID}/member`, accessToken)
      : null;
    const pinellasMember = !guildListLoaded || guildIds.has(PINELLAS_GUILD_ID)
      ? await discordJson(`/users/@me/guilds/${PINELLAS_GUILD_ID}/member`, accessToken)
      : null;

    const guildRoles = Array.isArray(guildMember?.roles) ? guildMember.roles.map(String) : [];
    const pinellasRoles = Array.isArray(pinellasMember?.roles) ? pinellasMember.roles.map(String) : [];
    const hasClearwaterAccess = Boolean(guildMember) && rolesGrantSiteAccess(guildRoles);
    const hasPcsoAccess = guildIds.has(PINELLAS_GUILD_ID) || Boolean(pinellasMember);
    // The web radio is for every Clearwater member, not only website testers. They get a radio-only
    // cookie instead of a site session, so it opens nothing else on the site.
    if (!hasClearwaterAccess && !hasPcsoAccess && next === '/radio' && guildMember) {
      return redirect(response, '/radio', [
        clearCookie(STATE_COOKIE),
        clearCookie(NEXT_COOKIE),
        makeCookie(RADIO_COOKIE, createSessionToken({ id: user.id, username: user.username, global_name: user.global_name }, radioCookieSecret(sessionSecret)), 60 * 60 * 24 * 7),
      ]);
    }
    if (!hasClearwaterAccess && !hasPcsoAccess) {
      return redirect(response, signinErrorPath('not-member', next), [
        clearCookie(STATE_COOKIE),
        clearCookie(NEXT_COOKIE),
        clearCookie(SESSION_COOKIE),
      ]);
    }

    const session = createSessionToken({
      ...user,
      guildBanner: guildMember?.banner || null,
      guildRoles,
      pinellasRoles,
      pinellasMember: hasPcsoAccess,
      discordAdmin,
    }, sessionSecret);
    const destination = next === '/' ? '/?login=success' : next;

    return redirect(response, destination, [
      clearCookie(STATE_COOKIE),
      clearCookie(NEXT_COOKIE),
      makeCookie(SESSION_COOKIE, session, 60 * 60 * 24 * 7),
    ]);
  } catch {
    return redirect(response, signinErrorPath('failed', next), [clearCookie(STATE_COOKIE)]);
  }
}
