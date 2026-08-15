import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { FULL_STAFF_PANEL_ROLE_ID } from './staffRanks.js';
import { logger } from './logger.js';

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
      response_format: 'opus',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenAI TTS failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function playHoldAnnouncement(voiceChannel, adapterCreator, audioBuffer) {
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator,
    selfDeaf: false,
    selfMute: false,
  });

  try {
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (error) {
    connection.destroy();
    throw error;
  }

  const directory = await mkdtemp(join(tmpdir(), 'cw-holdvc-'));
  const filePath = join(directory, 'hold.opus');
  try {
    await writeFile(filePath, audioBuffer);
    const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });
    const resource = createAudioResource(filePath);
    connection.subscribe(player);
    player.play(resource);
    await entersState(player, AudioPlayerStatus.Playing, 5_000);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 20_000);
      player.once(AudioPlayerStatus.Idle, () => {
        clearTimeout(timer);
        resolve();
      });
      player.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    player.stop(true);
  } finally {
    const existing = getVoiceConnection(voiceChannel.guild.id);
    existing?.destroy();
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Server-mute everyone in the VC except Ownership, announce the hold phrase,
 * and play OpenAI Onyx TTS in the channel when OPENAI_API_KEY is configured.
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
  if (!voiceChannel.permissionsFor(me)?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.MuteMembers])) {
    throw new Error('I need Connect, Speak, and Mute Members in that voice channel.');
  }

  const previous = activeHolds.get(message.guild.id);
  const mutedIds = new Set(previous?.channelId === voiceChannel.id ? previous.mutedIds : []);

  let mutedNow = 0;
  for (const [, member] of voiceChannel.members) {
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

  let voicePlayed = false;
  let voiceError = null;
  const apiKey = String(config.openAiApiKey || process.env.OPENAI_API_KEY || '').trim();
  if (apiKey) {
    try {
      const audio = await synthesizeOnyxSpeech(apiKey, HOLD_VC_PHRASE);
      await playHoldAnnouncement(voiceChannel, message.guild.voiceAdapterCreator, audio);
      voicePlayed = true;
    } catch (error) {
      voiceError = error?.message || String(error);
      logger.error('Hold VC Onyx announcement failed', error);
    }
  }

  return {
    voiceChannel,
    mutedNow,
    mutedTotal: mutedIds.size,
    voicePlayed,
    voiceError,
    hasApiKey: Boolean(apiKey),
  };
}

/** Undo a hold: unmute members this bot muted for the active hold. */
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
