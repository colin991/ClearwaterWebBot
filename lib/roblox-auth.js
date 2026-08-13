import { createState, makeCookie, clearCookie, parseCookies, safeEqual, safeNextPath } from './discord-auth.js';
import { CREDIT_STORE_ASSET_IDS } from './credit-store.js';

export const ROBLOX_STATE_COOKIE = '__Host-clearwater_rbx_oauth_state';
export const ROBLOX_NEXT_COOKIE = '__Host-clearwater_rbx_next';
export const ROBLOX_REFRESH_COOKIE = '__Host-clearwater_rbx_refresh';
const ROBLOX_REFRESH_MAX_AGE = 60 * 60 * 24 * 60;

export function getRobloxAuthConfig() {
  const config = {
    clientId: process.env.ROBLOX_OAUTH_CLIENT_ID || process.env.ROBLOX_CLIENT_ID,
    clientSecret: process.env.ROBLOX_OAUTH_CLIENT_SECRET || process.env.ROBLOX_CLIENT_SECRET,
    redirectUri: process.env.ROBLOX_OAUTH_REDIRECT_URI || 'https://cwrpvc.lol/api/auth/roblox/callback',
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) throw new Error(`Missing Roblox OAuth configuration: ${missing.join(', ')}`);
  return config;
}

export function createRobloxOAuthState() {
  return createState();
}

export function robloxAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL('https://apis.roblox.com/oauth/v1/authorize');
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile user.inventory-item:read',
    state,
  }).toString();
  return url.toString();
}

export function robloxOAuthCookies(state, next = '/internet/wallet') {
  return [
    makeCookie(ROBLOX_STATE_COOKIE, state, 600),
    makeCookie(ROBLOX_NEXT_COOKIE, safeNextPath(next) || '/internet/wallet', 600),
  ];
}

export function clearRobloxOAuthCookies() {
  return [clearCookie(ROBLOX_STATE_COOKIE), clearCookie(ROBLOX_NEXT_COOKIE)];
}

export function clearRobloxSessionCookies() {
  return [clearCookie(ROBLOX_REFRESH_COOKIE)];
}

export function readRobloxRefreshToken(header = '') {
  return String(parseCookies(header)[ROBLOX_REFRESH_COOKIE] || '').trim();
}

export function robloxSessionCookies(token = {}) {
  const refresh = String(token.refresh_token || '').trim();
  if (!refresh) return [];
  return [makeCookie(ROBLOX_REFRESH_COOKIE, refresh, ROBLOX_REFRESH_MAX_AGE)];
}

export async function refreshRobloxAccessToken({ clientId, clientSecret, refreshToken }) {
  const response = await fetch('https://apis.roblox.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const detail = String(body.error_description || body.error || 'refresh_failed');
    throw new Error(`Roblox session expired: ${detail}`);
  }
  return body;
}

export function readRobloxOAuthCookies(header = '') {
  const cookies = parseCookies(header);
  return {
    state: cookies[ROBLOX_STATE_COOKIE] || '',
    next: safeNextPath(cookies[ROBLOX_NEXT_COOKIE] || '/internet/wallet') || '/internet/wallet',
  };
}

export function robloxStateMatches(expected, actual) {
  return Boolean(expected && actual && safeEqual(String(expected), String(actual)));
}

export async function exchangeRobloxCode({ clientId, clientSecret, redirectUri, code }) {
  const response = await fetch('https://apis.roblox.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    const detail = String(body.error_description || body.error || 'token_exchange_failed');
    throw new Error(`Roblox token exchange failed: ${detail}`);
  }
  return body;
}

export async function fetchRobloxUserInfo(accessToken) {
  const response = await fetch('https://apis.roblox.com/oauth/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.sub) throw new Error('Could not read Roblox profile');
  return {
    robloxId: String(body.sub),
    username: String(body.preferred_username || body.nickname || body.name || '').slice(0, 80),
    displayName: String(body.name || body.nickname || body.preferred_username || '').slice(0, 80),
  };
}

export async function fetchOwnedCreditStoreAssets(accessToken, robloxId) {
  const filter = `assetIds=${CREDIT_STORE_ASSET_IDS.join(',')}`;
  const url = new URL(`https://apis.roblox.com/cloud/v2/users/${encodeURIComponent(robloxId)}/inventory-items`);
  url.searchParams.set('filter', filter);
  url.searchParams.set('maxPageSize', '100');
  const owned = new Set();
  let pageToken = '';
  for (let page = 0; page < 5; page += 1) {
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    else url.searchParams.delete('pageToken');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = String(body.message || body.error || response.status);
      throw new Error(`Could not read Roblox inventory (${detail})`);
    }
    for (const item of Array.isArray(body.inventoryItems) ? body.inventoryItems : []) {
      const assetId = String(item?.assetDetails?.assetId || '');
      if (assetId && CREDIT_STORE_ASSET_IDS.includes(assetId)) owned.add(assetId);
    }
    pageToken = String(body.nextPageToken || '');
    if (!pageToken) break;
  }
  return [...owned];
}
