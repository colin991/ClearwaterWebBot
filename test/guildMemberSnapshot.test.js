import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberSnapshotLoader, MEMBER_FETCH_INTERVAL_MS } from '../utils/guildMemberSnapshot.js';

test('parallel services share one fetch and reuse live cache until the 20s interval', async () => {
  let time = 0, calls = 0;
  const guild = { members: { cache: new Map(), fetch: async () => { calls++; } } };
  const load = createMemberSnapshotLoader({ now: () => time });
  await Promise.all([load(guild), load(guild), load(guild)]); assert.equal(calls, 1);
  guild.members.cache.set('new-member', {});
  assert.equal((await load(guild)).has('new-member'), true); assert.equal(calls, 1);
  time = MEMBER_FETCH_INTERVAL_MS; await load(guild); assert.equal(calls, 2);
});

test('rate limits reuse a previously loaded roster instead of blocking -dc', async () => {
  let time = 0, calls = 0;
  const guild = { members: { cache: new Map([['1', {}]]), fetch: async () => {
    calls += 1;
    if (calls === 1) return;
    throw Error('Request with opcode 8 was rate limited. Retry after 23.817 seconds.');
  } } };
  const load = createMemberSnapshotLoader({ now: () => time });
  await load(guild);
  time = MEMBER_FETCH_INTERVAL_MS;
  assert.equal((await load(guild)).has('1'), true);
  assert.equal(calls, 2);
  time = MEMBER_FETCH_INTERVAL_MS + 5_000;
  assert.equal((await load(guild)).has('1'), true);
  assert.equal(calls, 2);
});

test('cooldown with an incomplete cache still serves -dc instead of cooling down', async () => {
  let time = 0, calls = 0;
  const guild = {
    members: {
      cache: new Map([['bot', {}]]),
      fetch: async () => {
        calls += 1;
        throw Error('Request with opcode 8 was rate limited. Retry after 13 seconds.');
      },
    },
  };
  const load = createMemberSnapshotLoader({ now: () => time });
  assert.equal((await load(guild)).has('bot'), true);
  assert.equal(calls, 1);
  time = 5_000;
  assert.equal((await load(guild)).has('bot'), true);
  assert.equal(calls, 1);
});

test('rate limits back off without accepting empty cache when stale is forbidden, then retry', async () => {
  let time = 0, calls = 0;
  const guild = { members: { cache: new Map(), fetch: async () => { calls++; if (calls === 1) throw Error('Request with opcode 8 was rate limited. Retry after 23.817 seconds.'); } } };
  const load = createMemberSnapshotLoader({ now: () => time, ttlMs: MEMBER_FETCH_INTERVAL_MS });
  await assert.rejects(load(guild, { allowStale: false }), /24 seconds/);
  time = 20_000; await assert.rejects(load(guild, { allowStale: false }), /cooling down/); assert.equal(calls, 1);
  time = 24_000; await load(guild, { allowStale: false }); assert.equal(calls, 2);
});
