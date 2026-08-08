import { sendJson } from '../lib/discord-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  const key = process.env.GIPHY_API_KEY;
  if (!key) return sendJson(response, 503, { error: 'GIF search is not configured yet' });

  try {
    const url = new URL(request.url, `https://${request.headers.host || 'cwrpvc.lol'}`);
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 50);
    const giphy = new URL(query ? 'https://api.giphy.com/v1/gifs/search' : 'https://api.giphy.com/v1/gifs/trending');
    const params = { api_key: key, limit: '18', rating: 'g', country_code: 'US' };
    if (query) params.q = query;
    giphy.search = new URLSearchParams(params).toString();
    const result = await fetch(giphy, { signal: AbortSignal.timeout(8000) });
    const data = await result.json();
    if (!result.ok) return sendJson(response, 502, { error: 'GIF search is temporarily unavailable' });

    return sendJson(response, 200, {
      gifs: (data.data || []).map((gif) => ({
        id: gif.id,
        title: String(gif.title || 'GIF').slice(0, 120),
        url: gif.images?.original?.url || gif.images?.fixed_height?.url,
        previewUrl: gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url,
      })).filter((gif) => gif.url && gif.previewUrl),
    });
  } catch {
    return sendJson(response, 502, { error: 'GIF search is temporarily unavailable' });
  }
}
