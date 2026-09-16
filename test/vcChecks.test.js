import test from 'node:test';
import assert from 'node:assert/strict';
import { createVcChecks, VC_MESSAGES, COMMS_MESSAGES } from '../utils/vcChecks.js';
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
    enabled: true,
    snapshot: async () => { if (fail) throw Error('unavailable'); return { players, members, inVoice: id => voices.has(id) }; },
    send: async (text, guard) => { if (guard && !guard()) return false; calls.push(text); },
    onError: error => errors.push(error),
  });
  return { service, calls, errors, members, voices, players,
    advance: ms => { time += ms; }, fail: () => { fail = true; },
    join: () => members.set('discord', { id: 'discord', nickname: 'Officer | ROBLOX_USER', user: {} }),
  };
}

test('default off; no reminders until turned on', async () => {
  const f = fixture();
  const service = createVcChecks({
    now: () => 0,
    snapshot: async () => ({ players: f.players, members: f.members, inVoice: id => f.voices.has(id) }),
    send: async (text, guard) => { if (guard && !guard()) return false; f.calls.push(text); },
  });
  assert.equal(service.enabled, false);
  await service.tick();
  assert.deepEqual(f.calls, []);
  f.join();
  await service.setEnabled(true);
  assert.equal(f.calls[0], ':pm Roblox_User ' + VC_MESSAGES[0]);
});

test('default on when enabled; minute reminders and never jails or loads', async () => {
  const f = fixture(); f.join();
  assert.equal(f.service.enabled, true);
  await f.service.tick();
  assert.deepEqual(f.calls, [':pm Roblox_User ' + VC_MESSAGES[0]]);
  f.advance(59000); await f.service.tick(); assert.equal(f.calls.length, 1);
  f.advance(1000); await f.service.tick(); assert.equal(f.calls[1], ':pm Roblox_User ' + VC_MESSAGES[1]);
  f.advance(300000); await f.service.tick();
  assert.ok(!f.calls.some(c => c.startsWith(':jail') || c.startsWith(':load') || c.startsWith(':kick')));
  f.voices.add('discord'); await f.service.tick();
  assert.ok(!f.calls.some(c => c.startsWith(':unjail')));
});

test('missing member is PMed, never jailed, then voice reminders after they join Discord', async () => {
  const f = fixture(); await f.service.tick();
  assert.deepEqual(f.calls, [':pm Roblox_User ' + COMMS_MESSAGES[0]]);
  assert.ok(!f.calls.some(c => c.startsWith(':jail') || c.startsWith(':load')));
  f.advance(60000); await f.service.tick(); assert.equal(f.calls.at(-1), ':pm Roblox_User ' + COMMS_MESSAGES[1]);
  f.join(); await f.service.tick(); assert.equal(f.calls.at(-1), ':pm Roblox_User ' + VC_MESSAGES[0]);
  f.voices.add('discord'); await f.service.tick();
  assert.ok(!f.calls.some(c => c.startsWith(':unjail')));
});

test('already compliant is untouched; leaving VC gets a fresh grace period', async () => {
  const f = fixture(); f.join(); f.voices.add('discord'); await f.service.tick(); assert.deepEqual(f.calls, []);
  f.advance(600000); f.voices.clear(); await f.service.tick(); assert.equal(f.calls.length, 1);
  assert.ok(f.calls[0].startsWith(':pm'));
});

test('off suppresses reminders; on starts fresh grace', async () => {
  const f = fixture(); await f.service.tick();
  assert.ok(f.calls[0].startsWith(':pm'));
  const count = f.calls.length;
  await f.service.setEnabled(false);
  f.advance(600000); await f.service.tick(); assert.equal(f.calls.length, count);
  f.join(); await f.service.setEnabled(true); assert.equal(f.calls.at(-1), ':pm Roblox_User ' + VC_MESSAGES[0]);
});

test('lookup failure cannot PM or clear tracked jail state', async () => {
  const f = fixture(); f.fail(); await f.service.tick(); assert.deepEqual(f.calls, []); assert.equal(f.errors.length, 1);
});

test('incomplete Discord roster does not treat players as missing', async () => {
  const calls = [];
  const service = createVcChecks({
    enabled: true,
    snapshot: async () => ({
      players: [{ username: 'Player', robloxId: '1' }],
      members: new Map(),
      membersReady: false,
      inVoice: () => false,
    }),
    send: async (c) => calls.push(c),
  });
  await service.tick();
  assert.deepEqual(calls, []);
});

test('tracked jails are released even if the player is still not in voice', async () => {
  const calls = [];
  const service = createVcChecks({ load: async () => [['1', { jailed: true }]],
    snapshot: async () => ({ players: [{ username: 'Player', robloxId: '1' }], members: new Map(), inVoice: () => false }),
    send: async c => calls.push(c) });
  await service.tick(); assert.equal(calls[0], ':unjail Player');
  assert.ok(!calls.some(c => c.startsWith(':jail')));
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
    enabled: true,
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

test('successful PM emits ops-log events and never jails', async () => {
  const f = fixture();
  const events = [];
  const service = createVcChecks({
    now: () => 0,
    enabled: true,
    snapshot: async () => ({ players: f.players, members: f.members, inVoice: id => f.voices.has(id) }),
    send: async (text, guard) => { if (guard && !guard()) return false; f.calls.push(text); },
    onLog: event => events.push(event),
  });
  await service.tick();
  assert.equal(events[0].action, 'PM');
  assert.equal(events[0].reason, 'comms reminder');
  assert.ok(!events.some(event => event.action === 'JAIL'));
  f.join(); f.voices.add('discord'); await service.tick();
  assert.ok(!events.some(event => event.action === 'UNJAIL'));
});
