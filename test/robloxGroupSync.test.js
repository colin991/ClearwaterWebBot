import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateJoinRequest,
  joinRequestResourceName,
  joinRequestRobloxId,
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
