import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { renderLibertyLocationMap } from './libertyMapImage.js';
import { logger } from './logger.js';
import {
  getPcsoSiteForm,
  pcsoFormChannelId,
  publicSiteUrl,
  updatePcsoSiteForm,
} from './pcsoSiteForms.js';
import { memberHasPinellasInfractionAccess } from './pinellasServer.js';

export const PCSO_RECORDS_ACCEPT_PREFIX = 'pcso:rec:ok:';
export const PCSO_RECORDS_DENY_PREFIX = 'pcso:rec:no:';
export const PCSO_RECORDS_MODAL_PREFIX = 'pcso:rec:modal:';

function formTitle(kind) {
  if (kind === 'police-report') return 'Police report';
  if (kind === 'crime-stoppers') return 'Anonymous Crime Stoppers tip';
  if (kind === 'public-records') return 'Public records request';
  return 'Personnel complaint';
}

export function buildPcsoFormEmbed(record) {
  const fields = record.fields || {};
  const embed = new EmbedBuilder()
    .setColor(0x34363b)
    .setTitle(formTitle(record.kind))
    .setFooter({ text: record.id })
    .setTimestamp(new Date(record.createdAt || Date.now()));

  if (record.kind === 'crime-stoppers') {
    embed.setDescription(fields.tip || '—');
    return embed;
  }
  if (record.kind === 'police-report') {
    embed.addFields(
      { name: 'Name', value: fields.name || 'Not given', inline: true },
      { name: 'Incident', value: fields.incident || 'Not given', inline: true },
      {
        name: 'Map location',
        value: `${Math.round((fields.mapLeft || 0) * 100)}% west · ${Math.round((fields.mapTop || 0) * 100)}% north`,
        inline: false,
      },
      { name: 'What happened', value: (fields.description || '—').slice(0, 1024) },
    );
    return embed;
  }
  if (record.kind === 'public-records') {
    embed.addFields(
      { name: 'Request', value: fields.subjectType === 'case' ? 'Case number' : 'Deputy', inline: true },
      { name: 'Subject', value: fields.subject || '—', inline: true },
      { name: 'Requester', value: record.requester?.discordId ? `<@${record.requester.discordId}>` : 'Unknown', inline: true },
      { name: 'Details', value: (fields.details || 'None').slice(0, 1024) },
    );
    return embed;
  }
  embed.addFields(
    { name: 'Trooper', value: fields.trooperName || '—', inline: true },
    { name: 'Badge', value: fields.badgeNumber || '—', inline: true },
    { name: 'Location', value: fields.location || '—', inline: false },
    { name: 'Reason', value: fields.reason || '—', inline: false },
    { name: 'Description', value: (fields.description || '—').slice(0, 1024) },
    { name: 'Witnesses', value: (fields.witnesses || 'None listed').slice(0, 1024) },
  );
  if (record.requester?.discordId) {
    embed.addFields({ name: 'Filed by', value: `<@${record.requester.discordId}>` });
  }
  return embed;
}

export async function postPcsoSiteForm(client, record) {
  const channelId = pcsoFormChannelId(record.kind);
  if (!channelId) {
    logger.warn(`PCSO site form ${record.id} saved; no Discord channel configured for ${record.kind}.`);
    return { posted: false, reason: 'no_channel' };
  }
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error('The PCSO form channel is unavailable.');
  }
  const embed = buildPcsoFormEmbed(record);
  const payload = {
    embeds: [embed],
    allowedMentions: { parse: [] },
  };
  if (record.kind === 'police-report') {
    const png = await renderLibertyLocationMap({
      left: record.fields?.mapLeft,
      top: record.fields?.mapTop,
    });
    if (png) {
      payload.files = [new AttachmentBuilder(png, { name: 'location.png' })];
      embed.setImage('attachment://location.png');
    }
  }
  if (record.kind === 'public-records') {
    payload.components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PCSO_RECORDS_ACCEPT_PREFIX}${record.id}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`${PCSO_RECORDS_DENY_PREFIX}${record.id}`).setLabel('Deny').setStyle(ButtonStyle.Danger),
      ),
    ];
  }
  const message = await channel.send(payload);
  await updatePcsoSiteForm(record.id, { channelId, messageId: message.id });
  return { posted: true, channelId, messageId: message.id };
}

async function dmRequester(client, discordId, content) {
  const user = await client.users.fetch(discordId).catch(() => null);
  if (!user) throw new Error('Could not DM the requester.');
  await user.send({ content: content.slice(0, 1800) });
}

export async function handlePcsoSiteFormInteraction(interaction) {
  const id = interaction.customId || '';
  const isOurs = id.startsWith(PCSO_RECORDS_ACCEPT_PREFIX)
    || id.startsWith(PCSO_RECORDS_DENY_PREFIX)
    || id.startsWith(PCSO_RECORDS_MODAL_PREFIX);
  if (!isOurs) return false;

  const member = interaction.member || await interaction.guild?.members.fetch(interaction.user.id).catch(() => null);
  if (!memberHasPinellasInfractionAccess(member) && !interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: 'You need a PCSO command role to accept or deny records requests.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (interaction.isButton() && id.startsWith(PCSO_RECORDS_ACCEPT_PREFIX)) {
    const formId = id.slice(PCSO_RECORDS_ACCEPT_PREFIX.length);
    const modal = new ModalBuilder()
      .setCustomId(`${PCSO_RECORDS_MODAL_PREFIX}${formId}`)
      .setTitle('Send records');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('report')
        .setLabel('Report / key to DM')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1500),
    ));
    await interaction.showModal(modal);
    return true;
  }

  if (interaction.isButton() && id.startsWith(PCSO_RECORDS_DENY_PREFIX)) {
    const formId = id.slice(PCSO_RECORDS_DENY_PREFIX.length);
    const record = await getPcsoSiteForm(formId);
    if (!record?.requester?.discordId) throw new Error('That request could not be found.');
    await dmRequester(
      interaction.client,
      record.requester.discordId,
      `Your PCSO public records request was denied. You can file a complaint here: ${publicSiteUrl()}/complaint`,
    );
    await updatePcsoSiteForm(formId, { status: 'denied', decidedBy: interaction.user.id });
    await interaction.update({
      content: `Denied by <@${interaction.user.id}>.`,
      components: [],
    }).catch(async () => {
      await interaction.reply({ content: 'Request denied. The requester was DMed.', flags: MessageFlags.Ephemeral });
    });
    return true;
  }

  if (interaction.isModalSubmit() && id.startsWith(PCSO_RECORDS_MODAL_PREFIX)) {
    const formId = id.slice(PCSO_RECORDS_MODAL_PREFIX.length);
    const record = await getPcsoSiteForm(formId);
    if (!record?.requester?.discordId) throw new Error('That request could not be found.');
    const report = String(interaction.fields.getTextInputValue('report') || '').trim();
    if (!report) throw new Error('Enter the report or key to send.');
    await dmRequester(
      interaction.client,
      record.requester.discordId,
      `Your PCSO public records request was accepted.\n\n${report}`.slice(0, 1800),
    );
    await updatePcsoSiteForm(formId, { status: 'accepted', decidedBy: interaction.user.id });
    await interaction.reply({ content: 'Accepted. The report/key was DMed to the requester.', flags: MessageFlags.Ephemeral });
    if (interaction.message?.editable) {
      await interaction.message.edit({ content: `Accepted by <@${interaction.user.id}>.`, components: [] }).catch(() => {});
    }
    return true;
  }

  return true;
}
