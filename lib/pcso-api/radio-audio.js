import { sendJson } from '../discord-auth.js';
import { requireAdmin } from './radio-logs.js';

export default async function handler(request, response) {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'Method not allowed' });
  const user = await requireAdmin(request, response);
  if (!user) return;
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'Live radio is not connected to the bot host yet.' });
  const url = new URL(request.url || '/', 'http://localhost');
  const query = new URLSearchParams();
  for (const name of ['cursor', 'epoch']) {
    const value = url.searchParams.get(name);
    if (value != null) query.set(name, value.slice(0, 80));
  }
  try {
    const upstream = await fetch(`${apiUrl}/api/pcso/radio-audio?${query}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'X-Admin-Id': String(user.id || ''),
        'X-Admin-Name': String(user.displayName || ''),
        'X-Admin-Username': String(user.username || ''),
      },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });
    if (!upstream.ok) throw new Error('upstream');
    const body = await upstream.json();
    if (!Array.isArray(body.frames) || typeof body.ready !== 'boolean') throw new Error('payload');
    return sendJson(response, 200, body);
  } catch {
    return sendJson(response, 502, { error: 'Live radio is unavailable. The bot host may need the latest update or a restart.' });
  }
}
