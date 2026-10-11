import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCoverageTracker,
  normalizeCoverage,
  pointInArea,
  signalAt,
  signalBars,
  towerSignal,
} from '../utils/radioCoverage.js';

const square = [{ left: 0.1, top: 0.1 }, { left: 0.3, top: 0.1 }, { left: 0.3, top: 0.3 }, { left: 0.1, top: 0.3 }];

test('coverage from the website is cleaned before it is saved', () => {
  const clean = normalizeCoverage({
    towers: [
      { id: 'a', name: ' City ', left: 0.5, top: 0.5, range: 5 },
      { id: 'a', left: 0.2, top: 0.2 },
      { left: 2, top: 0.5 },
      'junk',
    ],
    zones: [
      { name: 'High Rock', points: square, strength: 0 },
      { name: 'Too small', points: square.slice(0, 2) },
    ],
  });
  assert.deepEqual(clean.towers.map((t) => [t.id, t.name, t.range]), [['a', 'City', 0.6], ['a-2', 'Tower 2', 0.2]]);
  assert.equal(clean.zones.length, 1);
  assert.equal(clean.zones[0].strength, 0.1);
  assert.deepEqual(normalizeCoverage(null), { towers: [], zones: [] });
});

test('near a tower is clear, far away and weak areas fade but never cut out', () => {
  assert.equal(towerSignal(0.05, 0.2), 1);
  assert.equal(towerSignal(0.2, 0.2), 0.55);
  assert.equal(towerSignal(1, 0.2), 0.15);
  assert.ok(pointInArea({ left: 0.2, top: 0.2 }, square));
  assert.ok(!pointInArea({ left: 0.5, top: 0.2 }, square));

  const coverage = normalizeCoverage({
    towers: [{ left: 0.5, top: 0.5, range: 0.2 }],
    zones: [{ points: square, strength: 0.4 }],
  });
  assert.equal(signalAt({ left: 0.52, top: 0.5 }, coverage), 1, 'city units near a tower stay clear');
  assert.equal(signalAt({ left: 0.95, top: 0.95 }, coverage), 0.15);
  assert.equal(signalAt({ left: 0.2, top: 0.2 }, coverage), 0.1, 'weak area far from a tower: as weak as it gets, still through');
  assert.equal(signalAt(null, coverage), null, 'not in game: clear');
  assert.equal(signalAt({ left: 0.5, top: 0.5 }, { towers: [], zones: [] }), null);
  // Only weak areas, no towers: clear everywhere else.
  const areasOnly = normalizeCoverage({ zones: [{ points: square, strength: 0.4 }] });
  assert.equal(signalAt({ left: 0.6, top: 0.6 }, areasOnly), 1);
  assert.equal(signalAt({ left: 0.2, top: 0.2 }, areasOnly), 0.4);
  assert.deepEqual([1, 0.7, 0.4, 0.1, null].map(signalBars), [4, 3, 2, 1, 4]);
});

test('the tracker locates radio users, sets their signal, and keeps the last one if the lookup fails', async () => {
  let coverage = normalizeCoverage({ towers: [{ left: 0.5, top: 0.5, range: 0.2 }] });
  const sent = [];
  let fail = false;
  const tracker = createCoverageTracker({
    users: () => [{ userId: 'a', name: 'Alice' }, { userId: 'b', name: 'Bob' }],
    players: async () => {
      if (fail) throw new Error('ER:LC down');
      return new Map([['a', { left: 0.5, top: 0.5 }], ['b', { left: 0.95, top: 0.95 }]]);
    },
    setSignals: (signals) => sent.push(Object.fromEntries(signals)),
    getCoverage: () => coverage,
  });
  await tracker.tick();
  assert.deepEqual(sent.at(-1), { a: 1, b: 0.15 });
  assert.deepEqual(tracker.positions().map((p) => [p.userId, p.signal]), [['a', 1], ['b', 0.15]]);

  fail = true;
  await tracker.tick();
  assert.equal(sent.length, 1, 'a failed lookup changes nothing');

  coverage = normalizeCoverage({ towers: [{ left: 0.95, top: 0.95, range: 0.2 }] });
  tracker.recompute();
  assert.deepEqual(sent.at(-1), { a: 0.15, b: 1 }, 'a new map applies straight away');

  coverage = normalizeCoverage({});
  await tracker.tick();
  assert.deepEqual(sent.at(-1), {}, 'no map: everyone clear');
});
