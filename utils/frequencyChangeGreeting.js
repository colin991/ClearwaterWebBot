import { AuditLogEvent, ChannelType, PermissionFlagsBits } from 'discord.js';
import { getVoiceConnection } from '@discordjs/voice';
import { wasMovedByBot } from './botVoiceMoves.js';
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

/**
 * Other bots that drag members into Frequency Change VCs.
 * When they move the first human in, we must not join/speak.
 */
export const FREQUENCY_CHANGE_SKIP_DRAG_BOT_IDS = Object.freeze([
  '1514096313547886673',
]);

/**
 * If this bot is in (or joins) a Frequency Change VC, our greeting bot must leave
 * and stay silent — do not join just to talk, and abort any in-flight TTS.
 */
export const FREQUENCY_CHANGE_SILENCE_BOT_IDS = Object.freeze([
  '1514096313547886673',
]);

/** channelId -> in-flight announcement promise */
const announcingByChannel = new Map();

/** channelId -> cancel flag for in-flight / queued greeting */
const cancelByChannel = new Map();

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

function isSilenceBotId(userId) {
  return FREQUENCY_CHANGE_SILENCE_BOT_IDS.includes(String(userId || ''));
}

function channelHasSilenceBot(channel) {
  if (!channel?.members) return false;
  return [...channel.members.values()].some((member) => isSilenceBotId(member.id));
}

function leaveFrequencyChangeIfConnected(guildId, channelId) {
  const connection = getVoiceConnection(String(guildId));
  if (!connection) return false;
  if (String(connection.joinConfig?.channelId) !== String(channelId)) return false;
  try {
    connection.destroy();
  } catch {
    // already destroyed
  }
  return true;
}

/**
 * Abort any greeting for this Frequency Change channel and leave if we joined.
 */
export function abortFrequencyChangeGreeting(channel, reason = 'silence_bot') {
  if (!channel?.id) return { ok: false, reason: 'no_channel' };
  cancelByChannel.set(channel.id, true);
  const left = leaveFrequencyChangeIfConnected(channel.guild?.id || channel.guildId, channel.id);
  logger.info(
    `Frequency change greeting aborted for #${channel.name || channel.id}`
    + ` (${reason}${left ? '; left VC' : ''}).`,
  );
  return { ok: true, reason, left };
}

function isGreetingCancelled(channelId) {
  return cancelByChannel.get(String(channelId)) === true;
}

function clearGreetingCancel(channelId) {
  cancelByChannel.delete(String(channelId));
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
  if (isGreetingCancelled(channel.id) || channelHasSilenceBot(channel)) {
    abortFrequencyChangeGreeting(channel, 'silence_bot_present');
    return { ok: false, reason: 'silence_bot' };
  }

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

  if (isGreetingCancelled(channel.id) || channelHasSilenceBot(channel)) {
    abortFrequencyChangeGreeting(channel, 'silence_bot_present');
    return { ok: false, reason: 'silence_bot' };
  }

  const mp3 = await synthesizeSpeechMp3(FREQUENCY_CHANGE_GREETING);

  if (isGreetingCancelled(channel.id) || channelHasSilenceBot(channel)) {
    abortFrequencyChangeGreeting(channel, 'silence_bot_present');
    return { ok: false, reason: 'silence_bot' };
  }

  const playResult = await playMp3InVoiceChannel(channel, channel.guild.voiceAdapterCreator, mp3, {
    leaveAfter: true,
    speakDelayMs: FREQUENCY_CHANGE_SPEAK_DELAY_MS,
    shouldAbort: () => isGreetingCancelled(channel.id) || channelHasSilenceBot(channel),
  });

  if (playResult?.ok === false && playResult.reason === 'aborted') {
    abortFrequencyChangeGreeting(channel, 'silence_bot_aborted');
    return { ok: false, reason: 'silence_bot' };
  }

  logger.info(
    `Frequency change greeting played in #${channel.name} (${channel.id}) `
    + `for ${humans[0]?.user?.tag || humans[0]?.id}.`,
  );
  return { ok: true };
}

/**
 * When silence bot 1514096313547886673 joins a Frequency Change VC, leave immediately
 * and do not talk (cancel any queued/in-flight greeting for that channel).
 */
function handleSilenceBotJoinedFrequencyChange(oldState, newState) {
  const joinedId = newState?.channelId;
  const leftId = oldState?.channelId;
  if (!joinedId || joinedId === leftId) return null;

  const memberId = newState.id || newState.member?.id;
  if (!isSilenceBotId(memberId)) return null;

  const channel = newState.channel
    || newState.guild?.channels?.cache?.get(joinedId);
  if (!isFrequencyChangeChannel(channel)) return null;

  return abortFrequencyChangeGreeting(channel, 'silence_bot_joined');
}

/**
 * When the first human joins a Frequency Change VC on their own, join → wait 2s → speak → leave.
 * Bot-dragged joins (including bot 1514096313547886673) do not trigger the greeting.
 * If that bot is already in the channel (or joins while we are joining/speaking), leave and stay silent.
 * Later joiners while the channel is occupied also do not re-trigger.
 */
export async function handleFrequencyChangeVoiceStateUpdate(oldState, newState) {
  const silenceAbort = handleSilenceBotJoinedFrequencyChange(oldState, newState);
  if (silenceAbort) return silenceAbort;

  const joinedId = newState?.channelId;
  const leftId = oldState?.channelId;
  if (!joinedId || joinedId === leftId) return null;
  if (newState.member?.user?.bot) return null;

  const channel = newState.channel
    || newState.guild?.channels?.cache?.get(joinedId)
    || await newState.client.channels.fetch(joinedId).catch(() => null);
  if (!isFrequencyChangeChannel(channel)) return null;

  // Other bot already in this Frequency Change — do not join or talk.
  if (channelHasSilenceBot(channel)) {
    logger.info(
      `Frequency change greeting skipped for #${channel.name}: `
      + `silence bot already present.`,
    );
    return { ok: false, reason: 'silence_bot' };
  }

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

  clearGreetingCancel(channel.id);

  const job = enqueueGuildJob(channel.guild.id, async () => {
    try {
      if (isGreetingCancelled(channel.id) || channelHasSilenceBot(channel)) {
        abortFrequencyChangeGreeting(channel, 'silence_bot_present');
        return { ok: false, reason: 'silence_bot' };
      }
      // Re-check in case a bot drag audit entry landed while we were queued.
      if (await wasDraggedInByBot(channel.guild, userId, { waitForAuditMs: 400 })) {
        logger.info(
          `Frequency change greeting skipped for #${channel.name}: bot drag detected before speak.`,
        );
        return { ok: false, reason: 'bot_dragged' };
      }
      return await announceFrequencyChange(channel);
    } catch (error) {
      logger.error(`Frequency change greeting failed in #${channel.name}`, error);
      return { ok: false, reason: 'error', error: error?.message || String(error) };
    } finally {
      announcingByChannel.delete(channel.id);
      clearGreetingCancel(channel.id);
    }
  });
  announcingByChannel.set(channel.id, job);
  return job;
}

export function startFrequencyChangeGreeting(client) {
  logger.info(
    'Frequency change greeting armed '
    + `(channels matching ${FREQUENCY_CHANGE_NAME_PATTERN}; `
    + `${FREQUENCY_CHANGE_SPEAK_DELAY_MS / 1000}s speak delay; `
    + `skip bot-dragged joins incl. ${FREQUENCY_CHANGE_SKIP_DRAG_BOT_IDS.join(', ')}; `
    + `leave+mute when silence bots join: ${FREQUENCY_CHANGE_SILENCE_BOT_IDS.join(', ')}; `
    + 'leave after TTS).',
  );
  return () => {
    announcingByChannel.clear();
    cancelByChannel.clear();
    guildQueues.clear();
  };
}
