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

export function createInternetFeedAnnouncer(client, config = {}) {
  const channelId = String(config.internetFeedChannelId || '').trim();
  const site = String(config.websiteUrl || 'https://cwrpvc.lol').replace(/\/$/, '');

  return async function announceInternetFeedPost(post) {
    if (!channelId || !client?.isReady?.() || !shouldAnnounceInternetPost(post)) return;

    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (error) {
      logger.error(`Internet feed channel fetch failed (${channelId})`, error);
      return;
    }
    if (!channel?.isTextBased?.()) {
      logger.error(`Internet feed channel is not text-based (${channelId})`);
      return;
    }

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
      .setAccentColor(0x4e91f9)
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

    try {
      await channel.send({
        components: [container],
        files,
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      logger.error('Could not post Clearwater Internet feed to Discord', error);
    }
  };
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
