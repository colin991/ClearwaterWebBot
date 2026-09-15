import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemberSnapshotLoader } from '../utils/guildMemberSnapshot.js';

test('parallel services share one fetch and reuse live cache until refresh', async () => {
  let time = 0, calls = 0;
  const guild = { members: { cache: new Map(), fetch: async () => { calls++; } } };
  const load = createMemberSnapshotLoader({ now: () => time });
  await Promise.all([load(guild), load(guild), load(guild)]); assert.equal(calls, 1);
  guild.members.cache.set('new-member', {});
  assert.equal((await load(guild)).has('new-member'), true); assert.equal(calls, 1);
  time = 300000; await load(guild); assert.equal(calls, 2);
});
test('rate limits back off without accepting incomplete cache, then retry', async () => {
  let time = 0, calls = 0;
  const guild = { members: { cache: new Map(), fetch: async () => { calls++; if (calls === 1) throw Error('Request with opcode 8 was rate limited. Retry after 23.817 seconds.'); } } };
  const load = createMemberSnapshotLoader({ now: () => time });
  await assert.rejects(load(guild), /30 seconds/);
  time = 24000; await assert.rejects(load(guild), /cooling down/); assert.equal(calls, 1);
  time = 30000; await load(guild); assert.equal(calls, 2);
});
