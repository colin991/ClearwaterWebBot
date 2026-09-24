import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EDGE_TTS_TIMEOUT_MS,
  OPENAI_TTS_TIMEOUT_MS,
  enqueueGuildVoice,
  estimateMp3DurationMs,
  isEarlyVoiceIdle,
  promiseWithTimeout,
  toNodeAudioBuffer,
  voiceClipPlaybackWindow,
  waitForVoiceClipEnd,
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
  assert.equal(EDGE_TTS_TIMEOUT_MS, 45_000);
  await assert.rejects(
    () => promiseWithTimeout(new Promise(() => {}), 20, 'Edge TTS'),
    /timed out after 20ms/,
  );
  assert.equal(await promiseWithTimeout(Promise.resolve('ok'), 100, 'OpenAI TTS'), 'ok');
});

test('speech clips get a playback window longer than the mp3 itself', () => {
  const fortySeconds = Buffer.alloc(Math.ceil(48_000 / 8 * 40));
  assert.ok(estimateMp3DurationMs(fortySeconds) >= 39_000);
  const window = voiceClipPlaybackWindow(fortySeconds, { idleTimeoutMs: 20_000 });
  assert.ok(window.minPlayMs >= 31_000);
  assert.ok(window.idleTimeoutMs >= 90_000);
  assert.equal(isEarlyVoiceIdle(8_000, window.estimatedMs), true);
  assert.equal(isEarlyVoiceIdle(window.estimatedMs, window.estimatedMs), false);
});

test('waitForVoiceClipEnd ignores an idle that happens mid-clip', async () => {
  let time = 0;
  const player = {
    state: { status: 'idle' },
    stop() { player.state.status = 'idle'; },
  };
  const result = await waitForVoiceClipEnd(player, {
    minPlayMs: 8_000,
    idleTimeoutMs: 12_000,
    estimatedMs: 10_000,
  }, {
    now: () => time,
    sleep: async (ms) => { time += Number(ms) || 0; },
    waitUntil: async (_player, _status, ms) => {
      time += Number(ms) || 0;
      throw new Error('timeout');
    },
  });
  assert.equal(result, 'idle');
  assert.ok(time >= 8_000);
});
