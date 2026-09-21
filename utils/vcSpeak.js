import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
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

export const SAY_VOICE = 'en-US-GuyNeural';
export const SAY_MAX_CHARS = 500;
export const OPENAI_TTS_VOICES = Object.freeze(['alloy', 'ash', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer']);
export const OPENAI_TTS_TIMEOUT_MS = 8_000;
export const EDGE_TTS_TIMEOUT_MS = 20_000;
const OPENAI_TTS_VOICE_SET = new Set(OPENAI_TTS_VOICES);
const execFile = promisify(execFileCallback);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function toNodeAudioBuffer(value) {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  return null;
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
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(escapeSsml(String(text || '').trim()), {
    rate: prosody.rate ?? 1,
    pitch: prosody.pitch ?? '+0Hz',
    volume: prosody.volume ?? 100,
  });
  const buffer = toNodeAudioBuffer(await bufferFromReadable(audioStream));
  if (!buffer?.length) throw new Error('TTS returned empty audio.');
  return buffer;
}

async function synthesizeGoogleMp3(text) {
  const phrase = String(text || '').trim().slice(0, 200);
  const url = new URL('https://translate.google.com/translate_tts');
  url.searchParams.set('ie', 'UTF-8');
  url.searchParams.set('q', phrase);
  url.searchParams.set('tl', 'en');
  url.searchParams.set('client', 'tw-ob');
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google TTS failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length < 250) throw new Error('Google TTS returned empty audio.');
  return buffer;
}

async function synthesizeLocalMp3(text) {
  let speak = 'espeak-ng';
  try {
    await execFile(speak, ['--version'], { timeout: 3000 });
  } catch {
    speak = 'espeak';
    await execFile(speak, ['--version'], { timeout: 3000 });
  }
  const directory = await mkdtemp(join(tmpdir(), 'cw-tts-'));
  const wavPath = join(directory, 'speech.wav');
  const mp3Path = join(directory, 'speech.mp3');
  try {
    await execFile(speak, ['-s', '140', '-v', 'en+m3', '-w', wavPath, String(text || '').trim().slice(0, SAY_MAX_CHARS)], { timeout: 15_000 });
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
    await execFile(ffmpeg, ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-qscale:a', '4', mp3Path], { timeout: 15_000 });
    const buffer = await readFile(mp3Path);
    if (!buffer.length) throw new Error('Local TTS returned empty audio.');
    return buffer;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function firstSpeechBuffer(attempts) {
  let lastError;
  for (const attempt of attempts) {
    try {
      const buffer = toNodeAudioBuffer(await attempt());
      if (buffer?.length) return buffer;
      lastError = new Error('TTS returned empty audio.');
    } catch (error) {
      lastError = error;
      logger.warn('TTS attempt failed', error);
    }
  }
  throw lastError || new Error('TTS failed.');
}

/** OpenAI TTS for named voices such as onyx; otherwise free Microsoft Edge TTS. */
export async function synthesizeSpeechMp3(text, voice = SAY_VOICE, prosody = {}) {
  const chosen = String(voice || SAY_VOICE).trim() || SAY_VOICE;
  const edge = (name) => promiseWithTimeout(
    synthesizeEdgeMp3(text, name, { rate: 1, pitch: '+0Hz', volume: 100 }),
    EDGE_TTS_TIMEOUT_MS,
    `Edge TTS (${name})`,
  );
  const fallbacks = [
    () => edge('en-US-DavisNeural'),
    () => edge('en-US-GuyNeural'),
    () => promiseWithTimeout(synthesizeGoogleMp3(text), 10_000, 'Google TTS'),
    () => synthesizeLocalMp3(text),
  ];
  if (isOpenAiVoice(chosen)) {
    return firstSpeechBuffer([
      () => promiseWithTimeout(
        synthesizeOpenAiMp3(text, chosen, prosody.rate ?? 1),
        OPENAI_TTS_TIMEOUT_MS,
        'OpenAI TTS',
      ),
      ...fallbacks,
    ]);
  }
  return firstSpeechBuffer([
    () => promiseWithTimeout(synthesizeEdgeMp3(text, chosen, prosody), EDGE_TTS_TIMEOUT_MS, 'Edge TTS'),
    ...fallbacks,
  ]);
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
  return connection;
}

async function createMp3Resource(mp3PathOrBuffer, directory) {
  const buffer = toNodeAudioBuffer(mp3PathOrBuffer);
  if (buffer) {
    const filePath = join(directory, `speech-${Date.now()}-${Math.random().toString(16).slice(2)}.mp3`);
    await writeFile(filePath, buffer);
    return createAudioResource(filePath, { inlineVolume: true });
  }
  const inputPath = String(mp3PathOrBuffer);
  const oggOpus = /\.ogg$/i.test(inputPath);
  return createAudioResource(inputPath, {
    inlineVolume: true,
    inputType: oggOpus ? StreamType.OggOpus : undefined,
  });
}

async function playClipOnPlayer(player, audio, { volume, idleTimeoutMs, minPlayMs, directory }) {
  const resource = await createMp3Resource(audio, directory);
  resource.volume?.setVolume(Math.max(0, Math.min(2, Number(volume) || 1)));
  player.play(resource);
  await entersState(player, AudioPlayerStatus.Playing, 8_000);
  const started = Date.now();
  try {
    await entersState(player, AudioPlayerStatus.Idle, idleTimeoutMs);
  } catch (error) {
    logger.warn('Voice clip did not go idle; stopping so the next clip can play', error);
    player.stop(true);
    await entersState(player, AudioPlayerStatus.Idle, 2_000).catch(() => {});
  }
  const remaining = Math.max(0, (Number(minPlayMs) || 0) - (Date.now() - started));
  if (remaining) await delay(remaining);
}

/**
 * Join a voice channel and play one or more MP3 files/buffers in order on the same player.
 */
export async function playMp3QueueInVoiceChannel(voiceChannel, adapterCreator, clips, {
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
      const timeout = toNodeAudioBuffer(audio) ? Math.max(idleTimeoutMs, 45_000) : Math.min(idleTimeoutMs, 8_000);
      await playClipOnPlayer(player, audio, {
        volume: clipVolume,
        idleTimeoutMs: timeout,
        minPlayMs: toNodeAudioBuffer(audio) ? 0 : minPlayMs,
        directory,
      });
      if (index < list.length - 1) await delay(120);
    }
  } catch (error) {
    player.stop(true);
    if (leaveAfter) connection.destroy();
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }

  player.stop(true);
  if (leaveAfter) connection.destroy();
  return connection;
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
