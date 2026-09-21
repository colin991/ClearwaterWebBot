import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSkipLogGate,
  evaluateJoinRequest,
  groupLogPayload,
  joinRequestResourceName,
  joinRequestRobloxId,
  sendGroupLog,
} from '../utils/robloxGroupSync.js';

test('join request user ids come from Open Cloud user strings or objects', () => {
  assert.equal(joinRequestRobloxId({ user: 'users/123456' }), '123456');
  assert.equal(joinRequestRobloxId({ user: { id: 'users/99' } }), '99');
  assert.equal(joinRequestRobloxId({ requester: { userId: 88 } }), '88');
  assert.equal(joinRequestRobloxId({ path: 'groups/1/join-requests/55' }), null);
});

test('join request resource names keep the Open Cloud path', () => {
  assert.equal(
    joinRequestResourceName({ path: 'groups/7/join-requests/55' }, '7'),
    'groups/7/join-requests/55',
  );
  assert.equal(
    joinRequestResourceName({ id: '55' }, '7'),
    'groups/7/join-requests/55',
  );
});

test('whitelisted matches are accepted and unmatched people are not declined on a stale roster', () => {
  assert.equal(evaluateJoinRequest({ robloxId: '1', discordId: 'd1', rosterReady: false }), 'accept');
  assert.equal(evaluateJoinRequest({ robloxId: '1', discordId: null, rosterReady: false }), 'skip');
  assert.equal(evaluateJoinRequest({ robloxId: '1', discordId: null, rosterReady: true }), 'decline');
  assert.equal(evaluateJoinRequest({ robloxId: null, discordId: null, rosterReady: true }), 'skip');
});

test('group Discord logs use a classic embed instead of silently dropping Components V2', () => {
  const payload = groupLogPayload(
    'Roblox group request accepted',
    '<@1128547120304095272> was accepted into the Roblox group.',
  );
  assert.equal(payload.embeds[0].title, 'Roblox group request accepted');
  assert.match(payload.embeds[0].description, /accepted into the Roblox group/);
  assert.deepEqual(payload.allowedMentions.users, ['1128547120304095272']);
});

test('sendGroupLog posts the embed to the configured Discord channel', async () => {
  const sent = [];
  const client = {
    channels: {
      fetch: async (id) => ({
        id,
        isTextBased: () => true,
        send: async (payload) => { sent.push(payload); },
      }),
    },
  };
  const ok = await sendGroupLog(
    client,
    { robloxGroupLogChannelId: '1536517651055120514' },
    'Roblox group request waiting',
    'Skipped **2** pending join request(s) because the Discord member list is incomplete.',
  );
  assert.equal(ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].embeds[0].title, 'Roblox group request waiting');
});

test('skipped whitelist requests still produce a Discord log, but not every minute', () => {
  const gate = createSkipLogGate(15 * 60 * 1000);
  assert.equal(gate(0, 1_000), false);
  assert.equal(gate(3, 1_000), true);
  assert.equal(gate(3, 1_000 + 60_000), false);
  assert.equal(gate(4, 1_000 + 60_000), true);
  assert.equal(gate(4, 1_000 + 60_000 + 15 * 60 * 1000 - 1), false);
  assert.equal(gate(4, 1_000 + 60_000 + 15 * 60 * 1000), true);
});
