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

function waitForPlayerIdle(player, timeoutMs = 60_000) {
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
    const cleanup = () => {
      clearTimeout(timer);
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

function escapeSsml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Free Microsoft Edge TTS — no API key. */
export async function synthesizeSpeechMp3(text, voice = SAY_VOICE, prosody = {}) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = tts.toStream(escapeSsml(String(text || '').trim()), {
    rate: prosody.rate ?? 1,
    pitch: prosody.pitch ?? '+0Hz',
    volume: prosody.volume ?? 100,
  });
  const buffer = await bufferFromReadable(audioStream);
  if (!buffer.length) throw new Error('TTS returned empty audio.');
  return buffer;
}

/**
 * Join (or reuse) a voice channel and play an MP3 file/buffer for everyone.
 * @param {{ leaveAfter?: boolean }} options
 */
export async function playMp3InVoiceChannel(voiceChannel, adapterCreator, mp3PathOrBuffer, {
  leaveAfter = true,
  /** Extra wait after joining so Discord voice is audible before playback. */
  speakDelayMs = 500,
  volume = 1,
} = {}) {
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
      connection.destroy();
      throw new Error(`Could not join the voice channel: ${error?.message || error}`);
    }
  }

  const delay = Math.max(0, Number(speakDelayMs) || 0);
  if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });
  const directory = await mkdtemp(join(tmpdir(), 'cw-vc-say-'));
  const filePath = join(directory, 'speech.mp3');

  try {
    if (Buffer.isBuffer(mp3PathOrBuffer)) {
      await writeFile(filePath, mp3PathOrBuffer);
    }

    const subscription = connection.subscribe(player);
    if (!subscription) {
      throw new Error('Could not subscribe the audio player to the voice connection.');
    }

    const inputPath = Buffer.isBuffer(mp3PathOrBuffer) ? filePath : mp3PathOrBuffer;
    const oggOpus = !Buffer.isBuffer(mp3PathOrBuffer) && /\.ogg$/i.test(String(mp3PathOrBuffer));
    const resource = createAudioResource(createReadStream(inputPath), {
      inlineVolume: true,
      inputType: oggOpus ? StreamType.OggOpus : undefined,
    });
    resource.volume?.setVolume(Math.max(0, Math.min(2, Number(volume) || 1)));

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 8_000);
    await waitForPlayerIdle(player, 90_000);
  } catch (error) {
    player.stop(true);
    if (leaveAfter) connection.destroy();
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }

  if (leaveAfter) connection.destroy();
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
