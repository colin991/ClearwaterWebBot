export default async function handler(request, response) {
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=30');

  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return response.end(JSON.stringify({ online: false, configured: false }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);

  try {
    const botResponse = await fetch(`${apiUrl}/api/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    if (!botResponse.ok) return response.end(JSON.stringify({ online: false, configured: true }));

    const status = await botResponse.json();
    return response.end(JSON.stringify({
      online: status.online === true,
      memberCount: Number.isInteger(status.guild?.memberCount) ? status.guild.memberCount : null,
      latencyMs: Number.isFinite(status.bot?.latencyMs) ? status.bot.latencyMs : null,
      updatedAt: status.updatedAt || null,
    }));
  } catch {
    return response.end(JSON.stringify({ online: false, configured: true }));
  } finally {
    clearTimeout(timeout);
  }
}
