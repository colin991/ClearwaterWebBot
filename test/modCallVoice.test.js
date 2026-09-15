import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import { createModCallMonitor, moveModCallPair, MOD_CALL_ROOMS } from '../utils/modCallVoice.js';
import { isStaffWaitingJoin, STAFF_WAITING_CHANNEL } from '../utils/staffWaitingGreeting.js';

test('new acceptance moves once, historical accepted calls are ignored, full rooms retry', async () => {
  let calls = [{ Caller: 'Old:1', Moderator: 'Staff:2', Timestamp: 1 }, { Caller: 'New:3', Moderator: null, Timestamp: 2 }];
  let available = false, attempts = 0;
  const monitor = createModCallMonitor({ snapshot: async () => calls, move: async call => { assert.equal(call.Caller, 'New:3'); attempts++; return available; } });
  await monitor.tick(); assert.equal(attempts, 0);
  calls[1].Moderator = 'Staff:2'; await monitor.tick(); assert.equal(attempts, 1);
  available = true; await monitor.tick(); await monitor.tick(); assert.equal(attempts, 2);
});
test('pair uses first empty room and never moves a disconnected member', async () => {
  const moves = [];
  const rooms = MOD_CALL_ROOMS.map((id, i) => ({ id, type: ChannelType.GuildVoice, userLimit: 2, members: new Map(i === 0 ? [['other', {}]] : []), permissionsFor: () => ({ has: () => true }) }));
  const member = id => ({ id, voice: { channelId: 'original', setChannel: async room => { moves.push([id, room.id]); } } });
  const guild = { members: { me: {} }, channels: { fetch: async id => rooms.find(r => r.id === id) } };
  assert.equal(await moveModCallPair(guild, member('caller'), member('staff')), true);
  assert.deepEqual(moves, [['caller', MOD_CALL_ROOMS[1]], ['staff', MOD_CALL_ROOMS[1]]]);
  const offline = member('offline'); offline.voice.channelId = null;
  assert.equal(await moveModCallPair(guild, offline, member('staff')), false);
});
test('waiting greeting triggers only for human entries, not mute changes or bot joins', () => {
  const next = { channelId: STAFF_WAITING_CHANNEL, member: { user: { bot: false } } };
  assert.equal(isStaffWaitingJoin({ channelId: null }, next), true);
  assert.equal(isStaffWaitingJoin({ channelId: STAFF_WAITING_CHANNEL }, next), false);
  assert.equal(isStaffWaitingJoin({ channelId: null }, { ...next, member: { user: { bot: true } } }), false);
});
