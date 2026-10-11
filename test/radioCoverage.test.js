import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCoverageTracker,
  hasCoverage,
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
  assert.equal(clean.zones[0].kind, 'weak');
  assert.deepEqual(normalizeCoverage(null), { towers: [], zones: [], buildings: false });
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

test('the tracker turns positions into signals and re-applies a new map straight away', () => {
  let coverage = normalizeCoverage({ towers: [{ left: 0.5, top: 0.5, range: 0.2 }] });
  const sent = [];
  const tracker = createCoverageTracker({
    users: () => [{ userId: 'a', name: 'Alice' }, { userId: 'b', name: 'Bob' }, { userId: 'c', name: 'Cat' }],
    setSignals: (signals) => sent.push(Object.fromEntries(signals)),
    getCoverage: () => coverage,
  });
  tracker.update(new Map([['a', { left: 0.5, top: 0.5 }], ['b', { left: 0.95, top: 0.95 }]]));
  assert.deepEqual(sent.at(-1), { a: 1, b: 0.15 }, 'not in game: clear (no signal sent)');
  assert.deepEqual(tracker.positions().map((p) => [p.userId, p.signal]), [['a', 1], ['b', 0.15]]);

  coverage = normalizeCoverage({ towers: [{ left: 0.95, top: 0.95, range: 0.2 }] });
  tracker.recompute();
  assert.deepEqual(sent.at(-1), { a: 0.15, b: 1 });

  coverage = normalizeCoverage({});
  tracker.recompute();
  assert.deepEqual(sent.at(-1), {}, 'no map: everyone clear');
  tracker.clear();
  assert.deepEqual(tracker.positions(), []);
});

test('tunnels and garages only weaken the signal while building interference is on', () => {
  const square = [{ left: 0.4, top: 0.4 }, { left: 0.6, top: 0.4 }, { left: 0.6, top: 0.6 }, { left: 0.4, top: 0.6 }];
  const off = normalizeCoverage({ zones: [{ kind: 'building', points: square }] });
  assert.equal(off.buildings, false, 'off by default');
  assert.equal(off.zones[0].kind, 'building');
  assert.equal(off.zones[0].strength, 0.25);
  assert.equal(off.zones[0].name, 'Tunnel / garage 1');
  assert.equal(hasCoverage(off), false);
  assert.equal(signalAt({ left: 0.5, top: 0.5 }, off), null);
  const on = normalizeCoverage({ buildings: true, zones: [{ kind: 'building', points: square }, { kind: 'bogus', points: square }] });
  assert.equal(on.zones[1].kind, 'weak', 'unknown kinds are weak areas');
  assert.equal(signalAt({ left: 0.5, top: 0.5 }, on), 0.1);
  assert.equal(normalizeCoverage({ buildings: 'yes' }).buildings, false);
});

test('a damaged radio is capped very weak, with or without a coverage map', () => {
  const sent = [];
  let damaged = true;
  const tracker = createCoverageTracker({
    users: () => [{ userId: 'u1' }, { userId: 'u2' }],
    setSignals: (signals) => sent.push(new Map(signals)),
    getCoverage: () => normalizeCoverage({}),
    limit: (userId) => (damaged && userId === 'u1' ? 0.1 : null),
  });
  tracker.update(new Map());
  assert.deepEqual([...sent.at(-1)], [['u1', 0.1]]);
  damaged = false;
  tracker.recompute();
  assert.equal(sent.at(-1).size, 0);
});
