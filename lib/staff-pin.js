import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { clearCookie, makeCookie, parseCookies, safeEqual } from './discord-auth.js';

export const STAFF_PIN_COOKIE = '__Host-clearwater_staff_pin';
const UNLOCK_TTL_SECONDS = 60 * 60 * 4;

/** 5-digit PINs. Override with STAFF_OWNERSHIP_PIN / STAFF_MANAGEMENT_PIN on Vercel. */
function readPin(envName, fallback) {
  const raw = String(process.env[envName] || fallback || '').trim();
  return /^\d{5}$/.test(raw) ? raw : '';
}

export function getStaffPins() {
  return {
    ownership: readPin('STAFF_OWNERSHIP_PIN', '58014'),
    management: readPin('STAFF_MANAGEMENT_PIN', '73629'),
  };
}

function pinKey(secret) {
  return createHash('sha256').update('cw.staffpin.v1\0').update(secret).digest();
}

export function createStaffPinUnlockToken({ userId, panel }, secret) {
  const payload = {
    id: String(userId || ''),
    panel: panel === 'full' ? 'full' : 'limited',
    exp: Math.floor(Date.now() / 1000) + UNLOCK_TTL_SECONDS,
  };
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', pinKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `p1.${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

export function readStaffPinUnlockToken(token, secret) {
  try {
    const [version, ivPart, dataPart, tagPart] = String(token || '').split('.');
    if (version !== 'p1' || !ivPart || !dataPart || !tagPart) return null;
    const decipher = createDecipheriv('aes-256-gcm', pinKey(secret), Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const payload = JSON.parse(Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8'));
    if (!payload?.id || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.panel !== 'full' && payload.panel !== 'limited') return null;
    return payload;
  } catch {
    return null;
  }
}

export function staffPinUnlockCookie(token) {
  return makeCookie(STAFF_PIN_COOKIE, token, UNLOCK_TTL_SECONDS);
}

export function clearStaffPinUnlockCookie() {
  return clearCookie(STAFF_PIN_COOKIE);
}

export function readStaffPinUnlock(request, secret) {
  const cookies = parseCookies(request.headers.cookie);
  return readStaffPinUnlockToken(cookies[STAFF_PIN_COOKIE], secret);
}

export function pinsConfigured() {
  const pins = getStaffPins();
  return Boolean(pins.ownership && pins.management);
}

/**
 * Verify a typed PIN for the caller's Discord staff panel level.
 * Ownership (full) must use the ownership PIN.
 * Management (limited) must use the management PIN.
 */
export function verifyStaffPin(panelAccess, pin) {
  const typed = String(pin || '').trim();
  if (!/^\d{5}$/.test(typed)) return { ok: false, error: 'Enter the 5-digit staff PIN' };
  const pins = getStaffPins();
  if (!pins.ownership || !pins.management) {
    return { ok: false, error: 'Staff PINs are not configured on the server' };
  }
  if (panelAccess === 'full') {
    if (!safeEqual(typed, pins.ownership)) return { ok: false, error: 'Incorrect ownership PIN' };
    return { ok: true, panel: 'full' };
  }
  if (panelAccess === 'limited') {
    if (!safeEqual(typed, pins.management)) return { ok: false, error: 'Incorrect management PIN' };
    return { ok: true, panel: 'limited' };
  }
  return { ok: false, error: 'Staff access required' };
}

export function assertStaffPinUnlocked(request, secret, { userId, requiredPanel }) {
  const unlock = readStaffPinUnlock(request, secret);
  if (!unlock || String(unlock.id) !== String(userId || '')) {
    const error = new Error('Enter your staff PIN to continue');
    error.code = 'STAFF_PIN_REQUIRED';
    throw error;
  }
  if (requiredPanel === 'full' && unlock.panel !== 'full') {
    const error = new Error('Ownership PIN required for this action');
    error.code = 'STAFF_PIN_REQUIRED';
    throw error;
  }
  if (requiredPanel === 'limited' && unlock.panel !== 'full' && unlock.panel !== 'limited') {
    const error = new Error('Enter your staff PIN to continue');
    error.code = 'STAFF_PIN_REQUIRED';
    throw error;
  }
  return unlock;
}

/** Constant-time digit compare helper used by tests / diagnostics. */
export function pinsLookValid() {
  const pins = getStaffPins();
  return /^\d{5}$/.test(pins.ownership) && /^\d{5}$/.test(pins.management)
    && !safeEqual(pins.ownership, pins.management);
}
