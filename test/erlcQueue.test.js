import test from 'node:test';
import assert from 'node:assert/strict';
import {
  executeErlcCommand,
  erlcCooldownRemainingMs,
  expireErlcBundleCacheForTests,
  fetchErlcServer,
  formatErlcRateLimitReport,
  getErlcRateLimitStatus,
  resetErlcNetworkForTests,
} from '../utils/erlc.js';

function jsonResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    json: async () => body,
  };
}

test('parallel snapshots and a command share one ER:LC HTTP queue', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  const urls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    urls.push({ url: String(url), method: options?.method || 'GET' });
    if (String(options?.method || 'GET').toUpperCase() === 'POST') {
      return jsonResponse(200, { message: 'ok' });
    }
    return jsonResponse(200, { Players: [], Queue: [] });
  };
  try {
    await Promise.all([
      fetchErlcServer('key'),
      fetchErlcServer('key', { vehicles: true }),
      fetchErlcServer('key', { killLogs: true }),
    ]);
    await executeErlcCommand('key', ':wanted TestUser');
    assert.equal(urls.filter((entry) => entry.method === 'GET').length, 1);
    assert.equal(urls.filter((entry) => entry.method === 'POST').length, 1);
    assert.ok(urls[0].method === 'GET');
    assert.ok(urls[1].method === 'POST');
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('a live command uses the cached roster instead of a second snapshot', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let gets = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(options?.method || 'GET').toUpperCase() === 'POST') {
      await fetchErlcServer('key');
      return jsonResponse(200, { message: 'ok' });
    }
    gets += 1;
    return jsonResponse(200, { Players: [{ Player: 'Test:1', Team: 'Sheriff' }] });
  };
  try {
    await fetchErlcServer('key');
    await executeErlcCommand('key', ':pm Test hello', {
      shouldExecute: async () => {
        const server = await fetchErlcServer('key');
        return Array.isArray(server.Players);
      },
    });
    assert.equal(gets, 1);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('stale -dc reads wait for a new snapshot', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let gets = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(options?.method || 'GET').toUpperCase() === 'POST') {
      return jsonResponse(200, { message: 'ok' });
    }
    gets += 1;
    return jsonResponse(200, { Players: [{ Player: `User${gets}:1`, Team: 'Sheriff' }] });
  };
  try {
    await fetchErlcServer('key');
    expireErlcBundleCacheForTests();
    const server = await fetchErlcServer('key', { maxAgeMs: 0 });
    assert.equal(gets, 2);
    assert.equal(server.Players[0].Player, 'User2:1');
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('idle refresh reloads an expired roster while a command is waiting', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0, idleRefresh: true });
  let gets = 0;
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(options?.method || 'GET').toUpperCase() === 'POST') {
      return jsonResponse(200, { message: 'ok' });
    }
    gets += 1;
    return jsonResponse(200, { Players: [{ Player: `User${gets}:1` }] });
  };
  try {
    await fetchErlcServer('key');
    expireErlcBundleCacheForTests();
    const command = executeErlcCommand('key', ':wanted Test', {
      shouldExecute: async () => {
        await hold;
        return true;
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.ok(gets >= 2);
    release();
    await command;
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('expired roster reads stay instant and do not jump ahead of a queued command', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let gets = 0;
  let posts = 0;
  let release;
  const hold = new Promise((resolve) => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(options?.method || 'GET').toUpperCase() === 'POST') {
      posts += 1;
      return jsonResponse(200, { message: 'ok' });
    }
    gets += 1;
    return jsonResponse(200, { Players: [{ Player: 'Test:1', Team: 'Sheriff' }] });
  };
  try {
    await fetchErlcServer('key');
    expireErlcBundleCacheForTests();
    const command = executeErlcCommand('key', ':wanted Test', {
      shouldExecute: async () => {
        await hold;
        return true;
      },
    });
    const t0 = Date.now();
    const roster = await Promise.all([
      fetchErlcServer('key'),
      fetchErlcServer('key', { vehicles: true }),
      fetchErlcServer('key', { killLogs: true }),
    ]);
    assert.ok(Date.now() - t0 < 50);
    assert.equal(gets, 1);
    assert.equal(posts, 0);
    assert.equal(roster[0].Players[0].Player, 'Test:1');
    release();
    await command;
    assert.equal(posts, 1);
    assert.equal(gets, 1);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('automatic :load commands never hit the ER:LC API', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let posts = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    posts += 1;
    return jsonResponse(200, { message: 'ok' });
  };
  try {
    const result = await executeErlcCommand('key', ':load Test');
    assert.equal(result, false);
    assert.equal(posts, 0);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('map layout :loadlayout commands still hit the ER:LC API', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  const posts = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    posts.push(JSON.parse(options.body));
    return jsonResponse(200, { message: 'ok' });
  };
  try {
    const blocked = await executeErlcCommand('key', ':load Test');
    assert.equal(blocked, false);
    const result = await executeErlcCommand('key', ':loadlayout "BRIEFING WALLS"');
    assert.equal(result.message, 'ok');
    assert.deepEqual(posts, [{ command: ':loadlayout "BRIEFING WALLS"' }]);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('automatic :kick commands never hit the ER:LC API', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let posts = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    posts += 1;
    return jsonResponse(200, { message: 'ok' });
  };
  try {
    const result = await executeErlcCommand('key', ':kick Test');
    assert.equal(result, false);
    assert.equal(posts, 0);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('an invalid ER:LC server key fails immediately instead of retrying', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let gets = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    gets += 1;
    return jsonResponse(401, {});
  };
  try {
    await assert.rejects(() => fetchErlcServer('bad-key'), /invalid or expired/);
    assert.equal(gets, 1);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
    await new Promise((resolve) => setImmediate(resolve));
  }
});

test('a rejected server key is not retried on later reads', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let gets = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    gets += 1;
    return jsonResponse(401, {});
  };
  try {
    await assert.rejects(() => fetchErlcServer('bad-key'), /invalid or expired/);
    await assert.rejects(() => fetchErlcServer('bad-key'), /invalid or expired/);
    assert.equal(gets, 1);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
    await new Promise((resolve) => setImmediate(resolve));
  }
});

test('a 429 command leaves the queue instead of retrying in place', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let posts = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(options?.method || 'GET').toUpperCase() === 'POST') {
      posts += 1;
      return jsonResponse(429, { message: 'slow down' }, { 'retry-after': '5' });
    }
    return jsonResponse(200, { Players: [] });
  };
  try {
    await fetchErlcServer('key');
    await assert.rejects(() => executeErlcCommand('key', ':wanted Test'), /Retry after/);
    assert.equal(posts, 1);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('a cooldown timeout names the remaining ER:LC wait', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 5_000 });
  const original = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(429, {}, { 'retry-after': '5' });
  try {
    await assert.rejects(() => fetchErlcServer('key'), /rate-limited/);
    await assert.rejects(
      () => fetchErlcServer('key', { timeoutMs: 80 }),
      (error) => error.code === 'ERLC_TIMEOUT' && /rate-limited|seconds/i.test(error.message),
    );
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('hour-long Retry-After values are honored so the host is not IP-blocked again', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  const original = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(429, {}, { 'retry-after': '4857' });
  try {
    await assert.rejects(() => fetchErlcServer('key'), /rate-limited.*4857 seconds/);
    assert.ok(erlcCooldownRemainingMs() > 4_000_000);
    assert.ok(erlcCooldownRemainingMs() <= 4_857_050);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('Discord roster reads time out when the snapshot itself hangs', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  let release = () => {};
  const hang = new Promise((resolve) => { release = resolve; });
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    await hang;
    return jsonResponse(200, { Players: [] });
  };
  try {
    const t0 = Date.now();
    await assert.rejects(
      () => fetchErlcServer('key', { timeoutMs: 80 }),
      (error) => error.code === 'ERLC_TIMEOUT',
    );
    assert.ok(Date.now() - t0 < 400);
  } finally {
    release();
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
    await new Promise((resolve) => setImmediate(resolve));
  }
});

test('-ratelimit report is ready when the ER:LC line is idle', () => {
  resetErlcNetworkForTests({ minIntervalMs: 5000 });
  const status = getErlcRateLimitStatus();
  assert.equal(status.state, 'ready');
  assert.match(formatErlcRateLimitReport(status), /Status:\*\* Ready/);
    assert.match(formatErlcRateLimitReport(status), /Limited for:\*\* not limited/);
    assert.match(formatErlcRateLimitReport(status), /Clears:\*\* now/);
});

test('-ratelimit report shows cooldown after a 429', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 5_000 });
  const original = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(429, {}, { 'retry-after': '5' });
  try {
    await assert.rejects(() => fetchErlcServer('key'), /rate-limited/);
    const status = getErlcRateLimitStatus();
    assert.equal(status.state, 'cooling_down');
    assert.ok(status.cooldownMs > 400);
    assert.match(formatErlcRateLimitReport(status), /PRC blocked this host/);
    assert.match(formatErlcRateLimitReport(status), /Limited for:\*\* \d+ seconds/);
    assert.match(formatErlcRateLimitReport(status), /Clears:\*\* <t:\d+:R>/);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});

test('-ratelimit report shows a rejected server key', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 0 });
  const original = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse(401, {});
  try {
    await assert.rejects(() => fetchErlcServer('key'), /invalid or expired/);
    const status = getErlcRateLimitStatus();
    assert.equal(status.state, 'key_rejected');
    assert.match(formatErlcRateLimitReport(status), /Key rejected/);
    assert.match(formatErlcRateLimitReport(status), /Limited for:/);
    assert.match(formatErlcRateLimitReport(status), /Clears:\*\* <t:\d+:R>/);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
    await new Promise((resolve) => setImmediate(resolve));
  }
});

test('a successful snapshot does not start the 5s command gap', async () => {
  resetErlcNetworkForTests({ minIntervalMs: 5_000 });
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(options?.method || 'GET').toUpperCase() === 'POST') {
      return jsonResponse(200, { message: 'ok' });
    }
    return jsonResponse(200, { Players: [] });
  };
  try {
    const t0 = Date.now();
    await fetchErlcServer('key');
    assert.equal(getErlcRateLimitStatus().state, 'ready');
    await executeErlcCommand('key', ':wanted Test');
    assert.ok(Date.now() - t0 < 800);
    const status = getErlcRateLimitStatus();
    assert.equal(status.state, 'command_gap');
    assert.match(formatErlcRateLimitReport(status), /POST \/command/);
  } finally {
    globalThis.fetch = original;
    resetErlcNetworkForTests({ minIntervalMs: 5000 });
  }
});
