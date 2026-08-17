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
  response.setHeader('Cache-Control', 'public, s-maxage=45, stale-while-revalidate=120, max-age=15');
  response.setHeader('X-Robots-Tag', 'noindex');

  const payload = await cachedJson('bot-status-v1', 20_000, async () => {
    const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
    const apiKey = process.env.BOT_API_KEY;
    if (!apiUrl || !apiKey) return { online: false, configured: false, bridgeError: 'missing_env' };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const healthResponse = await fetch(`${apiUrl}/health`, { signal: controller.signal });
      if (!healthResponse.ok) {
        return { online: false, configured: true, bridgeError: `http_${healthResponse.status}` };
      }
      const health = await healthResponse.json().catch(() => null);
      if (!health?.ok) return { online: false, configured: true, bridgeError: 'invalid_health' };

      const statusResponse = await fetch(`${apiUrl}/api/status`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(4000),
      });
      if (statusResponse.status === 401) {
        return { online: false, configured: true, bridgeError: 'unauthorized' };
      }
      if (!statusResponse.ok) {
        return { online: false, configured: true, bridgeError: `status_${statusResponse.status}` };
      }

      const status = await statusResponse.json();
      return {
        online: status.online === true,
        configured: true,
        bridgeError: null,
        memberCount: Number.isInteger(status.guild?.memberCount) ? status.guild.memberCount : null,
        latencyMs: Number.isFinite(status.bot?.latencyMs) ? status.bot.latencyMs : null,
        updatedAt: status.updatedAt || null,
        erlc: {
          online: status.erlc?.online === true,
          currentPlayers: Number.isInteger(status.erlc?.currentPlayers) ? status.erlc.currentPlayers : 0,
          maxPlayers: Number.isInteger(status.erlc?.maxPlayers) ? status.erlc.maxPlayers : 50,
          queue: Number.isInteger(status.erlc?.queue) ? status.erlc.queue : 0,
        },
      };
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      return { online: false, configured: true, bridgeError: timedOut ? 'timeout' : 'connect_failed' };
    } finally {
      clearTimeout(timeout);
    }
  });

  return response.end(JSON.stringify(payload));
}
