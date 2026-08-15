import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'node:crypto';

const SITE_SALT = 'clearwater-internet-pii-v1';
const ID_KEYS = new Set([
  'id',
  'authorId',
  'actorId',
  'fromId',
  'toId',
  'targetId',
  'recipientId',
  'reporterId',
  'withUserId',
  'userId',
  'advertiserId',
  'discordId',
  'businessOwnerId',
  'ownerId',
  'handlerId',
  'applicantId',
  'peerId',
  'otherId',
]);
const STRIP_KEYS = new Set([
  'ipHashes',
  'ipHash',
  'ipHashLegacy',
  'email',
  'emails',
  'phone',
  'token',
  'accessToken',
  'refreshToken',
  'sessionSecret',
  'apiKey',
  'password',
  'pin',
  'staffPin',
  'robloxPackClaims',
  'claimTokens',
  'melonly',
  'rawIp',
  'ip',
  'ips',
  'authorization',
]);
const MEDIA_HOSTS = new Set(['cdn.discordapp.com', 'media.discordapp.net']);

export function piiSecret() {
  return process.env.PII_HASH_SECRET || process.env.IP_HASH_SECRET || process.env.SESSION_SECRET || '';
}

export function piiKey(secret = piiSecret()) {
  if (!secret) return null;
  return createHash('sha256').update(`${SITE_SALT}:key\0`).update(secret).digest();
}

export function isSnowflake(value) {
  return /^\d{16,22}$/.test(String(value || ''));
}

export function isPublicUserId(value) {
  return /^u1_[A-Za-z0-9_-]{32,64}$/.test(String(value || ''));
}

export function hmacPii(purpose, value, secret = piiSecret()) {
  if (!secret || value == null || value === '') return '';
  return createHmac('sha256', secret)
    .update(SITE_SALT)
    .update('\0')
    .update(String(purpose || 'generic'))
    .update('\0')
    .update(String(value))
    .digest('base64url');
}

export function publicUserId(discordId, secret = piiSecret()) {
  const id = String(discordId || '');
  if (!isSnowflake(id) || !secret) return id;
  return `u1_${hmacPii('user', id, secret)}`;
}

export function normalizeClientIp(request) {
  const headers = request?.headers || {};
  const forwarded = headers['x-forwarded-for'];
  const realIp = headers['x-real-ip'];
  const vercelIp = headers['x-vercel-forwarded-for'];
  const raw = [forwarded, realIp, vercelIp].find((value) => value);
  let ip = String(Array.isArray(raw) ? raw[0] : raw || '').split(',')[0].trim().toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  if (ip.startsWith('::ffff:')) ip = ip.slice(7);
  const zone = ip.indexOf('%');
  if (zone !== -1) ip = ip.slice(0, zone);
  if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '');
  if (!ip || ip === 'unknown') return '';
  return ip.slice(0, 64);
}

export function hashClientIp(request) {
  const ip = normalizeClientIp(request);
  const secret = piiSecret();
  const legacySecret = process.env.IP_HASH_SECRET || '';
  if (!ip || !secret) return { hash: null, legacy: null };
  return {
    hash: hmacPii('ip', ip, secret),
    legacy: legacySecret ? createHmac('sha256', legacySecret).update(ip).digest('base64url') : null,
  };
}

export function encryptString(plain, secret = piiSecret(), { stable = false } = {}) {
  const key = piiKey(secret);
  if (!key || plain == null) return '';
  const iv = stable
    ? createHmac('sha256', key).update('cw.media.iv.v1\0').update(String(plain)).digest().subarray(0, 12)
    : randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

export function decryptString(token, secret = piiSecret()) {
  const key = piiKey(secret);
  if (!key || !token) return '';
  try {
    const buf = Buffer.from(String(token), 'base64url');
    if (buf.length < 29) return '';
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

export function isDiscordMediaUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && MEDIA_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function proxiedMediaUrl(value, secret = piiSecret()) {
  if (!value) return value;
  if (!isDiscordMediaUrl(value) || !secret) return String(value);
  return `/api/media?t=${encodeURIComponent(encryptString(value, secret, { stable: true }))}`;
}

export function readMediaToken(token, secret = piiSecret()) {
  const url = decryptString(token, secret);
  if (!isDiscordMediaUrl(url)) return '';
  return url;
}

const MAX_MEDIA_BYTES = 2_000_000;

export async function serveProxiedMedia(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    return response.end();
  }

  const url = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
  const source = readMediaToken(url.searchParams.get('t') || '');
  if (!source) {
    response.statusCode = 404;
    return response.end();
  }

  try {
    const upstream = await fetch(source, {
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'image/*' },
    });
    const contentType = String(upstream.headers.get('content-type') || '');
    const length = Number(upstream.headers.get('content-length') || 0);
    if (!upstream.ok || !contentType.startsWith('image/') || length > MAX_MEDIA_BYTES) {
      response.statusCode = 404;
      return response.end();
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_MEDIA_BYTES) {
      response.statusCode = 404;
      return response.end();
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, max-age=86400, immutable');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(buffer);
  } catch {
    response.statusCode = 404;
    response.end();
  }
}

function redactObject(value, secret, { keepIds = false } = {}) {
  if (value == null) return value;
  if (Array.isArray(value)) {
    return value.map((entry) => {
      if (!keepIds && isSnowflake(entry)) return publicUserId(entry, secret);
      return redactObject(entry, secret, { keepIds });
    });
  }
  if (typeof value !== 'object') {
    if (typeof value === 'string' && isDiscordMediaUrl(value)) return proxiedMediaUrl(value, secret);
    return value;
  }

  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (STRIP_KEYS.has(key)) continue;
    if (key === 'votes' && entry && typeof entry === 'object' && !Array.isArray(entry)) {
      out[key] = Object.fromEntries(
        Object.entries(entry).map(([id, vote]) => [
          (!keepIds && isSnowflake(id)) ? publicUserId(id, secret) : id,
          vote,
        ]),
      );
      continue;
    }
    if (!keepIds && typeof entry === 'string' && ID_KEYS.has(key) && isSnowflake(entry)) {
      out[key] = publicUserId(entry, secret);
      continue;
    }
    if (typeof entry === 'string' && isDiscordMediaUrl(entry)) {
      out[key] = proxiedMediaUrl(entry, secret);
      continue;
    }
    out[key] = redactObject(entry, secret, { keepIds });
  }
  return out;
}

export function redactPublicPayload(body, extra = {}) {
  const secret = piiSecret();
  const redacted = redactObject(body, secret, { keepIds: false }) || {};
  return {
    ...redacted,
    officialUserId: publicUserId('1514026810348671026', secret),
    ...extra,
  };
}

/** Staff-only responses keep Discord snowflakes so moderation actions can run. */
export function redactStaffPayload(body, extra = {}) {
  const secret = piiSecret();
  const redacted = redactObject(body, secret, { keepIds: true }) || {};
  return {
    ...redacted,
    officialUserId: '1514026810348671026',
    ...extra,
  };
}

export async function resolvePublicIds(body, users = []) {
  if (!body || typeof body !== 'object') return body;
  const secret = piiSecret();
  const map = new Map(users.map((user) => [publicUserId(user.id, secret), String(user.id)]));
  map.set(publicUserId('1514026810348671026', secret), '1514026810348671026');
  for (const user of users) {
    if (user?.discordId) map.set(publicUserId(user.discordId, secret), String(user.discordId));
    if (user?.businessOwnerId) map.set(publicUserId(user.businessOwnerId, secret), String(user.businessOwnerId));
  }

  const resolve = (value) => {
    if (!isPublicUserId(value)) return value;
    return map.get(value) || value;
  };

  const next = { ...body };
  for (const key of ['withUserId', 'targetId', 'to', 'userId', 'authorId', 'peerId', 'otherId', 'advertiserId', 'applicantId']) {
    if (next[key]) next[key] = resolve(next[key]);
  }
  return next;
}
