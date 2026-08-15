import { createReadStream, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { createRequire } from 'node:module';
import { FULL_STAFF_PANEL_ROLE_ID } from './staffRanks.js';
import { logger } from './logger.js';

const require = createRequire(import.meta.url);
try {
  const ffmpegStatic = require('ffmpeg-static');
  if (ffmpegStatic) process.env.FFMPEG_PATH = ffmpegStatic;
} catch {
  // System ffmpeg on PATH is fine.
}

const __dirname = dirname(fileURLToPath(import.meta.url));
export const HOLD_VC_PHRASE = 'Please Hold this voice chat';
export const HOLD_VC_AUDIO_PATH = join(__dirname, '..', 'assets', 'hold-vc.mp3');

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
 * Join the voice channel and play the bundled hold clip so everyone hears it.
 * Keeps the connection open afterward (until release/unhold).
 */
async function joinAndAnnounce(voiceChannel, adapterCreator, audioPath) {
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

  const player = createAudioPlayer({
    behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
  });

  try {
    const subscription = connection.subscribe(player);
    if (!subscription) {
      throw new Error('Could not subscribe the audio player to the voice connection.');
    }

    const resource = createAudioResource(createReadStream(audioPath), {
      inputType: StreamType.Arbitrary,
      inlineVolume: true,
    });
    resource.volume?.setVolume(1);

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 8_000);
    await waitForPlayerIdle(player, 45_000);
    return connection;
  } catch (error) {
    player.stop(true);
    connection.destroy();
    throw error;
  }
}

/**
 * Bot joins the VC, plays the bundled hold announcement for everyone, then
 * server-mutes non-Ownership members. No external TTS API key is required.
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

  if (!existsSync(HOLD_VC_AUDIO_PATH)) {
    throw new Error('Hold VC audio file is missing on the bot host (assets/hold-vc.mp3).');
  }

  await joinAndAnnounce(voiceChannel, message.guild.voiceAdapterCreator, HOLD_VC_AUDIO_PATH);

  const previous = activeHolds.get(message.guild.id);
  const mutedIds = new Set(previous?.channelId === voiceChannel.id ? previous.mutedIds : []);

  let mutedNow = 0;
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
