import test from 'node:test';
import assert from 'node:assert/strict';
import { createSheriffBalance, postSheriffBalanceLog, SHERIFF_LOG_CHANNEL, safeBalanceError, sheriffRetryDelaySeconds, sheriffPlayersToEnforce } from '../utils/sheriffBalance.js';

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
test('startup wants current extras over 23, not only later arrivals', async () => {
  const f = fixture(25); await f.service.tick();
  assert.deepEqual(f.commands.filter(c => c.startsWith(':wanted')), [':wanted Player24', ':wanted Player25']);
  f.set([...f.get(), player(26)]); await f.service.tick();
  assert.equal(f.commands.filter(c => c.startsWith(':wanted')).at(-1), ':wanted Player26');
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

test('Discord lookup rate limits still enforce from the last Sheriff roster', async () => {
  let time = 0;
  let players = Array.from({ length: 25 }, (_, i) => player(i + 1));
  let lookups = 0;
  const commands = [];
  const service = createSheriffBalance({
    now: () => time,
    snapshot: async () => {
      lookups += 1;
      if (lookups > 1) throw new Error('Discord is temporarily limiting member lookups. Please try -dc again in 30 seconds.');
      return players;
    },
    send: async (c, options) => { if (!await options.shouldExecute()) return false; commands.push(c); },
  });
  await service.tick();
  assert.equal(commands[0], ':wanted Player24');
});

test('sheriffPlayersToEnforce keeps the first 23 and wants the rest', () => {
  const sheriffs = Array.from({ length: 28 }, (_, i) => player(i + 1));
  const wanted = sheriffPlayersToEnforce(sheriffs, { previous: null }).map(p => p.username);
  assert.deepEqual(wanted, ['Player24', 'Player25', 'Player26', 'Player27', 'Player28']);
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

test('preflight failure is identified accurately and backs off retries', async () => {
  let players = Array.from({ length: 23 }, (_, i) => player(i + 1));
  let time = 0, fail = false, attempts = 0;
  const logs = [];
  const service = createSheriffBalance({ now: () => time,
    snapshot: async () => { if (fail) { fail = false; throw Error('Member lookup timed out'); } return players; },
    send: async (c, options) => { attempts++; fail = true; await options.shouldExecute(); },
    onError: () => {}, onLog: e => logs.push(e) });
  await service.tick(); players.push(player(24)); await service.tick();
  assert.match(logs[0].action, /Live roster\/role recheck/);
  assert.equal(logs[0].detail, 'Member lookup timed out');
  time = 59000; await service.tick(); assert.equal(attempts, 1);
  time = 60000; await service.tick(); assert.equal(attempts, 2);
  assert.match(logs[1].action, /120s/);
});

test('HTTP 429 retries after the API retry-after instead of 60s', async () => {
  let players = Array.from({ length: 23 }, (_, i) => player(i + 1));
  let time = 0, attempts = 0;
  const logs = [];
  const service = createSheriffBalance({
    now: () => time,
    snapshot: async () => players,
    send: async () => {
      attempts += 1;
      const error = new Error('You are being rate limited! Retry after 5 seconds.');
      error.status = 429;
      error.retryAfter = 5;
      throw error;
    },
    onError: () => {},
    onLog: e => logs.push(e),
  });
  await service.tick();
  players.push(player(24));
  await service.tick();
  assert.match(logs[0].action, /retry in 5s/);
  assert.equal(sheriffRetryDelaySeconds({ status: 429, retryAfter: 5 }, 1), 5);
  time = 4000;
  await service.tick();
  assert.equal(attempts, 1);
  time = 5000;
  await service.tick();
  assert.equal(attempts, 2);
});

test('in-game PM still sends after wanted removes the player from Sheriff', async () => {
  let players = Array.from({ length: 23 }, (_, i) => player(i + 1));
  const commands = [];
  const service = createSheriffBalance({
    snapshot: async () => players,
    send: async (c, options) => {
      if (!await options.shouldExecute()) return false;
      commands.push(c);
      if (c.startsWith(':wanted')) players = players.map(p => p.username === 'Player24' ? { ...p, team: 'Police' } : p);
    },
  });
  await service.tick();
  players.push(player(24, 'Sheriff'));
  await service.tick();
  assert.equal(commands[0], ':wanted Player24');
  assert.match(commands[1], /^:pm Player24 /);
});

test('safeBalanceError redacts secrets', () => {
  process.env.TEST_BALANCE_SECRET = 'private-test-value';
  try { assert.equal(safeBalanceError(Error('private-test-value Bearer abcdef')), '[redacted] Bearer [redacted]'); }
  finally { delete process.env.TEST_BALANCE_SECRET; }
});
