import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  FileUploadBuilder,
  LabelBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  createInternetAccount,
  createInternetPost,
  deleteInternetPost,
  hasInternetAccount,
  interactInternetPost,
  internetFeedDiscordRef,
  internetPreferences,
  internetProfile,
  readInternetStore,
  setInternetPostDiscordFeedMessage,
  updateInternetPreference,
  updateInternetProfile,
  updateInternetSocial,
} from './internetStore.js';
import {
  createInternetFeedController,
  fetchInternetChannel,
  INTERNET_POST_BOOKMARK_PREFIX,
  INTERNET_POST_COMMENT_PREFIX,
  INTERNET_POST_DELETE_PREFIX,
  INTERNET_POST_LIKE_PREFIX,
  INTERNET_POST_MORE_PREFIX,
  INTERNET_POST_PROFILE_PREFIX,
  INTERNET_POST_REPOST_PREFIX,
  isInternetForumChannel,
  requiredInternetForumTags,
} from './discordInternetFeed.js';
import { queueInternetAutomodReview } from './discordInternetModeration.js';
import { internetActor, mutateDiscordInternetStore } from './discordInternetStore.js';
import { logger } from './logger.js';
import { v2Container, v2Message } from './v2Message.js';

export const INTERNET_PANEL_ACCOUNT_CUSTOM_ID = 'cw-internet-create-account';
export const INTERNET_PANEL_PROFILE_CUSTOM_ID = 'cw-internet-my-profile';
export const INTERNET_PANEL_POST_CUSTOM_ID = 'p_338115604705710082';
export const INTERNET_PANEL_SETTINGS_CUSTOM_ID = 'p_338115612729413633';
export const INTERNET_PANEL_HELP_CUSTOM_ID = 'p_338117502649241606';

const INTERNET_PANEL_NAME = 'Internet Panel';
const POST_MODAL_ID = 'cw-internet-post-modal';
const COMMENT_MODAL_PREFIX = 'cw-internet-comment-modal:';
const ACCOUNT_MODAL_ID = 'cw-internet-account-modal';
const SETTINGS_EDIT_CUSTOM_ID = 'cw-internet-settings-edit';
const SETTINGS_DMS_CUSTOM_ID = 'cw-internet-settings-dms';
const SETTINGS_MODAL_ID = 'cw-internet-settings-modal';

const TOP_BANNER_URL = 'https://media.discordapp.net/attachments/1529616984755540088/1540518179158102066/Clearwater_banners_new_2.png?ex=6a8a3edb&is=6a88ed5b&hm=64d95c6a500832db72631b745e07c7c37f0c4688a129e930d87f54e552997841&=&format=webp&quality=lossless&width=512&height=161';
const BOTTOM_BANNER_URL = 'https://media.discordapp.net/attachments/1529616984755540088/1530017826910507141/Clearwater_banners_new_10.png?ex=6a899e64&is=6a884ce4&hm=301f41ae6e9863723935b2641c3d1f583c45087e5311a80e5cd9348b140b59b3&=&format=webp&quality=lossless';

function hasDiscordAdministrator(interaction) {
  return interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) === true;
}

export function canDeleteInternetPost(interaction, post) {
  return post?.authorId === interaction.user?.id || hasDiscordAdministrator(interaction);
}

export function buildInternetPanelPayload({ includeBanners = true } = {}) {
  const container = new ContainerBuilder().clearAccentColor();
  if (includeBanners) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(TOP_BANNER_URL)),
    )
      .addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  }
  container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        '# <:globeshield:1533214164955435240> Clearwater Internet',
        '',
        '> Welcome to **Clearwater Internet**! Create an account, add a profile, then send Chirper posts across the internet.',
        '',
        '> **Create Account** — Make your Internet username and profile.',
        '> **Profile** — View or update your display name, handle, and bio.',
        '> **Send a Post** — Publish a Chirper-style post on Clearwater Internet.',
        '> **Settings** — Manage extra profile details and Discord notifications.',
        '> **Need Help?** — Click **Help** if you need assistance.',
      ].join('\n')),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(INTERNET_PANEL_ACCOUNT_CUSTOM_ID)
          .setLabel('Create Account')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(INTERNET_PANEL_PROFILE_CUSTOM_ID)
          .setLabel('Profile')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(INTERNET_PANEL_POST_CUSTOM_ID)
          .setLabel('Send Post')
          .setEmoji({ id: '1514354958592643177', name: 'd_plane' })
          .setStyle(ButtonStyle.Secondary),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(INTERNET_PANEL_SETTINGS_CUSTOM_ID)
          .setLabel('Settings')
          .setEmoji({ id: '1514354007416504400', name: 'Settings' })
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(INTERNET_PANEL_HELP_CUSTOM_ID)
          .setLabel('Help')
          .setStyle(ButtonStyle.Danger),
      ),
    );
  if (includeBanners) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false))
      .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BOTTOM_BANNER_URL)),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function messageHasPanel(message) {
  try {
    return JSON.stringify(message.components.map((component) => component.toJSON()))
      .includes(INTERNET_PANEL_POST_CUSTOM_ID);
  } catch {
    return false;
  }
}

async function findForumPanel(channel) {
  const active = await channel.threads.fetchActive().catch(() => null);
  const live = active?.threads?.find((thread) => thread.name === INTERNET_PANEL_NAME);
  if (live) return live;
  const archived = await channel.threads.fetchArchived({ type: 'public', limit: 100 }).catch(() => null);
  return archived?.threads?.find((thread) => thread.name === INTERNET_PANEL_NAME) || null;
}

export async function ensureInternetPanel(client) {
  const channelId = String(client.config?.internetFeedChannelId || '').trim();
  const channel = await fetchInternetChannel(client, channelId);
  if (!channel) throw new Error(`Internet channel ${channelId || '(missing)'} is unavailable.`);
  const payload = buildInternetPanelPayload();

  if (isInternetForumChannel(channel)) {
    let thread = await findForumPanel(channel);
    if (thread) {
      if (thread.archived) await thread.setArchived(false, 'Keep the Internet Panel available').catch(() => {});
      if (thread.locked) await thread.setLocked(false, 'Keep the Internet Panel available').catch(() => {});
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter) {
        try {
          await starter.edit(payload);
        } catch (error) {
          logger.warn(`Internet Panel could not keep banners while updating (${error?.message || error}).`);
          await starter.edit(buildInternetPanelPayload({ includeBanners: false })).catch(() => {});
        }
        logger.info(`Internet Panel updated in forum channel ${channelId}.`);
        return thread.id;
      }
    }
    const appliedTags = requiredInternetForumTags(channel);
    try {
      thread = await channel.threads.create({
        name: INTERNET_PANEL_NAME,
        message: payload,
        ...(appliedTags.length ? { appliedTags } : {}),
      });
    } catch (error) {
      logger.warn(`Internet Panel banners could not be attached; creating the panel without banners (${error?.message || error}).`);
      thread = await channel.threads.create({
        name: INTERNET_PANEL_NAME,
        message: buildInternetPanelPayload({ includeBanners: false }),
        ...(appliedTags.length ? { appliedTags } : {}),
      });
    }
    logger.info(`Internet Panel created in forum channel ${channelId}.`);
    return thread.id;
  }

  const messages = await channel.messages.fetch({ limit: 100 });
  const existing = messages.find((message) => message.author?.id === client.user.id && messageHasPanel(message));
  if (existing) {
    try {
      await existing.edit(payload);
    } catch (error) {
      logger.warn(`Internet Panel could not keep banners while updating (${error?.message || error}).`);
      await existing.edit(buildInternetPanelPayload({ includeBanners: false })).catch(() => {});
    }
    logger.info(`Internet Panel updated in text channel ${channelId}.`);
    return existing.id;
  }
  let message;
  try {
    message = await channel.send(payload);
  } catch (error) {
    logger.warn(`Internet Panel banners could not be attached; creating the panel without banners (${error?.message || error}).`);
    message = await channel.send(buildInternetPanelPayload({ includeBanners: false }));
  }
  logger.info(`Internet Panel created in text channel ${channelId}.`);
  return message.id;
}

function optionalValue(input, value, minLength = 1) {
  const text = String(value || '');
  if (text.length >= minLength) input.setValue(text);
  return input;
}

function buildAccountModal(profile = {}) {
  return new ModalBuilder()
    .setCustomId(ACCOUNT_MODAL_ID)
    .setTitle('Create Internet Account')
    .addComponents(
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('displayName')
            .setLabel('Display name')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(true),
          profile.displayName,
        ),
      ),
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('username')
            .setLabel('Username (no @)')
            .setPlaceholder('Iceberg2310')
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(20)
            .setRequired(true),
          String(profile.username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20),
          3,
        ),
      ),
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('bio')
            .setLabel('Bio')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(300)
            .setRequired(false),
          profile.bio,
        ),
      ),
    );
}

function buildPostModal() {
  return new ModalBuilder()
    .setCustomId(POST_MODAL_ID)
    .setTitle('Send a Post')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('What do you want to post?')
        .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('content')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true),
      ),
      new LabelBuilder()
        .setLabel('Image or GIF')
        .setDescription('Optional — select a file from your device (max 2.8 MB).')
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId('media_file')
            .setMinValues(0)
            .setMaxValues(1)
            .setRequired(false),
        ),
    );
}

function buildCommentModal(postId) {
  return new ModalBuilder()
    .setCustomId(`${COMMENT_MODAL_PREFIX}${postId}`)
    .setTitle('Add a Comment')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comment')
          .setLabel('Comment')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true),
      ),
    );
}

function buildSettingsModal(profile) {
  return new ModalBuilder()
    .setCustomId(SETTINGS_MODAL_ID)
    .setTitle('Internet Profile')
    .addComponents(
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('displayName')
            .setLabel('Display name')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(true),
          profile?.displayName,
        ),
      ),
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('username')
            .setLabel('Username (no @)')
            .setStyle(TextInputStyle.Short)
            .setMinLength(3)
            .setMaxLength(20)
            .setRequired(true),
          String(profile?.username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20),
          3,
        ),
      ),
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('bio')
            .setLabel('Bio')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(300)
            .setRequired(false),
          profile?.bio,
        ),
      ),
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('pronouns')
            .setLabel('Pronouns')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(40)
            .setRequired(false),
          profile?.pronouns,
        ),
      ),
      new ActionRowBuilder().addComponents(
        optionalValue(
          new TextInputBuilder()
            .setCustomId('location')
            .setLabel('Location')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(60)
            .setRequired(false),
          profile?.location,
        ),
      ),
    );
}

async function showCreateAccountModal(interaction) {
  const actor = internetActor(interaction);
  const store = await readInternetStore();
  if (store.users?.[actor.id]?.accountCreated === true) {
    throw new Error('You already have a Clearwater Internet account. Use Profile to update it.');
  }
  await interaction.showModal(buildAccountModal({
    displayName: actor.displayName,
    username: String(actor.username || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20),
    bio: store.users?.[actor.id]?.bio || '',
  }));
}

async function saveAccount(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const profile = await mutateDiscordInternetStore((store) => createInternetAccount(store, {
    actor: internetActor(interaction),
    displayName: interaction.fields.getTextInputValue('displayName'),
    username: interaction.fields.getTextInputValue('username'),
    bio: interaction.fields.getTextInputValue('bio'),
  }));
  await interaction.editReply({
    content: `Your Clearwater Internet account is ready. You post as **${profile.displayName}** (@${profile.username}).`,
  });
}

async function requireInternetAccount(interaction) {
  const actor = internetActor(interaction);
  const store = await readInternetStore();
  if (hasInternetAccount(store, actor.id)) return true;
  throw new Error('Create a Clearwater Internet account from the panel first, then send a post.');
}

async function showSettings(interaction) {
  const actor = internetActor(interaction);
  const { profile, preferences } = await mutateDiscordInternetStore((store) => ({
    profile: internetProfile(store, actor),
    preferences: internetPreferences(store, actor),
  }));
  const text = [
    '## Internet Settings',
    `**Account:** <@${actor.id}>`,
    `**Bio:** ${profile.bio || 'Not set'}`,
    `**Discord notifications:** ${preferences.discordDmNotifications ? 'On' : 'Off'}`,
  ].join('\n');
  await interaction.reply(v2Container(text, (container) => {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(SETTINGS_EDIT_CUSTOM_ID)
          .setLabel('Edit Profile')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(SETTINGS_DMS_CUSTOM_ID)
          .setLabel(preferences.discordDmNotifications ? 'Turn DMs Off' : 'Turn DMs On')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  }, { ephemeral: true }));
}

async function showProfile(interaction, userId) {
  const store = await readInternetStore();
  const user = store.users?.[userId];
  if (!user) throw new Error('That Internet profile could not be found.');
  const postCount = store.posts.filter((post) => post.authorId === userId && !post.parentId).length;
  const followers = Object.values(store.users).filter((member) => Array.isArray(member.following) && member.following.includes(userId)).length;
  const text = [
    `## ${user.displayName || user.username || 'Internet Profile'}`,
    `**Username:** @${user.username || 'user'}`,
    `**Followers:** ${followers}`,
    user.bio ? `**Bio:** ${user.bio}` : '',
    user.pronouns ? `**Pronouns:** ${user.pronouns}` : '',
    user.location ? `**Location:** ${user.location}` : '',
    `**Posts:** ${postCount}`,
  ].filter(Boolean).join('\n');
  const isSelf = interaction.user?.id === userId;
  if (!isSelf) {
    await interaction.reply(v2Message(text, { ephemeral: true }));
    return;
  }
  await interaction.reply(v2Container(text, (container) => {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(SETTINGS_EDIT_CUSTOM_ID)
          .setLabel('Edit Profile')
          .setStyle(ButtonStyle.Primary),
      ),
    );
  }, { ephemeral: true }));
}

async function publishPost(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const actor = internetActor(interaction);
  const content = interaction.fields.getTextInputValue('content');
  const files = interaction.fields.getUploadedFiles('media_file');
  const attachment = files?.first?.() || null;
  let imageDataUrl = '';
  if (attachment) {
    const type = String(attachment.contentType || '').toLowerCase();
    const supportedName = /\.(?:png|jpe?g|webp|gif)$/i.test(String(attachment.name || ''));
    if (!/^image\/(?:png|jpeg|webp|gif)$/.test(type) && !supportedName) {
      throw new Error('Choose a PNG, JPG, WEBP, or GIF file.');
    }
    if (attachment.size > 2_800_000) throw new Error('The image or GIF must be 2.8 MB or smaller.');
    const response = await fetch(attachment.url);
    if (!response.ok) throw new Error('Discord could not read that uploaded file. Please try again.');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 2_800_000) throw new Error('The image or GIF must be 2.8 MB or smaller.');
    const mime = /^image\/(?:png|jpeg|webp|gif)$/.test(type)
      ? type
      : attachment.name?.toLowerCase().endsWith('.gif')
        ? 'image/gif'
        : attachment.name?.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : attachment.name?.toLowerCase().endsWith('.png')
            ? 'image/png'
            : 'image/jpeg';
    imageDataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
  }
  const result = await mutateDiscordInternetStore((store) => {
    if (!hasInternetAccount(store, actor.id)) {
      throw new Error('Create a Clearwater Internet account from the panel first, then send a post.');
    }
    const profile = internetProfile(store, actor);
    const poster = store.users[actor.id];
    poster.avatarUrl = actor.avatarUrl || poster.avatarUrl;
    if (!profile.username) poster.username = actor.username;
    try {
      return {
        held: false,
        post: createInternetPost(store, poster, content, imageDataUrl ? { image: { dataUrl: imageDataUrl } } : {}),
      };
    } catch (error) {
      const held = error?.held === true || error?.name === 'AutomodHoldError';
      if (!held) throw error;
      const report = store.reports.find((item) => item.status === 'open'
        && item.source === 'automod'
        && item.authorId === actor.id
        && item.content === String(content).trim().slice(0, 500));
      return { held: true, report: report ? { ...report } : null };
    }
  });
  if (result.held) {
    if (result.report) await queueInternetAutomodReview(client, result.report);
    await interaction.editReply({ content: 'Automod held your post for staff review. It was not published yet.' });
    return;
  }
  const post = result.post;
  const controller = createInternetFeedController(client, client.config);
  let messageId = null;
  let publishError = '';
  try {
    messageId = await controller.announce(post);
  } catch (error) {
    publishError = String(error?.rawError?.message || error?.message || error).replace(/\s+/g, ' ').trim().slice(0, 180);
    logger.error('Could not publish Clearwater Internet post to Discord', error);
  }
  if (messageId) {
    await mutateDiscordInternetStore((store) => setInternetPostDiscordFeedMessage(store, post.id, messageId));
    await interaction.editReply({ content: 'Your Chirper post was published to Clearwater Internet.' });
  } else {
    await interaction.editReply({
      content: publishError
        ? `Your post was saved, but Discord could not publish it in the Internet channel (${publishError}).`
        : 'Your post was saved, but Discord could not publish it in the Internet channel. Check the bot can post there, then try again.',
    });
  }
}

async function toggleRepost(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await mutateDiscordInternetStore((store) => interactInternetPost(store, {
    actor: internetActor(interaction),
    postId,
    type: 'repost',
  }));
  const parentId = result.post?.repostOf || postId;
  const store = await readInternetStore();
  const parent = store.posts.find((post) => post.id === String(parentId)) || result.post;
  await createInternetFeedController(client, client.config).update(parent);
  await interaction.editReply({
    content: result.reposted === false ? 'You removed your repost.' : 'You reposted this Chirper post.',
  });
}

async function toggleBookmark(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await mutateDiscordInternetStore((store) => {
    const actor = internetActor(interaction);
    const user = store.users?.[actor.id];
    const already = Array.isArray(user?.bookmarks) && user.bookmarks.includes(String(postId));
    updateInternetSocial(store, {
      actor,
      type: 'bookmark',
      postId,
      enabled: !already,
    });
    return {
      saved: !already,
      post: store.posts.find((post) => post.id === String(postId)),
    };
  });
  if (result.post) await createInternetFeedController(client, client.config).update(result.post);
  await interaction.editReply({ content: result.saved ? 'Saved to your bookmarks.' : 'Removed from your bookmarks.' });
}

async function showPostMore(interaction, postId) {
  const store = await readInternetStore();
  const post = store.posts.find((item) => item.id === String(postId));
  if (!post) throw new Error('That post no longer exists.');
  await interaction.reply(v2Container('## Chirper', (container) => {
    container.addActionRowComponents(
      new ActionRowBuilder().addComponents(
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
  }, { ephemeral: true }));
}

async function toggleLike(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await mutateDiscordInternetStore((store) => interactInternetPost(store, {
    actor: internetActor(interaction),
    postId,
    type: 'like',
  }));
  await createInternetFeedController(client, client.config).update(result.post);
  await interaction.editReply({ content: result.liked ? 'You liked this post.' : 'You removed your like.' });
}

async function publishComment(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const actor = internetActor(interaction);
  const comment = interaction.fields.getTextInputValue('comment');
  const result = await mutateDiscordInternetStore((store) => {
    try {
      const response = interactInternetPost(store, {
        actor,
        postId,
        type: 'reply',
        content: comment,
      });
      return {
        held: false,
        ...response,
        parent: store.posts.find((post) => post.id === String(postId)),
      };
    } catch (error) {
      const held = error?.held === true || error?.name === 'AutomodHoldError';
      if (!held) throw error;
      const report = store.reports.find((item) => item.status === 'open'
        && item.source === 'automod'
        && item.authorId === actor.id
        && item.content === String(comment).trim().slice(0, 500));
      return { held: true, report: report ? { ...report } : null };
    }
  });
  if (result.held) {
    if (result.report) await queueInternetAutomodReview(client, result.report);
    await interaction.editReply({ content: 'Automod held your comment for staff review. It was not published yet.' });
    return;
  }
  if (!result.parent) throw new Error('The original post no longer exists.');
  const controller = createInternetFeedController(client, client.config);
  if (!result.duplicate) await controller.addComment(result.parent, result.post);
  await controller.update(result.parent);
  await interaction.editReply({ content: result.duplicate ? 'That comment was already sent.' : 'Your comment was posted.' });
}

async function removePost(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const deleted = await mutateDiscordInternetStore((store) => {
    const existing = store.posts.find((post) => post.id === String(postId));
    if (!existing) throw new Error('That post no longer exists.');
    const isAdministrator = hasDiscordAdministrator(interaction);
    if (!canDeleteInternetPost(interaction, existing)) {
      throw new Error('Only the post author or a Discord Administrator can delete this post.');
    }
    const ref = internetFeedDiscordRef(store, existing);
    const post = deleteInternetPost(store, {
      postId,
      actorId: interaction.user.id,
      owner: isAdministrator,
    });
    store.posts = store.posts.filter((item) => item.parentId !== post.id);
    return ref || post;
  });
  await createInternetFeedController(client, client.config).markDeleted(deleted);
  await interaction.editReply({ content: 'The entire post and its comments were deleted from the Internet channel.' });
}

async function showEditSettingsModal(interaction) {
  const actor = internetActor(interaction);
  const profile = await mutateDiscordInternetStore((store) => internetProfile(store, actor));
  await interaction.showModal(buildSettingsModal(profile));
}

async function saveSettings(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await mutateDiscordInternetStore((store) => updateInternetProfile(store, {
    actor: internetActor(interaction),
    profile: {
      displayName: interaction.fields.getTextInputValue('displayName'),
      username: interaction.fields.getTextInputValue('username'),
      bio: interaction.fields.getTextInputValue('bio'),
      pronouns: interaction.fields.getTextInputValue('pronouns'),
      location: interaction.fields.getTextInputValue('location'),
    },
  }));
  await interaction.editReply({ content: 'Your Internet profile was updated.' });
}

async function toggleDmSettings(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const enabled = await mutateDiscordInternetStore((store) => {
    const current = internetPreferences(store, internetActor(interaction));
    const next = !current.discordDmNotifications;
    updateInternetPreference(store, {
      actor: internetActor(interaction),
      key: 'discordDmNotifications',
      enabled: next,
    });
    return next;
  });
  await interaction.editReply({ content: `Discord Internet notifications are now ${enabled ? 'on' : 'off'}.` });
}

async function showHelp(interaction) {
  await interaction.reply(v2Message([
    '## Clearwater Internet Help',
    '**Create Account** makes your Chirper profile: display name, @username, and bio.',
    '**Profile** shows your account and lets you edit it.',
    '**Send Post** publishes a Chirper-style post with like, repost, reply, and bookmark buttons.',
    '**Like / Repost / Reply / Bookmark** work on the post itself. **⋯** opens profile and delete.',
    '**Settings** lets you edit extra profile fields and Discord notification preference.',
  ].join('\n\n'), { ephemeral: true }));
}

async function respondWithError(interaction, error) {
  logger.error(`Clearwater Internet interaction failed (${interaction.customId || 'unknown'})`, error);
  const content = String(error?.message || 'That Internet action could not be completed.').slice(0, 1800);
  if (interaction.deferred) await interaction.editReply({ content, components: [] }).catch(() => {});
  else if (interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
  else await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => {});
}

export async function handleDiscordInternetInteraction(interaction, client) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
  const id = String(interaction.customId || '');
  const handled = id === INTERNET_PANEL_POST_CUSTOM_ID
    || id === INTERNET_PANEL_ACCOUNT_CUSTOM_ID
    || id === INTERNET_PANEL_PROFILE_CUSTOM_ID
    || id === INTERNET_PANEL_SETTINGS_CUSTOM_ID
    || id === INTERNET_PANEL_HELP_CUSTOM_ID
    || id === SETTINGS_EDIT_CUSTOM_ID
    || id === SETTINGS_DMS_CUSTOM_ID
    || id === SETTINGS_MODAL_ID
    || id === ACCOUNT_MODAL_ID
    || id.startsWith(INTERNET_POST_LIKE_PREFIX)
    || id.startsWith(INTERNET_POST_REPOST_PREFIX)
    || id.startsWith(INTERNET_POST_COMMENT_PREFIX)
    || id.startsWith(INTERNET_POST_BOOKMARK_PREFIX)
    || id.startsWith(INTERNET_POST_MORE_PREFIX)
    || id.startsWith(INTERNET_POST_PROFILE_PREFIX)
    || id.startsWith(INTERNET_POST_DELETE_PREFIX)
    || id.startsWith(COMMENT_MODAL_PREFIX)
    || id === POST_MODAL_ID;
  if (!handled) return false;

  try {
    if (id === INTERNET_PANEL_ACCOUNT_CUSTOM_ID) await showCreateAccountModal(interaction);
    else if (id === INTERNET_PANEL_PROFILE_CUSTOM_ID) await showProfile(interaction, interaction.user.id);
    else if (id === INTERNET_PANEL_POST_CUSTOM_ID) {
      await requireInternetAccount(interaction);
      await interaction.showModal(buildPostModal());
    }
    else if (id === INTERNET_PANEL_SETTINGS_CUSTOM_ID) await showSettings(interaction);
    else if (id === INTERNET_PANEL_HELP_CUSTOM_ID) await showHelp(interaction);
    else if (id === SETTINGS_EDIT_CUSTOM_ID) await showEditSettingsModal(interaction);
    else if (id === SETTINGS_DMS_CUSTOM_ID) await toggleDmSettings(interaction);
    else if (id === SETTINGS_MODAL_ID) await saveSettings(interaction);
    else if (id === ACCOUNT_MODAL_ID) await saveAccount(interaction);
    else if (id === POST_MODAL_ID) await publishPost(interaction, client);
    else if (id.startsWith(INTERNET_POST_LIKE_PREFIX)) await toggleLike(interaction, client, id.slice(INTERNET_POST_LIKE_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_REPOST_PREFIX)) await toggleRepost(interaction, client, id.slice(INTERNET_POST_REPOST_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_COMMENT_PREFIX)) await interaction.showModal(buildCommentModal(id.slice(INTERNET_POST_COMMENT_PREFIX.length)));
    else if (id.startsWith(INTERNET_POST_BOOKMARK_PREFIX)) await toggleBookmark(interaction, client, id.slice(INTERNET_POST_BOOKMARK_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_MORE_PREFIX)) await showPostMore(interaction, id.slice(INTERNET_POST_MORE_PREFIX.length));
    else if (id.startsWith(COMMENT_MODAL_PREFIX)) await publishComment(interaction, client, id.slice(COMMENT_MODAL_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_PROFILE_PREFIX)) await showProfile(interaction, id.slice(INTERNET_POST_PROFILE_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_DELETE_PREFIX)) await removePost(interaction, client, id.slice(INTERNET_POST_DELETE_PREFIX.length));
  } catch (error) {
    await respondWithError(interaction, error);
  }
  return true;
}
