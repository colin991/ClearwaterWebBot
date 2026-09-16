import test from 'node:test';
import assert from 'node:assert/strict';
import { createVcChecks, VC_MESSAGES, COMMS_MESSAGES, JAIL_MESSAGES } from '../utils/vcChecks.js';
import command from '../commands/vc.js';

function fixture() {
  let time = 0;
  const calls = [];
  const errors = [];
  const members = new Map();
  const voices = new Set();
  const players = [{ username: 'Roblox_User', robloxId: '123' }];
  let fail = false;
  const service = createVcChecks({
    now: () => time,
    snapshot: async () => { if (fail) throw Error('unavailable'); return { players, members, inVoice: id => voices.has(id) }; },
    send: async (text, guard) => { if (guard && !guard()) return false; calls.push(text); },
    onError: error => errors.push(error),
  });
  return { service, calls, errors, members, voices, players,
    advance: ms => { time += ms; }, fail: () => { fail = true; },
    join: () => members.set('discord', { id: 'discord', nickname: 'Officer | ROBLOX_USER', user: {} }),
  };
}

test('default on; five minute grace, alternating minute reminders, one jail and one release', async () => {
  const f = fixture(); f.join();
  assert.equal(f.service.enabled, true);
  await f.service.tick();
  assert.deepEqual(f.calls, [':pm Roblox_User ' + VC_MESSAGES[0]]);
  f.advance(59000); await f.service.tick(); assert.equal(f.calls.length, 1);
  f.advance(1000); await f.service.tick(); assert.equal(f.calls[1], ':pm Roblox_User ' + VC_MESSAGES[1]);
  f.advance(239999); await f.service.tick(); assert.ok(!f.calls.includes(':jail Roblox_User'));
  f.advance(1); await f.service.tick();
  assert.equal(f.calls.filter(c => c === ':jail Roblox_User').length, 1);
  assert.equal(f.calls.at(-2), ':pm Roblox_User ' + JAIL_MESSAGES.voice);
  assert.equal(f.calls.at(-1), ':jail Roblox_User');
  assert.ok(!f.calls.some(c => c.startsWith(':kick') || c.startsWith(':load') || c.startsWith(':wanted')));
  await f.service.tick(); assert.equal(f.calls.filter(c => c === ':jail Roblox_User').length, 1);
  f.voices.add('discord'); await f.service.tick(); await f.service.tick();
  assert.equal(f.calls.filter(c => c === ':unjail Roblox_User').length, 1);
});

test('missing member is jailed immediately; rotates comms then voice messages and releases on VC', async () => {
  const f = fixture(); await f.service.tick();
  assert.deepEqual(f.calls, [':pm Roblox_User ' + JAIL_MESSAGES.comms, ':jail Roblox_User']);
  assert.ok(!f.calls.some(c => c.startsWith(':kick')));
  f.advance(60000); await f.service.tick(); assert.equal(f.calls.at(-1), ':pm Roblox_User ' + COMMS_MESSAGES[0]);
  for (let i = 1; i <= 3; i++) { f.advance(60000); await f.service.tick(); assert.equal(f.calls.at(-1), ':pm Roblox_User ' + COMMS_MESSAGES[i % 3]); }
  f.join(); await f.service.tick(); assert.equal(f.calls.at(-1), ':pm Roblox_User ' + VC_MESSAGES[0]);
  f.voices.add('discord'); await f.service.tick(); assert.equal(f.calls.at(-1), ':unjail Roblox_User');
});

test('already compliant is untouched; leaving VC gets a fresh grace period', async () => {
  const f = fixture(); f.join(); f.voices.add('discord'); await f.service.tick(); assert.deepEqual(f.calls, []);
  f.advance(600000); f.voices.clear(); await f.service.tick(); assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].startsWith(':pm'));
});

test('off releases feature jails and suppresses reminders; on starts fresh grace', async () => {
  const f = fixture(); await f.service.tick(); await f.service.setEnabled(false);
  assert.equal(f.calls.at(-1), ':unjail Roblox_User');
  const count = f.calls.length; f.advance(600000); await f.service.tick(); assert.equal(f.calls.length, count);
  f.join(); await f.service.setEnabled(true); assert.equal(f.calls.at(-1), ':pm Roblox_User ' + VC_MESSAGES[0]);
});

test('lookup failure cannot jail or clear tracked jail state', async () => {
  const f = fixture(); f.fail(); await f.service.tick(); assert.deepEqual(f.calls, []); assert.equal(f.errors.length, 1);
});

test('failed jail is retried, and never falsely tracked as successfully jailed', async () => {
  const calls = []; let fail = true;
  const service = createVcChecks({ snapshot: async () => ({ players: [{ username: 'Player', robloxId: '1' }], members: new Map(), inVoice: () => false }),
    send: async c => { calls.push(c); if (fail && c.startsWith(':jail')) throw Error('rate limited'); }, onError: () => {} });
  await service.tick(); fail = false; await service.tick();
  assert.equal(calls.filter(c => c === ':jail Player').length, 2);
  assert.equal(calls.filter(c => c.startsWith(':pm Player ' + JAIL_MESSAGES.comms)).length, 2);
});

test('jail-notice PM is retried if it fails after a successful jail', async () => {
  const calls = [];
  const service = createVcChecks({
    snapshot: async () => ({ players: [{ username: 'Player', robloxId: '1' }], members: new Map(), inVoice: () => false }),
    send: async c => { calls.push(c); if (c.startsWith(':pm')) throw Error('pm failed'); },
    onError: () => {},
  });
  await service.tick();
  await service.tick();
  assert.equal(calls.filter(c => c === ':jail Player').length, 1);
  assert.equal(calls.filter(c => c.startsWith(':pm Player ' + JAIL_MESSAGES.comms)).length, 2);
});

test('tracked jails survive restart and release once compliant', async () => {
  const calls = [];
  const service = createVcChecks({ load: async () => [['1', { jailed: true }]],
    snapshot: async () => ({ players: [{ username: 'Player', robloxId: '1' }], members: new Map([['d', { id: 'd', nickname: 'Player' }]]), inVoice: () => true }),
    send: async c => calls.push(c) });
  await service.tick(); assert.deepEqual(calls, [':unjail Player']);
});

test('command rejects non-admins and administrators in another guild', async () => {
  for (const [guildId, admin] of [['home', false], ['other', true]]) {
    let reply;
    await command.execute({ inGuild: () => true, guildId, client: { config: { guildId: 'home' } },
      memberPermissions: { has: () => admin }, reply: async r => { reply = r; } });
    assert.match(reply.content, /Administrator/);
  }
  const json = command.data.toJSON();
  assert.equal(json.default_member_permissions, '8');
  assert.deepEqual(json.options.map(option => option.name), ['checks', 'whitelist']);
});

test('queued enforcement is cancelled if the player joins voice while waiting', async () => {
  let voice = false;
  const calls = [];
  const service = createVcChecks({
    snapshot: async () => ({ players: [{ username: 'Player', robloxId: '1' }], members: new Map([['d', { id: 'd', nickname: 'Player' }]]), inVoice: () => voice }),
    send: async (c, guard) => { voice = true; if (guard && !guard()) return false; calls.push(c); },
  });
  await service.tick(); await service.tick(); assert.deepEqual(calls, []);
});

test('any matching non-bot in VC qualifies and overlapping ticks do not duplicate commands', async () => {
  const f = fixture(); f.join();
  f.members.set('second', { id: 'second', user: { username: 'Roblox_User' } });
  f.voices.add('second'); await Promise.all([f.service.tick(), f.service.tick()]); assert.deepEqual(f.calls, []);
  f.voices.clear(); await Promise.all([f.service.tick(), f.service.tick()]); assert.equal(f.calls.length, 1);
});

test('successful jail, PM, and unjail emit ops-log events', async () => {
  const f = fixture();
  const events = [];
  const service = createVcChecks({
    now: () => 0,
    snapshot: async () => ({ players: f.players, members: f.members, inVoice: id => f.voices.has(id) }),
    send: async (text, guard) => { if (guard && !guard()) return false; f.calls.push(text); },
    onLog: event => events.push(event),
  });
  await service.tick();
  assert.equal(events[0].action, 'PM');
  assert.equal(events[0].reason, 'jail notice');
  assert.equal(events[1].action, 'JAIL');
  assert.equal(events[1].reason, 'no Discord match');
  f.join(); f.voices.add('discord'); await service.tick();
  assert.equal(events.at(-1).action, 'UNJAIL');
  assert.equal(events.at(-1).reason, 'joined voice');
});
