import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  applyStaffUserAction,
  readInternetStore,
  reviewInternetReport,
  setInternetPostDiscordFeedMessage,
} from './internetStore.js';
import { createInternetFeedController } from './discordInternetFeed.js';
import {
  dmInternetUser,
  internetActor,
  isInternetStaff,
  mutateDiscordInternetStore,
} from './discordInternetStore.js';
import { logger } from './logger.js';

const AUTOMOD_APPROVE_PREFIX = 'cw-inet-am-approve:';
const AUTOMOD_DENY_PREFIX = 'cw-inet-am-deny:';
const AUTOMOD_ACTION_PREFIX = 'cw-inet-am-action:';
const MOD_ACTION_PREFIX = 'cw-inet-mod-action:';
const MOD_MODAL_PREFIX = 'cw-inet-mod-modal:';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function reportPayload(report, status = 'open') {
  const resolved = status !== 'open';
  const decision = report.status === 'denied'
    ? 'Allowed and published'
    : report.action === 'ban'
      ? 'Banned from Clearwater Internet'
      : report.discordActionLabel || report.actionReason || report.action || 'Action taken';
  const text = resolved
    ? [
        '## Automod review completed',
        `**User:** <@${report.authorId}> (${report.authorId})`,
        `**Result:** ${decision}`,
        `**Reviewed by:** ${report.discordReviewedBy ? `<@${report.discordReviewedBy}>` : 'Staff'}`,
      ].join('\n')
    : [
        '## Clearwater Internet Automod',
        `**User:** <@${report.authorId}> (${report.authorId})`,
        `**Reason:** ${clean(report.reason, 300) || 'Automod match'}`,
        `**Category:** ${(Array.isArray(report.categories) ? report.categories : []).join(', ') || 'Not listed'}`,
        '',
        '**Held post:**',
        clean(report.content, 1000) || '_No text content._',
        '',
        '-# Approve the violation to choose an action, or deny it to publish the held post.',
      ].join('\n');
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(text.slice(0, 3900)));
  if (!resolved) {
    container.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${AUTOMOD_APPROVE_PREFIX}${report.id}`)
        .setLabel('Approve Violation')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${AUTOMOD_DENY_PREFIX}${report.id}`)
        .setLabel('Deny / Allow Post')
        .setStyle(ButtonStyle.Success),
    ));
  }
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], users: [] },
  };
}

function automodActionPayload(reportId) {
  const button = (action, label, style = ButtonStyle.Secondary) => new ButtonBuilder()
    .setCustomId(`${AUTOMOD_ACTION_PREFIX}${action}:${reportId}`)
    .setLabel(label)
    .setStyle(style);
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Choose what to do\nThe post will stay held and the selected action will be applied.'))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button('delete', 'Remove Post', ButtonStyle.Danger),
      button('warn', 'Warn'),
      button('mute1', 'Mute 24 Hours'),
      button('mute3', 'Mute 3 Days'),
      button('mute7', 'Mute 1 Week'),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button('ban', 'Ban from Internet', ButtonStyle.Danger),
    ));
  return { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

export function buildInternetModerationPanel(target) {
  const targetId = String(target.id);
  const button = (action, label, style = ButtonStyle.Secondary) => new ButtonBuilder()
    .setCustomId(`${MOD_ACTION_PREFIX}${action}:${targetId}`)
    .setLabel(label)
    .setStyle(style);
  const container = new ContainerBuilder()
    .clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '## Internet Moderation Panel',
      `**User:** <@${targetId}> (${targetId})`,
      'These actions only affect Clearwater Internet. The member will receive a DM.',
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button('mute1', 'Mute 24 Hours'),
      button('mute3', 'Mute 3 Days'),
      button('mute7', 'Mute 1 Week'),
      button('warn', 'Warn'),
      button('ban', 'Ban', ButtonStyle.Danger),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      button('unmute', 'Unmute', ButtonStyle.Success),
      button('unban', 'Unban', ButtonStyle.Success),
    ));
  return { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral };
}

function moderationReasonModal(action, targetId) {
  const labels = {
    mute1: 'Mute for 24 Hours',
    mute3: 'Mute for 3 Days',
    mute7: 'Mute for 1 Week',
    warn: 'Warn Internet User',
    ban: 'Ban from Clearwater Internet',
  };
  return new ModalBuilder()
    .setCustomId(`${MOD_MODAL_PREFIX}${action}:${targetId}`)
    .setTitle(labels[action] || 'Internet Moderation')
    .addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(300)
        .setRequired(true),
    ));
}

function actionDetails(action) {
  if (action === 'delete') return { storeAction: 'delete', durationDays: 'forever', label: 'post removed' };
  if (action === 'mute1') return { storeAction: 'mute', durationDays: 1, label: 'muted for 24 hours' };
  if (action === 'mute3') return { storeAction: 'mute', durationDays: 3, label: 'muted for 3 days' };
  if (action === 'mute7') return { storeAction: 'mute', durationDays: 7, label: 'muted for 1 week' };
  if (action === 'ban') return { storeAction: 'ban', durationDays: 'forever', label: 'banned' };
  if (action === 'warn') return { storeAction: 'warn', durationDays: 'forever', label: 'warned' };
  if (action === 'unmute') return { storeAction: 'unmute', durationDays: 'forever', label: 'unmuted' };
  if (action === 'unban') return { storeAction: 'unban', durationDays: 'forever', label: 'unbanned' };
  throw new Error('Unknown Internet moderation action.');
}

async function applyUserModeration(interaction, action, targetId, reason = '') {
  const details = actionDetails(action);
  await mutateDiscordInternetStore((store) => applyStaffUserAction(store, {
    actor: internetActor(interaction),
    targetId,
    staffAction: details.storeAction,
    reason,
    durationDays: details.durationDays,
  }));
  const dmReason = reason ? `\nReason: ${reason}` : '';
  const dmSent = await dmInternetUser(
    interaction.client,
    targetId,
    `Clearwater Internet moderation notice: you were **${details.label}**.${dmReason}`,
  );
  return { ...details, dmSent };
}

async function sendReviewMessage(client, report) {
  const channelId = String(client.config?.internetAutomodChannelId || '').trim();
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error(`Internet automod channel ${channelId || '(missing)'} is unavailable.`);
  const message = await channel.send(reportPayload(report));
  await mutateDiscordInternetStore((store) => {
    const stored = store.reports.find((item) => item.id === report.id && item.status === 'open');
    if (stored) {
      stored.discordReviewChannelId = channel.id;
      stored.discordReviewMessageId = message.id;
    }
  });
  return message.id;
}

export async function queueInternetAutomodReview(client, report) {
  if (!report?.id || report.source !== 'automod' || report.status !== 'open') return null;
  try {
    return await sendReviewMessage(client, report);
  } catch (error) {
    logger.error(`Could not send Internet automod review ${report.id}`, error);
    return null;
  }
}

export async function ensureInternetAutomodQueue(client) {
  const store = await readInternetStore();
  const pending = store.reports
    .filter((report) => report.source === 'automod' && report.status === 'open' && !report.discordReviewMessageId)
    .slice(0, 25)
    .reverse();
  for (const report of pending) await queueInternetAutomodReview(client, report);
  logger.info(`Internet automod review queue ready (${pending.length} newly queued).`);
}

async function updateReviewMessage(client, report) {
  const channelId = report.discordReviewChannelId || client.config?.internetAutomodChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !report.discordReviewMessageId) return;
  const message = await channel.messages.fetch(report.discordReviewMessageId).catch(() => null);
  if (message) {
    const payload = reportPayload(report, 'resolved');
    delete payload.flags;
    await message.edit(payload).catch(() => {});
  }
}

async function denyAutomod(interaction, reportId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await mutateDiscordInternetStore((store) => {
    const report = reviewInternetReport(store, { reportId, decision: 'deny' });
    report.discordReviewedBy = interaction.user.id;
    report.discordActionLabel = 'Allowed and published';
    const post = report.postId ? store.posts.find((item) => item.id === report.postId) : null;
    return { report: { ...report }, post: post ? { ...post } : null };
  });
  if (result.post) {
    const controller = createInternetFeedController(interaction.client, interaction.client.config);
    if (result.post.parentId) {
      const store = await readInternetStore();
      const parent = store.posts.find((item) => item.id === result.post.parentId);
      if (parent) {
        await controller.addComment(parent, result.post);
        await controller.update(parent);
      }
    } else {
      const messageId = await controller.announce(result.post);
      if (messageId) {
        await mutateDiscordInternetStore((store) => setInternetPostDiscordFeedMessage(store, result.post.id, messageId));
      }
    }
  }
  await dmInternetUser(interaction.client, result.report.authorId, 'Clearwater Internet automod reviewed your held post and approved it for publication.');
  await updateReviewMessage(interaction.client, result.report);
  await interaction.editReply({ content: result.post ? 'The automod hold was denied and the post was published.' : 'The automod hold was denied.' });
}

async function approveAutomodAction(interaction, action, reportId) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const details = actionDetails(action);
  const result = await mutateDiscordInternetStore((store) => {
    const current = store.reports.find((item) => item.id === reportId && item.status === 'open');
    if (!current) throw new Error('That automod report was already reviewed.');
    const reason = current.reason || 'Clearwater Internet automod violation';
    const reportAction = action === 'warn' ? 'warning' : action === 'ban' ? 'ban' : 'delete';
    const report = reviewInternetReport(store, {
      reportId,
      decision: 'accept',
      action: reportAction,
      reason,
      durationDays: action === 'ban' ? 'forever' : undefined,
    });
    if (action.startsWith('mute')) {
      applyStaffUserAction(store, {
        actor: internetActor(interaction),
        targetId: report.authorId,
        staffAction: 'mute',
        reason,
        durationDays: details.durationDays,
      });
    }
    report.discordReviewedBy = interaction.user.id;
    report.discordActionLabel = action === 'delete' ? 'Post removed' : details.label;
    return { report: { ...report }, reason };
  });
  await dmInternetUser(
    interaction.client,
    result.report.authorId,
    action === 'delete'
      ? `Clearwater Internet moderation notice: your held post was removed.\nReason: ${result.reason}`
      : `Clearwater Internet moderation notice: your held post was not published and you were **${details.label}**.\nReason: ${result.reason}`,
  );
  await updateReviewMessage(interaction.client, result.report);
  await interaction.editReply({ content: `Automod review completed: ${result.report.discordActionLabel}.` });
}

export async function handleDiscordInternetModerationInteraction(interaction) {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
  const id = String(interaction.customId || '');
  const handled = id.startsWith(AUTOMOD_APPROVE_PREFIX)
    || id.startsWith(AUTOMOD_DENY_PREFIX)
    || id.startsWith(AUTOMOD_ACTION_PREFIX)
    || id.startsWith(MOD_ACTION_PREFIX)
    || id.startsWith(MOD_MODAL_PREFIX);
  if (!handled) return false;

  try {
    if (!isInternetStaff(interaction)) throw new Error('You need the Moderate Members permission to use Internet moderation.');
    if (id.startsWith(AUTOMOD_APPROVE_PREFIX)) {
      await interaction.reply(automodActionPayload(id.slice(AUTOMOD_APPROVE_PREFIX.length)));
    } else if (id.startsWith(AUTOMOD_DENY_PREFIX)) {
      await denyAutomod(interaction, id.slice(AUTOMOD_DENY_PREFIX.length));
    } else if (id.startsWith(AUTOMOD_ACTION_PREFIX)) {
      const [action, reportId] = id.slice(AUTOMOD_ACTION_PREFIX.length).split(':');
      await approveAutomodAction(interaction, action, reportId);
    } else if (id.startsWith(MOD_ACTION_PREFIX)) {
      const [action, targetId] = id.slice(MOD_ACTION_PREFIX.length).split(':');
      if (action === 'unmute' || action === 'unban') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const result = await applyUserModeration(interaction, action, targetId);
        await interaction.editReply({ content: `<@${targetId}> was ${result.label}.${result.dmSent ? ' A DM was sent.' : ' Their DMs are closed.'}`, allowedMentions: { parse: [] } });
      } else {
        await interaction.showModal(moderationReasonModal(action, targetId));
      }
    } else if (id.startsWith(MOD_MODAL_PREFIX)) {
      const [action, targetId] = id.slice(MOD_MODAL_PREFIX.length).split(':');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await applyUserModeration(interaction, action, targetId, interaction.fields.getTextInputValue('reason'));
      await interaction.editReply({ content: `<@${targetId}> was ${result.label}.${result.dmSent ? ' A DM was sent.' : ' Their DMs are closed.'}`, allowedMentions: { parse: [] } });
    }
  } catch (error) {
    logger.error(`Internet moderation interaction failed (${id})`, error);
    const payload = { content: clean(error?.message || 'That moderation action failed.', 1800), flags: MessageFlags.Ephemeral };
    if (interaction.deferred) await interaction.editReply({ content: payload.content, components: [] }).catch(() => {});
    else if (interaction.replied) await interaction.followUp(payload).catch(() => {});
    else await interaction.reply(payload).catch(() => {});
  }
  return true;
}
