import { AuditLogEvent, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { wasMovedByBot } from './botVoiceMoves.js';
import { DISPATCH_VOICE_CHANNEL_ID } from './dispatchChannelStatus.js';
import {
  pauseDispatchRadioMonitor,
  resumeDispatchRadioMonitor,
} from './dispatchRadioTalkMonitor.js';
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

/**
 * After the first human joins, wait this long then re-scan the VC.
 * If Operations is present, do not join/speak.
 */
export const FREQUENCY_CHANGE_OPERATIONS_SCAN_MS = 5_000;

/** Match usernames / nicknames like "Operations", "Pinellas Operations", etc. */
export const FREQUENCY_CHANGE_OPERATIONS_NAME_PATTERN = /operations/i;

/** Channel names like "Frequency Change 1", "frequency change 2", etc. */
export const FREQUENCY_CHANGE_NAME_PATTERN = /frequency\s*change/i;

/**
 * Other bots that drag members into Frequency Change VCs.
 * When they move the first human in, we must not join/speak.
 */
export const FREQUENCY_CHANGE_SKIP_DRAG_BOT_IDS = Object.freeze([
  '1514096313547886673',
]);

/** channelId -> in-flight announcement promise */
const announcingByChannel = new Map();

/** guildId -> serial queue so the bot only uses one VC at a time */
const guildQueues = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

/**
 * True when a member named Operations (not this bot) is already in the VC.
 */
export function channelHasOperationsMember(channel) {
  if (!channel?.members) return false;
  const selfId = String(channel.client?.user?.id || channel.guild?.members?.me?.id || '');
  for (const member of channel.members.values()) {
    if (selfId && String(member.id) === selfId) continue;
    const names = [
      member.user?.username,
      member.user?.globalName,
      member.nickname,
      member.displayName,
    ].filter(Boolean);
    if (names.some((name) => FREQUENCY_CHANGE_OPERATIONS_NAME_PATTERN.test(String(name)))) {
      return true;
    }
  }
  return false;
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

function isSkipDragBotId(executorId) {
  return FREQUENCY_CHANGE_SKIP_DRAG_BOT_IDS.includes(String(executorId || ''));
}

/**
 * True when this member was dragged into the VC by a bot (ours or another),
 * not when they joined/switched channels themselves.
 */
async function wasDraggedInByBot(guild, userId, { waitForAuditMs = 0 } = {}) {
  if (wasMovedByBot(userId)) return true;

  if (waitForAuditMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitForAuditMs));
  }

  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberMove,
      limit: 15,
    });
    const cutoff = Date.now() - 15_000;
    for (const entry of logs.entries.values()) {
      if (entry.createdTimestamp < cutoff) continue;
      const targetId = entry.targetId || entry.target?.id;
      if (String(targetId) !== String(userId)) continue;

      const executorId = String(entry.executorId || entry.executor?.id || '');
      // Explicit proximity / zone bots (executor User may be uncached).
      if (isSkipDragBotId(executorId)) return true;
      if (entry.executor?.bot) return true;

      // Executor object may be missing from cache — fetch when needed.
      if (executorId && !entry.executor) {
        const user = await guild.client.users.fetch(executorId).catch(() => null);
        if (user?.bot || isSkipDragBotId(executorId)) return true;
      }
    }
  } catch (error) {
    // Missing View Audit Log — still honor our own drag marks above.
    logger.warn(
      `Frequency change: could not check Member Move audit log: ${error?.message || error}`,
    );
  }
  return false;
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
  const existingChannelId = existing?.joinConfig?.channelId;
  const leavingRadioForFc = Boolean(
    existing
    && existingChannelId
    && existingChannelId !== channel.id
    && existingChannelId === DISPATCH_VOICE_CHANNEL_ID,
  );

  if (existing && existingChannelId !== channel.id && !leavingRadioForFc) {
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

  if (channelHasOperationsMember(channel)) {
    logger.info(
      `Frequency change greeting skipped for #${channel.name}: Operations is in the channel.`,
    );
    return { ok: false, reason: 'operations_present' };
  }

  // Radio talk logging sits in dispatch VC — leaving briefly for FC TTS is fine.
  if (leavingRadioForFc) {
    pauseDispatchRadioMonitor('frequency_change_greeting');
    logger.info(
      `Frequency change greeting: leaving dispatch radio VC ${DISPATCH_VOICE_CHANNEL_ID} `
      + `to speak in #${channel.name}.`,
    );
  }

  try {
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
  } finally {
    if (leavingRadioForFc) {
      resumeDispatchRadioMonitor('frequency_change_done');
    }
  }
}

/**
 * When the first human joins a Frequency Change VC on their own, wait 5s, scan for
 * Operations, then join → wait 2s → speak → leave (unless Operations is present).
 * Bot-dragged joins (including bot 1514096313547886673) do not trigger the greeting.
 * Later joiners while the channel is occupied also do not re-trigger.
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

  const userId = newState.id || newState.member?.id;
  // Wait briefly so other-bot Member Move audit entries are queryable.
  if (await wasDraggedInByBot(newState.guild, userId, { waitForAuditMs: 900 })) {
    logger.info(
      `Frequency change greeting skipped for #${channel.name}: `
      + `${newState.member?.user?.tag || userId} was dragged in by a bot.`,
    );
    return { ok: false, reason: 'bot_dragged' };
  }

  const job = enqueueGuildJob(channel.guild.id, async () => {
    try {
      // Re-check in case a bot drag audit entry landed while we were queued.
      if (await wasDraggedInByBot(channel.guild, userId, { waitForAuditMs: 400 })) {
        logger.info(
          `Frequency change greeting skipped for #${channel.name}: bot drag detected before speak.`,
        );
        return { ok: false, reason: 'bot_dragged' };
      }

      // Give Operations time to land in the VC before we decide to join.
      await sleep(FREQUENCY_CHANGE_OPERATIONS_SCAN_MS);

      const liveChannel = channel.guild.channels.cache.get(channel.id)
        || await channel.guild.channels.fetch(channel.id).catch(() => channel);
      if (!isFrequencyChangeChannel(liveChannel)) {
        return { ok: false, reason: 'channel_gone' };
      }
      if (humanMembersInChannel(liveChannel).length === 0) {
        return { ok: false, reason: 'channel_empty' };
      }
      if (channelHasOperationsMember(liveChannel)) {
        logger.info(
          `Frequency change greeting skipped for #${liveChannel.name}: `
          + `Operations present after ${FREQUENCY_CHANGE_OPERATIONS_SCAN_MS / 1000}s scan.`,
        );
        return { ok: false, reason: 'operations_present' };
      }

      return await announceFrequencyChange(liveChannel);
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
    + `${FREQUENCY_CHANGE_OPERATIONS_SCAN_MS / 1000}s Operations scan; `
    + `${FREQUENCY_CHANGE_SPEAK_DELAY_MS / 1000}s speak delay; `
    + `skip bot-dragged joins incl. ${FREQUENCY_CHANGE_SKIP_DRAG_BOT_IDS.join(', ')}; leave after TTS).`,
  );
  return () => {
    announcingByChannel.clear();
    guildQueues.clear();
  };
}
