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
  assert.deepEqual(sent.at(-1), ['a', { postal: '204', street: 'Main St', speed: null, heading: '' }]);

  clock = 5000;
  feed.update(users, new Map([['a', { x: 250, z: 0, postal: '205', street: 'Main St' }]]));
  assert.deepEqual(sent.at(-1)[1], { postal: '205', street: 'Main St', speed: 32, heading: 'E' });
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
