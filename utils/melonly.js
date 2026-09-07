import { logger } from './logger.js';

/** Clearwater main Melonly API (server-scoped Bearer token). */
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

/**
 * Low-level Melonly client for the main Clearwater Melonly server.
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

/**
 * Fetch a small number of newest shift pages (main Melonly).
 * Open shifts are recent — do not walk the whole history (that causes 429s).
 */
async function listRecentShiftPages(apiKey, {
  limit = 100,
  maxPages = 2,
  cacheTtlMs = 25_000,
} = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= maxPages) {
    const result = await melonlyFetch(apiKey, '/server/shifts', {
      query: { page, limit },
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
  const ended = shift.endedAt;
  if (ended == null || ended === '' || ended === 0 || ended === '0') return true;
  return false;
}

export function shiftCreatedMs(shift) {
  const raw = Number(shift?.createdAt);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  // Melonly docs use Unix epoch integers; tolerate ms.
  return raw > 1e12 ? raw : raw * 1000;
}

/**
 * Active (open) shifts from the main Melonly server.
 * Uses a short cache so panel refresh + command share one Melonly pull.
 */
export async function fetchActiveMelonlyShifts(apiKey, { cacheTtlMs = 25_000 } = {}) {
  const shifts = await listRecentShiftPages(apiKey, {
    limit: 100,
    maxPages: 2,
    cacheTtlMs,
  });
  return shifts.filter(isActiveMelonlyShift);
}

/**
 * Active (open) shifts — prefer Pinellas department scope when available,
 * otherwise the Melonly server shifts endpoint.
 */
export async function fetchPinellasDepartmentShifts(apiKey, departmentId, { cacheTtlMs = 25_000 } = {}) {
  const id = String(departmentId || '').trim();
  if (!apiKey || !id) return fetchRecentMelonlyShifts(apiKey, { cacheTtlMs });

  const candidates = [
    { path: `/server/shifts`, query: { page: 1, limit: 100, departmentId: id } },
    { path: `/departments/${encodeURIComponent(id)}/shifts`, query: { page: 1, limit: 100 } },
    { path: `/department/${encodeURIComponent(id)}/shifts`, query: { page: 1, limit: 100 } },
  ];

  for (const candidate of candidates) {
    try {
      const result = await melonlyFetch(apiKey, candidate.path, {
        query: candidate.query,
        cacheTtlMs,
      });
      const batch = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
      if (batch.length || result?.total === 0 || Array.isArray(result?.data)) {
        // If department filter is accepted, also pull page 2 lightly.
        let items = [...batch];
        if ((Number(result?.totalPages) || 1) > 1) {
          try {
            const page2 = await melonlyFetch(apiKey, candidate.path, {
              query: { ...candidate.query, page: 2 },
              cacheTtlMs,
            });
            const more = Array.isArray(page2?.data) ? page2.data : [];
            items = items.concat(more);
          } catch {
            // one page is enough
          }
        }
        return items;
      }
    } catch (error) {
      if (error?.status === 404 || error?.status === 400) continue;
      if (error?.status === 429) throw error;
      logger.warn(`Melonly department shifts probe failed (${candidate.path}): ${error?.message || error}`);
    }
  }

  return fetchRecentMelonlyShifts(apiKey, { cacheTtlMs });
}

/** @deprecated Use fetchRecentMelonlyShifts — full history walks cause Melonly 429s. */
export async function fetchAllMelonlyShifts(apiKey, options = {}) {
  return fetchRecentMelonlyShifts(apiKey, options);
}

export async function fetchMelonlyMember(apiKey, memberId) {
  return melonlyFetch(apiKey, `/server/members/${encodeURIComponent(memberId)}`, {
    cacheTtlMs: 5 * 60_000,
  });
}

export async function fetchMelonlyMemberByDiscordId(apiKey, discordId) {
  return melonlyFetch(apiKey, `/server/members/discord/${encodeURIComponent(discordId)}`, {
    cacheTtlMs: 5 * 60_000,
  });
}

export async function fetchMelonlyRoles(apiKey) {
  return melonlyFetch(apiKey, '/server/roles', {
    query: { page: 1, limit: 100 },
    cacheTtlMs: 15 * 60_000,
  }).then((result) => (Array.isArray(result?.data) ? result.data : []));
}

/**
 * Best-effort Discord ID from a Melonly member / shift memberId.
 * On the main Melonly server, shift.memberId is typically the Discord snowflake.
 */
export function resolveMelonlyDiscordId(memberOrShift, fallbackMemberId = null) {
  const sources = [
    memberOrShift,
    memberOrShift?.member,
    memberOrShift?.user,
  ].filter(Boolean);

  for (const source of sources) {
    for (const key of [
      'discordId',
      'discordUserId',
      'discord_id',
      'userId',
      'user_id',
      'id',
    ]) {
      const value = String(source?.[key] || '').trim();
      if (/^\d{16,22}$/.test(value)) return value;
    }
  }

  const fallback = String(fallbackMemberId || memberOrShift?.memberId || '').trim();
  if (/^\d{16,22}$/.test(fallback)) return fallback;
  return null;
}

/**
 * Melonly CAD is not part of the public main API docs.
 * Do not probe multiple endpoints (burns rate limit). Return null.
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
