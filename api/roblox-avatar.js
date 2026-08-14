import { fetchRobloxHeadshots } from '../lib/roblox-avatars.js';

const cache = new Map();
const CACHE_MS = 30 * 60 * 1000;

function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });

  const url = new URL(request.url, 'http://localhost');
  const userId = String(url.searchParams.get('userId') || '').replace(/[^\d]/g, '');
  if (!userId) return sendJson(response, 400, { error: 'Missing Roblox user id' });

  try {
    const cached = cache.get(userId);
    let imageUrl = cached && cached.expires > Date.now() ? cached.imageUrl : '';
    if (!imageUrl) {
      const headshots = await fetchRobloxHeadshots([userId]);
      imageUrl = headshots.get(userId) || '';
      if (imageUrl) cache.set(userId, { imageUrl, expires: Date.now() + CACHE_MS });
    }
    if (!imageUrl) return sendJson(response, 404, { error: 'Avatar not found' });

    const upstream = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!upstream.ok) return sendJson(response, 502, { error: 'Could not load Roblox avatar' });

    const contentType = upstream.headers.get('content-type') || 'image/png';
    const bytes = Buffer.from(await upstream.arrayBuffer());
    response.statusCode = 200;
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'public, max-age=1800, stale-while-revalidate=86400');
    response.setHeader('Content-Length', String(bytes.length));
    response.end(bytes);
  } catch {
    return sendJson(response, 502, { error: 'Could not load Roblox avatar' });
  }
}
