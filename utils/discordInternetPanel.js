import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  createInternetPost,
  createInternetReport,
  deleteInternetPost,
  interactInternetPost,
  internetFeedDiscordRef,
  internetPreferences,
  internetProfile,
  readInternetStore,
  saveInternetStore,
  setInternetPostDiscordFeedMessage,
  updateInternetPreference,
  updateInternetProfile,
} from './internetStore.js';
import {
  createInternetFeedController,
  fetchInternetChannel,
  INTERNET_POST_COMMENT_PREFIX,
  INTERNET_POST_DELETE_PREFIX,
  INTERNET_POST_LIKE_PREFIX,
  INTERNET_POST_PROFILE_PREFIX,
  INTERNET_POST_REPORT_PREFIX,
  isInternetForumChannel,
  requiredInternetForumTags,
} from './discordInternetFeed.js';
import { logger } from './logger.js';
import { v2Container, v2Message } from './v2Message.js';

export const INTERNET_PANEL_POST_CUSTOM_ID = 'p_338115604705710082';
export const INTERNET_PANEL_SETTINGS_CUSTOM_ID = 'p_338115612729413633';
export const INTERNET_PANEL_HELP_CUSTOM_ID = 'p_338117502649241606';

const INTERNET_PANEL_NAME = 'Internet Panel';
const POST_MODAL_ID = 'cw-internet-post-modal';
const COMMENT_MODAL_PREFIX = 'cw-internet-comment-modal:';
const REPORT_MODAL_PREFIX = 'cw-internet-report-modal:';
const SETTINGS_EDIT_CUSTOM_ID = 'cw-internet-settings-edit';
const SETTINGS_DMS_CUSTOM_ID = 'cw-internet-settings-dms';
const SETTINGS_MODAL_ID = 'cw-internet-settings-modal';

const TOP_BANNER_URL = 'https://media.discordapp.net/attachments/1529616984755540088/1540518179158102066/Clearwater_banners_new_2.png?ex=6a8a3edb&is=6a88ed5b&hm=64d95c6a500832db72631b745e07c7c37f0c4688a129e930d87f54e552997841&=&format=webp&quality=lossless&width=512&height=161';
const BOTTOM_BANNER_URL = 'https://media.discordapp.net/attachments/1529616984755540088/1530017826910507141/Clearwater_banners_new_10.png?ex=6a899e64&is=6a884ce4&hm=301f41ae6e9863723935b2641c3d1f583c45087e5311a80e5cd9348b140b59b3&=&format=webp&quality=lossless';

let storeMutationQueue = Promise.resolve();

function mutateInternetStore(task) {
  const run = storeMutationQueue.then(async () => {
    const store = await readInternetStore();
    const result = await task(store);
    await saveInternetStore(store);
    return result;
  });
  storeMutationQueue = run.catch(() => {});
  return run;
}

function actorFromInteraction(interaction) {
  const user = interaction.user;
  return {
    id: user.id,
    username: user.username,
    displayName: interaction.member?.displayName || user.globalName || user.displayName || user.username,
    avatarUrl: user.displayAvatarURL({ extension: 'png', size: 256 }),
  };
}

function isOwnerInteraction(interaction, client) {
  if (client.config?.ownerDiscordIds?.includes(interaction.user.id)) return true;
  const roles = interaction.member?.roles?.cache;
  return client.config?.ownerRoleIds?.some((roleId) => roles?.has?.(roleId)) === true;
}

function mediaUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('invalid');
    return url.href.slice(0, 500);
  } catch {
    throw new Error('The image or GIF must use a valid https URL.');
  }
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
        '> Welcome to **Clearwater Internet**! Here you can manage your account, create and post messages across the internet, and access helpful resources.',
        '',
        '> **Send a Post** — Create and publish a message on Clearwater Internet.',
        '> **Settings** — Update and manage your Clearwater Internet account & update your settings.',
        '> **Need Help?** — Click the **Help** button below if you need assistance learning how to use Clearwater Internet.',
      ].join('\n')),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(INTERNET_PANEL_POST_CUSTOM_ID)
          .setLabel('Send Post')
          .setEmoji({ id: '1514354958592643177', name: 'd_plane' })
          .setStyle(ButtonStyle.Secondary),
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
        logger.info(`Internet Panel already exists in forum channel ${channelId}.`);
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
    logger.info(`Internet Panel already exists in text channel ${channelId}.`);
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

function buildPostModal() {
  return new ModalBuilder()
    .setCustomId(POST_MODAL_ID)
    .setTitle('Send a Post')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('content')
          .setLabel('What do you want to post?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('media_url')
          .setLabel('Image or GIF URL (optional)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(500)
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

function buildReportModal(postId) {
  return new ModalBuilder()
    .setCustomId(`${REPORT_MODAL_PREFIX}${postId}`)
    .setTitle('Report Post')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Why are you reporting this post?')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(true),
      ),
    );
}

function buildSettingsModal(profile) {
  return new ModalBuilder()
    .setCustomId(SETTINGS_MODAL_ID)
    .setTitle('Internet Profile Settings')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('bio')
          .setLabel('Bio')
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(300)
          .setRequired(false)
          .setValue(String(profile?.bio || '').slice(0, 300)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('pronouns')
          .setLabel('Pronouns')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(40)
          .setRequired(false)
          .setValue(String(profile?.pronouns || '').slice(0, 40)),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('location')
          .setLabel('Location')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(60)
          .setRequired(false)
          .setValue(String(profile?.location || '').slice(0, 60)),
      ),
    );
}

async function showSettings(interaction) {
  const actor = actorFromInteraction(interaction);
  const { profile, preferences } = await mutateInternetStore((store) => ({
    profile: internetProfile(store, actor),
    preferences: internetPreferences(store, actor),
  }));
  const text = [
    '## Internet Settings',
    `**Account:** <@${actor.id}>`,
    `**Bio:** ${profile.bio || 'Not set'}`,
    `**Pronouns:** ${profile.pronouns || 'Not set'}`,
    `**Location:** ${profile.location || 'Not set'}`,
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
  const text = [
    `## ${user.displayName || user.username || 'Internet Profile'}`,
    `**Username:** @${user.username || 'user'}`,
    user.bio ? `**Bio:** ${user.bio}` : '',
    user.pronouns ? `**Pronouns:** ${user.pronouns}` : '',
    user.location ? `**Location:** ${user.location}` : '',
    `**Posts:** ${postCount}`,
  ].filter(Boolean).join('\n');
  await interaction.reply(v2Message(text, { ephemeral: true }));
}

async function publishPost(interaction, client) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const actor = actorFromInteraction(interaction);
  const content = interaction.fields.getTextInputValue('content');
  const imageUrl = mediaUrl(interaction.fields.getTextInputValue('media_url'));
  const post = await mutateInternetStore((store) => {
    const created = createInternetPost(store, actor, content);
    if (imageUrl) created.imageUrl = imageUrl;
    return created;
  });
  const controller = createInternetFeedController(client, client.config);
  const messageId = await controller.announce(post);
  if (messageId) {
    await mutateInternetStore((store) => setInternetPostDiscordFeedMessage(store, post.id, messageId));
    await interaction.editReply({ content: 'Your post was published to Clearwater Internet.' });
  } else {
    await interaction.editReply({ content: 'Your post was saved, but Discord could not publish it in the Internet channel. Please contact staff.' });
  }
}

async function toggleLike(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await mutateInternetStore((store) => interactInternetPost(store, {
    actor: actorFromInteraction(interaction),
    postId,
    type: 'like',
  }));
  await createInternetFeedController(client, client.config).update(result.post);
  await interaction.editReply({ content: result.liked ? 'You liked this post.' : 'You removed your like.' });
}

async function publishComment(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await mutateInternetStore((store) => {
    const response = interactInternetPost(store, {
      actor: actorFromInteraction(interaction),
      postId,
      type: 'reply',
      content: interaction.fields.getTextInputValue('comment'),
    });
    return {
      ...response,
      parent: store.posts.find((post) => post.id === String(postId)),
    };
  });
  if (!result.parent) throw new Error('The original post no longer exists.');
  const controller = createInternetFeedController(client, client.config);
  if (!result.duplicate) await controller.addComment(result.parent, result.post);
  await controller.update(result.parent);
  await interaction.editReply({ content: result.duplicate ? 'That comment was already sent.' : 'Your comment was posted.' });
}

async function submitReport(interaction, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await mutateInternetStore((store) => createInternetReport(store, {
    postId,
    actor: actorFromInteraction(interaction),
    reason: interaction.fields.getTextInputValue('reason'),
  }));
  await interaction.editReply({ content: 'Your report was sent to Clearwater staff.' });
}

async function removePost(interaction, client, postId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const deleted = await mutateInternetStore((store) => {
    const existing = store.posts.find((post) => post.id === String(postId));
    const ref = internetFeedDiscordRef(store, existing);
    const post = deleteInternetPost(store, {
      postId,
      actorId: interaction.user.id,
      owner: isOwnerInteraction(interaction, client),
    });
    store.posts = store.posts.filter((item) => item.parentId !== post.id);
    return ref || post;
  });
  await createInternetFeedController(client, client.config).markDeleted(deleted);
  await interaction.editReply({ content: 'The post was deleted.' });
}

async function showEditSettingsModal(interaction) {
  const actor = actorFromInteraction(interaction);
  const profile = await mutateInternetStore((store) => internetProfile(store, actor));
  await interaction.showModal(buildSettingsModal(profile));
}

async function saveSettings(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await mutateInternetStore((store) => updateInternetProfile(store, {
    actor: actorFromInteraction(interaction),
    profile: {
      bio: interaction.fields.getTextInputValue('bio'),
      pronouns: interaction.fields.getTextInputValue('pronouns'),
      location: interaction.fields.getTextInputValue('location'),
    },
  }));
  await interaction.editReply({ content: 'Your Internet profile was updated.' });
}

async function toggleDmSettings(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const enabled = await mutateInternetStore((store) => {
    const current = internetPreferences(store, actorFromInteraction(interaction));
    const next = !current.discordDmNotifications;
    updateInternetPreference(store, {
      actor: actorFromInteraction(interaction),
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
    '**Send Post** opens a form where you can write a post and optionally include an image or GIF link.',
    '**Like** adds or removes your reaction from a post.',
    '**Comment** opens a form and publishes your reply inside the post.',
    '**Profile** shows a member’s Internet profile.',
    '**Report** privately sends a post to staff for review.',
    '**Settings** lets you edit your profile and Discord notification preference.',
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
    || id === INTERNET_PANEL_SETTINGS_CUSTOM_ID
    || id === INTERNET_PANEL_HELP_CUSTOM_ID
    || id === SETTINGS_EDIT_CUSTOM_ID
    || id === SETTINGS_DMS_CUSTOM_ID
    || id === SETTINGS_MODAL_ID
    || id.startsWith(INTERNET_POST_LIKE_PREFIX)
    || id.startsWith(INTERNET_POST_COMMENT_PREFIX)
    || id.startsWith(INTERNET_POST_PROFILE_PREFIX)
    || id.startsWith(INTERNET_POST_REPORT_PREFIX)
    || id.startsWith(INTERNET_POST_DELETE_PREFIX)
    || id.startsWith(COMMENT_MODAL_PREFIX)
    || id.startsWith(REPORT_MODAL_PREFIX)
    || id === POST_MODAL_ID;
  if (!handled) return false;

  try {
    if (id === INTERNET_PANEL_POST_CUSTOM_ID) await interaction.showModal(buildPostModal());
    else if (id === INTERNET_PANEL_SETTINGS_CUSTOM_ID) await showSettings(interaction);
    else if (id === INTERNET_PANEL_HELP_CUSTOM_ID) await showHelp(interaction);
    else if (id === SETTINGS_EDIT_CUSTOM_ID) await showEditSettingsModal(interaction);
    else if (id === SETTINGS_DMS_CUSTOM_ID) await toggleDmSettings(interaction);
    else if (id === SETTINGS_MODAL_ID) await saveSettings(interaction);
    else if (id === POST_MODAL_ID) await publishPost(interaction, client);
    else if (id.startsWith(INTERNET_POST_LIKE_PREFIX)) await toggleLike(interaction, client, id.slice(INTERNET_POST_LIKE_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_COMMENT_PREFIX)) await interaction.showModal(buildCommentModal(id.slice(INTERNET_POST_COMMENT_PREFIX.length)));
    else if (id.startsWith(COMMENT_MODAL_PREFIX)) await publishComment(interaction, client, id.slice(COMMENT_MODAL_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_PROFILE_PREFIX)) await showProfile(interaction, id.slice(INTERNET_POST_PROFILE_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_REPORT_PREFIX)) await interaction.showModal(buildReportModal(id.slice(INTERNET_POST_REPORT_PREFIX.length)));
    else if (id.startsWith(REPORT_MODAL_PREFIX)) await submitReport(interaction, id.slice(REPORT_MODAL_PREFIX.length));
    else if (id.startsWith(INTERNET_POST_DELETE_PREFIX)) await removePost(interaction, client, id.slice(INTERNET_POST_DELETE_PREFIX.length));
  } catch (error) {
    await respondWithError(interaction, error);
  }
  return true;
}
