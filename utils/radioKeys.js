import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Prefix that marks a Clearwater Radio sign-in token. CWR2 tokens are only issued after Discord sign-in;
 * the old pasted CWR1 keys are no longer accepted.
 */
export const RADIO_KEY_PREFIX = 'CWR2.';

function radioKeySecret(env = process.env) {
  const explicit = env.RADIO_KEY_SECRET?.trim();
  if (explicit) return explicit;
  const token = env.RADIO_BOT_TOKEN?.trim();
  if (!token) return '';
  // Derived so hosts only need the radio bot token; rotating the token revokes every key.
  return createHash('sha256').update(`clearwater-radio:${token}`).digest('hex');
}

/** Public WebSocket URL the desktop app connects to, e.g. ws://1.2.3.4:25565/radio. */
export function radioPublicUrl(env = process.env) {
  return env.RADIO_PUBLIC_URL?.trim() || '';
}

function sign(secret, userId) {
  return createHmac('sha256', secret).update(`radio-session:${userId}`).digest('base64url');
}

/**
 * Token the radio app stores after a member signs in with Discord.
 * It carries the relay URL and an HMAC of their Discord ID.
 * @returns {string|null} null when the host is missing radio env vars.
 */
export function createRadioKey(userId, env = process.env) {
  const secret = radioKeySecret(env);
  const url = radioPublicUrl(env);
  const id = String(userId || '').trim();
  if (!secret || !url || !/^\d{15,22}$/.test(id)) return null;
  const payload = { u: url, i: id, s: sign(secret, id) };
  return RADIO_KEY_PREFIX + Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeRadioKey(key) {
  const text = String(key || '').trim();
  if (!text.startsWith(RADIO_KEY_PREFIX)) return null;
  try {
    const payload = JSON.parse(Buffer.from(text.slice(RADIO_KEY_PREFIX.length), 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    const id = String(payload.i || '');
    if (!/^\d{15,22}$/.test(id) || typeof payload.s !== 'string') return null;
    return { url: String(payload.u || ''), userId: id, signature: payload.s };
  } catch {
    return null;
  }
}

/** @returns {string|null} the Discord user ID the key belongs to, or null if it is not valid here. */
export function verifyRadioKey(key, env = process.env) {
  const decoded = decodeRadioKey(key);
  const secret = radioKeySecret(env);
  if (!decoded || !secret) return null;
  const expected = Buffer.from(sign(secret, decoded.userId));
  const actual = Buffer.from(decoded.signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return decoded.userId;
}
