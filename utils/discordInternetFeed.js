import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelFlagsBitField,
  ChannelType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { readInternetStore } from './internetStore.js';
import { logger } from './logger.js';

const MAX_ATTACH_BYTES = 8 * 1024 * 1024;
const INTERNET_EMOJI = '<:globeshield:1533214164955435240>';

export const INTERNET_POST_LIKE_PREFIX = 'cw-internet-like:';
export const INTERNET_POST_COMMENT_PREFIX = 'cw-internet-comment:';
export const INTERNET_POST_PROFILE_PREFIX = 'cw-internet-profile:';
export const INTERNET_POST_DELETE_PREFIX = 'cw-internet-delete:';

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

function shouldAnnounceInternetPost(post) {
  if (!post?.id || post.parentId) return false;
  if (post.repostOf && !post.quoteId && !String(post.content || '').trim() && !post.imageUrl && !post.gifUrl && !post.videoUrl && !post.poll) {
    return false;
  }
  return true;
}

function commentCount(store, postId) {
  return Array.isArray(store?.posts)
    ? store.posts.filter((post) => post.parentId === String(postId)).length
    : 0;
}

function postTimestamp(post) {
  const seconds = Math.floor(new Date(post?.createdAt || Date.now()).getTime() / 1000);
  return Number.isFinite(seconds) ? `<t:${seconds}:R>` : 'just now';
}

function buildFeedText(post, store) {
  const author = /^\d{16,22}$/.test(String(post?.authorId || ''))
    ? `<@${post.authorId}>`
    : `@${posterHandle(post)}`;
  const body = String(post?.content || '').trim() || '_Shared a post._';
  const likes = Array.isArray(post?.likes) ? post.likes.length : 0;
  const comments = commentCount(store, post?.id);
  return [
    `## ${INTERNET_EMOJI} ${author}`,
    body,
    `-# @${posterHandle(post)} • ${postTimestamp(post)} • ${likes} like${likes === 1 ? '' : 's'} • ${comments} comment${comments === 1 ? '' : 's'}`,
  ].join('\n\n').slice(0, 4000);
}

function resolveFeedMessageId(post) {
  const id = String(post?.discordFeedMessageId || '').trim();
  return /^\d{16,22}$/.test(id) ? id : '';
}

function resolveMedia(post) {
  const files = [];
  let mediaUrl = '';
  const gifUrl = String(post?.gifUrl || '');
  const imageUrl = String(post?.imageUrl || '');

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
  return { files, mediaUrl };
}

export function buildInternetPostPayload(post, store = null, { emojis = true, media = true } = {}) {
  const { files, mediaUrl } = media ? resolveMedia(post) : { files: [], mediaUrl: '' };
  const likes = Array.isArray(post?.likes) ? post.likes.length : 0;
  const comments = commentCount(store, post?.id);
  const likeButton = new ButtonBuilder()
    .setCustomId(`${INTERNET_POST_LIKE_PREFIX}${post.id}`)
    .setLabel(`Like${likes ? ` (${likes})` : ''}`)
    .setStyle(ButtonStyle.Secondary);
  const commentButton = new ButtonBuilder()
    .setCustomId(`${INTERNET_POST_COMMENT_PREFIX}${post.id}`)
    .setLabel(`Comment${comments ? ` (${comments})` : ''}`)
    .setStyle(ButtonStyle.Secondary);
  if (emojis) {
    likeButton.setEmoji('❤️');
    commentButton.setEmoji('💬');
  }
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildFeedText(post, store)));

  if (mediaUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(mediaUrl)),
    );
  }

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      likeButton,
      commentButton,
      new ButtonBuilder()
        .setCustomId(`${INTERNET_POST_PROFILE_PREFIX}${post.authorId}`)
        .setLabel('Profile')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${INTERNET_POST_DELETE_PREFIX}${post.id}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger),
    ),
  );

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
  if (files.length) payload.files = files;
  return payload;
}

function buildCommentPayload(comment) {
  const author = /^\d{16,22}$/.test(String(comment?.authorId || ''))
    ? `<@${comment.authorId}>`
    : `@${posterHandle(comment)}`;
  const text = [
    `**${author}**`,
    String(comment?.content || '').trim(),
    `-# ${postTimestamp(comment)}`,
  ].filter(Boolean).join('\n').slice(0, 4000);
  return {
    components: [new ContainerBuilder()
      .clearAccentColor()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function isInternetForumChannel(channel) {
  return channel?.type === ChannelType.GuildForum || channel?.type === ChannelType.GuildMedia;
}

export function requiredInternetForumTags(channel) {
  if (!channel?.flags?.has?.(ChannelFlagsBitField.Flags.RequireTag)) return [];
  return [...new Set((channel.availableTags || []).map((tag) => String(tag?.id || '').trim()).filter(Boolean))].slice(0, 1);
}

async function findThreadByName(channel, name) {
  const match = (bundle) => bundle?.threads?.find((thread) => thread.name === name) || null;
  return match(await channel.threads.fetchActive().catch(() => null))
    || match(await channel.threads.fetchArchived({ type: 'public', limit: 100 }).catch(() => null));
}

function payloadAttempts(post, store) {
  return [
    () => buildInternetPostPayload(post, store),
    () => buildInternetPostPayload(post, store, { emojis: false }),
    () => buildInternetPostPayload(post, store, { emojis: false, media: false }),
    () => ({ content: buildFeedText(post, store).slice(0, 1900), allowedMentions: { parse: [] } }),
  ];
}

async function createForumThread(channel, post, payload) {
  const name = forumThreadName(post);
  const tags = requiredInternetForumTags(channel);
  const body = { name, message: payload };
  if (tags.length) body.appliedTags = tags;
  try {
    return await channel.threads.create(body);
  } catch (error) {
    if (!tags.length) throw error;
    return channel.threads.create({ name, message: payload });
  }
}

async function sendFeedPayload(channel, post, payload) {
  if (isInternetForumChannel(channel)) {
    try {
      const thread = await createForumThread(channel, post, payload);
      return thread?.id || null;
    } catch (error) {
      const panel = await findThreadByName(channel, 'Internet Panel');
      if (!panel) throw error;
      if (panel.archived) await panel.setArchived(false, 'Publish Internet post').catch(() => {});
      const message = await panel.send(payload);
      return message?.id || null;
    }
  }
  const message = await channel.send(payload);
  return message?.id || null;
}

export async function fetchInternetChannel(client, channelId) {
  if (!channelId || !client?.isReady?.()) return null;
  let channel;
  try {
    channel = await client.channels.fetch(channelId);
  } catch (error) {
    logger.error(`Internet channel fetch failed (${channelId})`, error);
    return null;
  }
  if (!isInternetForumChannel(channel) && !channel?.isTextBased?.()) {
    logger.error(`Internet channel is not a forum or text channel (${channelId})`);
    return null;
  }
  return channel;
}

function forumThreadName(post) {
  const snippet = String(post?.content || 'New post').replace(/\s+/g, ' ').trim();
  return `@${posterHandle(post)} • ${snippet || 'New post'}`.slice(0, 100);
}

function editablePayload(payload) {
  const next = { ...payload };
  delete next.flags;
  return next;
}

async function fetchForumThread(channel, id) {
  try {
    return await channel.threads.fetch(id);
  } catch {
    return null;
  }
}

export function createInternetFeedController(client, config = {}) {
  const channelId = String(config.internetFeedChannelId || '').trim();

  async function announce(post, knownStore = null) {
    if (!shouldAnnounceInternetPost(post)) return null;
    const channel = await fetchInternetChannel(client, channelId);
    if (!channel) return null;
    if (typeof channel.fetch === 'function') await channel.fetch().catch(() => {});
    const store = knownStore || await readInternetStore().catch(() => null);
    let lastError = null;
    for (const build of payloadAttempts(post, store)) {
      try {
        const id = await sendFeedPayload(channel, post, build());
        if (id) return id;
      } catch (error) {
        lastError = error;
        logger.warn('Could not publish Clearwater Internet post to Discord', error);
      }
    }
    if (lastError) throw lastError;
    return null;
  }

  async function update(post, knownStore = null) {
    const messageId = resolveFeedMessageId(post);
    if (!messageId || !shouldAnnounceInternetPost(post)) return;
    const channel = await fetchInternetChannel(client, channelId);
    if (!channel) return;
    const store = knownStore || await readInternetStore().catch(() => null);
    const payload = editablePayload(buildInternetPostPayload(post, store));

    try {
      if (isInternetForumChannel(channel)) {
        const thread = await fetchForumThread(channel, messageId);
        const starter = await thread?.fetchStarterMessage?.();
        if (starter) await starter.edit(payload);
        return;
      }
      await channel.messages.edit(messageId, payload);
    } catch (error) {
      logger.error(`Could not update Clearwater Internet post ${messageId}`, error);
    }
  }

  async function addComment(parentPost, comment) {
    const messageId = resolveFeedMessageId(parentPost);
    if (!messageId) return;
    const channel = await fetchInternetChannel(client, channelId);
    if (!channel) return;

    try {
      if (isInternetForumChannel(channel)) {
        const thread = await fetchForumThread(channel, messageId);
        if (thread?.archived) await thread.setArchived(false, 'New Internet comment').catch(() => {});
        if (thread) await thread.send(buildCommentPayload(comment));
        return;
      }
      const message = await channel.messages.fetch(messageId);
      if (message) await message.reply(buildCommentPayload(comment));
    } catch (error) {
      logger.error(`Could not publish comment for Internet post ${parentPost?.id}`, error);
    }
  }

  async function markDeleted(post) {
    const messageId = resolveFeedMessageId(post);
    if (!messageId) return;
    const channel = await fetchInternetChannel(client, channelId);
    if (!channel) return;
    try {
      if (isInternetForumChannel(channel)) {
        const thread = await fetchForumThread(channel, messageId);
        if (thread) await thread.delete('Clearwater Internet post deleted');
        return;
      }
      await channel.messages.delete(messageId);
    } catch (error) {
      logger.error(`Could not delete Clearwater Internet post ${messageId}`, error);
    }
  }

  return { announce, update, addComment, markDeleted };
}

export function createInternetFeedAnnouncer(client, config = {}) {
  return createInternetFeedController(client, config).announce;
}

export function shouldAnnounceInteractResult(body, result) {
  const post = result?.post;
  if (!shouldAnnounceInternetPost(post) || result?.duplicate || 'liked' in (result || {})) return false;
  if (body?.type === 'reply') return false;
  if (body?.type === 'repost') return result?.reposted === true || Boolean(post.quoteId);
  return false;
}
