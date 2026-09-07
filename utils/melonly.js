import { logger } from './logger.js';

/** Melonly API — token is server/department-scoped (create it on the Pinellas Melonly). */
export const MELONLY_API_BASE = 'https://api.melonly.xyz/api/v1';

/** Soft client-side cache so 30s panel refreshes do not spam Melonly. */
const responseCache = new Map();
/** After a 429, pause Melonly calls until this timestamp. */
let rateLimitedUntil = 0;

function formatMelonlyErrorDetail(json, text, statusText) {
  const raw = json?.error ?? json?.message ?? null;
  if (raw == null || raw === '') {
    return String(text || statusText || 'request failed').slice(0, 240);
  }
  if (typeof raw === 'string') return raw.slice(0, 240);
  try {
    return JSON.stringify(raw).slice(0, 240);
  } catch {
    return String(raw).slice(0, 240);
  }
}

export function melonlyRateLimitedUntil() {
  return rateLimitedUntil;
}

export function isMelonlyRateLimited() {
  return Date.now() < rateLimitedUntil;
}

export function clearMelonlyResponseCache() {
  responseCache.clear();
}

/**
 * Low-level Melonly client. Token scope = whatever Melonly server/department created it.
 */
export async function melonlyFetch(apiKey, path, {
  method = 'GET',
  query = null,
  body = null,
  timeoutMs = 12_000,
  cacheTtlMs = 0,
} = {}) {
  const key = String(apiKey || '').trim();
  if (!key) throw new Error('MELONLY_API_KEY is not configured.');

  if (isMelonlyRateLimited()) {
    const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    const error = new Error(`Melonly rate limited — try again in ~${waitSec}s.`);
    error.status = 429;
    error.rateLimited = true;
    throw error;
  }

  const url = new URL(path.replace(/^\//, ''), `${MELONLY_API_BASE}/`);
  if (query && typeof query === 'object') {
    for (const [name, value] of Object.entries(query)) {
      if (value == null || value === '') continue;
      url.searchParams.set(name, String(value));
    }
  }

  const cacheKey = `${method}:${url.toString()}`;
  if (method === 'GET' && cacheTtlMs > 0) {
    const hit = responseCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }

  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
  };
  let payload;
  if (body != null) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: payload,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  const retryAfterHeader = Number(response.headers.get('retry-after'));
  const resetHeader = Number(response.headers.get('x-ratelimit-reset'));
  if (response.status === 429) {
    const retrySec = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
      ? retryAfterHeader
      : (Number.isFinite(resetHeader) && resetHeader > 0 ? Math.min(resetHeader, 3600) : 60);
    rateLimitedUntil = Date.now() + (retrySec * 1000);
    const detail = formatMelonlyErrorDetail(json, text, response.statusText);
    const error = new Error(`Melonly rate limited (${detail}). Wait ~${retrySec}s.`);
    error.status = 429;
    error.rateLimited = true;
    error.body = json;
    throw error;
  }

  if (!response.ok) {
    const detail = formatMelonlyErrorDetail(json, text, response.statusText);
    const error = new Error(`Melonly ${method} ${url.pathname} failed (${response.status}): ${detail}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }

  if (method === 'GET' && cacheTtlMs > 0) {
    responseCache.set(cacheKey, { value: json, expiresAt: Date.now() + cacheTtlMs });
  }
  return json;
}

async function listPages(apiKey, path, {
  limit = 100,
  maxPages = 3,
  cacheTtlMs = 25_000,
  query = {},
} = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= maxPages) {
    const result = await melonlyFetch(apiKey, path, {
      query: { page, limit, ...query },
      cacheTtlMs,
    });
    const batch = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
    items.push(...batch);
    totalPages = Math.max(1, Number(result?.totalPages) || 1);
    if (!batch.length) break;
    page += 1;
  }
  return items;
}

export function isActiveMelonlyShift(shift) {
  if (!shift || typeof shift !== 'object') return false;
  const status = String(shift.status || shift.state || '').toLowerCase();
  if (status && ['ended', 'complete', 'completed', 'closed', 'inactive'].includes(status)) {
    return false;
  }
  if (status && ['active', 'ongoing', 'on_duty', 'onduty', 'open'].includes(status)) {
    return true;
  }
  const ended = shift.endedAt;
  if (ended == null || ended === '' || ended === 0 || ended === '0') return true;
  return false;
}

export function shiftCreatedMs(shift) {
  const raw = Number(shift?.createdAt ?? shift?.startedAt ?? shift?.startAt);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return raw > 1e12 ? raw : raw * 1000;
}

/**
 * Recent shifts for the Melonly server/department the API key belongs to.
 * Create the token on the Pinellas Melonly department (Settings → Panel → API Tokens).
 */
export async function fetchRecentMelonlyShifts(apiKey, { cacheTtlMs = 25_000, maxPages = 3 } = {}) {
  return listPages(apiKey, '/server/shifts', {
    limit: 100,
    maxPages,
    cacheTtlMs,
  });
}

export async function fetchActiveMelonlyShifts(apiKey, options = {}) {
  const shifts = await fetchRecentMelonlyShifts(apiKey, options);
  return shifts.filter(isActiveMelonlyShift);
}

/** @deprecated */
export async function fetchAllMelonlyShifts(apiKey, options = {}) {
  return fetchRecentMelonlyShifts(apiKey, options);
}

/** @deprecated department probe removed — use a Pinellas-department API token instead. */
export async function fetchPinellasDepartmentShifts(apiKey, _departmentId, options = {}) {
  return fetchRecentMelonlyShifts(apiKey, options);
}

export async function fetchMelonlyMember(apiKey, memberId) {
  return melonlyFetch(apiKey, `/server/members/${encodeURIComponent(memberId)}`, {
    cacheTtlMs: 10 * 60_000,
  });
}

/**
 * Official Melonly mapping: internal memberId → Discord snowflake.
 * GET /server/members/{memberId}/discord → { discordId }
 */
export async function fetchMelonlyMemberDiscordId(apiKey, memberId) {
  const id = String(memberId || '').trim();
  if (!id) return null;
  const result = await melonlyFetch(apiKey, `/server/members/${encodeURIComponent(id)}/discord`, {
    cacheTtlMs: 10 * 60_000,
  });
  // Only accept explicit discordId fields — never fall back to Melonly `id`.
  const discordId = String(
    result?.discordId
    || result?.discord_id
    || result?.discordUserId
    || result?.userId
    || '',
  ).trim();
  return /^\d{16,22}$/.test(discordId) ? discordId : null;
}

export async function fetchMelonlyMemberByDiscordId(apiKey, discordId) {
  return melonlyFetch(apiKey, `/server/members/discord/${encodeURIComponent(discordId)}`, {
    cacheTtlMs: 10 * 60_000,
  });
}

export async function fetchMelonlyMembers(apiKey, { maxPages = 5, cacheTtlMs = 10 * 60_000 } = {}) {
  return listPages(apiKey, '/server/members', { limit: 100, maxPages, cacheTtlMs });
}

export async function fetchMelonlyRoles(apiKey) {
  return listPages(apiKey, '/server/roles', {
    limit: 100,
    maxPages: 3,
    cacheTtlMs: 15 * 60_000,
  });
}

/**
 * Extract an explicit Discord snowflake from a Melonly payload.
 * Do NOT treat Melonly `id` / `memberId` as Discord — Melonly docs say IDs are internal.
 */
export function resolveMelonlyDiscordId(memberOrShift) {
  const sources = [
    memberOrShift,
    memberOrShift?.member,
    memberOrShift?.user,
    memberOrShift?.account,
    memberOrShift?.discord,
  ].filter(Boolean);

  for (const source of sources) {
    for (const key of [
      'discordId',
      'discordUserId',
      'discord_id',
      'discordID',
      'userId',
      'user_id',
    ]) {
      const value = String(source?.[key] || '').trim();
      if (/^\d{16,22}$/.test(value)) return value;
    }
    // Nested discord object: { id: "..." }
    const nested = source?.discord?.id || source?.discordUser?.id;
    if (/^\d{16,22}$/.test(String(nested || ''))) return String(nested);
  }
  return null;
}

/**
 * Melonly CAD is not part of the public API docs.
 */
export async function fetchMelonlyCadForDiscord() {
  return null;
}

export function formatCadStatus(cad) {
  if (!cad) return 'Unavailable';
  const status = cad.status;
  if (status == null || status === '') return 'Unavailable';
  if (typeof status === 'string') return status;
  if (typeof status === 'object') {
    return status.name || status.label || status.status || JSON.stringify(status);
  }
  return String(status);
}

export function formatCadAttachedCalls(cad) {
  if (!cad) return 'Unavailable';
  const calls = cad.attachedCalls;
  if (calls == null) return 'None';
  if (typeof calls === 'string') return calls || 'None';
  if (Array.isArray(calls)) {
    if (!calls.length) return 'None';
    return calls.map((call) => {
      if (typeof call === 'string') return call;
      return call?.id || call?.number || call?.code || call?.title || call?.name || JSON.stringify(call);
    }).join(', ');
  }
  if (typeof calls === 'object') {
    return calls.id || calls.number || calls.title || JSON.stringify(calls);
  }
  return String(calls);
}
