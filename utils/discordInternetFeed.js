import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { logger } from './logger.js';

const MAX_ATTACH_BYTES = 8 * 1024 * 1024;
const ANNOUNCEMENT_EMOJI = '<:Announcement:1514458339680059422>';
const ACCENT_LIVE = 0x4e91f9;
const ACCENT_DELETED = 0x6b7280;

function isHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseDataImage(value) {
  const match = String(value || '').replace(/\s+/g, '').match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/]+=*)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_ATTACH_BYTES) return null;
  const mime = match[1].toLowerCase();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
  return { buffer, name: `post.${ext}` };
}

function posterHandle(post) {
  const raw = String(post?.username || post?.displayName || 'user')
    .replace(/[`@]/g, '')
    .trim()
    .slice(0, 80);
  return raw || 'user';
}

function postBodyText(post) {
  const body = String(post?.content || '').trim().slice(0, 1800);
  if (body) return body;
  if (post?.kind === 'reel') return '_Posted a Reel_';
  if (post?.gifUrl) return '_Posted a GIF_';
  if (post?.imageUrl) return '_Posted a photo_';
  if (post?.videoUrl) return '_Posted a video_';
  if (post?.poll?.question) return '_Created a poll_';
  if (post?.location?.label) return '_Dropped a location_';
  if (post?.quoteId) return '_Quoted a post_';
  return '_New post_';
}

function shouldAnnounceInternetPost(post) {
  if (!post?.id || post.parentId) return false;
  // Bare native reposts have no composition of their own.
  if (post.repostOf && !post.quoteId && !String(post.content || '').trim() && !post.imageUrl && !post.gifUrl && !post.videoUrl && !post.poll) {
    return false;
  }
  return true;
}

function buildFeedText(post) {
  const lines = [
    `# ${ANNOUNCEMENT_EMOJI} Clearwater Internet`,
    `**Poster:** @${posterHandle(post)}`,
    postBodyText(post),
  ];
  if (post?.poll?.question) lines.push(`📊 ${String(post.poll.question).slice(0, 180)}`);
  if (post?.location?.label) lines.push(`📍 ${String(post.location.label).slice(0, 120)}`);
  return lines.join('\n').slice(0, 4000);
}

function buildDeletedFeedText(post) {
  return [
    `# ${ANNOUNCEMENT_EMOJI} Clearwater Internet`,
    `**Poster:** @${posterHandle(post)}`,
    '_This post was deleted._',
  ].join('\n').slice(0, 4000);
}

function resolveFeedMessageId(post) {
  const id = String(post?.discordFeedMessageId || '').trim();
  return /^\d{16,22}$/.test(id) ? id : '';
}

function buildLivePayload(post, site) {
  const postUrl = `${site}/internet/post/${encodeURIComponent(post.id)}`;
  const files = [];
  let mediaUrl = '';

  const gifUrl = String(post.gifUrl || '');
  const imageUrl = String(post.imageUrl || '');
  if (gifUrl && isHttpsUrl(gifUrl)) {
    mediaUrl = gifUrl;
  } else if (imageUrl && isHttpsUrl(imageUrl) && !imageUrl.includes('/api/media')) {
    mediaUrl = imageUrl;
  } else {
    const data = parseDataImage(imageUrl);
    if (data) {
      files.push(new AttachmentBuilder(data.buffer, { name: data.name }));
      mediaUrl = `attachment://${data.name}`;
    }
  }

  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_LIVE)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildFeedText(post)));

  if (mediaUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(mediaUrl)),
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('View post')
        .setStyle(ButtonStyle.Link)
        .setURL(postUrl),
    ),
  );

  return {
    components: [container],
    files,
    flags: MessageFlags.IsComponentsV2,
  };
}

function buildDeletedPayload(post) {
  const container = new ContainerBuilder()
    .setAccentColor(ACCENT_DELETED)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildDeletedFeedText(post)));

  return {
    components: [container],
    files: [],
    flags: MessageFlags.IsComponentsV2,
  };
}

async function fetchFeedChannel(client, channelId) {
  if (!channelId || !client?.isReady?.()) return null;
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (error) {
    logger.error(`Internet feed channel fetch failed (${channelId})`, error);
    return null;
  }
  if (!channel?.isTextBased?.()) {
    logger.error(`Internet feed channel is not text-based (${channelId})`);
    return null;
  }
  return channel;
}

/**
 * Discord Components V2 cross-post for Clearwater Internet.
 * announce → returns Discord message id (or null)
 * update → edits live message to match post
 * markDeleted → edits to a deleted notice (falls back to delete)
 */
export function createInternetFeedController(client, config = {}) {
  const channelId = String(config.internetFeedChannelId || '').trim();
  const site = String(config.websiteUrl || 'https://cwrpvc.lol').replace(/\/$/, '');

  async function announce(post) {
    if (!shouldAnnounceInternetPost(post)) return null;
    const channel = await fetchFeedChannel(client, channelId);
    if (!channel) return null;

    try {
      const message = await channel.send(buildLivePayload(post, site));
      return message?.id || null;
    } catch (error) {
      logger.error('Could not post Clearwater Internet feed to Discord', error);
      return null;
    }
  }

  async function update(post) {
    const messageId = resolveFeedMessageId(post);
    if (!messageId || !shouldAnnounceInternetPost(post)) return;
    const channel = await fetchFeedChannel(client, channelId);
    if (!channel?.messages?.edit) return;

    try {
      await channel.messages.edit(messageId, buildLivePayload(post, site));
    } catch (error) {
      logger.error(`Could not update Clearwater Internet feed message ${messageId}`, error);
    }
  }

  async function markDeleted(post) {
    const messageId = resolveFeedMessageId(post);
    if (!messageId) return;
    const channel = await fetchFeedChannel(client, channelId);
    if (!channel?.messages) return;

    try {
      await channel.messages.edit(messageId, buildDeletedPayload(post));
      return;
    } catch (editError) {
      logger.error(`Could not mark Clearwater Internet feed message deleted ${messageId}`, editError);
    }

    try {
      await channel.messages.delete(messageId);
    } catch (deleteError) {
      logger.error(`Could not delete Clearwater Internet feed message ${messageId}`, deleteError);
    }
  }

  return { announce, update, markDeleted };
}

/** @deprecated Prefer createInternetFeedController().announce */
export function createInternetFeedAnnouncer(client, config = {}) {
  return createInternetFeedController(client, config).announce;
}

export function shouldAnnounceInteractResult(body, result) {
  const post = result?.post;
  if (!shouldAnnounceInternetPost(post) || result?.duplicate || 'liked' in (result || {})) return false;
  if (body?.type === 'reply') return false;
  if (body?.type === 'repost') {
    return result?.reposted === true || Boolean(post.quoteId);
  }
  return false;
}
