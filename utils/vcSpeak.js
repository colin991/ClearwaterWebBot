import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

export const SAY_VOICE = 'en-US-GuyNeural';
export const SAY_MAX_CHARS = 500;

function waitForPlayerIdle(player, timeoutMs = 60_000, shouldAbort = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);
    const onIdle = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(error);
    };
    const poll = setInterval(() => {
      if (typeof shouldAbort !== 'function' || !shouldAbort()) return;
      cleanup();
      try {
        player.stop(true);
      } catch {
        // ignore
      }
      resolve();
    }, 250);
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(poll);
      player.off(AudioPlayerStatus.Idle, onIdle);
      player.off('error', onError);
    };
    player.once(AudioPlayerStatus.Idle, onIdle);
    player.once('error', onError);
  });
}

async function bufferFromReadable(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Free Microsoft Edge TTS — no API key. */
export async function synthesizeSpeechMp3(text, voice = SAY_VOICE) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(String(text || '').trim());
  const buffer = await bufferFromReadable(audioStream);
  if (!buffer.length) throw new Error('TTS returned empty audio.');
  return buffer;
}

function safeDestroyConnection(connection) {
  if (!connection) return;
  try {
    connection.destroy();
  } catch {
    // already destroyed
  }
}

/**
 * Join (or reuse) a voice channel and play an MP3 file/buffer for everyone.
 * @param {{ leaveAfter?: boolean, speakDelayMs?: number, shouldAbort?: () => boolean }} options
 * @returns {Promise<import('@discordjs/voice').VoiceConnection | { ok: false, reason: string }>}
 */
export async function playMp3InVoiceChannel(voiceChannel, adapterCreator, mp3PathOrBuffer, {
  leaveAfter = true,
  /** Extra wait after joining so Discord voice is audible before playback. */
  speakDelayMs = 500,
  /** When true mid-join/playback, leave without speaking (or stop speaking). */
  shouldAbort = null,
} = {}) {
  const aborted = () => typeof shouldAbort === 'function' && shouldAbort();
  if (aborted()) {
    const existing = getVoiceConnection(voiceChannel.guild.id);
    if (leaveAfter && existing?.joinConfig?.channelId === voiceChannel.id) {
      safeDestroyConnection(existing);
    }
    return { ok: false, reason: 'aborted' };
  }

  const existing = getVoiceConnection(voiceChannel.guild.id);
  const sameChannel = existing?.joinConfig?.channelId === voiceChannel.id;
  let connection = sameChannel ? existing : null;

  if (!connection) {
    existing?.destroy();
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
    connection.on('error', (error) => {
      logger.error('Voice connection error', error);
    });
    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      safeDestroyConnection(connection);
      throw new Error(`Could not join the voice channel: ${error?.message || error}`);
    }
    const delay = Math.max(0, Number(speakDelayMs) || 0);
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    if (aborted()) {
      if (leaveAfter) safeDestroyConnection(connection);
      return { ok: false, reason: 'aborted' };
    }
  }

  if (aborted()) {
    if (leaveAfter) safeDestroyConnection(connection);
    return { ok: false, reason: 'aborted' };
  }

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  const directory = await mkdtemp(join(tmpdir(), 'cw-vc-say-'));
  const filePath = join(directory, 'speech.mp3');

  try {
    if (Buffer.isBuffer(mp3PathOrBuffer)) {
      await writeFile(filePath, mp3PathOrBuffer);
    }

    if (aborted()) {
      if (leaveAfter) safeDestroyConnection(connection);
      return { ok: false, reason: 'aborted' };
    }

    const subscription = connection.subscribe(player);
    if (!subscription) {
      throw new Error('Could not subscribe the audio player to the voice connection.');
    }

    const inputPath = Buffer.isBuffer(mp3PathOrBuffer) ? filePath : mp3PathOrBuffer;
    const resource = createAudioResource(createReadStream(inputPath), {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });
    resource.volume?.setVolume(1);

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 8_000);
    await waitForPlayerIdle(player, 90_000, shouldAbort);
    if (aborted()) {
      try {
        player.stop(true);
      } catch {
        // ignore
      }
      if (leaveAfter) safeDestroyConnection(connection);
      return { ok: false, reason: 'aborted' };
    }
  } catch (error) {
    player.stop(true);
    if (leaveAfter) safeDestroyConnection(connection);
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }

  if (leaveAfter) safeDestroyConnection(connection);
  return connection;
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
