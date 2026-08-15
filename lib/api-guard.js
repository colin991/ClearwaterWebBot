/** Shared API hardening: hide browsable JSON and cache hot public endpoints. */

const memoryCache = new Map();

export function isBrowserDocumentRequest(request) {
  const dest = String(request.headers['sec-fetch-dest'] || '').toLowerCase();
  const mode = String(request.headers['sec-fetch-mode'] || '').toLowerCase();
  return dest === 'document' || mode === 'navigate';
}

/** True for same-origin / same-site fetch/XHR (and non-browser clients with no Sec-Fetch). */
export function isAppFetchRequest(request) {
  if (isBrowserDocumentRequest(request)) return false;
  const site = String(request.headers['sec-fetch-site'] || '').toLowerCase();
  if (!site) return true; // Phone / older clients
  return site === 'same-origin' || site === 'same-site' || site === 'none';
}

export function rejectPublicBrowse(request, response) {
  if (!isBrowserDocumentRequest(request)) return false;
  response.statusCode = 404;
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Robots-Tag', 'noindex, nofollow');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end('Not found');
  return true;
}

export function getCached(key) {
  const hit = memoryCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    memoryCache.delete(key);
    return null;
  }
  return hit.value;
}

export function setCached(key, value, ttlMs) {
  memoryCache.set(key, { value, expiresAt: Date.now() + Math.max(1_000, ttlMs) });
  if (memoryCache.size > 200) {
    const now = Date.now();
    for (const [entryKey, entry] of memoryCache) {
      if (entry.expiresAt <= now) memoryCache.delete(entryKey);
    }
  }
  return value;
}

export function clearCached(key) {
  memoryCache.delete(key);
}

export function clearCachedMatching(prefixOrTest) {
  const match = typeof prefixOrTest === 'function'
    ? prefixOrTest
    : (key) => String(key).startsWith(String(prefixOrTest));
  for (const key of memoryCache.keys()) {
    if (match(key)) memoryCache.delete(key);
  }
}

export async function cachedJson(key, ttlMs, loader) {
  const existing = getCached(key);
  if (existing) return existing;
  const value = await loader();
  return setCached(key, value, ttlMs);
}
