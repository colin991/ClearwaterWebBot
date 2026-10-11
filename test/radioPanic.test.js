import test from 'node:test';
import assert from 'node:assert/strict';
import { createRadioPanicWatch, parseRadioPanic } from '../utils/radioPanic.js';

test('reads a panic event with caller and location', () => {
  assert.deepEqual(
    parseRadioPanic({ Type: 'Panic', Caller: 'Deputy_Jones:123', PositionDescriptor: 'Main St & 1st Ave' }),
    { name: 'Deputy_Jones', location: 'Main St & 1st Ave' },
  );
  assert.deepEqual(
    parseRadioPanic({ Type: 'EmergencyCall', Team: 'Police', Description: 'Panic button', Caller: 'Smith:9', PositionDescriptor: 'Postal 204' }),
    { name: 'Smith', location: 'Postal 204' },
  );
});

test('reads ;panic typed in game', () => {
  assert.deepEqual(
    parseRadioPanic({ Type: 'Command', Command: ';panic gas station', Player: 'Unit12:55' }),
    { name: 'Unit12', location: 'gas station' },
  );
  assert.equal(parseRadioPanic({ Type: 'Command', Command: ';ss 10-8', Player: 'Unit12:55' }), null);
});

test('ignores ordinary calls and panic attacks', () => {
  assert.equal(parseRadioPanic({ Type: 'EmergencyCall', Team: 'Police', Description: 'Robbery', PositionDescriptor: 'Bank' }), null);
  assert.equal(parseRadioPanic({ Type: 'EmergencyCall', Team: 'Fire', Description: 'Someone is having a panic attack' }), null);
  assert.equal(parseRadioPanic(null), null);
});

test('sends each panic once', () => {
  let clock = 1000;
  const sent = [];
  const watch = createRadioPanicWatch((message) => sent.push(message), () => clock);
  const event = { Type: 'Panic', Caller: 'A:1', PositionDescriptor: 'Here' };
  watch(event);
  watch(event);
  clock += 20_000;
  watch(event);
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], { type: 'panic', name: 'A', location: 'Here', at: 1000 });
});
