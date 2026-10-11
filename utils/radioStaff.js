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
 * Clearwater Radio staff tools: the admin panel (/radio-staff: force-mute / kick off the radio) and the
 * panic history post. Only members with Administrator use the panel.
 */
export const RADIO_STAFF_PREFIX = 'radio-staff:';
export const RADIO_STAFF_PICK_ID = `${RADIO_STAFF_PREFIX}pick`;
export const RADIO_STAFF_REFRESH_ID = `${RADIO_STAFF_PREFIX}refresh`;
/** Kicked members can't sign back in to the radio for this long. */
export const RADIO_KICK_BLOCK_MS = 5 * 60 * 1000;
const PANEL_FOOTER = 'Clearwater Radio staff panel';
/** The same panel on the website, for admins signed in with Discord. */
export const RADIO_STAFF_URL = 'https://www.cwpcso.com/radio-staff';
export const RADIO_STAFF_ACTIONS = Object.freeze(['mute', 'unmute', 'kick']);

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
  buttons.push(new ButtonBuilder().setURL(RADIO_STAFF_URL).setLabel('Open on cwpcso.com').setStyle(ButtonStyle.Link));
  rows.push(new ActionRowBuilder().addComponents(buttons));
  return { embeds: [embed], components: rows };
}

/**
 * What the website panel shows: who is on the radio and who is muted. nameOf fills in names for
 * muted members who are not on a radio.
 */
export function radioStaffSnapshot(nameOf = () => '') {
  if (!controls) return { running: false, users: [], muted: [] };
  const users = controls.users();
  const onRadio = new Set(users.map((user) => user.userId));
  return {
    running: true,
    users: users.map((user) => ({
      userId: user.userId,
      name: user.name || nameOf(user.userId) || 'Unknown',
      channel: user.channelName,
      muted: Boolean(user.muted),
      since: user.since || null,
    })),
    muted: [...(controls.muted || [])].filter((id) => !onRadio.has(id)).map((id) => ({ userId: id, name: nameOf(id) || '' })),
  };
}

/**
 * Force-mute, unmute or kick a member, then post it in the radio channel chat. Used by the Discord
 * panel and the website. Throws with a status when it can't be done.
 */
export async function runRadioStaffAction(action, userId, by, { from = '' } = {}) {
  const fail = (message, status) => Object.assign(new Error(message), { status });
  if (!RADIO_STAFF_ACTIONS.includes(action)) throw fail('Unknown action.', 400);
  if (!/^\d{15,22}$/.test(String(userId))) throw fail('Pick a member first.', 400);
  if (!controls) throw fail('The radio is not running on the bot host right now.', 503);
  const suffix = from ? ` (${from})` : '';
  let note;
  let closed = 0;
  if (action === 'kick') {
    closed = controls.kick(userId, by);
    note = `👢 <@${by}> kicked <@${userId}> off the radio for 5 minutes${closed ? '' : ' (they were not on a radio)'}${suffix}.`;
  } else {
    await controls.setMuted(userId, action === 'mute', by);
    note = action === 'mute'
      ? `🔇 <@${by}> force-muted <@${userId}> on the radio${suffix}.`
      : `🔊 <@${by}> unmuted <@${userId}> on the radio${suffix}.`;
  }
  logger.info(`Radio staff: ${action} ${userId} by ${by}${suffix}`);
  // Not awaited, so a slow Discord post never holds up the panel's reply.
  void Promise.resolve(controls.postStaff?.({ content: note, allowedMentions: { parse: [] } })).catch(() => {});
  return { ok: true, action, userId, closed };
}

/** Handles the panel's buttons and select; returns true when the interaction was the radio staff panel's. */
export async function handleRadioStaffInteraction(interaction) {
  const id = interaction.customId;
  if (typeof id !== 'string' || !id.startsWith(RADIO_STAFF_PREFIX)) return false;
  if (!isRadioAdmin(interaction)) {
    await interaction.reply({ content: 'Only admins can use the radio staff panel.', flags: MessageFlags.Ephemeral });
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
  if (!RADIO_STAFF_ACTIONS.includes(action)) return false;
  await runRadioStaffAction(action, userId, interaction.user.id);
  await interaction.update(buildRadioStaffPanel(userId));
  return true;
}
