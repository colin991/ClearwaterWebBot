import {
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { memberHasPinellasCommandAccess } from './pinellasServer.js';

export const DOD_CUSTODY_CHANNEL_ID = '1545195433792643143';
export const DOD_INCIDENT_CHANNEL_ID = '1545195332822900807';
export const DOD_STAFF_LOG_CHANNEL_ID = '1545210075600257074';
export const DOD_DEPLOYMENT_CHANNEL_ID = '1545195147703357541';
export const DOD_MEMBER_ROLE_ID = '1552815019761205320';
export const DOD_GUILD_ID = '1536695906768781362';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const COUNTER_PATH = path.join(ROOT, 'data', 'dod-report-counters.json');
const HEADER_PATH = path.join(ROOT, 'assets', 'pinellas-ops-banner.png');
const FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-application-footer.png');
const DOD_LOGO = '<:DODlogo:1545234117606641774>';
let counterQueue = Promise.resolve();

function memberRoleIds(member) {
  if (member?.roles?.cache?.keys) return new Set([...member.roles.cache.keys()].map(String));
  if (Array.isArray(member?.roles)) return new Set(member.roles.map((role) => String(role?.id || role)));
  return new Set();
}

export function requireDodMember(member, { staff = false } = {}) {
  const administrator = member?.permissions?.has?.(PermissionFlagsBits.Administrator)
    || member?.permissions?.has?.(PermissionFlagsBits.ManageRoles);
  if (administrator || memberHasPinellasCommandAccess(member)) return true;
  if (!staff && memberRoleIds(member).has(DOD_MEMBER_ROLE_ID)) return true;
  throw new Error(staff
    ? 'You need the PCSO command role or Manage Roles to use this command.'
    : 'You need the Detentions role to use this command.');
}

export function wordCount(value) {
  return String(value || '').trim().split(/\s+/).filter(Boolean).length;
}

export function requireMinimumWords(value, minimum, label) {
  const count = wordCount(value);
  if (count < minimum) throw new Error(`${label} must contain at least ${minimum} words (currently ${count}).`);
}

async function nextReportNumber(kind) {
  const run = counterQueue.then(async () => {
    const store = await readJsonFile(COUNTER_PATH, { custody: 0, incident: 0 });
    const next = Math.max(0, Number(store?.[kind]) || 0) + 1;
    await writeJsonFile(COUNTER_PATH, { ...store, [kind]: next }, { backup: true });
    return String(next).padStart(5, '0');
  });
  counterQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function attachment(filePath, name) {
  return new AttachmentBuilder(await readFile(filePath), { name });
}

export async function buildDodPayload(content, { allowedUserIds = [], pingRole = false } = {}) {
  const files = [
    await attachment(HEADER_PATH, 'Detentions.png'),
    await attachment(FOOTER_PATH, 'pcso-application-footer.png'),
  ];
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://Detentions.png'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('attachment://pcso-application-footer.png'),
    ));
  return {
    components: [container], files, flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      parse: [],
      users: [...new Set(allowedUserIds.map(String))],
      roles: pingRole ? [DOD_MEMBER_ROLE_ID] : [],
    },
  };
}

export async function destinationChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error(`The configured destination channel <#${channelId}> is unavailable.`);
  return channel;
}

export async function postCustodyReport(interaction, { receivedBy, vehicle, inmate }) {
  const number = await nextReportNumber('custody');
  const timestamp = Math.floor(Date.now() / 1000);
  const content = [
    `## Custody Transfer Log #${number}`,
    '',
    `- **Custody Transferred To:** <@${interaction.user.id}>`,
    `- **Custody Transferred By:** ${receivedBy}`,
    `- **Transportation Method:** ${vehicle}`,
    `- **Time of Occurrence:** <t:${timestamp}:F>`,
    `- **Inmate:** ${inmate}`,
  ].join('\n');
  const channel = await destinationChannel(interaction.guild, DOD_CUSTODY_CHANNEL_ID);
  const message = await channel.send(await buildDodPayload(content, { allowedUserIds: [interaction.user.id] }));
  return { number, message };
}

export async function postIncidentReport(interaction, { assistingDeputies, description, action, inmate }) {
  requireMinimumWords(description, 50, 'Incident description');
  requireMinimumWords(action, 50, 'Action response');
  const number = await nextReportNumber('incident');
  const content = [
    `## Incident Log #${number}`,
    '',
    `- **Lead Deputy:** <@${interaction.user.id}>`,
    `- **Assisting Deputies:** ${assistingDeputies}`,
    `- **Incident Description:** ${description}`,
    `- **Action Response:** ${action}`,
    `- **Inmate:** ${inmate}`,
  ].join('\n');
  const channel = await destinationChannel(interaction.guild, DOD_INCIDENT_CHANNEL_ID);
  const message = await channel.send(await buildDodPayload(content, { allowedUserIds: [interaction.user.id] }));
  return { number, message };
}

export async function postDodInfraction(interaction, { target, reason, type, notes }) {
  const content = [
    `# ${DOD_LOGO} Infraction`,
    `> <@${target.id}> has received a **${type}** for ${reason}.`,
    '',
    `**Reason:** ${reason}`,
    `**Type:** ${type}`,
    `**Notes:** ${notes}`,
    `-# **Issued by:** <@${interaction.user.id}>`,
  ].join('\n');
  const channel = await destinationChannel(interaction.guild, DOD_STAFF_LOG_CHANNEL_ID);
  return channel.send(await buildDodPayload(content, { allowedUserIds: [target.id, interaction.user.id] }));
}

export async function postDodPromotion(interaction, { target, reason, rank }) {
  const content = [
    `# ${DOD_LOGO} Promotion`,
    `> -# Congrats, <@${target.id}>! We would like to thank you for your hard work, professionalism, dedication, and more. With this, you've been promoted to **${rank}**!`,
    '',
    `**Reason:** ${reason}`,
    `-# **Issued by:** <@${interaction.user.id}>`,
  ].join('\n');
  const channel = await destinationChannel(interaction.guild, DOD_STAFF_LOG_CHANNEL_ID);
  return channel.send(await buildDodPayload(content, { allowedUserIds: [target.id, interaction.user.id] }));
}

export async function postDodDeployment(interaction) {
  const content = [
    `# ${DOD_LOGO} Detentions Deployment`,
    '',
    '**Time:** Now',
    '**Location:** Pinellas County Prison',
    `**Host:** <@${interaction.user.id}>`,
    `**Ping:** <@&${DOD_MEMBER_ROLE_ID}>`,
    '',
    'React if you are attending/already on shift as detentions.',
  ].join('\n');
  const channel = await destinationChannel(interaction.guild, DOD_DEPLOYMENT_CHANNEL_ID);
  const message = await channel.send(await buildDodPayload(content, {
    allowedUserIds: [interaction.user.id], pingRole: true,
  }));
  await message.react('✅').catch(() => {});
  return message;
}
