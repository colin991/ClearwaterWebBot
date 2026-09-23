import { readEventBytes, verifyErlcEvent, eventHeaders } from '../../lib/erlc-webhook.js';

// Raw bytes must reach signature verification without JSON re-serialization.
export const config = { api: { bodyParser: false } };

export function createEventsHandler({ env = process.env, fetchImpl = fetch, verifyEvent = verifyErlcEvent } = {}) {
  return async (request, response) => {
    const send = (status, data) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json');
      response.setHeader('Cache-Control', 'no-store');
      response.end(JSON.stringify(data));
    };
    if (request.method === 'GET') {
      if (!env.BOT_API_URL || !env.BOT_API_KEY) return send(503, { ready: false, error: 'Bot bridge is not configured.' });
      try {
        const upstream = await fetchImpl(new URL('/api/erlc/events', env.BOT_API_URL), {
          headers: { authorization: `Bearer ${env.BOT_API_KEY}` }, redirect: 'error', signal: AbortSignal.timeout(8000),
        });
        const inbox = upstream.ok ? await upstream.json() : null;
        const ready = Number.isInteger(inbox?.pending) && Array.isArray(inbox?.events);
        return send(ready ? 200 : 503, { ready, ...(ready ? { destination: 'Melonly', pending: inbox.pending } : { error: 'Restart the updated bot to enable the event receiver.' }) });
      } catch {
        return send(503, { ready: false, error: 'Bot event receiver is unreachable.' });
      }
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return send(405, { error: 'Use a signed ER:LC POST request.' });
    }
    try {
      const raw = await readEventBytes(request);
      const event = verifyEvent(raw, request.headers);
      if (!env.BOT_API_URL || !env.BOT_API_KEY) return send(503, { error: 'Bot bridge is not configured.' });
      const url = new URL('/api/erlc/events', env.BOT_API_URL);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return send(503, { error: 'Invalid bot bridge configuration.' });
      const upstream = await fetchImpl(url, {
        method: 'POST', redirect: 'error',
        headers: { ...eventHeaders(event), authorization: `Bearer ${env.BOT_API_KEY}` },
        body: raw, signal: AbortSignal.timeout(8000),
      });
      // Only acknowledge once the bot has durably saved the event for both consumers.
      if (!upstream.ok) return send(503, { error: 'Bot event receiver is unavailable. Restart the updated bot.' });
      const receipt = await upstream.json().catch(() => null);
      if (receipt?.accepted !== true || receipt?.id !== event.id) return send(502, { error: 'Invalid event receiver acknowledgment.' });
      return send(200, { accepted: true });
    } catch (error) {
      return send(error.status || 503, { error: error.status ? error.message : 'Event relay temporarily unavailable.' });
    }
  };
}

export default createEventsHandler();
