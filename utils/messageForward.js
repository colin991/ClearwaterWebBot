import { logger } from './logger.js';

/** Channels whose messages are mirrored to the forward destination. */
export const MESSAGE_FORWARD_SOURCE_IDS = Object.freeze([
  '1514667590608486400',
  '1513609542468894877',
]);

/** Destination channel for mirrored messages. */
export const MESSAGE_FORWARD_DESTINATION_ID = '1544901668934525020';

function sourceChannelIds(config = {}) {
  const fromEnv = String(config.messageForwardSourceIds || process.env.MESSAGE_FORWARD_SOURCE_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(fromEnv.length ? fromEnv : MESSAGE_FORWARD_SOURCE_IDS);
}

function destinationChannelId(config = {}) {
  return String(
    config.messageForwardDestinationId
    || process.env.MESSAGE_FORWARD_DESTINATION_ID
    || MESSAGE_FORWARD_DESTINATION_ID,
  ).trim();
}

async function fetchForwardChannel(client, channelId) {
  if (!channelId || !client?.isReady?.()) return null;
  const channel = client.channels.cache.get(channelId)
    || await client.channels.fetch(channelId).catch((error) => {
      logger.error(`Message forward channel fetch failed (${channelId})`, error);
      return null;
    });
  if (!channel?.isTextBased?.() || !channel?.send) {
    logger.error(`Message forward destination is not text-based (${channelId})`);
    return null;
  }
  return channel;
}

function buildForwardContent(message) {
  const author = message.member?.displayName || message.author?.globalName || message.author?.username || 'Unknown';
  const source = message.channel ? `<#${message.channel.id}>` : 'unknown channel';
  const jump = message.url ? `[Jump](${message.url})` : '';
  const header = `**${author}** in ${source}${jump ? ` · ${jump}` : ''}`;
  const body = String(message.content || '').trim();
  const stickerNames = [...(message.stickers?.values?.() || [])]
    .map((sticker) => sticker.name)
    .filter(Boolean);
  const stickerLine = stickerNames.length
    ? `_Sticker${stickerNames.length === 1 ? '' : 's'}: ${stickerNames.join(', ')}_`
    : '';

  return [header, body, stickerLine].filter(Boolean).join('\n').slice(0, 2000);
}

/**
 * If the message was posted in a configured source channel, mirror it to the destination.
 * Returns true when a forward was attempted (or skipped as not applicable without error).
 */
export async function handleMessageForward(message, client) {
  if (!message?.inGuild?.() || !message.channelId) return false;

  const config = client?.config || {};
  const sources = sourceChannelIds(config);
  const destinationId = destinationChannelId(config);

  if (!sources.has(String(message.channelId))) return false;
  if (!destinationId || String(message.channelId) === destinationId) return false;
  if (message.author?.id && message.author.id === client.user?.id) return false;

  const hasContent = Boolean(String(message.content || '').trim());
  const attachments = [...(message.attachments?.values?.() || [])];
  const stickers = [...(message.stickers?.values?.() || [])];
  if (!hasContent && !attachments.length && !stickers.length) return false;

  const destination = await fetchForwardChannel(client, destinationId);
  if (!destination) return false;

  const files = attachments.slice(0, 10).map((attachment) => ({
    attachment: attachment.url,
    name: attachment.name || 'attachment',
  }));

  await destination.send({
    content: buildForwardContent(message),
    files: files.length ? files : undefined,
    allowedMentions: { parse: [] },
  });

  return true;
}
