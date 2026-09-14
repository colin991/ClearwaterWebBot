import test from 'node:test';
import assert from 'node:assert/strict';

test('fresh cache works during rate limiting, but never crosses API credentials', async () => {
  const { melonlyFetch } = await import('../utils/melonly.js?cache-regression');
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response(JSON.stringify({ members: ['cached'] }), { status: 200 })
      : new Response('{}', { status: 429, headers: { 'retry-after': '37' } });
  };
  try {
    const cached = await melonlyFetch('test-key-a', '/server/members', { cacheTtlMs: 60000 });
    await assert.rejects(melonlyFetch('test-key-a', '/server/shifts'), error => error.status === 429 && error.retryAfter === 37);
    assert.deepEqual(await melonlyFetch('test-key-a', '/server/members', { cacheTtlMs: 60000 }), cached);
    assert.equal(calls, 2);
    await assert.rejects(melonlyFetch('test-key-b', '/server/members', { cacheTtlMs: 60000 }), error => error.status === 429);
    await assert.rejects(melonlyFetch('test-key-a', '/server/members', { method: 'POST' }), error => error.status === 429);
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});
