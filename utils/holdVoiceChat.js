import { createReadStream, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
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
import { FULL_STAFF_PANEL_ROLE_ID } from './staffRanks.js';
import { enqueueGuildVoice } from './vcSpeak.js';
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

function actorFrom(source) {
  return {
    guild: source.guild,
    member: source.member,
    user: source.user || source.author,
    client: source.client,
  };
}

export function resolveHoldVoiceChannel(source, explicitChannel = null) {
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
  const mentioned = source.mentions?.channels?.find?.((channel) => (
    channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice
  ));
  if (mentioned) return mentioned;
  return source.member?.voice?.channel || null;
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

async function mapLimit(items, limit, task) {
  const results = [];
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      try {
        results[current] = { ok: true, value: await task(items[current], current) };
      } catch (error) {
        results[current] = { ok: false, error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Join the voice channel and start the bundled hold clip so everyone hears it.
 * Keeps the connection open afterward (until release/unhold).
 */
async function joinAndStartAnnouncement(voiceChannel, adapterCreator, audioPath) {
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

    player.on('error', (error) => {
      logger.error('Hold VC audio playback error', error);
    });

    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 8_000);
    void waitForPlayerIdle(player, 45_000).catch((error) => {
      logger.warn(`Hold VC audio did not finish cleanly: ${error?.message || error}`);
    });
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
export async function holdVoiceChat(source, config = {}, explicitChannel = null) {
  const { guild, user } = actorFrom(source);
  const voiceChannel = resolveHoldVoiceChannel(source, explicitChannel);
  if (!voiceChannel) {
    throw new Error('Join a voice channel first (or choose one).');
  }

  const me = guild.members.me;
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

  await enqueueGuildVoice(guild.id, () => (
    joinAndStartAnnouncement(voiceChannel, guild.voiceAdapterCreator, HOLD_VC_AUDIO_PATH)
  ));

  const previous = activeHolds.get(guild.id);
  const mutedIds = new Set(previous?.channelId === voiceChannel.id ? previous.mutedIds : []);

  const channel = await guild.channels.fetch(voiceChannel.id).catch(() => voiceChannel);
  const membersToMute = [...channel.members.values()].filter((member) => (
    !member.user.bot && !isOwnershipMember(member, config)
  ));
  const results = await mapLimit(membersToMute, 6, async (member) => {
    if (member.voice.serverMute) return { member, mutedNow: false };
    try {
      await member.voice.setMute(true, `Hold VC by ${user.tag}`);
      return { member, mutedNow: true };
    } catch (error) {
      logger.warn(`Could not server-mute ${member.id} for hold VC: ${error?.message || error}`);
      return { member, mutedNow: false, failed: true };
    }
  });
  let mutedNow = 0;
  for (const result of results) {
    if (!result?.ok || result.value?.failed) continue;
    mutedIds.add(result.value.member.id);
    if (result.value.mutedNow) mutedNow += 1;
  }

  activeHolds.set(guild.id, {
    channelId: voiceChannel.id,
    mutedIds: [...mutedIds],
    heldBy: user.id,
    at: new Date().toISOString(),
  });

  return {
    voiceChannel: channel,
    mutedNow,
    mutedTotal: mutedIds.size,
    voicePlayed: true,
  };
}

function trackMuted(hold, guildId, memberId) {
  if (!hold.mutedIds.includes(memberId)) {
    hold.mutedIds.push(memberId);
    activeHolds.set(guildId, hold);
  }
}

function untrackMuted(hold, guildId, memberId) {
  const next = hold.mutedIds.filter((id) => id !== memberId);
  if (next.length !== hold.mutedIds.length) {
    hold.mutedIds = next;
    activeHolds.set(guildId, hold);
  }
}

async function unmuteAfterLeavingHold(member, newState) {
  if (newState.channelId && newState.serverMute) {
    await newState.setMute(false, 'Left held voice channel');
    return;
  }
  await member.edit({ mute: false, reason: 'Left held voice channel' });
}

/**
 * While a hold is active: server-mute non-Ownership members who join the held
 * channel, and unmute them again when they leave that channel.
 */
export async function handleHoldVoiceStateUpdate(oldState, newState, config = {}) {
  const guild = newState.guild || oldState.guild;
  if (!guild) return;

  const hold = activeHolds.get(guild.id);
  if (!hold) return;

  const member = newState.member || oldState.member;
  if (!member || member.user?.bot) return;

  const wasInHold = oldState.channelId === hold.channelId;
  const isInHold = newState.channelId === hold.channelId;
  if (wasInHold === isInHold) return;

  if (isInHold && !wasInHold) {
    if (isOwnershipMember(member, config)) return;
    if (member.voice?.serverMute) {
      trackMuted(hold, guild.id, member.id);
      return;
    }
    try {
      await member.voice.setMute(true, 'Joined voice channel while Hold VC is active');
      trackMuted(hold, guild.id, member.id);
    } catch (error) {
      logger.warn(`Could not server-mute ${member.id} joining hold VC: ${error?.message || error}`);
    }
    return;
  }

  if (wasInHold && !isInHold) {
    if (!hold.mutedIds.includes(member.id)) return;
    try {
      await unmuteAfterLeavingHold(member, newState);
      untrackMuted(hold, guild.id, member.id);
    } catch (error) {
      logger.warn(`Could not unmute ${member.id} leaving hold VC: ${error?.message || error}`);
    }
  }
}

/** Undo a hold: unmute members this bot muted, then leave the voice channel. */
export async function releaseVoiceChat(source) {
  const { guild, user } = actorFrom(source);
  const hold = activeHolds.get(guild.id);
  if (!hold) throw new Error('No active hold VC in this server.');

  const voiceChannel = guild.channels.cache.get(hold.channelId)
    || await guild.channels.fetch(hold.channelId).catch(() => null);

  const results = await mapLimit(hold.mutedIds, 6, async (userId) => {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member?.voice?.channel) return false;
    if (!member.voice.serverMute) return false;
    try {
      await member.voice.setMute(false, `Hold VC released by ${user.tag}`);
      return true;
    } catch (error) {
      logger.warn(`Could not unmute ${userId} after hold VC: ${error?.message || error}`);
      return false;
    }
  });
  const unmuted = results.filter((result) => result?.ok && result.value === true).length;

  activeHolds.delete(guild.id);
  await enqueueGuildVoice(guild.id, async () => {
    getVoiceConnection(guild.id)?.destroy();
  });

  return { voiceChannel, unmuted };
}
