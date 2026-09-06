import {
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PINELLAS_EMPLOYEE_WELCOME_ROLE_ID,
  PINELLAS_GUILD_ID,
  requirePinellasCommandAccess,
} from './pinellasServer.js';
import { logger } from './logger.js';

export const PINELLAS_MASS_SHIFT_CHANNEL_ID = '1516237998180794388';
export const PINELLAS_MASS_SHIFT_ATTEND_PREFIX = 'pcs:massshift:attend:';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-mass-shifts.json');
const BANNER_PATH = path.join(ROOT, 'assets', 'pcso-mass-shift-banner.png');
const FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-application-footer.png');

const SLOGO_EMOJI = '<:slogo:1546245229420744804>';
const APPLICATION_EMOJI = '<:Application:1515820976745480242>';
const SHEET_EMOJI = '<:sheet:1546293540827701329>';
const BELL_EMOJI = { id: '1521058727988433016', name: 'bell' };

function newId() {
  return randomBytes(4).toString('hex');
}

async function readStore() {
  try {
    const store = JSON.parse(await readFile(STORE_PATH, 'utf8'));
    return {
      shifts: store.shifts && typeof store.shifts === 'object' ? store.shifts : {},
    };
  } catch {
    return { shifts: {} };
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

async function loadAttachment(filePath, name) {
  try {
    const buffer = await readFile(filePath);
    return new AttachmentBuilder(buffer, { name });
  } catch (error) {
    logger.warn(`Pinellas mass shift: missing asset ${name} (${error?.message || error})`);
    return null;
  }
}

function attendingListText(attendeeIds) {
  const lines = (attendeeIds || []).map((id) => `- **<@${id}>**`);
  return [
    `## ${SHEET_EMOJI} Personnel Attending`,
    lines.length ? lines.join('\n') : '-# Nobody has signed up yet.',
    '',
  ].join('\n');
}

async function buildMassShiftPayload(shift, { includeFiles = true } = {}) {
  const files = [];
  const banner = includeFiles
    ? await loadAttachment(BANNER_PATH, 'pcso-mass-shift-banner.png')
    : null;
  const footer = includeFiles
    ? await loadAttachment(FOOTER_PATH, 'pcso-application-footer.png')
    : null;
  if (banner) files.push(banner);
  if (footer) files.push(footer);

  // Even when not re-uploading, keep attachment:// refs so Discord can reuse
  // the files already on the message.
  const hasBanner = Boolean(banner) || !includeFiles;
  const hasFooter = Boolean(footer) || !includeFiles;

  const startedTs = Math.floor(new Date(shift.createdAt).getTime() / 1000);
  const container = new ContainerBuilder().clearAccentColor();

  if (hasBanner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-mass-shift-banner.png'),
      ),
    );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${SLOGO_EMOJI} Mass Shift Briefing`,
        `-# <@&${PINELLAS_EMPLOYEE_WELCOME_ROLE_ID}>`,
        '',
        'The Pinellas County Sheriff’s Office Command Staff is officially initiating a Mass Shift and requests that all available personnel report for duty. This shift is intended to increase departmental activity, strengthen countywide patrol coverage, and ensure that the citizens of Pinellas County and Clearwater receive the highest level of law enforcement service possible.',
        '',
        'All members are expected to maintain the highest level of professionalism, follow all departmental policies and procedures, and represent the Pinellas County Sheriff’s Office in a positive manner at all times while on duty.',
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${APPLICATION_EMOJI} Additional Details`,
        `**Primary Focus:** ${shift.focus}`,
        `**Date & Time**: <t:${startedTs}:F>`,
        `**Initiated By:** <@${shift.initiatorId}>`,
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(attendingListText(shift.attendeeIds)),
        )
        .setButtonAccessory(
          new ButtonBuilder()
            .setCustomId(`${PINELLAS_MASS_SHIFT_ATTEND_PREFIX}${shift.id}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(BELL_EMOJI),
        ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    );

  if (hasFooter) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-application-footer.png'),
      ),
    );
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      parse: [],
      roles: [PINELLAS_EMPLOYEE_WELCOME_ROLE_ID],
      users: [...new Set([shift.initiatorId, ...(shift.attendeeIds || [])])],
    },
  };
  if (includeFiles && files.length) payload.files = files;
  return payload;
}

export async function postPinellasMassShift({ guild, issuerMember, focus }) {
  if (String(guild.id) !== PINELLAS_GUILD_ID) {
    throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
  }
  requirePinellasCommandAccess(issuerMember);

  const cleanFocus = String(focus || '').trim();
  if (!cleanFocus) throw new Error('Provide a primary focus for the mass shift.');
  if (cleanFocus.length > 200) throw new Error('Keep the focus under 200 characters.');

  const channel = guild.channels.cache.get(PINELLAS_MASS_SHIFT_CHANNEL_ID)
    || await guild.channels.fetch(PINELLAS_MASS_SHIFT_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Mass shift channel \`${PINELLAS_MASS_SHIFT_CHANNEL_ID}\` is unavailable.`);
  }

  const shift = {
    id: newId(),
    focus: cleanFocus,
    initiatorId: issuerMember.id,
    attendeeIds: [issuerMember.id],
    createdAt: new Date().toISOString(),
    channelId: channel.id,
    messageId: null,
    guildId: guild.id,
  };

  const payload = await buildMassShiftPayload(shift);
  const message = await channel.send(payload);
  shift.messageId = message.id;

  const store = await readStore();
  store.shifts[shift.id] = shift;
  await writeStore(store);

  logger.info(
    `Pinellas mass shift: ${issuerMember.user?.tag || issuerMember.id} started ${shift.id} (${cleanFocus})`,
  );
  return shift;
}

export async function handlePinellasMassShiftInteraction(interaction) {
  const id = interaction.customId || '';
  if (!id.startsWith(PINELLAS_MASS_SHIFT_ATTEND_PREFIX)) return false;
  if (!interaction.isButton()) return false;

  if (String(interaction.guildId) !== PINELLAS_GUILD_ID) {
    await interaction.reply({
      content: 'Mass shifts are only available in the Pinellas County Sheriff\'s Office server.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
    return true;
  }

  const shiftId = id.slice(PINELLAS_MASS_SHIFT_ATTEND_PREFIX.length);
  const store = await readStore();
  const shift = store.shifts?.[shiftId];
  if (!shift) {
    await interaction.reply({
      content: 'That mass shift briefing was not found.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
    return true;
  }

  const userId = interaction.user.id;
  shift.attendeeIds = Array.isArray(shift.attendeeIds) ? shift.attendeeIds : [];
  if (shift.attendeeIds.includes(userId)) {
    await interaction.reply({
      content: 'You are already on the Personnel Attending list.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
    return true;
  }

  shift.attendeeIds.push(userId);
  store.shifts[shiftId] = shift;
  await writeStore(store);

  try {
    const payload = await buildMassShiftPayload(shift, { includeFiles: false });
    await interaction.update(payload);
    await interaction.followUp({
      content: 'You have been added to **Personnel Attending**.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
  } catch (error) {
    logger.warn(`Pinellas mass shift attend update failed: ${error?.message || error}`);
    // Fallback: try editing the message directly if update failed.
    try {
      const channel = await interaction.client.channels.fetch(shift.channelId).catch(() => null);
      const message = channel?.messages
        ? await channel.messages.fetch(shift.messageId).catch(() => null)
        : null;
      if (message) await message.edit(await buildMassShiftPayload(shift, { includeFiles: false }));
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'You have been added to **Personnel Attending**.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    } catch (editError) {
      logger.warn(`Pinellas mass shift fallback edit failed: ${editError?.message || editError}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'You were added, but the briefing message could not be refreshed.',
          flags: MessageFlags.Ephemeral,
        }).catch(() => null);
      }
    }
  }

  return true;
}
