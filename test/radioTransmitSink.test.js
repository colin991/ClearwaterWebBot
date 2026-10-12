import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransmitSink } from '../utils/radioBot.js';
import { loadOggOpusPackets, RADIO_TRANSMIT_TONE_CHANNELS } from '../utils/radioTone.js';

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

test('a transmit tone plays ahead of the voice, and not at all for a PTT tap', async () => {
  let stream = null;
  const tap = createTransmitSink((played) => { stream = played; }, 3, [packet(9)]);
  tap.push(packet(1));
  tap.end();
  assert.equal(stream, null);

  const sink = createTransmitSink((played) => { stream = played; }, 2, [packet(8), packet(9)]);
  sink.push(packet(1));
  sink.push(packet(2));
  sink.push(packet(3));
  sink.end();
  const received = [];
  for await (const chunk of stream) received.push(chunk[0]);
  assert.deepEqual(received, [8, 9, 1, 2, 3]);
});

test('only Fire and DOT get the transmit tone, and it loads as Opus packets', async () => {
  assert.deepEqual([...RADIO_TRANSMIT_TONE_CHANNELS].sort(), ['dot', 'fire']);
  const packets = await loadOggOpusPackets();
  assert.equal(packets.length, 26);
  assert.ok(packets.every((p) => Buffer.isBuffer(p) && p.length > 0));
});
