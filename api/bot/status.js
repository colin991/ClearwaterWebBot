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
    if (!apiUrl || !apiKey) return { online: false, configured: false };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const botResponse = await fetch(`${apiUrl}/api/status`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      if (!botResponse.ok) return { online: false, configured: true };

      const status = await botResponse.json();
      return {
        online: status.online === true,
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
    } catch {
      return { online: false, configured: true };
    } finally {
      clearTimeout(timeout);
    }
  });

  return response.end(JSON.stringify(payload));
}
