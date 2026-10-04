import assert from 'node:assert/strict';
import test from 'node:test';

import { erlcPlayersFromServer, parseErlcPlayer } from '../utils/erlc.js';
import { libertyLocationPin } from '../utils/libertyMapCalibration.js';

test('parses current X/Y/Z ER:LC player locations', () => {
  const player = parseErlcPlayer({
    Player: 'MapTester:123', Callsign: '101', Team: 'Sheriff',
    Location: { X: 150, Y: 20, Z: -300, Postal: '403' },
  });
  assert.deepEqual(player.location, {
    x: 150, z: -300, postal: '403', street: '', building: '',
  });
  assert.ok(libertyLocationPin(player.location));
});

test('parses nested coordinates and three-value vectors', () => {
  const nested = parseErlcPlayer({
    player: 'Nested:2', location: { coordinates: { x: 10, z: 25, postalCode: '404' } },
  });
  const vector = parseErlcPlayer({ player: 'Vector:3', position: [50, 12, 75], postalCode: '405' });
  assert.deepEqual([nested.location.x, nested.location.z, nested.location.postal], [10, 25, '404']);
  assert.deepEqual([vector.location.x, vector.location.z, vector.location.postal], [50, 75, '405']);
});

test('reads players from nested v2 response envelopes and keyed collections', () => {
  const player = { Player: 'Envelope:4' };
  assert.deepEqual(erlcPlayersFromServer({ data: { players: [player] } }), [player]);
  assert.deepEqual(erlcPlayersFromServer({ Data: { Players: { four: player } } }), [player]);
});
