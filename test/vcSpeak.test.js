import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_TTS_TIMEOUT_MS,
  OPENAI_TTS_TIMEOUT_MS,
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

test('TTS helpers time out instead of hanging after the beep', async () => {
  assert.equal(OPENAI_TTS_TIMEOUT_MS, 8_000);
  assert.equal(EDGE_TTS_TIMEOUT_MS, 20_000);
  await assert.rejects(
    () => promiseWithTimeout(new Promise(() => {}), 20, 'Edge TTS'),
    /timed out after 20ms/,
  );
  assert.equal(await promiseWithTimeout(Promise.resolve('ok'), 100, 'OpenAI TTS'), 'ok');
});
