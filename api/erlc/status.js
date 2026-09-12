export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=30');

  const serverKey = process.env.ERLC_SERVER_KEY;
  if (!serverKey) {
    response.statusCode = 503;
    return response.end(JSON.stringify({ online: false, configured: false }));
  }

  try {
    const upstream = await fetch('https://api.erlc.gg/v2/server?Queue=true', {
      headers: { 'server-key': serverKey },
      signal: AbortSignal.timeout(8000),
    });
    if (!upstream.ok) {
      response.statusCode = 502;
      return response.end(JSON.stringify({ online: false, configured: true }));
    }

    const server = await upstream.json();
    return response.end(JSON.stringify({
      online: true,
      currentPlayers: Number.isInteger(server.CurrentPlayers) ? server.CurrentPlayers : 0,
      maxPlayers: Number.isInteger(server.MaxPlayers) ? server.MaxPlayers : 50,
      queue: Array.isArray(server.Queue) ? server.Queue.length : 0,
      updatedAt: new Date().toISOString(),
    }));
  } catch {
    response.statusCode = 502;
    return response.end(JSON.stringify({ online: false, configured: true }));
  }
}
