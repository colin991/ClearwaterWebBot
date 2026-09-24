import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_TTS_TIMEOUT_MS,
  OPENAI_TTS_TIMEOUT_MS,
  enqueueGuildVoice,
  promiseWithTimeout,
  toNodeAudioBuffer,
} from '../utils/vcSpeak.js';

test('TTS audio from Edge-style bytes is treated as an mp3 buffer', () => {
  const raw = Uint8Array.from([1, 2, 3, 4]);
  const converted = toNodeAudioBuffer(raw);
  assert.equal(Buffer.isBuffer(converted), true);
  assert.deepEqual([...converted], [1, 2, 3, 4]);
  assert.equal(toNodeAudioBuffer(Buffer.from('abc')).toString(), 'abc');
});

test('guild voice jobs wait until the current speak session finishes', async () => {
  const order = [];
  let releaseFirst;
  const firstHold = new Promise((resolve) => { releaseFirst = resolve; });
  const first = enqueueGuildVoice('guild-1', async () => {
    order.push('first-start');
    await firstHold;
    await enqueueGuildVoice('guild-1', async () => { order.push('nested'); });
    order.push('first-end');
    return 'one';
  });
  const second = enqueueGuildVoice('guild-1', async () => {
    order.push('second');
    return 'two';
  });
  await Promise.resolve();
  assert.deepEqual(order, ['first-start']);
  releaseFirst();
  assert.equal(await first, 'one');
  assert.equal(await second, 'two');
  assert.deepEqual(order, ['first-start', 'nested', 'first-end', 'second']);
});

test('TTS helpers time out instead of hanging after the beep', async () => {
  assert.equal(OPENAI_TTS_TIMEOUT_MS, 30_000);
  assert.equal(EDGE_TTS_TIMEOUT_MS, 20_000);
  await assert.rejects(
    () => promiseWithTimeout(new Promise(() => {}), 20, 'Edge TTS'),
    /timed out after 20ms/,
  );
  assert.equal(await promiseWithTimeout(Promise.resolve('ok'), 100, 'OpenAI TTS'), 'ok');
});
