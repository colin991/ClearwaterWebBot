import test from 'node:test';
import assert from 'node:assert/strict';
import { createPriorityService, validatePriorityServer, priorityPanel, postPriorityQueueLog, PRIORITY_QUEUE_LOG_CHANNEL } from '../utils/priorityQueue.js';
import command from '../prefixCommands/prtyq.js';

const server = () => ({ Queue: [123], Players: [], Staff: { Admins: {}, Mods: {}, Helpers: {} }, OwnerId: 9, CoOwnerIds: [] });
function fixture({ joined = false, failMod = false, failRemove = false } = {}) {
  let time = 0, pending = null, reads = 0;
  const calls = [];
  const service = createPriorityService({
    now: () => time,
    // Deadline races use a real pending promise; polling advances our simulated clock.
    wait: ms => ms > 1000 ? new Promise(() => {}) : Promise.resolve(time += ms),
    snapshot: async () => { const s = server(); if (joined && reads++ > 0) s.Players = [{ Player: 'User:123' }]; return s; },
    session: async action => action(async c => { calls.push({ command: c, time }); if ((failMod && c.startsWith(':mod')) || (failRemove && c.startsWith(':unmod'))) throw Error('API failure'); }),
    load: async () => pending,
    save: async value => { pending = value; },
  });
  return { service, calls, pending: () => pending };
}

test('requires a real queue and preserves existing staff and owners', () => {
  const s = server(); validatePriorityServer(s, '123');
  assert.throws(() => validatePriorityServer({ ...s, Queue: [] }, '123'), /no in-game queue/);
  assert.throws(() => validatePriorityServer({ ...s, Queue: null }, '123'), /unavailable/);
  assert.throws(() => validatePriorityServer({ ...s, Staff: {} }, '123'), /permissions/);
  assert.throws(() => validatePriorityServer({ ...s, Staff: { ...s.Staff, Mods: { '123': 'User' } } }, '123'), /already have/);
  assert.throws(() => validatePriorityServer(s, '9'), /owners/);
  assert.throws(() => validatePriorityServer({ ...s, Players: [{ Player: 'User:123' }] }, '123'), /already in/);
});

test('grants by Roblox ID and removes at ten seconds', async () => {
  const f = fixture(); await f.service.grant('123', async () => {});
  assert.deepEqual(f.calls, [{ command: ':mod 123', time: 0 }, { command: ':unmod 123', time: 10000 }]);
  assert.equal(f.pending(), null);
});

test('joining early removes early', async () => {
  const f = fixture({ joined: true }); await f.service.grant('123', async () => {});
  assert.deepEqual(f.calls, [{ command: ':mod 123', time: 0 }, { command: ':unmod 123', time: 1000 }]);
});

test('invalid identity or lost role never grants access', async () => {
  const f = fixture();
  await assert.rejects(f.service.grant('', async () => {}), /linked Roblox/);
  await assert.rejects(f.service.grant('123', async () => { throw Error('role removed'); }), /role removed/);
  assert.deepEqual(f.calls, []);
});

test('uncertain grant still attempts removal', async () => {
  const f = fixture({ failMod: true }); await assert.rejects(f.service.grant('123', async () => {}));
  assert.deepEqual(f.calls.map(c => c.command), [':mod 123', ':unmod 123']);
  assert.equal(f.pending(), null);
});

test('failed removal stays persisted and blocks grants until recovery succeeds', async () => {
  const f = fixture({ failRemove: true }); await assert.rejects(f.service.grant('123', async () => {}));
  assert.equal(f.pending().robloxId, '123');
  await assert.rejects(f.service.grant('124', async () => {}), /pending/);
  const commands = [];
  const recovered = createPriorityService({ load: async () => f.pending(), save: async v => commands.push(v), session: async action => action(async c => commands.push(c)) });
  await recovered.recover(); assert.deepEqual(commands, [':unmod 123', null]);
});

test('parallel clicks cannot overlap privileges', async () => {
  const f = fixture(); const first = f.service.grant('123', async () => {});
  await assert.rejects(f.service.grant('123', async () => {}), /being processed/); await first;
});

test('panel has supplied button and admin permission enforced before posting', async () => {
  const panel = priorityPanel(); assert.equal(panel.flags, 32768);
  assert.equal(panel.components[0].components[4].components[0].custom_id, 'priority_queue_boost');
  await assert.rejects(command.execute({ guild: { id: 'home', members: { fetch: async () => ({ permissions: { has: () => false } }) } },
    author: { id: 'user' }, client: { config: { guildId: 'home' } } }), /Administrator/);
});

test('Join Queue usage logs to the specified channel without mentions', async () => {
  let payload;
  await postPriorityQueueLog({ channels: { fetch: async id => {
    assert.equal(id, PRIORITY_QUEUE_LOG_CHANNEL);
    return { isTextBased: () => true, send: async value => { payload = value; } };
  } } }, { action: 'Join Queue used', ok: true, userId: '1', username: 'Tester', robloxId: '123' });
  assert.deepEqual(payload.allowedMentions.parse, []);
  assert.equal(payload.embeds[0].title, 'Priority Queue');
  assert.match(payload.embeds[0].fields[0].value, /Tester/);
  assert.equal(payload.embeds[0].fields[1].value, '123');
});
