import { resolve } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { eventHeaders } from '../lib/erlc-webhook.js';

export function createErlcEventRelay({
  path = resolve('data', 'erlc-events.json'),
  load = () => readJsonFile(path, [], { corruptFallback: false }),
  save = events => writeJsonFile(path, events),
  fetchImpl = fetch, now = Date.now, onEvent = () => {},
} = {}) {
  let queue = Promise.resolve();
  let running;
  function transaction(action) {
    const next = queue.then(async () => action(await load()));
    queue = next.catch(() => {});
    return next;
  }
  async function accept(event) {
    const result = await transaction(async events => {
      if (events.some(item => item.id === event.id)) return { accepted: true, id: event.id, duplicate: true };
      if (events.filter(item => !item.deliveredAt).length >= 128) throw Object.assign(new Error('Event queue full'), { status: 503 });
      const pending = events.filter(item => !item.deliveredAt);
      const completed = events.filter(item => item.deliveredAt).slice(-100);
      await save([...completed, ...pending, { ...event, receivedAt: now(), attempts: 0, retryAt: 0 }]);
      return { accepted: true, id: event.id, duplicate: false };
    });
    // The persisted inbox remains available even if a consumer throws or the bot restarts.
    if (!result.duplicate) {
      try { await onEvent(event.payload, event.id); } catch { /* Inspect/replay from the authenticated inbox. */ }
    }
    return result;
  }
  async function deliver() {
    const due = await transaction(events => events.filter(item => !item.deliveredAt && item.retryAt <= now()).slice(0, 10));
    for (const event of due) {
      let delivered = false, status = 0, retryAfter = 0;
      try {
        const response = await fetchImpl('https://melon.ly/events', {
          method: 'POST', redirect: 'error', headers: eventHeaders(event),
          body: Buffer.from(event.raw, 'base64'), signal: AbortSignal.timeout(8000),
        });
        delivered = response.ok;
        status = response.status;
        const retry = response.headers.get('retry-after');
        retryAfter = Number.isFinite(Number(retry)) ? Number(retry) * 1000 : Math.max(0, Date.parse(retry) - now()) || 0;
        await response.body?.cancel();
      } catch { /* Retain the original signature and payload for retry. */ }
      await transaction(async events => {
        const stored = events.find(item => item.id === event.id);
        if (!stored) return;
        stored.attempts += 1;
        stored.lastStatus = status;
        stored.lastAttemptAt = now();
        if (delivered) stored.deliveredAt = now();
        else stored.retryAt = now() + Math.max(retryAfter, Math.min(300000, 2000 * 2 ** Math.min(stored.attempts, 8)));
        await save(events);
      });
    }
  }
  return {
    accept,
    tick() {
      if (!running) running = deliver().finally(() => { running = null; });
      return running;
    },
    inspect: () => transaction(events => ({
      pending: events.filter(event => !event.deliveredAt).length,
      events: events.slice(-20).map(({ raw, signature, ...event }) => event),
    })),
  };
}
