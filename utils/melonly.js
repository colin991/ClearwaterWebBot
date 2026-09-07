import { logger } from './logger.js';

export const MELONLY_API_BASE = 'https://api.melonly.xyz/api/v1';

/**
 * Low-level Melonly Open Cloud client (Bearer token, server-scoped).
 */
export async function melonlyFetch(apiKey, path, {
  method = 'GET',
  query = null,
  body = null,
  timeoutMs = 12_000,
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

  if (!response.ok) {
    const detail = json?.error || json?.message || text?.slice(0, 200) || response.statusText;
    const error = new Error(`Melonly ${method} ${url.pathname} failed (${response.status}): ${detail}`);
    error.status = response.status;
    error.body = json;
    throw error;
  }

  return json;
}

async function listAllPages(apiKey, path, { limit = 100, maxPages = 20 } = {}) {
  const items = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= maxPages) {
    const result = await melonlyFetch(apiKey, path, { query: { page, limit } });
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

/** Active (open) shifts for the Melonly department linked to the API key. */
export async function fetchActiveMelonlyShifts(apiKey) {
  const shifts = await listAllPages(apiKey, '/server/shifts', { limit: 100, maxPages: 30 });
  return shifts.filter(isActiveMelonlyShift);
}

/** All shifts (used for wave totals). */
export async function fetchAllMelonlyShifts(apiKey, { maxPages = 15 } = {}) {
  return listAllPages(apiKey, '/server/shifts', { limit: 100, maxPages });
}

export async function fetchMelonlyMember(apiKey, memberId) {
  return melonlyFetch(apiKey, `/server/members/${encodeURIComponent(memberId)}`);
}

export async function fetchMelonlyMemberByDiscordId(apiKey, discordId) {
  return melonlyFetch(apiKey, `/server/members/discord/${encodeURIComponent(discordId)}`);
}

export async function fetchMelonlyRoles(apiKey) {
  return listAllPages(apiKey, '/server/roles', { limit: 100, maxPages: 10 });
}

/**
 * Best-effort Discord ID from a Melonly member / shift memberId.
 * Public schemas are sparse; real payloads often include discord/user ids.
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
 * Probe Melonly CAD endpoints (not publicly documented). Returns null when unavailable.
 */
export async function fetchMelonlyCadForDiscord(apiKey, discordId) {
  const id = String(discordId || '').trim();
  if (!apiKey || !id) return null;

  const candidates = [
    `/server/cad/units/discord/${encodeURIComponent(id)}`,
    `/server/cad/units/${encodeURIComponent(id)}`,
    `/cad/units/discord/${encodeURIComponent(id)}`,
    `/cad/units/${encodeURIComponent(id)}`,
  ];

  for (const path of candidates) {
    try {
      const data = await melonlyFetch(apiKey, path, { timeoutMs: 6_000 });
      if (data && typeof data === 'object') {
        return {
          status: data.status || data.currentStatus || data.unitStatus || data.state || null,
          attachedCalls: data.attachedCalls || data.calls || data.activeCalls || data.callAttachments || null,
          raw: data,
          path,
        };
      }
    } catch (error) {
      if (error?.status === 404 || error?.status === 400) continue;
      if (error?.status === 401 || error?.status === 403) {
        logger.warn(`Melonly CAD probe unauthorized at ${path}`);
        return null;
      }
      // 429 / 5xx — stop probing this cycle
      if (error?.status === 429 || (error?.status >= 500)) {
        logger.warn(`Melonly CAD probe stopped (${error?.message || error})`);
        return null;
      }
    }
  }
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
