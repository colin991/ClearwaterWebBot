import test from 'node:test';
import assert from 'node:assert/strict';

const json = (body, init = {}) => new Response(JSON.stringify(body), { status: 200, ...init });

async function withFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = handler;
  try { return await fn(); } finally { globalThis.fetch = original; }
}

test('Melonly requests run one at a time with spacing', async () => {
  const melonly = await import('../utils/melonly.js?queue-serial');
  melonly.resetMelonlyQueueForTests({ minIntervalMs: 30 });
  let active = 0;
  let peak = 0;
  const starts = [];
  await withFetch(async () => {
    active += 1;
    peak = Math.max(peak, active);
    starts.push(Date.now());
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return json({ ok: true });
  }, () => Promise.all([
    melonly.melonlyFetch('k', '/server/a'),
    melonly.melonlyFetch('k', '/server/b'),
    melonly.melonlyFetch('k', '/server/c'),
  ]));
  assert.equal(peak, 1);
  assert.equal(starts.length, 3);
  for (let i = 1; i < starts.length; i += 1) assert.ok(starts[i] - starts[i - 1] >= 35);
});

test('identical GETs in the queue share a single Melonly request', async () => {
  const melonly = await import('../utils/melonly.js?queue-dedupe');
  melonly.resetMelonlyQueueForTests();
  let calls = 0;
  const results = await withFetch(async () => {
    calls += 1;
    return json({ calls });
  }, () => Promise.all([
    melonly.melonlyFetch('k', '/server/cad/calls', { cacheTtlMs: 1000 }),
    melonly.melonlyFetch('k', '/server/cad/calls', { cacheTtlMs: 1000 }),
    melonly.melonlyFetch('k', '/server/cad/calls', { cacheTtlMs: 1000 }),
  ]));
  assert.equal(calls, 1);
  assert.deepEqual(results, [{ calls: 1 }, { calls: 1 }, { calls: 1 }]);
});

test('a short 429 waits in the queue and retries instead of failing', async () => {
  const melonly = await import('../utils/melonly.js?queue-retry');
  melonly.resetMelonlyQueueForTests();
  let calls = 0;
  const result = await withFetch(async () => {
    calls += 1;
    return calls === 1
      ? new Response('{}', { status: 429, headers: { 'retry-after': '1' } })
      : json({ ok: 'after-wait' });
  }, () => melonly.melonlyFetch('k', '/server/cad/calls'));
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: 'after-wait' });
});

test('an exhausted rate-limit bucket pauses the queue before the next 429', async () => {
  const melonly = await import('../utils/melonly.js?queue-exhausted');
  melonly.resetMelonlyQueueForTests();
  await withFetch(async () => json({ ok: true }, {
    headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '120' },
  }), () => melonly.melonlyFetch('k', '/server/shifts'));
  assert.ok(melonly.getMelonlyQueueStatus().rateLimitedMs > 100_000);
  await assert.rejects(melonly.melonlyFetch('k', '/server/other'), (error) => error.status === 429);
});

test('CAD lookup skips 404 probe paths and reuses the working path', async () => {
  const melonly = await import('../utils/melonly.js?queue-cad');
  melonly.resetMelonlyQueueForTests();
  const hits = [];
  await withFetch(async (url) => {
    const path = new URL(url).pathname;
    hits.push(path);
    if (path.endsWith('/server/cad/calls')) {
      return json({ data: [{ id: '1', title: 'PCSO traffic stop', units: ['PCSO 1A-12'] }] });
    }
    return new Response('{"error":"not found"}', { status: 404 });
  }, async () => {
    const first = await melonly.fetchPcsoAssignedMelonlyCalls('k', { pinellasDepartmentId: 'dept', cacheTtlMs: 0 });
    assert.equal(first.calls.length, 1);
    const probes = hits.length;
    assert.equal(probes, 3);
    await melonly.fetchPcsoAssignedMelonlyCalls('k', { pinellasDepartmentId: 'dept', cacheTtlMs: 0 });
    assert.equal(hits.length, probes + 1);
    assert.ok(hits.at(-1).endsWith('/server/cad/calls'));
  });
});
