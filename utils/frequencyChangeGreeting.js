import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { getActiveHold } from './holdVoiceChat.js';
import { logger } from './logger.js';
import { playMp3InVoiceChannel, synthesizeSpeechMp3 } from './vcSpeak.js';

/** Spoken once when the first human joins any Frequency Change voice channel. */
export const FREQUENCY_CHANGE_GREETING = (
  'Hello, welcome to the frequency change. '
  + 'You are only permitted a maximum of 10 minutes in a frequency, '
  + 'briefings of any kind are exempt.'
);

/** Wait after joining so Discord voice audio is actually audible. */
export const FREQUENCY_CHANGE_SPEAK_DELAY_MS = 2_000;

/** Channel names like "Frequency Change 1", "frequency change 2", etc. */
export const FREQUENCY_CHANGE_NAME_PATTERN = /frequency\s*change/i;

/** channelId -> in-flight announcement promise */
const announcingByChannel = new Map();

/** guildId -> serial queue so the bot only uses one VC at a time */
const guildQueues = new Map();

export function isFrequencyChangeChannel(channel) {
  if (!channel) return false;
  if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) {
    return false;
  }
  return FREQUENCY_CHANGE_NAME_PATTERN.test(String(channel.name || ''));
}

function humanMembersInChannel(channel) {
  if (!channel?.members) return [];
  return [...channel.members.values()].filter((member) => !member.user?.bot);
}

function enqueueGuildJob(guildId, job) {
  const key = String(guildId);
  const previous = guildQueues.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(job)
    .finally(() => {
      if (guildQueues.get(key) === next) guildQueues.delete(key);
    });
  guildQueues.set(key, next);
  return next;
}

async function announceFrequencyChange(channel) {
  const me = channel.guild.members.me
    || await channel.guild.members.fetchMe().catch(() => null);
  const perms = channel.permissionsFor(me);
  if (!perms?.has(PermissionFlagsBits.Connect) || !perms?.has(PermissionFlagsBits.Speak)) {
    logger.error(
      `Frequency change greeting: missing Connect/Speak in #${channel.name} (${channel.id}).`,
    );
    return { ok: false, reason: 'missing_permissions' };
  }

  const hold = getActiveHold(channel.guild.id);
  if (hold) {
    logger.info(
      `Frequency change greeting skipped for #${channel.name}: hold VC is active.`,
    );
    return { ok: false, reason: 'hold_active' };
  }

  const existing = getVoiceConnection(channel.guild.id);
  if (existing && existing.joinConfig?.channelId !== channel.id) {
    // Don't yank the bot out of another live session mid-playback.
    logger.info(
      `Frequency change greeting skipped for #${channel.name}: bot already in another VC.`,
    );
    return { ok: false, reason: 'busy_elsewhere' };
  }

  // If everyone already left while we were queued, skip. If more people joined,
  // still greet — the trigger was the first joiner emptying→occupied transition.
  const humans = humanMembersInChannel(channel);
  if (humans.length === 0) {
    return { ok: false, reason: 'channel_empty' };
  }

  const mp3 = await synthesizeSpeechMp3(FREQUENCY_CHANGE_GREETING);
  await playMp3InVoiceChannel(channel, channel.guild.voiceAdapterCreator, mp3, {
    leaveAfter: true,
    speakDelayMs: FREQUENCY_CHANGE_SPEAK_DELAY_MS,
  });

  logger.info(
    `Frequency change greeting played in #${channel.name} (${channel.id}) `
    + `for ${humans[0]?.user?.tag || humans[0]?.id}.`,
  );
  return { ok: true };
}

/**
 * When the first human joins a Frequency Change VC, join → wait 2s → speak → leave.
 * Later joiners while the channel is occupied do not re-trigger the greeting.
 */
export async function handleFrequencyChangeVoiceStateUpdate(oldState, newState) {
  const joinedId = newState?.channelId;
  const leftId = oldState?.channelId;
  if (!joinedId || joinedId === leftId) return null;
  if (newState.member?.user?.bot) return null;

  const channel = newState.channel
    || newState.guild?.channels?.cache?.get(joinedId)
    || await newState.client.channels.fetch(joinedId).catch(() => null);
  if (!isFrequencyChangeChannel(channel)) return null;

  const humans = humanMembersInChannel(channel);
  // First human in the channel (bots ignored) — later joiners must not re-trigger.
  if (humans.length !== 1) return null;
  if (announcingByChannel.has(channel.id)) return null;

  const job = enqueueGuildJob(channel.guild.id, async () => {
    try {
      return await announceFrequencyChange(channel);
    } catch (error) {
      logger.error(`Frequency change greeting failed in #${channel.name}`, error);
      return { ok: false, reason: 'error', error: error?.message || String(error) };
    } finally {
      announcingByChannel.delete(channel.id);
    }
  });
  announcingByChannel.set(channel.id, job);
  return job;
}

export function startFrequencyChangeGreeting(client) {
  logger.info(
    'Frequency change greeting armed '
    + `(channels matching ${FREQUENCY_CHANGE_NAME_PATTERN}; `
    + `${FREQUENCY_CHANGE_SPEAK_DELAY_MS / 1000}s speak delay; leave after TTS).`,
  );
  return () => {
    announcingByChannel.clear();
    guildQueues.clear();
  };
}
