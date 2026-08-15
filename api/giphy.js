import { SESSION_COOKIE, getAuthConfig, parseCookies, readSessionToken, sendJson } from '../lib/discord-auth.js';
import { getStaffAccess } from '../lib/owner-access.js';
import { cachedJson, isAppFetchRequest, rejectPublicBrowse } from '../lib/api-guard.js';
import { allowRate } from '../utils/rateLimit.js';

export default async function handler(request, response) {
  if (rejectPublicBrowse(request, response)) return;
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!isAppFetchRequest(request)) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.end('Not found');
    return;
  }

  const key = process.env.GIPHY_API_KEY;
  if (!key) return sendJson(response, 503, { error: 'GIF search is not configured yet' });

  try {
    const { sessionSecret } = getAuthConfig();
    const user = readSessionToken(parseCookies(request.headers.cookie)[SESSION_COOKIE], sessionSecret);
    if (!user) return sendJson(response, 401, { error: 'Sign in with Discord to search GIFs' });
    if (!allowRate(`giphy:${user.id}`, { max: 20, windowMs: 60_000 })) {
      return sendJson(response, 429, { error: 'Too many GIF searches. Wait a moment.' });
    }
    const access = await getStaffAccess(user);
    if (!access.siteAccess) return sendJson(response, 403, { error: 'Clearwater Internet access required' });

    const url = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 50);
    const cacheKey = `giphy:${query.toLowerCase() || 'trending'}`;
    const payload = await cachedJson(cacheKey, query ? 60_000 : 180_000, async () => {
      const giphy = new URL(query ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending');
      const params = { api_key: key, limit: '18', rating: 'g', country_code: 'US' };
      if (query) params.q = query;
      giphy.search = new URLSearchParams(params).toString();
      const result = await fetch(giphy, { signal: AbortSignal.timeout(8000) });
      const data = await result.json();
      if (!result.ok) throw new Error('GIF search is temporarily unavailable');

      const giphyUrl = (value) => {
        try {
          const parsed = new URL(String(value || ''));
          if (parsed.protocol !== 'https:' || !/^(?:media\d*|i)\.giphy\.com$/i.test(parsed.hostname)) return '';
          return parsed.href;
        } catch {
          return '';
        }
      };

      return {
        gifs: (data.data || []).map((gif) => ({
          id: String(gif.id || '').slice(0, 80),
          title: String(gif.title || 'GIF').slice(0, 120),
          url: giphyUrl(gif.images?.original?.url || gif.images?.fixed_height?.url),
          previewUrl: giphyUrl(gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url),
        })).filter((gif) => gif.url && gif.previewUrl),
      };
    });

    response.setHeader('Cache-Control', 'private, max-age=30');
    return sendJson(response, 200, payload);
  } catch (error) {
    if (/Missing authentication configuration/i.test(String(error?.message || ''))) {
      return sendJson(response, 503, { error: 'GIF search is not configured yet' });
    }
    return sendJson(response, 502, { error: 'GIF search is temporarily unavailable' });
  }
}
