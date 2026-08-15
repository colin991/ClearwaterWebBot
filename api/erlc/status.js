import { cachedJson, isAppFetchRequest, rejectPublicBrowse } from '../../lib/api-guard.js';

export default async function handler(request, response) {
  if (rejectPublicBrowse(request, response)) return;
  if (!isAppFetchRequest(request)) {
    response.statusCode = 404;
    response.setHeader('Content-Type', 'text/plain; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Robots-Tag', 'noindex, nofollow');
    response.end('Not found');
    return;
  }

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'public, s-maxage=45, stale-while-revalidate=120, max-age=20');
  response.setHeader('X-Robots-Tag', 'noindex');

  const payload = await cachedJson('erlc-status-v1', 25_000, async () => {
    const serverKey = process.env.ERLC_SERVER_KEY;
    if (!serverKey) {
      return { online: false, configured: false, status: 503 };
    }

    try {
      const upstream = await fetch('https://api.erlc.gg/v2/server?Queue=true', {
        headers: { 'server-key': serverKey },
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) return { online: false, configured: true, status: 502 };

      const server = await upstream.json();
      return {
        online: true,
        currentPlayers: Number.isInteger(server.CurrentPlayers) ? server.CurrentPlayers : 0,
        maxPlayers: Number.isInteger(server.MaxPlayers) ? server.MaxPlayers : 50,
        queue: Array.isArray(server.Queue) ? server.Queue.length : 0,
        updatedAt: new Date().toISOString(),
        status: 200,
      };
    } catch {
      return { online: false, configured: true, status: 502 };
    }
  });

  response.statusCode = payload.status || 200;
  const { status, ...body } = payload;
  return response.end(JSON.stringify(body));
}
