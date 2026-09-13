import { requireAdmin } from './radio-logs.js';
import { sendJson } from '../discord-auth.js';

export default async function handler(request, response) {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
  if (!(await requireAdmin(request, response))) return;
  const apiUrl = process.env.BOT_API_URL?.replace(/\/$/, '');
  const apiKey = process.env.BOT_API_KEY;
  if (!apiUrl || !apiKey) return sendJson(response, 503, { error: 'Live radio is not connected to the bot host yet.' });
  const action = String(request.headers['x-talk-action'] || 'audio').toLowerCase();
  if (!['audio', 'stop'].includes(action)) return sendJson(response, 400, { error: 'Invalid talk action.' });
  try {
    const chunks = [];
    let total = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > 96_000) return sendJson(response, 413, { error: 'Audio chunk is too large.' });
      chunks.push(buffer);
    }
    const upstream = await fetch(`${apiUrl}/api/pcso/radio-talk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/octet-stream',
        'X-Talk-Action': action,
      },
      body: Buffer.concat(chunks),
      signal: AbortSignal.timeout(5_000),
    });
    const body = await upstream.json().catch(() => ({ error: 'Invalid bot response.' }));
    return sendJson(response, upstream.status, body);
  } catch {
    return sendJson(response, 502, { error: 'The bot host could not receive the microphone audio.' });
  }
}
