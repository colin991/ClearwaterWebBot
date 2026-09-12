import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = '__Host-clearwater_session';
export const STATE_COOKIE = '__Host-clearwater_oauth_state';
export const NEXT_COOKIE = '__Host-clearwater_next';
export const SAFE_NEXT_PATHS = Object.freeze(['/', '/internet', '/internet.html', '/owner', '/owner.html']);

export function safeNextPath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  // Only same-site relative paths. Reject protocol-relative and absolute URLs.
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /^[a-z]+:/i.test(raw)) return '/';
  const path = (raw.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
  if (path === '/internet.html') return '/internet';
  if (path === '/owner.html') return '/owner';
  if (SAFE_NEXT_PATHS.includes(path)) return path;
  // Preserve Clearwater Internet deep links (post/member/sponsored/pages).
  if (/^\/internet\/(post|member|sponsored)\/[A-Za-z0-9._-]{1,120}$/.test(path)) return path;
  if (/^\/internet\/(messages|notifications|settings|profile|wallet|staff|sponsored)$/.test(path)) return path;
  return '/';
}

export function getAuthConfig() {
  const config = {
    clientId: process.env.DISCORD_CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    redirectUri: process.env.DISCORD_REDIRECT_URI,
    sessionSecret: process.env.SESSION_SECRET,
  };

  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) throw new Error(`Missing authentication configuration: ${missing.join(', ')}`);
  return config;
}

export function createState() {
  return randomBytes(32).toString('base64url');
}

export function parseCookies(header = '') {
  return header.split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index < 0) return cookies;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) return cookies;

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
    return cookies;
  }, {});
}

export function makeCookie(name, value, maxAge) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function clearCookie(name) {
  return makeCookie(name, '', 0);
}

export function safeEqual(left = '', right = '') {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sessionKey(secret) {
  return createHash('sha256').update('cw.session.v1\0').update(secret).digest();
}

function sessionPayload(user) {
  return {
    id: String(user.id),
    username: String(user.username || '').slice(0, 80),
    displayName: String(user.global_name || user.username || 'Discord user').slice(0, 80),
    avatar: user.avatar ? String(user.avatar) : null,
    banner: user.banner ? String(user.banner) : null,
    guildBanner: user.guildBanner ? String(user.guildBanner) : null,
    guildRoles: Array.isArray(user.guildRoles)
      ? user.guildRoles.filter((roleId) => /^\d{16,22}$/.test(String(roleId))).map(String).slice(0, 100)
      : [],
    bannerColor: user.banner_color ? String(user.banner_color).slice(0, 16) : null,
    bio: String(user.bio || '').slice(0, 190),
    // Sessions last a week; live Discord checks revoke site/panel access sooner
    // when the bot can confirm membership.
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7),
  };
}

function parseSession(session) {
  if (!session?.id || !session.exp || session.exp <= Math.floor(Date.now() / 1000)) return null;
  return session;
}

export function createSessionToken(user, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', sessionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(sessionPayload(user)), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `e1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

export function readSessionToken(token, secret) {
  if (!token || !secret || !token.startsWith('e1.')) return null;

  // Only AES-GCM e1 sessions are accepted. Legacy HMAC tokens are rejected so
  // a weak or leaked signing path cannot forge cookies.
  const [, ivPart, dataPart, tagPart, extra] = token.split('.');
  if (!ivPart || !dataPart || !tagPart || extra) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', sessionKey(secret), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const session = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8'));
    return parseSession(session);
  } catch {
    return null;
  }
}

export function avatarUrl(user) {
  if (!user?.id || !user?.avatar) return null;
  const extension = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.${extension}?size=64`;
}

export function bannerUrl(user) {
  if (!user?.id) return null;

  if (user.guildBanner) {
    const extension = user.guildBanner.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/guilds/1514026810348671026/users/${encodeURIComponent(user.id)}/banners/${encodeURIComponent(user.guildBanner)}.${extension}?size=1024`;
  }

  if (!user.banner) return null;
  const extension = user.banner.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${encodeURIComponent(user.id)}/${encodeURIComponent(user.banner)}.${extension}?size=1024`;
}

export function isOwner(user) {
  // Owner break-glass is Discord ID only. Role-based ownership is decided live
  // via the bot /api/access check — never from stale session guildRoles.
  const allowedIds = (process.env.OWNER_DISCORD_IDS || '1044686997194805280')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return Boolean(user?.id && allowedIds.includes(String(user.id)));
}

export function isSameSiteRequest(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;

  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();
    const local = hostname === 'localhost' || hostname === '127.0.0.1';
    return url.host === host && (url.protocol === 'https:' || (local && url.protocol === 'http:'));
  } catch {
    return false;
  }
}

export function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.end(JSON.stringify(body));
}

export function redirect(response, location, cookies = []) {
  response.statusCode = 302;
  response.setHeader('Location', location);
  response.setHeader('Cache-Control', 'no-store');
  if (cookies.length) response.setHeader('Set-Cookie', cookies);
  response.end();
}
