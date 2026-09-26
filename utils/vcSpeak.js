import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) process.env.FFMPEG_PATH = ffmpegStatic;
} catch {
  // System ffmpeg on PATH is fine.
}

export const SAY_VOICE = 'en-US-BrianNeural';
export const SAY_VOICE_RATE = 1.15;
export const SAY_MAX_CHARS = 500;
export const OPENAI_TTS_VOICES = Object.freeze(['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']);
export const OPENAI_TTS_TIMEOUT_MS = 30_000;
export const EDGE_TTS_TIMEOUT_MS = 45_000;
export const EDGE_MP3_BITRATE_BPS = 48_000;
export const VOICE_PLAYBACK_TAIL_MS = 600;
export const VOICE_CLIP_HARD_STOP_MS = 180_000;
const OPENAI_TTS_VOICE_SET = new Set(OPENAI_TTS_VOICES);
const guildVoiceHold = new AsyncLocalStorage();
const guildVoiceTails = new Map();

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function guildVoiceKey(guildId) {
  return String(guildId || '_');
}

/**
 * One Discord guild can only play in one voice channel at a time.
 * Nested calls from the job that already holds the lock run immediately
 * so a beep-then-speech session is not split by a Fire radio join.
 */
export function enqueueGuildVoice(guildId, work) {
  const id = guildVoiceKey(guildId);
  if (guildVoiceHold.getStore() === id) {
    return Promise.resolve().then(work);
  }
  const run = () => guildVoiceHold.run(id, work);
  const previous = guildVoiceTails.get(id) || Promise.resolve();
  const current = previous.then(run, run);
  guildVoiceTails.set(id, current.then(() => {}, () => {}));
  return current;
}

export function toNodeAudioBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
}

export function estimateMp3DurationMs(audio, byteLength = 0) {
  const buffer = toNodeAudioBuffer(audio);
  const size = buffer?.length || Number(byteLength) || 0;
  if (size <= 0) return 0;
  return Math.ceil((size * 8) / EDGE_MP3_BITRATE_BPS * 1000);
}

export function isEarlyVoiceIdle(elapsedMs, estimatedMs) {
  const estimated = Number(estimatedMs) || 0;
  if (estimated < 2_500) return false;
  return Number(elapsedMs) < estimated * 0.8;
}

export function voiceClipPlaybackWindow(audio, {
  idleTimeoutMs = 20_000,
  minPlayMs = 0,
  byteLength = 0,
} = {}) {
  const buffer = toNodeAudioBuffer(audio);
  const estimatedMs = estimateMp3DurationMs(audio, byteLength);
  const speech = Boolean(buffer?.length);
  return {
    estimatedMs,
    minPlayMs: Math.max(Number(minPlayMs) || 0, speech ? Math.floor(estimatedMs * 0.8) : 0),
    idleTimeoutMs: Math.max(
      Number(idleTimeoutMs) || 0,
      estimatedMs + 20_000,
      speech ? 90_000 : 8_000,
    ),
  };
}

export async function waitForVoiceClipEnd(player, {
  minPlayMs = 0,
  idleTimeoutMs = 60_000,
  estimatedMs = 0,
} = {}, {
  sleep = delay,
  waitUntil = entersState,
  now = Date.now,
} = {}) {
  const started = now();
  const deadline = started + Math.max(1_000, Number(idleTimeoutMs) || 0);
  const finished = (elapsed) => (
    !isEarlyVoiceIdle(elapsed, estimatedMs) && elapsed >= (Number(minPlayMs) || 0)
  );

  while (now() < deadline) {
    const status = player?.state?.status;
    const elapsed = now() - started;
    if (status === AudioPlayerStatus.Idle
      || status === AudioPlayerStatus.Paused
      || status === AudioPlayerStatus.AutoPaused) {
      if (finished(elapsed)) return 'idle';
      const remainMin = Math.max(
        0,
        (Number(minPlayMs) || 0) - elapsed,
        Math.floor((Number(estimatedMs) || 0) * 0.8) - elapsed,
      );
      const waitMs = Math.max(100, Math.min(deadline - now(), remainMin || 5_000, 5_000));
      await Promise.race([
        waitUntil(player, AudioPlayerStatus.Playing, waitMs).catch(() => null),
        sleep(waitMs),
      ]);
      continue;
    }
    const waitMs = Math.max(100, Math.min(deadline - now(), 8_000));
    try {
      await waitUntil(player, AudioPlayerStatus.Idle, waitMs);
    } catch {
      // Still playing or buffering — keep waiting until the clip should be done.
    }
  }

  if (player?.state?.status && player.state.status !== AudioPlayerStatus.Idle) {
    const leftover = Math.max(0, (Number(minPlayMs) || 0) - (now() - started));
    if (leftover) await sleep(Math.min(leftover, 8_000));
    if (player.state?.status !== AudioPlayerStatus.Idle) {
      player.stop?.(true);
      await waitUntil(player, AudioPlayerStatus.Idle, 2_000).catch(() => {});
      return 'stopped';
    }
  }
  return 'idle';
}

export async function promiseWithTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function bufferFromReadable(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    const converted = toNodeAudioBuffer(chunk) || Buffer.from(chunk);
    chunks.push(converted);
  }
  return Buffer.concat(chunks);
}

function escapeSsml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function isOpenAiVoice(voice) {
  return OPENAI_TTS_VOICE_SET.has(String(voice || '').trim().toLowerCase());
}

async function synthesizeOpenAiMp3(text, voice, speed) {
  const key = String(process.env.OPENAI_API_KEY || '').trim();
  if (!key) throw new Error('OPENAI_API_KEY is not set');
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: String(text || '').trim().slice(0, SAY_MAX_CHARS),
      voice: String(voice || 'onyx').toLowerCase(),
      speed: Math.min(4, Math.max(0.25, Number(speed) || 1)),
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(OPENAI_TTS_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI TTS failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error('OpenAI TTS returned empty audio.');
  return buffer;
}

async function synthesizeEdgeMp3(text, voice, prosody = {}) {
  const tts = new MsEdgeTTS();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const { audioStream } = tts.toStream(escapeSsml(String(text || '').trim()), {
      rate: prosody.rate ?? 1,
      pitch: prosody.pitch ?? '+0Hz',
      volume: prosody.volume ?? 100,
    });
    const buffer = toNodeAudioBuffer(await bufferFromReadable(audioStream));
    if (!buffer?.length) throw new Error('TTS returned empty audio.');
    return buffer;
  } finally {
    try { tts.close(); } catch { /* ignore */ }
  }
}

/** OpenAI TTS for named voices such as onyx; otherwise free Microsoft Edge TTS. */
export async function synthesizeSpeechMp3(text, voice = SAY_VOICE, prosody = {}) {
  const chosen = String(voice || SAY_VOICE).trim() || SAY_VOICE;
  const rate = prosody.rate ?? SAY_VOICE_RATE;
  if (isOpenAiVoice(chosen)) {
    try {
      return await promiseWithTimeout(
        synthesizeOpenAiMp3(text, chosen, rate),
        OPENAI_TTS_TIMEOUT_MS,
        'OpenAI TTS',
      );
    } catch (error) {
      logger.warn(`OpenAI voice ${chosen} failed; using Edge ${SAY_VOICE} instead`, error);
      return promiseWithTimeout(
        synthesizeEdgeMp3(text, SAY_VOICE, { rate, pitch: '+0Hz', volume: 100 }),
        EDGE_TTS_TIMEOUT_MS,
        'Edge TTS',
      );
    }
  }
  return promiseWithTimeout(synthesizeEdgeMp3(text, chosen, { ...prosody, rate }), EDGE_TTS_TIMEOUT_MS, 'Edge TTS');
}

/**
 * Join a guild voice channel (or reuse the existing connection in the same channel).
 */
export async function ensureGuildVoiceConnection(voiceChannel, adapterCreator) {
  const existing = getVoiceConnection(voiceChannel.guild.id);
  const sameChannel = existing?.joinConfig?.channelId === voiceChannel.id;
  if (sameChannel && existing) {
    if (existing.state?.status === VoiceConnectionStatus.Ready) return existing;
    try {
      await entersState(existing, VoiceConnectionStatus.Ready, 20_000);
      return existing;
    } catch (error) {
      existing.destroy();
      logger.warn('Stale voice connection was not ready; rejoining', error);
    }
  } else {
    existing?.destroy();
    await delay(300);
  }

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: adapterCreator || voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: false,
  });
  connection.on('error', (error) => {
    logger.error('Voice connection error', error);
  });
  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    connection.destroy();
    throw new Error(`Could not join the voice channel: ${error?.message || error}`);
  }
  if (String(connection.joinConfig?.channelId) !== String(voiceChannel.id)) {
    connection.destroy();
    throw new Error(`Voice connection joined ${connection.joinConfig?.channelId} instead of ${voiceChannel.id}`);
  }
  return connection;
}

async function writeClipFile(mp3PathOrBuffer, directory) {
  const buffer = toNodeAudioBuffer(mp3PathOrBuffer);
  if (buffer) {
    const filePath = join(directory, `speech-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`);
    await writeFile(filePath, buffer);
    return { filePath, byteLength: buffer.length, buffer };
  }
  const filePath = String(mp3PathOrBuffer);
  let byteLength = 0;
  try {
    byteLength = (await stat(filePath)).size || 0;
  } catch {
    byteLength = 0;
  }
  return { filePath, byteLength, buffer: null };
}

function createClipResource(filePath, volume) {
  const oggOpus = /\.ogg$/i.test(filePath);
  const useVolume = Math.max(0, Math.min(2, Number(volume) || 1));
  const resource = createAudioResource(filePath, {
    inlineVolume: useVolume !== 1,
    inputType: oggOpus ? StreamType.OggOpus : undefined,
  });
  if (useVolume !== 1) resource.volume?.setVolume(useVolume);
  return resource;
}

async function playClipOnPlayer(player, audio, { volume, idleTimeoutMs, minPlayMs, directory }) {
  const clip = await writeClipFile(audio, directory);
  // Generated speech buffers use a known bitrate and need protection from a
  // premature Idle event. Bundled MP3 files may use a different bitrate, so
  // trust the player's real Idle event instead of overestimating their length.
  const window = voiceClipPlaybackWindow(clip.buffer, {
    idleTimeoutMs,
    minPlayMs,
    byteLength: clip.buffer ? clip.byteLength : 0,
  });
  player.play(createClipResource(clip.filePath, volume));
  await entersState(player, AudioPlayerStatus.Playing, 8_000);
  const result = await waitForVoiceClipEnd(player, {
    minPlayMs: window.minPlayMs,
    idleTimeoutMs: Math.min(VOICE_CLIP_HARD_STOP_MS, window.idleTimeoutMs),
    estimatedMs: window.estimatedMs,
  });
  if (result === 'stopped') {
    logger.warn(`Voice clip was still playing after ${window.idleTimeoutMs}ms; stopped so the next clip can play`);
  }
}

async function playMp3QueueUnlocked(voiceChannel, adapterCreator, clips, {
  leaveAfter = true,
  speakDelayMs = 500,
  volume = 1,
  volumes = null,
  idleTimeoutMs = 20_000,
  minPlayMs = 0,
} = {}) {
  const list = Array.isArray(clips) ? clips : [clips];
  const connection = await ensureGuildVoiceConnection(voiceChannel, adapterCreator);
  if (speakDelayMs) await delay(speakDelayMs);

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Play },
  });
  player.on('error', (error) => {
    logger.warn('Voice player error', error);
  });
  const subscription = connection.subscribe(player);
  if (!subscription) {
    throw new Error('Could not subscribe the audio player to the voice connection.');
  }

  const directory = await mkdtemp(join(tmpdir(), 'cw-vc-say-'));
  try {
    for (let index = 0; index < list.length; index += 1) {
      const audio = await list[index];
      if (audio == null) throw new Error('Voice clip was empty.');
      const clipVolume = Array.isArray(volumes) ? (volumes[index] ?? volume) : volume;
      await playClipOnPlayer(player, audio, {
        volume: clipVolume,
        idleTimeoutMs,
        minPlayMs,
        directory,
      });
      if (index < list.length - 1) await delay(120);
    }
    await delay(VOICE_PLAYBACK_TAIL_MS);
  } finally {
    try {
      player.stop(true);
      await delay(leaveAfter ? VOICE_PLAYBACK_TAIL_MS : 80);
      if (leaveAfter && connection.state?.status !== VoiceConnectionStatus.Destroyed) {
        connection.destroy();
      }
    } catch (error) {
      logger.warn('Voice cleanup failed', error);
    }
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }

  return connection;
}

/**
 * Join a voice channel and play one or more MP3 files/buffers in order on the same player.
 * Jobs for the same guild wait until the current clip (and its whole speak session) finishes.
 */
export async function playMp3QueueInVoiceChannel(voiceChannel, adapterCreator, clips, options = {}) {
  return enqueueGuildVoice(voiceChannel?.guild?.id, () => (
    playMp3QueueUnlocked(voiceChannel, adapterCreator, clips, options)
  ));
}

/**
 * Join (or reuse) a voice channel and play an MP3 file/buffer for everyone.
 * @param {{ leaveAfter?: boolean }} options
 */
export async function playMp3InVoiceChannel(voiceChannel, adapterCreator, mp3PathOrBuffer, options = {}) {
  return playMp3QueueInVoiceChannel(voiceChannel, adapterCreator, [mp3PathOrBuffer], options);
}

export function resolveSayVoiceChannel(source, explicitChannel = null) {
  if (explicitChannel
    && (explicitChannel.type === ChannelType.GuildVoice || explicitChannel.type === ChannelType.GuildStageVoice)) {
    return explicitChannel;
  }
  if (source.options?.getChannel) {
    const selected = source.options.getChannel('channel', false);
    if (selected
      && (selected.type === ChannelType.GuildVoice || selected.type === ChannelType.GuildStageVoice)) {
      return selected;
    }
  }
  return source.member?.voice?.channel || null;
}

/**
 * Speak arbitrary text in a voice channel for everyone (Edge TTS, no API key).
 */
export async function sayInVoiceChannel(source, text, {
  explicitChannel = null,
  leaveAfter = true,
} = {}) {
  const phrase = String(text || '').replace(/\s+/g, ' ').trim();
  if (!phrase) throw new Error('Provide some text to say.');
  if (phrase.length > SAY_MAX_CHARS) {
    throw new Error(`Keep it under ${SAY_MAX_CHARS} characters.`);
  }

  const guild = source.guild;
  const voiceChannel = resolveSayVoiceChannel(source, explicitChannel);
  if (!voiceChannel) {
    throw new Error('Join a voice channel first (or choose one).');
  }

  const me = guild.members.me;
  if (!voiceChannel.permissionsFor(me)?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    throw new Error('I need Connect and Speak in that voice channel.');
  }

  const mp3 = await synthesizeSpeechMp3(phrase);
  await playMp3InVoiceChannel(voiceChannel, guild.voiceAdapterCreator, mp3, { leaveAfter });

  return { voiceChannel, text: phrase, leftAfter: leaveAfter };
}
