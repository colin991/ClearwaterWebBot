import { logger } from './logger.js';
import { createHash } from 'node:crypto';

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

  const url = new URL(path.replace(/^\//, ''), `${MELONLY_API_BASE}/`);
  if (query && typeof query === 'object') {
    for (const [name, value] of Object.entries(query)) {
      if (value == null || value === '') continue;
      url.searchParams.set(name, String(value));
    }
  }

  const cacheKey = `${createHash('sha256').update(key).digest('hex')}:${method}:${url.toString()}`;
  if (method === 'GET' && cacheTtlMs > 0) {
    const hit = responseCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }

  if (isMelonlyRateLimited()) {
    const waitSec = Math.ceil((rateLimitedUntil - Date.now()) / 1000);
    const error = new Error(`Melonly rate limited — try again in ~${waitSec}s.`);
    error.status = 429;
    error.rateLimited = true;
    error.retryAfter = waitSec;
    throw error;
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
    error.retryAfter = retrySec;
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

/** Last moment a shift represented activity (end time when present, otherwise start). */
export function shiftLastActivityMs(shift) {
  const values = [shift?.endedAt, shift?.createdAt, shift?.startedAt, shift?.startAt]
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => (value > 1e12 ? value : value * 1000));
  return values.length ? Math.max(...values) : null;
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

/**
 * Load enough newest-first shift pages to cover a time window.
 * `complete` is false if the safety page cap is reached before the window is covered.
 */
export async function fetchMelonlyShiftsSince(apiKey, sinceMs, {
  cacheTtlMs = 60_000,
  maxPages = 10,
} = {}) {
  const shifts = [];
  let page = 1;
  let totalPages = 1;
  let coveredWindow = false;
  let pagesFetched = 0;

  while (page <= totalPages && page <= maxPages) {
    const result = await melonlyFetch(apiKey, '/server/shifts', {
      query: { page, limit: 100 },
      cacheTtlMs,
    });
    pagesFetched += 1;
    const batch = Array.isArray(result?.data) ? result.data : (Array.isArray(result) ? result : []);
    totalPages = Math.max(1, Number(result?.totalPages) || 1);
    shifts.push(...batch);
    if (!batch.length) {
      coveredWindow = true;
      break;
    }

    const timestamps = batch.map(shiftLastActivityMs).filter(Boolean);
    if (timestamps.length && Math.min(...timestamps) < sinceMs) {
      coveredWindow = true;
      break;
    }
    page += 1;
  }

  return {
    shifts: shifts.filter((shift) => (shiftLastActivityMs(shift) || 0) >= sinceMs),
    complete: coveredWindow || page > totalPages,
    pagesFetched,
    totalPages,
  };
}

/** @deprecated Prefer fetchPinellasDepartmentShifts for the PCSO panel. */
export async function fetchActiveMelonlyShifts(apiKey, options = {}) {
  const shifts = await fetchRecentMelonlyShifts(apiKey, options);
  return shifts.filter(isActiveMelonlyShift);
}

/**
 * Shifts for a Melonly department (not main/staff panel shifts).
 * Official endpoint: GET /server/departments/{departmentId}/shifts
 */
export async function fetchPinellasDepartmentShifts(apiKey, departmentId, {
  cacheTtlMs = 25_000,
  maxPages = 3,
} = {}) {
  const id = String(departmentId || '').trim();
  if (!id) throw new Error('Melonly department id is required.');
  return listPages(apiKey, `/server/departments/${encodeURIComponent(id)}/shifts`, {
    limit: 100,
    maxPages,
    cacheTtlMs,
  });
}

export async function fetchActivePinellasDepartmentShifts(apiKey, departmentId, options = {}) {
  const shifts = await fetchPinellasDepartmentShifts(apiKey, departmentId, options);
  return shifts.filter(isActiveMelonlyShift);
}

/** Paginated Leave of Absence records for the token's server and departments. */
export async function fetchMelonlyLoas(apiKey, { cacheTtlMs = 60_000, maxPages = 5 } = {}) {
  return listPages(apiKey, '/server/loas', {
    limit: 100,
    maxPages,
    cacheTtlMs,
  });
}

function epochMs(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return numeric > 1e12 ? numeric : numeric * 1000;
}

/** True only while an approved Melonly LOA is currently in effect. */
export function isActiveMelonlyLoa(loa, now = Date.now()) {
  if (!loa || typeof loa !== 'object') return false;
  if (epochMs(loa.cancelledAt) || epochMs(loa.endedAt) || epochMs(loa.expiredAt)) return false;
  if (String(loa.denyReason || '').trim()) return false;

  const status = String(loa.status ?? '').trim().toLowerCase();
  if (['denied', 'rejected', 'cancelled', 'canceled', 'ended', 'expired'].includes(status)) return false;

  const start = epochMs(loa.startedAt) || epochMs(loa.startAt);
  const end = epochMs(loa.endAt);
  if (start && start > now) return false;
  if (end && end <= now) return false;

  // Melonly supplies reviewedAt for approved requests and startedAt once active.
  // Pending requests must not mark a roster row as LOA.
  return Boolean(epochMs(loa.startedAt) || epochMs(loa.reviewedAt));
}

/** @deprecated Use fetchRecentMelonlyShifts / fetchPinellasDepartmentShifts. */
export async function fetchAllMelonlyShifts(apiKey, options = {}) {
  return fetchRecentMelonlyShifts(apiKey, options);
}

export async function fetchMelonlyMember(apiKey, memberId) {
  return melonlyFetch(apiKey, `/server/members/${encodeURIComponent(memberId)}`, {
    cacheTtlMs: 10 * 60_000,
  });
}

/**
 * Official Melonly mapping: internal memberId → Discord snowflake.
 * Prefers department-scoped lookup when departmentId is provided.
 */
export async function fetchMelonlyMemberDiscordId(apiKey, memberId, {
  departmentId = null,
} = {}) {
  const id = String(memberId || '').trim();
  if (!id) return null;

  const paths = [];
  const dept = String(departmentId || '').trim();
  if (dept) {
    paths.push(`/server/departments/${encodeURIComponent(dept)}/members/${encodeURIComponent(id)}/discord`);
  }
  paths.push(`/server/members/${encodeURIComponent(id)}/discord`);

  let lastError = null;
  for (const path of paths) {
    try {
      const result = await melonlyFetch(apiKey, path, { cacheTtlMs: 10 * 60_000 });
      // Only accept explicit discordId fields — never fall back to Melonly `id`.
      const discordId = String(
        result?.discordId
        || result?.discord_id
        || result?.discordUserId
        || result?.userId
        || '',
      ).trim();
      if (/^\d{16,22}$/.test(discordId)) return discordId;
    } catch (error) {
      lastError = error;
      if (error?.status === 429) throw error;
      if (error?.status && error.status !== 404) {
        logger.warn(`Melonly discord lookup failed (${path}): ${error?.message || error}`);
      }
    }
  }
  if (lastError?.status === 429) throw lastError;
  return null;
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
 * Melonly CAD helpers. Call listing is not fully documented publicly, so we probe
 * known /server/cad paths and normalize whatever shape comes back.
 */
export async function fetchMelonlyCadForDiscord() {
  return null;
}

const CAD_CALL_PATHS = [
  '/server/cad/calls',
  '/server/cad/calls/active',
  '/server/calls',
];

function asCadArray(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.calls)) return value.calls;
  if (Array.isArray(value.results)) return value.results;
  if (Array.isArray(value.items)) return value.items;
  return [];
}

function cadUnitLabels(call) {
  const bags = [
    call?.units,
    call?.assignedUnits,
    call?.attachedUnits,
    call?.respondingUnits,
    call?.unit,
    call?.assigned,
    call?.officers,
  ];
  const labels = [];
  for (const bag of bags) {
    if (bag == null) continue;
    const list = Array.isArray(bag) ? bag : [bag];
    for (const entry of list) {
      if (entry == null || entry === '') continue;
      if (typeof entry === 'string' || typeof entry === 'number') {
        labels.push(String(entry));
        continue;
      }
      const label = entry.callsign || entry.unit || entry.name || entry.label
        || entry.badge || entry.username || entry.displayName || entry.id;
      if (label) labels.push(String(label));
      if (entry.department) labels.push(String(entry.department));
      if (entry.agency) labels.push(String(entry.agency));
    }
  }
  return labels;
}

function cadCallText(call) {
  return [
    call?.title, call?.name, call?.code, call?.type, call?.postal,
    call?.description, call?.location, call?.address, call?.agency,
    call?.department, call?.departmentId, call?.departmentName,
    ...cadUnitLabels(call),
  ].map((value) => String(value || '').toLowerCase()).join(' ');
}

/** True when Melonly call text/units look like Pinellas / PCSO. */
export function isPcsoAssignedCadCall(call, pinellasDepartmentId = '') {
  const text = cadCallText(call);
  const dept = String(pinellasDepartmentId || '').trim();
  if (dept && (String(call?.departmentId || '') === dept || String(call?.department?.id || '') === dept)) {
    return cadUnitLabels(call).length > 0 || /pcso|pinellas|sheriff/.test(text);
  }
  if (!/pcso|pinellas|sheriff/.test(text)) return false;
  const units = cadUnitLabels(call);
  if (!units.length) {
    return /assigned|attached|responding/.test(text) || Boolean(call?.units || call?.assignedUnits);
  }
  return units.some((unit) => /pcso|pinellas|sheriff|\b\d{1,3}[a-z]-\d+/i.test(unit))
    || /pcso|pinellas|sheriff/.test(text);
}

export function normalizeMelonlyCadCall(call) {
  if (!call || typeof call !== 'object') return null;
  const units = cadUnitLabels(call);
  return {
    id: String(call.id || call.callId || call._id || call.number || ''),
    title: String(call.title || call.name || call.type || call.code || 'Active call'),
    code: String(call.code || call.callCode || call.postal || ''),
    status: String(call.status?.name || call.status?.label || call.status || call.state || 'Active'),
    location: String(call.location || call.address || call.street || call.place || ''),
    units,
  };
}

/**
 * Fetch Melonly CAD calls and keep those with a PCSO / Pinellas unit assigned.
 */
export async function fetchPcsoAssignedMelonlyCalls(apiKey, {
  pinellasDepartmentId = '',
  cacheTtlMs = 15_000,
} = {}) {
  const paths = [...CAD_CALL_PATHS];
  const dept = String(pinellasDepartmentId || '').trim();
  if (dept) {
    paths.unshift(`/server/departments/${encodeURIComponent(dept)}/cad/calls`);
    paths.unshift(`/server/departments/${encodeURIComponent(dept)}/calls`);
  }

  let lastError = null;
  let rawCalls = [];
  let sourcePath = null;

  for (const path of paths) {
    try {
      const result = await melonlyFetch(apiKey, path, { cacheTtlMs });
      const batch = asCadArray(result);
      sourcePath = path;
      rawCalls = batch;
      break;
    } catch (error) {
      lastError = error;
      if (error?.status === 429) throw error;
    }
  }

  if (!sourcePath) {
    const error = lastError || new Error('Melonly CAD calls are unavailable.');
    error.code = 'cad_unavailable';
    throw error;
  }

  const calls = rawCalls
    .filter((call) => isPcsoAssignedCadCall(call, dept))
    .map(normalizeMelonlyCadCall)
    .filter(Boolean);

  return {
    calls,
    sourcePath,
    totalRaw: rawCalls.length,
  };
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
