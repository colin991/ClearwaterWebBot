import {
  SESSION_COOKIE,
  clearCookie,
  getAuthConfig,
  makeCookie,
  parseCookies,
  readSessionToken,
  redirect,
  sendJson,
  avatarUrl,
} from '../../../lib/discord-auth.js';
import {
  clearRobloxOAuthCookies,
  exchangeRobloxCode,
  fetchOwnedCreditStoreAssets,
  fetchRobloxUserInfo,
  getRobloxAuthConfig,
  readRobloxOAuthCookies,
  robloxStateMatches,
} from '../../../lib/roblox-auth.js';

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

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  const fail = (reason = 'denied') => redirect(
    response,
    walletClaimRedirect('/internet/wallet', { robloxClaim: reason }),
    clearRobloxOAuthCookies(),
  );

  try {
    const { sessionSecret } = getAuthConfig();
    const { clientId, clientSecret, redirectUri } = getRobloxAuthConfig();
    const requestUrl = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const cookies = parseCookies(request.headers.cookie);
    const session = readSessionToken(cookies[SESSION_COOKIE], sessionSecret);
    const oauth = readRobloxOAuthCookies(request.headers.cookie);

    if (!session?.id) {
      return redirect(response, `/signin?next=${encodeURIComponent('/internet/wallet')}`, clearRobloxOAuthCookies());
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
    }), clearRobloxOAuthCookies());
  } catch (error) {
    const reason = /inventory/i.test(String(error?.message || ''))
      ? 'inventory'
      : (/configured/i.test(String(error?.message || '')) ? 'config' : 'error');
    return fail(reason);
  }
}
