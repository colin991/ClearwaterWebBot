import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PermissionFlagsBits } from 'discord.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, '..', 'data', 'notice-channel-state.json');

export const NOTICE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

const emptyState = () => ({
  version: 1,
  noticeMessageId: '',
  punishedCount: 0,
  punishedUserIds: [],
});

function noticeContent(punishedCount = 0) {
  const count = Math.max(0, Number(punishedCount) || 0);
  const peopleLabel = count === 1 ? '1 person was' : `${count} people were`;
  return [
    '# :pin: Notice',
    '> Sending messages here will result in a 7 day timeout. Please refrain from sending any kind of messages here. Thanks!',
    `> -# ${peopleLabel} punished`,
    '',
    'You can verify in #verification',
  ].join('\n');
}

function isNoticeBody(content = '') {
  const text = String(content || '');
  return text.includes('# :pin: Notice') || text.includes('# 📌 Notice') || text.includes('Sending messages here will result in a 7 day timeout');
}

async function readState() {
  const data = await readJsonFile(STATE_PATH, emptyState());
  const punishedUserIds = Array.isArray(data?.punishedUserIds)
    ? [...new Set(data.punishedUserIds.map(String).filter(Boolean))]
    : [];
  const punishedCount = Math.max(
    Number.parseInt(data?.punishedCount, 10) || 0,
    punishedUserIds.length,
  );
  return {
    version: 1,
    noticeMessageId: String(data?.noticeMessageId || ''),
    punishedCount,
    punishedUserIds,
  };
}

async function writeState(state) {
  await writeJsonFile(STATE_PATH, {
    version: 1,
    noticeMessageId: String(state.noticeMessageId || ''),
    punishedCount: Math.max(0, Number(state.punishedCount) || 0),
    punishedUserIds: Array.isArray(state.punishedUserIds)
      ? [...new Set(state.punishedUserIds.map(String).filter(Boolean))]
      : [],
  });
}

function noticeChannelId(client) {
  return String(client?.config?.noticeChannelId || '').trim();
}

async function resolveNoticeChannel(client) {
  const channelId = noticeChannelId(client);
  if (!channelId) return null;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || channel.isDMBased?.()) return null;
  return channel;
}

async function pinNotice(message) {
  if (!message?.pin || message.pinned) return;
  await message.pin().catch((error) => {
    logger.warn(`Could not pin notice channel message: ${error?.message || error}`);
  });
}

async function syncNoticeMessage(channel, state, { forceNew = false } = {}) {
  const content = noticeContent(state.punishedCount);
  if (!forceNew && state.noticeMessageId) {
    const existing = await channel.messages.fetch(state.noticeMessageId).catch(() => null);
    if (existing) {
      if (existing.content !== content) {
        await existing.edit({ content, allowedMentions: { parse: [] } }).catch((error) => {
          logger.warn(`Could not edit notice channel message: ${error?.message || error}`);
        });
      }
      await pinNotice(existing);
      return existing;
    }
  }

  const posted = await channel.send({ content, allowedMentions: { parse: [] } });
  state.noticeMessageId = posted.id;
  await writeState(state);
  await pinNotice(posted);
  return posted;
}

async function purgeOtherMessages(channel, noticeMessageId) {
  if (!channel?.messages?.fetch) return;
  let sweeps = 0;
  while (sweeps < 10) {
    sweeps += 1;
    const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
    if (!batch?.size) break;
    const removable = [...batch.values()].filter((message) => message.id !== noticeMessageId);
    if (!removable.length) break;
    for (const message of removable) {
      await message.delete().catch(() => {});
    }
    if (batch.size < 100) break;
  }
}

export async function ensureNoticeChannel(client) {
  const channel = await resolveNoticeChannel(client);
  if (!channel) return;

  const me = channel.guild?.members?.me;
  if (me && !channel.permissionsFor(me)?.has(PermissionFlagsBits.ManageMessages)) {
    logger.warn(`Missing Manage Messages in notice channel ${channel.id}.`);
  }

  const state = await readState();
  const notice = await syncNoticeMessage(channel, state);
  await purgeOtherMessages(channel, notice.id);
  logger.info(`Notice channel ready in #${channel.name || channel.id} (kept message ${notice.id}).`);
}

async function punishMember(message, client) {
  const member = message.member
    || await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member || member.user.bot) return false;
  if (!member.moderatable) {
    logger.warn(`Could not timeout ${member.user.tag} in notice channel (not moderatable).`);
    return false;
  }
  await member.timeout(
    NOTICE_TIMEOUT_MS,
    'Posted in the no-message notice channel',
  );
  return true;
}

/**
 * @returns {Promise<boolean>} true when the message was handled by the notice channel.
 */
export async function handleNoticeChannelMessage(message, client) {
  const channelId = noticeChannelId(client);
  if (!channelId || message.channelId !== channelId) return false;
  if (!message.inGuild()) return true;

  const state = await readState();

  // Keep (and adopt) the pinned notice message — including when Ownership or the bot posts it.
  if (
    message.id === state.noticeMessageId
    || (message.author.id === client.user.id && isNoticeBody(message.content))
  ) {
    if (message.id !== state.noticeMessageId) {
      state.noticeMessageId = message.id;
      await writeState(state);
    }
    return true;
  }

  await message.delete().catch(() => {});

  if (message.author.bot) return true;

  let timedOut = false;
  try {
    timedOut = await punishMember(message, client);
  } catch (error) {
    logger.warn(`Notice channel timeout failed for ${message.author.id}: ${error?.message || error}`);
  }

  const alreadyCounted = state.punishedUserIds.includes(message.author.id);
  if (!alreadyCounted) {
    state.punishedUserIds.push(message.author.id);
    state.punishedCount = state.punishedUserIds.length;
    await writeState(state);

    const channel = message.channel?.isTextBased?.()
      ? message.channel
      : await resolveNoticeChannel(client);
    if (channel) {
      await syncNoticeMessage(channel, state).catch((error) => {
        logger.warn(`Could not refresh notice after punishment: ${error?.message || error}`);
      });
    }
  }

  if (timedOut) {
    logger.info(`Notice channel: timed out ${message.author.tag} (${message.author.id}).`);
  }
  return true;
}
