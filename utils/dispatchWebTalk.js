import { PassThrough } from 'node:stream';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  createAudioPlayer,
  createAudioResource,
} from '@discordjs/voice';
import { getDispatchRadioVoiceConnection } from './dispatchRadioTalkMonitor.js';
import { logger } from './logger.js';

let player = null;
let input = null;
let stopTimer = null;

function stopTimerNow() {
  if (!stopTimer) return;
  clearTimeout(stopTimer);
  stopTimer = null;
}

export function stopDispatchWebTalk() {
  stopTimerNow();
  try { input?.end(); } catch { /* ignore */ }
  input = null;
  try { player?.stop(true); } catch { /* ignore */ }
  player = null;
}

function armIdleStop() {
  stopTimerNow();
  stopTimer = setTimeout(() => stopDispatchWebTalk(), 1_500);
  stopTimer.unref?.();
}

function ensureStream(connection) {
  if (input && player) return;
  input = new PassThrough();
  player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  player.on('error', (error) => {
    logger.warn(`Web talk audio stopped: ${error?.message || error}`);
    stopDispatchWebTalk();
  });
  player.once(AudioPlayerStatus.Idle, () => {
    if (input?.readableEnded) stopDispatchWebTalk();
  });
  connection.subscribe(player);
  player.play(createAudioResource(input, {
    inputType: StreamType.Raw,
    inlineVolume: false,
  }));
}

export function writeDispatchWebTalk(pcm) {
  const connection = getDispatchRadioVoiceConnection();
  if (!connection) return { ok: false, talking: false, error: 'Dispatch RTO is not connected.' };
  if (!Buffer.isBuffer(pcm) || !pcm.length) return { ok: false, talking: false, error: 'Audio data is required.' };
  try {
    ensureStream(connection);
    input.write(pcm);
    armIdleStop();
    return { ok: true, talking: true };
  } catch (error) {
    stopDispatchWebTalk();
    return { ok: false, talking: false, error: error?.message || 'Could not transmit audio.' };
  }
}
