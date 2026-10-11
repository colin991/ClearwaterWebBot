import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransmitSink } from '../utils/radioBot.js';

const packet = (n) => Buffer.from([n]);

test('a PTT tap too short to say anything never plays in Discord', () => {
  let plays = 0;
  const sink = createTransmitSink(() => { plays += 1; }, 4);
  sink.push(packet(1));
  sink.push(packet(2));
  sink.end();
  assert.equal(plays, 0);
});

test('a real transmission plays every packet in order once enough has arrived', async () => {
  let stream = null;
  const sink = createTransmitSink((played) => { stream = played; }, 3);
  sink.push(packet(1));
  sink.push(packet(2));
  assert.equal(stream, null);
  sink.push(packet(3));
  sink.push(packet(4));
  sink.end();
  const received = [];
  for await (const chunk of stream) received.push(chunk[0]);
  assert.deepEqual(received, [1, 2, 3, 4]);
});
