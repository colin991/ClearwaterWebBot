import {
  NEXT_COOKIE,
  STATE_COOKIE,
  avatarUrl,
  bannerUrl,
  clearCookie,
  createOAuthState,
  createSessionToken,
  getAuthConfig,
  isSameSiteRequest,
  makeCookie,
  parseCookies,
  readOAuthState,
  readSessionToken,
  redirect,
  safeEqual,
  safeNextPath,
  sendJson,
  sessionClearCookies,
  sessionCookieValue,
  sessionSetCookies,
} from './discord-auth.js';
import { getStaffAccess } from './owner-access.js';
import { clearStaffPinUnlockCookie } from './staff-pin.js';
import { proxiedMediaUrl, publicUserId } from './privacy.js';
import {
  clearRobloxOAuthCookies,
  clearRobloxSessionCookies,
  createRobloxOAuthState,
  exchangeRobloxCode,
  fetchOwnedCreditStoreAssets,
  fetchRobloxUserInfo,
  getRobloxAuthConfig,
  readRobloxOAuthCookies,
  readRobloxRefreshToken,
  refreshRobloxAccessToken,
  robloxAuthorizeUrl,
  robloxOAuthCookies,
  robloxSessionCookies,
  robloxStateMatches,
} from './roblox-auth.js';
import { withSiteBadges } from '../utils/staffRanks.js';

export function handleDiscordStart(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const next = safeNextPath(requestUrl.searchParams.get('next') || '');
    if (requestUrl.searchParams.get('agreed') !== '1') {
      return redirect(response, `/signin?next=${encodeURIComponent(next)}`);
    }

    const { clientId, redirectUri, sessionSecret } = getAuthConfig();
    const state = createOAuthState(next, sessionSecret);
    const authorizationUrl = new URL('https://discord.com/oauth2/authorize');
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: 'identify guilds.members.read',
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

export async function handleDiscordCallback(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  const membershipRedirect = '/signin?error=membership';

  try {
    const { clientId, clientSecret, redirectUri, sessionSecret } = getAuthConfig();
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const cookies = parseCookies(request.headers.cookie);
    const signed = readOAuthState(state, sessionSecret);
    const cookieState = cookies[STATE_COOKIE];
    const stateOk = Boolean(signed) || Boolean(code && state && cookieState && safeEqual(state, cookieState));

    if (!code || !state || !stateOk) {
      return redirect(response, membershipRedirect, [clearCookie(STATE_COOKIE)]);
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

    if (!tokenResponse.ok) return redirect(response, membershipRedirect, [clearCookie(STATE_COOKIE)]);
    const token = await tokenResponse.json();

    const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });

    if (!userResponse.ok) return redirect(response, membershipRedirect, [clearCookie(STATE_COOKIE)]);
    const user = await userResponse.json();

    let guildMember = null;
    try {
      const memberResponse = await fetch(
        'https://discord.com/api/v10/users/@me/guilds/1514026810348671026/member',
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      );
      if (memberResponse.ok) guildMember = await memberResponse.json();
    } catch {
      // Fall back to the global Discord profile when the guild member lookup fails.
    }

    if (!guildMember) {
      return redirect(response, membershipRedirect, [
        clearCookie(STATE_COOKIE),
        clearCookie(NEXT_COOKIE),
        ...sessionClearCookies(),
      ]);
    }

    const guildRoles = Array.isArray(guildMember.roles) ? guildMember.roles.map(String) : [];

    const session = createSessionToken({
      ...user,
      guildBanner: guildMember?.banner || null,
      guildRoles,
    }, sessionSecret);
    const next = signed?.next || safeNextPath(cookies[NEXT_COOKIE] || '');
    const destination = next === '/' ? '/?login=success' : next;

    return redirect(response, destination, [
      clearCookie(STATE_COOKIE),
      clearCookie(NEXT_COOKIE),
      ...sessionSetCookies(session),
    ]);
  } catch {
    return redirect(response, membershipRedirect, [clearCookie(STATE_COOKIE)]);
  }
}

export async function handleMe(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const cookies = parseCookies(request.headers.cookie);
    const user = readSessionToken(sessionCookieValue(cookies), sessionSecret);
    if (!user) return sendJson(response, 200, { authenticated: false, siteAccess: false });

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
        serverManagement: staffAccess.serverManagement === true,
        staffRank: staffAccess.staffRank,
        badges: withSiteBadges(staffAccess.badges, user),
      },
    });
  } catch {
    return sendJson(response, 200, { authenticated: false, siteAccess: false });
  }
}

export function handleLogout(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!isSameSiteRequest(request)) return sendJson(response, 403, { error: 'Invalid request origin' });
  response.setHeader('Set-Cookie', [
    ...sessionClearCookies(),
    clearStaffPinUnlockCookie(),
  ]);
  return sendJson(response, 200, { ok: true });
}

export function handleRobloxStart(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  try {
    const { sessionSecret } = getAuthConfig();
    const cookies = parseCookies(request.headers.cookie);
    const session = readSessionToken(sessionCookieValue(cookies), sessionSecret);
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

async function callBotClaim({ discordUser, robloxId, robloxUsername, ownedAssetIds }) {
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) throw new Error('Clearwater Internet is not configured yet');

  const upstream = await fetch(`${apiUrl}/api/internet`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'wallet-roblox-claim',
      robloxId,
      robloxUsername,
      ownedAssetIds,
      actor: {
        id: discordUser.id,
        username: discordUser.username,
        displayName: discordUser.displayName,
        avatarUrl: avatarUrl(discordUser),
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(body.error || 'Could not grant Clearwater credits');
  return body;
}

function walletClaimRedirect(next, params = {}) {
  const url = new URL(next, 'https://cwrpvc.lol');
  if (!url.pathname.startsWith('/internet')) url.pathname = '/internet/wallet';
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  return `${url.pathname}${url.search}`;
}

export async function handleRobloxCallback(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  const fail = (reason = 'denied') => redirect(
    response,
    walletClaimRedirect('/internet/wallet', { robloxClaim: reason, market: '1' }),
    [...clearRobloxOAuthCookies(), ...clearRobloxSessionCookies()],
  );

  try {
    const { sessionSecret } = getAuthConfig();
    const { clientId, clientSecret, redirectUri } = getRobloxAuthConfig();
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const cookies = parseCookies(request.headers.cookie);
    const session = readSessionToken(sessionCookieValue(cookies), sessionSecret);
    const oauth = readRobloxOAuthCookies(request.headers.cookie);

    if (!session?.id) {
      return redirect(response, `/signin?next=${encodeURIComponent('/internet/wallet?market=1')}`, clearRobloxOAuthCookies());
    }
    if (!code || !robloxStateMatches(oauth.state, state)) return fail('denied');

    const token = await exchangeRobloxCode({ clientId, clientSecret, redirectUri, code });
    const profile = await fetchRobloxUserInfo(token.access_token);
    const ownedAssetIds = await fetchOwnedCreditStoreAssets(token.access_token, profile.robloxId);
    const result = await callBotClaim({
      discordUser: session,
      robloxId: profile.robloxId,
      robloxUsername: profile.username,
      ownedAssetIds,
    });

    const granted = Number(result.grantedCredits) || 0;
    const packs = Number(result.grantedPacks) || 0;
    return redirect(response, walletClaimRedirect(oauth.next || '/internet/wallet', {
      robloxClaim: granted > 0 ? 'ok' : 'none',
      credits: granted > 0 ? String(granted) : '',
      packs: packs > 0 ? String(packs) : '',
      market: '1',
    }), [...clearRobloxOAuthCookies(), ...robloxSessionCookies(token)]);
  } catch (error) {
    const reason = /inventory/i.test(String(error?.message || ''))
      ? 'inventory'
      : (/configured/i.test(String(error?.message || '')) ? 'config' : 'error');
    return fail(reason);
  }
}

export async function handleRobloxSync(request, response) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return sendJson(response, 405, { error: 'Method not allowed' });
  }

  try {
    const { sessionSecret } = getAuthConfig();
    const cookies = parseCookies(request.headers.cookie);
    const session = readSessionToken(sessionCookieValue(cookies), sessionSecret);
    if (!session?.id) {
      return sendJson(response, 200, { linked: false, needsAuth: true, error: 'Sign in with Discord first' });
    }

    const refreshToken = readRobloxRefreshToken(request.headers.cookie);
    if (!refreshToken) {
      return sendJson(response, 200, { linked: false, needsAuth: true });
    }

    const { clientId, clientSecret } = getRobloxAuthConfig();
    let token;
    try {
      token = await refreshRobloxAccessToken({ clientId, clientSecret, refreshToken });
    } catch {
      return sendJson(response, 200, { linked: false, needsAuth: true }, clearRobloxSessionCookies());
    }

    const profile = await fetchRobloxUserInfo(token.access_token);
    const ownedAssetIds = await fetchOwnedCreditStoreAssets(token.access_token, profile.robloxId);
    const result = await callBotClaim({
      discordUser: session,
      robloxId: profile.robloxId,
      robloxUsername: profile.username,
      ownedAssetIds,
    });

    return sendJson(response, 200, {
      linked: true,
      needsAuth: false,
      grantedCredits: Number(result.grantedCredits) || 0,
      grantedPacks: Number(result.grantedPacks) || 0,
      granted: Array.isArray(result.granted) ? result.granted : [],
      wallet: result.wallet || null,
      robloxUsername: profile.username || '',
    }, robloxSessionCookies(token));
  } catch (error) {
    const message = String(error?.message || 'Could not sync Roblox purchases');
    if (/session expired|refresh/i.test(message)) {
      return sendJson(response, 200, { linked: false, needsAuth: true, error: message }, clearRobloxSessionCookies());
    }
    return sendJson(response, 200, { linked: true, needsAuth: false, error: message, grantedCredits: 0, grantedPacks: 0 });
  }
}
