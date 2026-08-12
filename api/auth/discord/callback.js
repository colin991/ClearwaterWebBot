import {
  NEXT_COOKIE,
  SAFE_NEXT_PATHS,
  SESSION_COOKIE,
  STATE_COOKIE,
  clearCookie,
  createSessionToken,
  getAuthConfig,
  makeCookie,
  parseCookies,
  redirect,
  safeEqual,
  sendJson,
} from '../../../lib/discord-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  const siteRedirect = '/?login=error';

  try {
    const { clientId, clientSecret, redirectUri, sessionSecret } = getAuthConfig();
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

    // A Discord server profile can use a different banner from the person's
    // global account. Read Clearwater's member profile when Discord grants it;
    // a missing profile or permission simply falls back to the global banner.
    let guildMember = null;
    try {
      const memberResponse = await fetch(
        'https://discord.com/api/v10/users/@me/guilds/1514026810348671026/member',
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      if (memberResponse.ok) guildMember = await memberResponse.json();
    } catch {
      // The normal Discord account profile remains available below.
    }

    if (!guildMember) return redirect(response, '/?login=server-required', [clearCookie(STATE_COOKIE)]);

    const session = createSessionToken({
      ...user,
      guildBanner: guildMember?.banner || null,
      guildRoles: guildMember?.roles || [],
    }, sessionSecret);
    const next = SAFE_NEXT_PATHS.includes(cookies[NEXT_COOKIE] || '') ? cookies[NEXT_COOKIE] : '/';
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
