import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheriffBalance, postSheriffBalanceLog, SHERIFF_LOG_CHANNEL } from '../utils/sheriffBalance.js';

const player = (id, team = 'Sheriff') => ({ username: 'Player' + id, robloxId: String(id), team });
function fixture(count) {
  let players = Array.from({ length: count }, (_, i) => player(i + 1));
  const commands = [], errors = [];
  let fail = false;
  const service = createSheriffBalance({
    snapshot: async () => { if (fail) throw Error('offline'); return players; },
    send: async (c, options) => { if (!await options.shouldExecute()) return false; commands.push(c); },
    onError: e => errors.push(e),
  });
  return { service, commands, errors, set: p => { players = p; }, get: () => players, fail: () => { fail = true; } };
}
test('23rd Sheriff allowed; 24th wanted and privately notified once', async () => {
  const f = fixture(22); await f.service.tick();
  f.set([...f.get(), player(23)]); await f.service.tick(); assert.deepEqual(f.commands, []);
  f.set([...f.get(), player(24)]); await f.service.tick();
  assert.equal(f.commands[0], ':wanted Player24'); assert.match(f.commands[1], /^:pm Player24 .*full/);
  await f.service.tick(); assert.equal(f.commands.length, 2);
});
test('startup never ejects incumbents; a later arrival to an overfull team is rejected', async () => {
  const f = fixture(25); await f.service.tick(); assert.deepEqual(f.commands, []);
  f.set([...f.get(), player(26)]); await f.service.tick(); assert.equal(f.commands[0], ':wanted Player26');
});
test('vacancy allows new player; non-Sheriff joins ignored', async () => {
  const f = fixture(23); await f.service.tick();
  f.set([...f.get().slice(1), player(24), player(25, 'Police')]); await f.service.tick(); assert.deepEqual(f.commands, []);
});
test('simultaneous arrivals only use remaining slots', async () => {
  const f = fixture(22); await f.service.tick();
  f.set([...f.get(), player(23), player(24), player(25)]); await f.service.tick();
  assert.deepEqual(f.commands.filter(c => c.startsWith(':wanted')), [':wanted Player24', ':wanted Player25']);
});
test('a delayed command cancels when team occupancy drops', async () => {
  let roster = Array.from({ length: 23 }, (_, i) => player(i + 1));
  const commands = [];
  const service = createSheriffBalance({ snapshot: async () => roster, send: async (c, options) => {
    roster = roster.slice(1);
    if (!await options.shouldExecute()) return false;
    commands.push(c);
  } });
  await service.tick(); roster.push(player(24)); await service.tick(); assert.deepEqual(commands, []);
});
test('failed lookup issues no commands', async () => {
  const f = fixture(23); await f.service.tick(); f.fail(); await f.service.tick(); assert.deepEqual(f.commands, []); assert.equal(f.errors.length, 1);
});

test('logs enforcement once and sends embeds to the specified channel without mentions', async () => {
  let players = Array.from({ length: 23 }, (_, i) => player(i + 1));
  const events = [];
  const service = createSheriffBalance({ snapshot: async () => players, send: async () => {}, onLog: e => events.push(e) });
  await service.tick(); players.push(player(24)); await service.tick(); await service.tick();
  assert.equal(events.length, 2);
  assert.match(events[0].action, /Wanted command applied/);
  assert.match(events[1].action, /notice sent/);
  let payload;
  await postSheriffBalanceLog({ channels: { fetch: async id => {
    assert.equal(id, SHERIFF_LOG_CHANNEL);
    return { isTextBased: () => true, send: async value => { payload = value; } };
  } } }, events[0]);
  assert.deepEqual(payload.allowedMentions.parse, []);
  assert.equal(payload.embeds[0].fields[1].value, '24');
});
