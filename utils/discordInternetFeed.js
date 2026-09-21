import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelFlagsBitField,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { followerDiscordIds, readInternetStore } from './internetStore.js';
import { logger } from './logger.js';

const MAX_ATTACH_BYTES = 8 * 1024 * 1024;
const DEFAULT_AVATAR_URL = 'https://cdn.discordapp.com/embed/avatars/0.png';

export const INTERNET_POST_LIKE_PREFIX = 'cw-internet-like:';
export const INTERNET_POST_REPOST_PREFIX = 'cw-internet-repost:';
export const INTERNET_POST_COMMENT_PREFIX = 'cw-internet-comment:';
export const INTERNET_POST_BOOKMARK_PREFIX = 'cw-internet-bookmark:';
export const INTERNET_POST_MORE_PREFIX = 'cw-internet-more:';
export const INTERNET_POST_PROFILE_PREFIX = 'cw-internet-profile:';
export const INTERNET_POST_DELETE_PREFIX = 'cw-internet-delete:';
export const INTERNET_POST_FOLLOW_PREFIX = 'cw-internet-follow:';
export const INTERNET_POST_REACT_PREFIX = 'cw-internet-react:';
export const INTERNET_REACT_EMOJI_PREFIX = 'cw-internet-rx:';

const INTERNET_BUTTON_EMOJIS = Object.freeze({
  like: { id: '1551629795316600942', name: 'like' },
  repost: { id: '1518386518387851425', name: 'DownArrow' },
  reply: { id: '1540761931797758013', name: 'chat' },
});

export const INTERNET_REACT_EMOJIS = Object.freeze({
  heart: '❤️',
  fire: '🔥',
  laugh: '😂',
  wow: '😮',
  sad: '😢',
});

function isHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseDataImage(value, fileName = 'post') {
  const match = String(value || '').replace(/\s+/g, '').match(/^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/]+=*)$/i);
  if (!match) return null;
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_ATTACH_BYTES) return null;
  const mime = match[1].toLowerCase();
  const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('gif') ? 'gif' : 'jpg';
  return { buffer, name: `${fileName}.${ext}` };
}

function posterHandle(post) {
  const raw = String(post?.username || post?.displayName || 'user')
    .replace(/[`@]/g, '')
    .trim()
    .slice(0, 80);
  return raw || 'user';
}

function posterName(post) {
  return String(post?.displayName || post?.username || 'Internet user').replace(/[`]/g, '').trim().slice(0, 80) || 'Internet user';
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

function followerCount(store, userId) {
  const id = String(userId || '');
  return Object.values(store?.users || {}).filter((member) => Array.isArray(member?.following) && member.following.includes(id)).length;
}

function repostCount(store, postId) {
  const id = String(postId || '');
  return Array.isArray(store?.posts)
    ? store.posts.filter((post) => post.repostOf === id).length
    : 0;
}

function bookmarkCount(store, postId) {
  const id = String(postId || '');
  return Object.values(store?.users || {}).filter((member) => Array.isArray(member?.bookmarks) && member.bookmarks.includes(id)).length;
}

export function formatFeedTimestamp(iso) {
  const ms = new Date(iso || Date.now()).getTime();
  if (!Number.isFinite(ms)) return '';
  const formatted = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
    timeZoneName: 'short',
  }).format(new Date(ms));
  return formatted.replace(', ', ' · ');
}

export function buildFeedPostText(post, store) {
  const followers = followerCount(store, post?.authorId);
  const body = String(post?.content || '').trim() || '_Shared a post._';
  const when = formatFeedTimestamp(post?.createdAt);
  return [
    `**${posterName(post)}**`,
    `-# @${posterHandle(post)} · ${followers} follower${followers === 1 ? '' : 's'}`,
    '',
    body,
    when ? `-# ${when}` : '',
  ].filter((line) => line !== undefined).join('\n').slice(0, 4000);
}

function buildFeedText(post, store) {
  return buildFeedPostText(post, store);
}

function countLabel(count) {
  return Number(count) > 0 ? String(count) : '\u200b';
}

function resolveFeedMessageId(post) {
  const id = String(post?.discordFeedMessageId || '').trim();
  return /^\d{16,22}$/.test(id) ? id : '';
}

function resolveAvatar(post, store) {
  const author = store?.users?.[post?.authorId];
  const raw = author?.avatarUrl || post?.avatarUrl || '';
  if (isHttpsUrl(raw)) return { url: raw, files: [] };
  const data = parseDataImage(raw, 'avatar');
  if (data) {
    return {
      url: `attachment://${data.name}`,
      files: [new AttachmentBuilder(data.buffer, { name: data.name })],
    };
  }
  return { url: DEFAULT_AVATAR_URL, files: [] };
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

function internetActionRow(post, store, { emojis = true, bookmark = true } = {}) {
  const likes = Array.isArray(post?.likes) ? post.likes.length : 0;
  const comments = commentCount(store, post?.id);
  const reposts = repostCount(store, post?.id);
  const bookmarks = bookmarkCount(store, post?.id);
  const likeButton = new ButtonBuilder()
    .setCustomId(`${INTERNET_POST_LIKE_PREFIX}${post.id}`)
    .setLabel(countLabel(likes))
    .setStyle(ButtonStyle.Secondary);
  const repostButton = new ButtonBuilder()
    .setCustomId(`${INTERNET_POST_REPOST_PREFIX}${post.id}`)
    .setLabel(countLabel(reposts))
    .setStyle(ButtonStyle.Secondary);
  const commentButton = new ButtonBuilder()
    .setCustomId(`${INTERNET_POST_COMMENT_PREFIX}${post.id}`)
    .setLabel(countLabel(comments))
    .setStyle(ButtonStyle.Secondary);
  const moreButton = new ButtonBuilder()
    .setCustomId(`${INTERNET_POST_MORE_PREFIX}${post.id}`)
    .setLabel('⋯')
    .setStyle(ButtonStyle.Secondary);
  const buttons = [likeButton, repostButton, commentButton];
  if (bookmark) {
    const bookmarkButton = new ButtonBuilder()
      .setCustomId(`${INTERNET_POST_BOOKMARK_PREFIX}${post.id}`)
      .setLabel(countLabel(bookmarks))
      .setStyle(ButtonStyle.Secondary);
    if (emojis) bookmarkButton.setEmoji('🔖');
    else bookmarkButton.setLabel(`Save${bookmarks ? ` ${bookmarks}` : ''}`);
    buttons.push(bookmarkButton);
  }
  buttons.push(moreButton);
  if (emojis) {
    likeButton.setEmoji(INTERNET_BUTTON_EMOJIS.like);
    repostButton.setEmoji(INTERNET_BUTTON_EMOJIS.repost);
    commentButton.setEmoji(INTERNET_BUTTON_EMOJIS.reply);
  } else {
    likeButton.setLabel(`Like${likes ? ` ${likes}` : ''}`);
    repostButton.setLabel(`Repost${reposts ? ` ${reposts}` : ''}`);
    commentButton.setLabel(`Reply${comments ? ` ${comments}` : ''}`);
    moreButton.setLabel('More');
  }
  return new ActionRowBuilder().addComponents(...buttons);
}

function internetMetaRow(post) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${INTERNET_POST_REACT_PREFIX}${post.id}`)
      .setLabel('React to Post')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${INTERNET_POST_FOLLOW_PREFIX}${post.authorId}`)
      .setLabel('Follow')
      .setStyle(ButtonStyle.Secondary),
  );
}

function addPostCard(container, post, store, { thumbnail = true, media = true } = {}) {
  const { files, mediaUrl } = media ? resolveMedia(post) : { files: [], mediaUrl: '' };
  const avatar = thumbnail ? resolveAvatar(post, store) : { url: '', files: [] };
  const accessoryUrl = (media && mediaUrl) || avatar.url;
  if (accessoryUrl === avatar.url) files.push(...avatar.files);
  const followers = followerCount(store, post?.authorId);
  const body = String(post?.content || '').trim() || '_Shared a post._';
  const when = formatFeedTimestamp(post?.createdAt);
  const header = new TextDisplayBuilder().setContent(
    `**${posterName(post)}**\n-# @${posterHandle(post)} · ${followers} follower${followers === 1 ? '' : 's'}`,
  );
  const bodyText = new TextDisplayBuilder().setContent(body.slice(0, 2000));
  const footer = new TextDisplayBuilder().setContent(when ? `-# ${when}` : '\u200b');
  if (accessoryUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header, bodyText, footer)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(accessoryUrl).setDescription(posterName(post))),
    );
  } else {
    container.addTextDisplayComponents(header, bodyText, footer);
  }
  return files;
}

export function buildInternetPostPayload(post, store = null, {
  emojis = true,
  media = true,
  thumbnail = true,
  variant = 'post',
} = {}) {
  const isReply = variant === 'reply' || Boolean(post?.parentId);
  const container = new ContainerBuilder().clearAccentColor();
  if (isReply) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`↩ @${posterHandle(post)} replied to this post.`),
    );
  }

  const files = addPostCard(container, post, store, { thumbnail, media });
  container.addActionRowComponents(internetActionRow(post, store, { emojis, bookmark: !isReply }));

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
  if (files.length) payload.files = files;
  return payload;
}

export function buildRepostPayload(post) {
  const text = `↩ **@${posterHandle(post)}** reposted this post.`;
  return {
    components: [new ContainerBuilder()
      .clearAccentColor()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(text))],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildReactPicker(postId) {
  return {
    components: [new ContainerBuilder()
      .clearAccentColor()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('**React to Post**'))
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          ...Object.entries(INTERNET_REACT_EMOJIS).map(([name, emoji]) => (
            new ButtonBuilder()
              .setCustomId(`${INTERNET_REACT_EMOJI_PREFIX}${name}:${postId}`)
              .setEmoji(emoji)
              .setStyle(ButtonStyle.Secondary)
          )),
        ),
      )],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
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
    () => buildInternetPostPayload(post, store, { emojis: false, thumbnail: false }),
    () => buildInternetPostPayload(post, store, { emojis: false, thumbnail: false, media: false }),
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
  const next = { ...payload, content: null, embeds: [] };
  return next;
}

async function fetchForumThread(channel, id) {
  try {
    return await channel.threads.fetch(id);
  } catch {
    return null;
  }
}

async function ghostPingFollowers(channel, post, store, feedId) {
  const userIds = followerDiscordIds(store, post?.authorId);
  if (!userIds.length) return;
  let dest = channel;
  if (isInternetForumChannel(channel) && feedId) {
    dest = await fetchForumThread(channel, feedId) || channel;
  }
  if (!dest?.send) return;
  for (const userId of userIds) {
    try {
      const ping = await dest.send({
        content: `<@${userId}>`,
        allowedMentions: { parse: [], users: [userId] },
      });
      await ping.delete().catch(() => {});
    } catch (error) {
      logger.warn(`Could not notify Internet follower ${userId}`, error);
    }
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
        if (id) {
          await ghostPingFollowers(channel, post, store, id).catch((error) => {
            logger.warn('Could not notify Internet followers', error);
          });
          return id;
        }
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
        if (thread) await thread.send(buildInternetPostPayload(comment, await readInternetStore().catch(() => null), { variant: 'reply' }));
        return;
      }
      const message = await channel.messages.fetch(messageId);
      if (message) await message.reply(buildInternetPostPayload(comment, await readInternetStore().catch(() => null), { variant: 'reply' }));
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
