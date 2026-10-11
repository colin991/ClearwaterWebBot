import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  UserSelectMenuBuilder,
} from 'discord.js';
import { logger } from './logger.js';

/**
 * Clearwater Radio staff tools: the admin panel (force-mute / kick off the radio) and the
 * staff channel posts (panic history, weekly stats). Only members with Administrator use the panel.
 */
export const RADIO_STAFF_PREFIX = 'radio-staff:';
export const RADIO_STAFF_OPEN_ID = `${RADIO_STAFF_PREFIX}open`;
export const RADIO_STAFF_PICK_ID = `${RADIO_STAFF_PREFIX}pick`;
export const RADIO_STAFF_REFRESH_ID = `${RADIO_STAFF_PREFIX}refresh`;
/** Kicked members can't sign back in to the radio for this long. */
export const RADIO_KICK_BLOCK_MS = 5 * 60 * 1000;
const PANEL_FOOTER = 'Clearwater Radio staff panel';

/** Staff channel for panic history, weekly stats and the panel. Unset: those posts are skipped. */
export function radioStaffChannelId(env = process.env) {
  return env.RADIO_STAFF_CHANNEL_ID?.trim() || '';
}

// radioBot.js registers the live relay controls here once the radio is running.
let controls = null;
export function setRadioStaffControls(next) {
  controls = next;
}

export function isRadioAdmin(interaction) {
  return Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.Administrator));
}

export function buildRadioPanicEmbed(alert) {
  const at = Math.floor((alert.at || Date.now()) / 1000);
  const where = [alert.location, alert.postal ? `postal ${alert.postal}` : ''].filter(Boolean).join(' · ') || 'Unknown';
  return new EmbedBuilder()
    .setColor(0xc0261b)
    .setTitle('🚨 Radio panic')
    .addFields(
      { name: 'Who', value: `${alert.userId ? `<@${alert.userId}> · ` : ''}${alert.name || 'Unknown'}${alert.unit ? ` (${alert.unit})` : ''}`.slice(0, 1024) },
      { name: 'Where', value: String(where).slice(0, 1024) },
      { name: 'When', value: `<t:${at}:F> (<t:${at}:R>)` },
      { name: 'From', value: alert.source === 'radio' ? 'PANIC button on a radio' : 'In game (;panic or an ER:LC panic)' },
    );
}

/** The ephemeral panel: who is on the radio, who is muted, and actions for the picked member. */
export function buildRadioStaffPanel(selectedId = '') {
  const users = controls?.users() || [];
  const muted = new Set(controls?.muted || []);
  const embed = new EmbedBuilder().setColor(0x267bd7).setTitle('📻 Radio staff panel').setFooter({ text: PANEL_FOOTER });
  if (!controls) {
    embed.setDescription('The radio is not running on the bot host right now.');
    return { embeds: [embed], components: [] };
  }
  const online = users.length
    ? users.slice(0, 25).map((user) => `<@${user.userId}> · ${user.channelName}${user.muted ? ' · 🔇 muted' : ''}`).join('\n')
    : 'Nobody is on a radio.';
  const mutedOffline = [...muted].filter((id) => !users.some((user) => user.userId === id));
  embed.setDescription([
    `**On the radio now (${users.length})**`,
    online,
    mutedOffline.length ? `\n**Also muted (not on a radio)**\n${mutedOffline.map((id) => `<@${id}>`).join(', ')}` : '',
    '\nPick a member below to force-mute, unmute or kick them off the radio. A kick keeps them off for 5 minutes.',
  ].filter(Boolean).join('\n'));
  const rows = [new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder().setCustomId(RADIO_STAFF_PICK_ID).setPlaceholder('Pick a member').setMinValues(1).setMaxValues(1),
  )];
  const buttons = [];
  if (selectedId) {
    const user = users.find((entry) => entry.userId === selectedId);
    embed.addFields({
      name: 'Selected',
      value: `<@${selectedId}> · ${user ? `on ${user.channelName}` : 'not on a radio'} · ${muted.has(selectedId) ? '🔇 muted' : 'can talk'}`,
    });
    buttons.push(muted.has(selectedId)
      ? new ButtonBuilder().setCustomId(`${RADIO_STAFF_PREFIX}unmute:${selectedId}`).setLabel('Unmute').setStyle(ButtonStyle.Success)
      : new ButtonBuilder().setCustomId(`${RADIO_STAFF_PREFIX}mute:${selectedId}`).setLabel('Force mute').setStyle(ButtonStyle.Secondary));
    buttons.push(new ButtonBuilder().setCustomId(`${RADIO_STAFF_PREFIX}kick:${selectedId}`).setLabel('Kick off radio').setStyle(ButtonStyle.Danger));
  }
  buttons.push(new ButtonBuilder().setCustomId(selectedId ? `${RADIO_STAFF_REFRESH_ID}:${selectedId}` : RADIO_STAFF_REFRESH_ID).setLabel('Refresh').setStyle(ButtonStyle.Primary));
  rows.push(new ActionRowBuilder().addComponents(buttons));
  return { embeds: [embed], components: rows };
}

/** The message that stays in the staff channel; its button opens the panel for admins only. */
export function buildRadioStaffLauncher() {
  const embed = new EmbedBuilder()
    .setColor(0x267bd7)
    .setTitle('📻 Radio staff panel')
    .setDescription('Admins: open the panel to see who is on the radio, force-mute someone, or kick them off the radio.')
    .setFooter({ text: PANEL_FOOTER });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(RADIO_STAFF_OPEN_ID).setLabel('Open staff panel').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

/** Keeps one launcher message in the staff channel. */
export async function ensureRadioStaffLauncher(client, env = process.env) {
  const channelId = radioStaffChannelId(env);
  if (!channelId) return;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.messages) {
    logger.warn('Radio staff channel is missing or not a text channel.');
    return;
  }
  const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  const existing = recent?.find((message) => message.author?.id === client.user?.id
    && message.embeds?.[0]?.footer?.text === PANEL_FOOTER);
  if (existing) return;
  await channel.send(buildRadioStaffLauncher()).catch((error) => logger.warn(`Radio staff panel post failed: ${error?.message || error}`));
}

/** Handles the panel's buttons and select; returns true when the interaction was the radio staff panel's. */
export async function handleRadioStaffInteraction(interaction) {
  const id = interaction.customId;
  if (typeof id !== 'string' || !id.startsWith(RADIO_STAFF_PREFIX)) return false;
  if (!isRadioAdmin(interaction)) {
    await interaction.reply({ content: 'Only admins can use the radio staff panel.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (id === RADIO_STAFF_OPEN_ID) {
    await interaction.reply({ ...buildRadioStaffPanel(), flags: MessageFlags.Ephemeral });
    return true;
  }
  if (id === RADIO_STAFF_PICK_ID && interaction.isUserSelectMenu?.()) {
    await interaction.update(buildRadioStaffPanel(interaction.values[0]));
    return true;
  }
  const [, action, userId = ''] = id.split(':');
  if (action === 'refresh') {
    await interaction.update(buildRadioStaffPanel(userId));
    return true;
  }
  if (!controls || !/^\d{15,22}$/.test(userId)) {
    await interaction.reply({ content: 'The radio is not running on the bot host right now.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const by = interaction.user.id;
  let note = '';
  if (action === 'mute' || action === 'unmute') {
    await controls.setMuted(userId, action === 'mute', by);
    note = action === 'mute' ? `🔇 <@${by}> force-muted <@${userId}> on the radio.` : `🔊 <@${by}> unmuted <@${userId}> on the radio.`;
  } else if (action === 'kick') {
    const closed = controls.kick(userId, by);
    note = `👢 <@${by}> kicked <@${userId}> off the radio for 5 minutes${closed ? '' : ' (they were not on a radio)'}.`;
  } else {
    return false;
  }
  logger.info(`Radio staff: ${action} ${userId} by ${by}`);
  await interaction.update(buildRadioStaffPanel(userId));
  await controls.postStaff?.({ content: note, allowedMentions: { parse: [] } });
  return true;
}
