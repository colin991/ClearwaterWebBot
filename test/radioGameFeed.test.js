import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameFeed, estimateMotion, headingFrom } from '../utils/radioGameFeed.js';

test('heading follows the Liberty map, where north is the top (-Z)', () => {
  assert.equal(headingFrom(0, -10), 'N');
  assert.equal(headingFrom(10, 0), 'E');
  assert.equal(headingFrom(0, 10), 'S');
  assert.equal(headingFrom(-10, 0), 'W');
  assert.equal(headingFrom(10, -10), 'NE');
});

test('speed comes from the distance moved between two updates', () => {
  const moving = estimateMotion({ x: 0, z: 0, at: 0 }, { x: 0, z: -250, at: 5000 });
  assert.equal(moving.heading, 'N');
  assert.equal(moving.speed, Math.round(50 * 0.63));
  assert.deepEqual(estimateMotion({ x: 0, z: 0, at: 0, heading: 'E' }, { x: 2, z: 1, at: 5000 }), { speed: 0, heading: 'E' }, 'jitter is standing still');
  assert.equal(estimateMotion({ x: 0, z: 0, at: 0 }, { x: 900, z: 0, at: 60_000 }).speed, null, 'too long a gap gives no speed');
  assert.equal(estimateMotion(null, { x: 0, z: 0, at: 0 }).speed, null);
});

test('the feed sends game data only when it changes, and null once the member leaves the game', () => {
  let clock = 0;
  const sent = [];
  const feed = createGameFeed({ send: (id, info) => sent.push([id, info]), now: () => clock });
  const users = [{ userId: 'a' }];
  feed.update(users, new Map([['a', { x: 0, z: 0, postal: '204', street: 'Main St' }]]));
  assert.deepEqual(sent.at(-1), ['a', { postal: '204', street: 'Main St', speed: null, heading: '', nearest: [] }]);

  clock = 5000;
  feed.update(users, new Map([['a', { x: 250, z: 0, postal: '205', street: 'Main St' }]]));
  assert.deepEqual(sent.at(-1)[1], { postal: '205', street: 'Main St', speed: 32, heading: 'E', nearest: [] });
  assert.equal(feed.info('a').postal, '205');

  clock = 10_000;
  feed.update(users, new Map([['a', { x: 500, z: 0, postal: '205', street: 'Main St' }]]));
  assert.equal(sent.length, 2, 'same postal, speed and heading: nothing sent');

  feed.update(users, new Map());
  assert.deepEqual(sent.at(-1), ['a', null]);
  assert.equal(feed.info('a'), null);
  feed.update(users, new Map());
  assert.equal(sent.length, 3, 'not in game twice: sent once');
});

test('nearest units are the 3 closest other radio users in game, with postal and miles', async () => {
  const { nearestUnits } = await import('../utils/radioGameFeed.js');
  const located = new Map([
    ['me', { x: 0, z: 0 }],
    ['a', { x: 3000, z: 0, postal: '300' }],
    ['b', { x: 500, z: 0, postal: '101' }],
    ['c', { x: 0, z: 1500, postal: '150' }],
    ['d', { x: 9000, z: 0, postal: '900' }],
    ['e', { x: null, z: null }],
  ]);
  const names = new Map([['a', 'A-1'], ['b', 'B-2'], ['c', 'C-3'], ['d', 'D-4']]);
  const nearest = nearestUnits('me', located, names);
  assert.deepEqual(nearest.map((unit) => unit.name), ['B-2', 'C-3', 'A-1']);
  assert.equal(nearest[0].postal, '101');
  assert.equal(nearest[0].miles, 0.1);
  assert.deepEqual(nearestUnits('nobody', located, names), []);
});

test('a member in the kill log gets a damaged radio for 20 seconds, once per kill', async () => {
  const { createDamageTracker, DOWNED_MS } = await import('../utils/radioGameFeed.js');
  let clock = 300_000;
  const damage = createDamageTracker({ now: () => clock });
  const located = new Map([['u1', { player: { username: 'Alice', robloxId: '42' } }], ['u2', { player: { username: 'Bob', robloxId: '7' } }]]);
  const kills = [{ username: 'Alice', robloxId: '42', at: 240_000 }, { username: 'bob', robloxId: '', at: 10_000 }];
  assert.deepEqual(damage.update(kills, located), ['u1'], 'a kill the log showed late still counts; an old one is history');
  assert.equal(damage.isDamaged('u1'), true);
  assert.equal(damage.nextEnd(), 300_000 + DOWNED_MS);
  clock += 5000;
  assert.deepEqual(damage.update(kills, located), [], 'the same kill again does nothing');
  clock += DOWNED_MS;
  assert.equal(damage.isDamaged('u1'), false);
  assert.equal(damage.nextEnd(), 0);
  assert.deepEqual(damage.update([{ username: 'BOB', at: clock - 1000 }], located), ['u2'], 'matched by name too');
  const known = new Map([['u3', { robloxId: '99', names: ['Carl_RBX'] }]]);
  assert.deepEqual(damage.update([{ username: 'Carl_RBX', robloxId: '99', at: clock - 2000 }], new Map(), known), ['u3'], 'a linked member the player list missed');
});

test('a Civilian-team player on the radio is flagged once, after two updates in a row', async () => {
  const { createTeamWatch } = await import('../utils/radioGameFeed.js');
  const watch = createTeamWatch({ isOffTeam: (team) => /civilian/i.test(team) });
  const users = [{ userId: 'u1' }];
  const civ = new Map([['u1', { team: 'Civilian', player: { username: 'Alice' } }]]);
  const police = new Map([['u1', { team: 'Police' }]]);
  assert.deepEqual(watch.update(users, civ), []);
  assert.deepEqual(watch.update(users, civ).map((flag) => flag.userId), ['u1']);
  assert.deepEqual(watch.update(users, civ), [], 'not flagged again while they stay');
  assert.deepEqual(watch.update(users, police), []);
  watch.update(users, civ);
  assert.equal(watch.update(users, civ).length, 1, 'flagged again after going back to Civilian');
});
