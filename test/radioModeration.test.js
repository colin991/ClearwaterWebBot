import test from 'node:test';
import assert from 'node:assert/strict';
import { createSceneClock, createTalkOverWatch, sceneChannelIds } from '../utils/radioModeration.js';

test('talking over dispatch 3 times in 10 minutes is flagged, then the count starts again', () => {
  let clock = 0;
  const watch = createTalkOverWatch({ now: () => clock });
  assert.equal(watch.hit('a'), 0);
  clock += 60_000;
  assert.equal(watch.hit('a'), 0);
  assert.equal(watch.hit('b'), 0, 'counted per member');
  clock += 60_000;
  assert.equal(watch.hit('a'), 3);
  assert.equal(watch.hit('a'), 0, 'starts from zero after a flag');
  clock += 11 * 60_000;
  watch.hit('b');
  assert.equal(watch.hit('b'), 0, 'old talk-overs fall out of the window');
});

test('scene timers count from when each member joined a scene channel', () => {
  let clock = 1000;
  const clock2 = createSceneClock({ now: () => clock });
  const room = (members) => [{ id: '1', name: 'Traffic Stop 1', members }];
  assert.deepEqual(clock2.update(room([{ id: 'a', name: 'Alice' }])), [{ id: 'a', name: 'Alice', channel: 'Traffic Stop 1', since: 1000 }]);
  clock = 5000;
  const list = clock2.update(room([{ id: 'a', name: 'Alice' }, { id: 'b', name: 'Bob' }]));
  assert.deepEqual(list.map((scene) => [scene.id, scene.since]), [['a', 1000], ['b', 5000]]);
  clock2.update(room([]));
  clock = 9000;
  assert.equal(clock2.update(room([{ id: 'a', name: 'Alice' }]))[0].since, 9000, 'leaving resets the timer');
});

test('scene channel IDs come from a comma-separated env value', () => {
  assert.deepEqual(sceneChannelIds('123456789012345678, 223456789012345678,bad'), ['123456789012345678', '223456789012345678']);
  assert.deepEqual(sceneChannelIds(''), []);
});
