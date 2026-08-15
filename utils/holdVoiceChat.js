import { createReadStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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
import { FULL_STAFF_PANEL_ROLE_ID } from './staffRanks.js';
import { createRequire } from 'node:module';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) process.env.FFMPEG_PATH = ffmpegStatic;
} catch {
  // System ffmpeg on PATH is fine.
}


export const HOLD_VC_PHRASE = 'Please Hold this voice chat';

/** guildId -> { channelId, mutedIds: string[], heldBy: string, at: string } */
const activeHolds = new Map();

export function getActiveHold(guildId) {
  return activeHolds.get(String(guildId)) || null;
}

function isOwnershipMember(member, config = {}) {
  if (!member) return false;
  const ownerIds = new Set((config.ownerDiscordIds || []).map(String));
  if (ownerIds.has(String(member.id))) return true;
  if (member.roles?.cache?.has(FULL_STAFF_PANEL_ROLE_ID)) return true;
  for (const roleId of config.ownerRoleIds || []) {
    if (roleId && member.roles?.cache?.has(String(roleId))) return true;
  }
  return false;
}

export function resolveHoldVoiceChannel(message) {
  const mentioned = message.mentions.channels.find((channel) => (
    channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice
  ));
  if (mentioned) return mentioned;
  return message.member?.voice?.channel || null;
}

async function synthesizeOnyxSpeech(apiKey, text) {
  const response = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      voice: 'onyx',
      input: text,
      response_format: 'mp3',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI TTS failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function waitForPlayerIdle(player, timeoutMs = 30_000) {
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

/**
 * Join the voice channel and play Onyx MP3 through ffmpeg so everyone in VC hears it.
 * Keeps the connection open afterward (until release/unhold).
 */
async function joinAndAnnounce(voiceChannel, adapterCreator, mp3Buffer) {
  getVoiceConnection(voiceChannel.guild.id)?.destroy();

  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  connection.on('error', (error) => {
    logger.error('Hold VC voice connection error', error);
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
  } catch (error) {
    connection.destroy();
    throw new Error(`Could not join the voice channel: ${error?.message || error}`);
  }

  // Give Discord a moment to finish negotiating audio before we speak.
  await new Promise((resolve) => setTimeout(resolve, 750));

  const directory = await mkdtemp(join(tmpdir(), 'cw-holdvc-'));
  const filePath = join(directory, 'hold.mp3');
  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  try {
    await writeFile(filePath, mp3Buffer);

    const subscription = connection.subscribe(player);
    if (!subscription) {
      throw new Error('Could not subscribe the audio player to the voice connection.');
    }

    // StreamType.Arbitrary forces ffmpeg decode → Discord opus, which is reliable for MP3.
    const resource = createAudioResource(createReadStream(filePath), {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });
    resource.volume?.setVolume(1);

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 8_000);
    await waitForPlayerIdle(player, 45_000);
    // Stay connected so the bot remains visibly in the held VC.
    return connection;
  } catch (error) {
    player.stop(true);
    connection.destroy();
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Bot joins the VC, speaks the hold line with Onyx for everyone, then server-mutes
 * non-Ownership members. Discord text TTS is never used (that only plays locally).
 */
export async function holdVoiceChat(message, config = {}) {
  const voiceChannel = resolveHoldVoiceChannel(message);
  if (!voiceChannel) {
    throw new Error('Join a voice channel first (or mention one).');
  }

  const me = message.guild.members.me;
  if (!me?.permissions?.has(PermissionFlagsBits.MuteMembers)) {
    throw new Error('I need the Mute Members permission.');
  }
  if (!voiceChannel.permissionsFor(me)?.has([
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.MuteMembers,
  ])) {
    throw new Error('I need Connect, Speak, and Mute Members in that voice channel.');
  }

  const apiKey = String(config.openAiApiKey || process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('Set OPENAI_API_KEY on the bot host so I can speak with Onyx in the voice channel.');
  }

  // Speak first while the bot is clearly in channel, then mute everyone else.
  const audio = await synthesizeOnyxSpeech(apiKey, HOLD_VC_PHRASE);
  await joinAndAnnounce(voiceChannel, message.guild.voiceAdapterCreator, audio);

  const previous = activeHolds.get(message.guild.id);
  const mutedIds = new Set(previous?.channelId === voiceChannel.id ? previous.mutedIds : []);

  let mutedNow = 0;
  // Refresh members after join.
  const channel = await message.guild.channels.fetch(voiceChannel.id).catch(() => voiceChannel);
  for (const [, member] of channel.members) {
    if (member.user.bot) continue;
    if (isOwnershipMember(member, config)) continue;
    if (member.voice.serverMute) {
      mutedIds.add(member.id);
      continue;
    }
    try {
      await member.voice.setMute(true, `Hold VC by ${message.author.tag}`);
      mutedIds.add(member.id);
      mutedNow += 1;
    } catch (error) {
      logger.warn(`Could not server-mute ${member.id} for hold VC: ${error?.message || error}`);
    }
  }

  activeHolds.set(message.guild.id, {
    channelId: voiceChannel.id,
    mutedIds: [...mutedIds],
    heldBy: message.author.id,
    at: new Date().toISOString(),
  });

  return {
    voiceChannel: channel,
    mutedNow,
    mutedTotal: mutedIds.size,
    voicePlayed: true,
  };
}

/** Undo a hold: unmute members this bot muted, then leave the voice channel. */
export async function releaseVoiceChat(message) {
  const hold = activeHolds.get(message.guild.id);
  if (!hold) throw new Error('No active hold VC in this server.');

  const voiceChannel = message.guild.channels.cache.get(hold.channelId)
    || await message.guild.channels.fetch(hold.channelId).catch(() => null);

  let unmuted = 0;
  for (const userId of hold.mutedIds) {
    const member = await message.guild.members.fetch(userId).catch(() => null);
    if (!member?.voice?.channel) continue;
    if (!member.voice.serverMute) continue;
    try {
      await member.voice.setMute(false, `Hold VC released by ${message.author.tag}`);
      unmuted += 1;
    } catch (error) {
      logger.warn(`Could not unmute ${userId} after hold VC: ${error?.message || error}`);
    }
  }

  activeHolds.delete(message.guild.id);
  getVoiceConnection(message.guild.id)?.destroy();

  return { voiceChannel, unmuted };
}
