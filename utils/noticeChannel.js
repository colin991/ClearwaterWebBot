import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, '..', 'data', 'notice-channel-state.json');

export const NOTICE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

const emptyState = () => ({
  version: 1,
  noticeMessageId: '',
  punishedCount: 0,
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
  return text.includes('# :pin: Notice')
    || text.includes('# 📌 Notice')
    || text.includes('Sending messages here will result in a 7 day timeout');
}

async function readState() {
  const data = await readJsonFile(STATE_PATH, emptyState());
  return {
    version: 1,
    noticeMessageId: String(data?.noticeMessageId || ''),
    punishedCount: Math.max(0, Number.parseInt(data?.punishedCount, 10) || 0),
  };
}

async function writeState(state) {
  await writeJsonFile(STATE_PATH, {
    version: 1,
    noticeMessageId: String(state.noticeMessageId || ''),
    punishedCount: Math.max(0, Number(state.punishedCount) || 0),
  });
}

export function noticeChannelId(client) {
  return String(client?.config?.noticeChannelId || '').trim();
}

async function resolveNoticeChannel(client) {
  const channelId = noticeChannelId(client);
  if (!channelId) {
    logger.warn('Notice channel id is not configured.');
    return null;
  }

  let channel = client.channels.cache.get(channelId) || null;
  if (!channel) {
    try {
      channel = await client.channels.fetch(channelId);
    } catch (error) {
      logger.error(`Could not fetch notice channel ${channelId}`, error);
      return null;
    }
  }

  if (!channel) {
    logger.warn(`Notice channel ${channelId} was not found.`);
    return null;
  }

  if (channel.type === ChannelType.DM || channel.type === ChannelType.GroupDM) {
    logger.warn(`Notice channel ${channelId} is a DM and cannot be used.`);
    return null;
  }

  if (typeof channel.isTextBased === 'function' && !channel.isTextBased()) {
    logger.warn(`Notice channel ${channelId} is not a text channel.`);
    return null;
  }

  if (typeof channel.send !== 'function') {
    logger.warn(`Notice channel ${channelId} does not support sending messages.`);
    return null;
  }

  return channel;
}

function botCanSend(channel) {
  const me = channel.guild?.members?.me;
  if (!me) return { ok: true, missing: [] };
  const permissions = channel.permissionsFor(me);
  if (!permissions) return { ok: true, missing: [] };
  const needed = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageMessages,
  ];
  const missing = needed.filter((flag) => !permissions.has(flag));
  return { ok: missing.length === 0, missing, permissions };
}

async function pinNotice(message) {
  if (!message?.pin || message.pinned) return;
  await message.pin().catch((error) => {
    logger.warn(`Could not pin notice channel message: ${error?.message || error}`);
  });
}

async function postNotice(channel, state) {
  const content = noticeContent(state.punishedCount);
  const posted = await channel.send({ content, allowedMentions: { parse: [] } });
  state.noticeMessageId = posted.id;
  await writeState(state);
  await pinNotice(posted);
  return posted;
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

  return postNotice(channel, state);
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

export async function ensureNoticeChannel(client, { forceNew = false } = {}) {
  const channelId = noticeChannelId(client);
  logger.info(`Preparing notice channel (${channelId || 'missing-id'})...`);

  const channel = await resolveNoticeChannel(client);
  if (!channel) {
    throw new Error(`Notice channel could not be resolved (${channelId || 'missing-id'}).`);
  }

  const access = botCanSend(channel);
  if (!access.ok) {
    logger.warn(`Notice channel is missing permissions: ViewChannel/SendMessages/ManageMessages in ${channel.id}`);
  }
  if (access.permissions && !access.permissions.has(PermissionFlagsBits.SendMessages)) {
    throw new Error(`Bot cannot Send Messages in notice channel ${channel.id}.`);
  }

  const state = await readState();
  const notice = await syncNoticeMessage(channel, state, { forceNew });
  await purgeOtherMessages(channel, notice.id);
  logger.info(`Notice channel ready in #${channel.name || channel.id} (message ${notice.id}, count ${state.punishedCount}).`);
  return notice;
}

async function punishMember(message) {
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

  // Keep (and adopt) the bot notice message so it is never auto-deleted.
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

  // System / other bot chatter: delete only, do not bump the punishment count.
  if (message.author.bot) return true;

  let timedOut = false;
  try {
    timedOut = await punishMember(message);
  } catch (error) {
    logger.warn(`Notice channel timeout failed for ${message.author.id}: ${error?.message || error}`);
  }

  state.punishedCount += 1;
  await writeState(state);

  const channel = message.channel?.isTextBased?.()
    ? message.channel
    : await resolveNoticeChannel(client);
  if (channel) {
    await syncNoticeMessage(channel, state).catch((error) => {
      logger.warn(`Could not refresh notice after punishment: ${error?.message || error}`);
    });
  }

  if (timedOut) {
    logger.info(`Notice channel: timed out ${message.author.tag} (${message.author.id}). Count=${state.punishedCount}`);
  }
  return true;
}

/**
 * If someone deletes the notice, post it again with the same count.
 */
export async function handleNoticeChannelMessageDelete(message, client) {
  const channelId = noticeChannelId(client);
  if (!channelId) return;

  const eventChannelId = message.channelId || message.channel?.id;
  if (eventChannelId !== channelId) return;

  const state = await readState();
  if (!state.noticeMessageId || message.id !== state.noticeMessageId) return;

  state.noticeMessageId = '';
  await writeState(state);

  const channel = message.channel?.isTextBased?.()
    ? message.channel
    : await resolveNoticeChannel(client);
  if (!channel) return;

  const restored = await syncNoticeMessage(channel, state, { forceNew: true });
  logger.info(`Notice channel message was removed; re-sent as ${restored.id}.`);
}
