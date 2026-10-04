import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertManualIdentityList } from '../utils/identityStore.js';

test('manual identity links replace Discord and Roblox collisions', () => {
  const next = upsertManualIdentityList([
    { discordId: '1111111111111111', robloxId: '10' },
    { discordId: '2222222222222222', robloxId: '20' },
  ], {
    discordId: '1111111111111111', robloxId: '20', robloxUsername: 'UpdatedPlayer',
  });
  assert.equal(next.length, 1);
  assert.equal(next[0].discordId, '1111111111111111');
  assert.equal(next[0].robloxId, '20');
  assert.equal(next[0].source, 'manual');
});

test('manual identity links reject malformed IDs', () => {
  assert.throws(() => upsertManualIdentityList([], { discordId: 'abc', robloxId: '1' }), /valid numeric IDs/);
});
