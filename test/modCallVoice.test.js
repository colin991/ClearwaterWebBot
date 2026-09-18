import test from 'node:test';
import assert from 'node:assert/strict';
import { ChannelType } from 'discord.js';
import {
  createModCallMonitor,
  moveModCallPair,
  MOD_CALL_ROOMS,
  MOD_CALL_MAX_AGE_MS,
  MOD_CALL_UNPICKED_MS,
  MOD_CALL_REMIND_CHANNEL,
  MOD_CALL_REMIND_MESSAGE,
  MOD_CALL_REMIND_ROLE,
  isModCallStale,
  modCallCallerInGame,
} from '../utils/modCallVoice.js';
import { isStaffWaitingJoin, STAFF_WAITING_CHANNEL } from '../utils/staffWaitingGreeting.js';

const NOW = 1_700_000_000_000;

test('new acceptance moves once, historical accepted calls are ignored, full rooms retry', async () => {
  let time = NOW;
  let calls = [
    { Caller: 'Old:1', Moderator: 'Staff:2', Timestamp: (NOW - 10_000) / 1000 },
    { Caller: 'New:3', Moderator: null, Timestamp: NOW / 1000 },
  ];
  let available = false;
  let attempts = 0;
  const monitor = createModCallMonitor({
    now: () => time,
    snapshot: async () => ({
      calls,
      players: [{ username: 'New', robloxId: '3' }, { username: 'Staff', robloxId: '2' }],
    }),
    move: async (call) => {
      assert.equal(call.Caller, 'New:3');
      attempts += 1;
      return available;
    },
  });
  await monitor.tick();
  assert.equal(attempts, 0);
  calls[1].Moderator = 'Staff:2';
  await monitor.tick();
  assert.equal(attempts, 1);
  available = true;
  await monitor.tick();
  await monitor.tick();
  assert.equal(attempts, 2);
});

test('does not drag when the caller already left the game', async () => {
  let calls = [
    { Caller: 'Gone:9', Moderator: null, Timestamp: NOW / 1000 },
  ];
  let attempts = 0;
  const monitor = createModCallMonitor({
    now: () => NOW,
    snapshot: async () => ({
      calls,
      players: [{ username: 'Staff', robloxId: '2' }],
    }),
    move: async () => {
      attempts += 1;
      return true;
    },
  });
  await monitor.tick();
  calls[0].Moderator = 'Staff:2';
  await monitor.tick();
  await monitor.tick();
  assert.equal(attempts, 0);
});

test('does not drag a pickup long after the original mod call', async () => {
  assert.equal(isModCallStale({ Timestamp: (NOW - MOD_CALL_MAX_AGE_MS - 1000) / 1000 }, NOW), true);
  assert.equal(isModCallStale({ Timestamp: NOW / 1000 }, NOW), false);
  let calls = [{
    Caller: 'Late:4',
    Moderator: null,
    Timestamp: (NOW - MOD_CALL_MAX_AGE_MS - 5000) / 1000,
  }];
  let attempts = 0;
  const monitor = createModCallMonitor({
    now: () => NOW,
    snapshot: async () => ({
      calls,
      players: [{ username: 'Late', robloxId: '4' }, { username: 'Staff', robloxId: '2' }],
    }),
    move: async () => {
      attempts += 1;
      return true;
    },
  });
  await monitor.tick();
  calls[0].Moderator = 'Staff:2';
  await monitor.tick();
  await monitor.tick();
  assert.equal(attempts, 0);
});

test('caller in-game matching uses Roblox id or username', () => {
  const call = { Caller: 'CivName:99' };
  assert.equal(modCallCallerInGame(call, [{ username: 'Other', robloxId: '1' }]), false);
  assert.equal(modCallCallerInGame(call, [{ username: 'CivName', robloxId: '99' }]), true);
  assert.equal(modCallCallerInGame(call, [{ username: 'civname', robloxId: '8' }]), true);
});

test('pair uses first empty room and never moves a disconnected member', async () => {
  const moves = [];
  const rooms = MOD_CALL_ROOMS.map((id, i) => ({
    id,
    type: ChannelType.GuildVoice,
    userLimit: 2,
    members: new Map(i === 0 ? [['other', {}]] : []),
    permissionsFor: () => ({ has: () => true }),
  }));
  const member = (id) => ({
    id,
    voice: {
      channelId: 'original',
      setChannel: async (room) => { moves.push([id, room.id]); },
    },
  });
  const guild = { members: { me: {} }, channels: { fetch: async (id) => rooms.find((r) => r.id === id) } };
  assert.equal(await moveModCallPair(guild, member('caller'), member('staff')), true);
  assert.deepEqual(moves, [['caller', MOD_CALL_ROOMS[1]], ['staff', MOD_CALL_ROOMS[1]]]);
  const offline = member('offline');
  offline.voice.channelId = null;
  assert.equal(await moveModCallPair(guild, offline, member('staff')), false);
});

test('unpicked mod call pings staff after 3 minutes once and does not infract', async () => {
  let time = NOW;
  let calls = [];
  const reminds = [];
  const monitor = createModCallMonitor({
    now: () => time,
    snapshot: async () => ({ calls, players: [] }),
    move: async () => false,
    remind: async () => { reminds.push(time); },
  });
  await monitor.tick();
  calls = [{ Caller: 'Civ:9', Moderator: null, Timestamp: time / 1000 }];
  await monitor.tick();
  assert.deepEqual(reminds, []);
  time += MOD_CALL_UNPICKED_MS - 1000;
  await monitor.tick();
  assert.deepEqual(reminds, []);
  time += 2000;
  await monitor.tick();
  assert.equal(reminds.length, 1);
  await monitor.tick();
  assert.equal(reminds.length, 1);
  assert.match(MOD_CALL_REMIND_MESSAGE, new RegExp(`<@&${MOD_CALL_REMIND_ROLE}>`));
  assert.equal(MOD_CALL_REMIND_CHANNEL, '1514422317587890327');
});

test('startup queue and picked-up calls do not send the unpicked reminder', async () => {
  let time = NOW;
  let calls = [{ Caller: 'Old:1', Moderator: null, Timestamp: (NOW - MOD_CALL_UNPICKED_MS) / 1000 }];
  const reminds = [];
  const monitor = createModCallMonitor({
    now: () => time,
    snapshot: async () => ({ calls, players: [] }),
    move: async () => false,
    remind: async () => { reminds.push(1); },
  });
  await monitor.tick();
  time += MOD_CALL_UNPICKED_MS;
  await monitor.tick();
  assert.deepEqual(reminds, []);
  calls = [{ Caller: 'New:2', Moderator: null, Timestamp: time / 1000 }];
  await monitor.tick();
  calls[0].Moderator = 'Staff:3';
  time += MOD_CALL_UNPICKED_MS + 1000;
  await monitor.tick();
  assert.deepEqual(reminds, []);
});

test('two overdue unpicked calls send one scare ping', async () => {
  let time = NOW;
  let calls = [];
  let reminds = 0;
  const monitor = createModCallMonitor({
    now: () => time,
    snapshot: async () => ({ calls, players: [] }),
    move: async () => false,
    remind: async () => { reminds += 1; },
  });
  await monitor.tick();
  calls = [
    { Caller: 'A:1', Moderator: null, Timestamp: time / 1000 },
    { Caller: 'B:2', Moderator: null, Timestamp: time / 1000 },
  ];
  await monitor.tick();
  time += MOD_CALL_UNPICKED_MS + 1000;
  await monitor.tick();
  assert.equal(reminds, 1);
});

test('waiting greeting triggers only for human entries, not mute changes or bot joins', () => {
  const next = { channelId: STAFF_WAITING_CHANNEL, member: { user: { bot: false } } };
  assert.equal(isStaffWaitingJoin({ channelId: null }, next), true);
  assert.equal(isStaffWaitingJoin({ channelId: STAFF_WAITING_CHANNEL }, next), false);
  assert.equal(isStaffWaitingJoin({ channelId: null }, { ...next, member: { user: { bot: true } } }), false);
});
