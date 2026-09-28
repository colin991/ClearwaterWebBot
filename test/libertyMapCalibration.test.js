import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIBERTY_POSTAL_POINTS,
  fitLibertyAffine,
  libertyCalibrationStatus,
  libertyLocationPin,
  postalMapPoint,
  recordLibertyCalibration,
  resetLibertyCalibrationForTests,
} from '../utils/libertyMapCalibration.js';
import { libertyPlayerMapPoint } from '../utils/erlc.js';

// Hidden "true" transform used to fake live ER:LC samples: centre-origin studs, 2900 across.
const WORLD = 2900;
const toWorld = ({ left, top }) => ({ x: (left - 0.5) * WORLD, z: (top - 0.5) * WORLD });

function fakeSamples() {
  return Object.entries(LIBERTY_POSTAL_POINTS).flatMap(([p, point], index) => {
    const world = toWorld(point);
    const jitter = ((index % 5) - 2) * 6;
    return [
      { x: world.x + jitter, z: world.z - jitter, p },
      { x: world.x - jitter, z: world.z + jitter, p },
    ];
  });
}

test('official postal labels are bundled', () => {
  assert.ok(Object.keys(LIBERTY_POSTAL_POINTS).length >= 90);
  const airport = postalMapPoint('902');
  assert.ok(Math.abs(airport.left - 0.417) < 0.01);
  assert.ok(Math.abs(airport.top - 0.286) < 0.01);
  assert.equal(postalMapPoint('no'), null);
});

test('without a learned fit the pin sits on the reported postal, not the raw 3120 guess', () => {
  resetLibertyCalibrationForTests();
  const pin = libertyPlayerMapPoint({ x: 2459, z: 1457, postal: '902' });
  const airport = postalMapPoint('902');
  assert.deepEqual(pin, { left: Number(airport.left.toFixed(5)), top: Number(airport.top.toFixed(5)) });
});

test('learns the world-to-map transform from live samples', () => {
  const fit = fitLibertyAffine(fakeSamples());
  assert.ok(fit);
  assert.ok(fit.rms < 0.01);

  resetLibertyCalibrationForTests(fakeSamples());
  assert.equal(libertyCalibrationStatus().fitted, true);
  const exact = { left: 0.43, top: 0.3 };
  const world = toWorld(exact);
  const pin = libertyLocationPin({ ...world, postal: '902' });
  assert.ok(Math.abs(pin.left - exact.left) < 0.005);
  assert.ok(Math.abs(pin.top - exact.top) < 0.005);
});

test('a fitted pin that lands far from the reported postal falls back to the postal', () => {
  resetLibertyCalibrationForTests(fakeSamples());
  const far = toWorld({ left: 0.79, top: 0.47 });
  const pin = libertyLocationPin({ ...far, postal: '902' });
  const airport = postalMapPoint('902');
  assert.ok(Math.abs(pin.left - airport.left) < 0.001);
  assert.ok(Math.abs(pin.top - airport.top) < 0.001);
});

test('unknown postal uses the fit, then the legacy fallback', () => {
  resetLibertyCalibrationForTests(fakeSamples());
  const pin = libertyLocationPin({ ...toWorld({ left: 0.6, top: 0.6 }), postal: '99999' });
  assert.ok(Math.abs(pin.left - 0.6) < 0.005);
  resetLibertyCalibrationForTests();
  assert.deepEqual(
    libertyLocationPin({ x: 1, z: 2, postal: '' }, (x, z) => ({ left: x, top: z })),
    { left: 1, top: 2 },
  );
});

test('records raw ER:LC players and ignores missing postals or coords', () => {
  resetLibertyCalibrationForTests();
  const added = recordLibertyCalibration([
    { Player: 'A:1', Location: { LocationX: -250, LocationZ: -620, PostalCode: '902' } },
    { Player: 'A:1', Location: { LocationX: -250, LocationZ: -620, PostalCode: '902' } },
    { Player: 'B:2', Location: { LocationX: 10, LocationZ: 10, PostalCode: '' } },
    { Player: 'C:3', Location: { PostalCode: '403' } },
  ], { persist: false });
  assert.equal(added, 1);
  assert.equal(libertyCalibrationStatus().samples, 1);
  resetLibertyCalibrationForTests();
});
