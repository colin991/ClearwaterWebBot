import {
  ActionRowBuilder,
  AttachmentBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/** Pinellas County Sheriff's Office Discord server. */
export const PINELLAS_GUILD_ID = '1514100977920245760';

/** Welcome / introductions channel. */
export const PINELLAS_WELCOME_CHANNEL_ID = '1514100979711217706';

/** Applications channel linked in the welcome message. */
export const PINELLAS_APPLICATIONS_CHANNEL_ID = '1514443793607295058';

/** Channel for employee-role welcome messages. */
export const PINELLAS_EMPLOYEE_WELCOME_CHANNEL_ID = '1514108033720909894';

/** Role that triggers the employee welcome message when granted. */
export const PINELLAS_EMPLOYEE_WELCOME_ROLE_ID = '1514363218754142218';

/** Information channel linked from the welcome message. */
export const PINELLAS_INFORMATION_CHANNEL_URL =
  'https://discord.com/channels/1514100977920245760/1514436767980454060';

const EMPLOYEE_INFO_CHANNEL_URL =
  'https://discord.com/channels/1514100977920245760/1514128260102099016';
const DIVISIONS_CHANNEL_URL =
  'https://discord.com/channels/1514100977920245760/1514666220538957994';

export const PINELLAS_NICKNAME = 'Pinellas Operations';

export const PINELLAS_BIO =
  "<:unlock:1517217312489472030> **Pinellas County** Sheriff's Office internal utilities and operations manager.";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Per-server avatar (PCSO badge branding). */
const PINELLAS_LOGO_PATH = path.join(ROOT, 'assets', 'pinellas-ops-logo.png');
/** Per-server banner (PCSO application / ops branding). */
const PINELLAS_BANNER_PATH = path.join(ROOT, 'assets', 'pinellas-ops-banner.webp');
const EMPLOYEE_FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-application-footer.png');
const PROFILE_STATE_PATH = path.join(ROOT, 'data', 'pinellas-profile.json');

const WAVE_EMOJI = '<:wave:1517217333234503790>';
const SLOGO_EMOJI = '<:slogo:1546245229420744804>';
const SAVE_EMOJI = '<:Save:1517217415098798280>';
const MEMBER_EMOJI = { id: '1517350373671833732', name: 'member' };

/** Prevent duplicate welcomes when Discord emits multiple member updates. */
const recentEmployeeWelcomes = new Map();
const EMPLOYEE_WELCOME_DEDUP_MS = 60_000;

/**
 * True when audit logs show this member just received the given role.
 * Used when the old member snapshot is partial/unreliable.
 */
async function memberGainedRoleViaAudit(member, roleId) {
  // Discord can lag a moment before the role-update audit entry is available.
  await new Promise((resolve) => setTimeout(resolve, 1200));

  const logs = await member.guild.fetchAuditLogs({
    type: AuditLogEvent.MemberRoleUpdate,
    limit: 6,
  }).catch((error) => {
    logger.warn(`Pinellas: could not read Member Role Update audit logs: ${error?.message || error}`);
    return null;
  });
  if (!logs) return false;

  const cutoff = Date.now() - 25_000;
  for (const entry of logs.entries.values()) {
    if (entry.createdTimestamp < cutoff) continue;
    if (entry.targetId !== member.id && entry.target?.id !== member.id) continue;
    const added = entry.changes?.find((change) => change.key === '$add');
    if (!Array.isArray(added?.new)) continue;
    if (added.new.some((role) => String(role.id) === String(roleId))) return true;
  }
  return false;
}

let cachedLogo = null;
let cachedBanner = null;

async function loadAsset(filePath, cacheRef) {
  if (cacheRef.value) return cacheRef.value;
  const buffer = await readFile(filePath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  cacheRef.value = { buffer, sha256 };
  return cacheRef.value;
}

async function loadPinellasLogo() {
  cachedLogo ||= { value: null };
  return loadAsset(PINELLAS_LOGO_PATH, cachedLogo);
}

async function loadPinellasBanner() {
  cachedBanner ||= { value: null };
  return loadAsset(PINELLAS_BANNER_PATH, cachedBanner);
}

async function readProfileState() {
  try {
    return JSON.parse(await readFile(PROFILE_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeProfileState(state) {
  await mkdir(path.dirname(PROFILE_STATE_PATH), { recursive: true });
  await writeFile(PROFILE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Apply the Pinellas per-server nickname, avatar, banner, and bio.
 * Re-uploads images only when asset hashes change so restarts stay quiet.
 */
export async function ensurePinellasServerProfile(client) {
  const guild = client.guilds.cache.get(PINELLAS_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_GUILD_ID).catch((error) => {
      logger.warn(`Pinellas: could not fetch guild ${PINELLAS_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Pinellas: bot is not in guild ${PINELLAS_GUILD_ID}; skipping profile.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('Pinellas: could not resolve bot member for profile edit.');
    return false;
  }

  const logo = await loadPinellasLogo();
  const banner = await loadPinellasBanner();
  const state = await readProfileState();
  const needsNick = me.nickname !== PINELLAS_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  const needsBanner = state.bannerSha256 !== banner.sha256 || !me.banner;
  const needsBio = state.bio !== PINELLAS_BIO;
  if (!needsNick && !needsAvatar && !needsBanner && !needsBio) {
    logger.info(`Pinellas: server profile already set (${PINELLAS_NICKNAME}).`);
    return true;
  }

  try {
    const options = { reason: 'Pinellas Operations server profile' };
    if (needsNick) options.nick = PINELLAS_NICKNAME;
    if (needsAvatar) options.avatar = logo.buffer;
    if (needsBanner) {
      options.banner = `data:image/webp;base64,${banner.buffer.toString('base64')}`;
    }
    if (needsBio) options.bio = PINELLAS_BIO;

    await guild.members.editMe(options);
    await writeProfileState({
      logoSha256: logo.sha256,
      bannerSha256: banner.sha256,
      bio: PINELLAS_BIO,
      nick: PINELLAS_NICKNAME,
      updatedAt: new Date().toISOString(),
    });
    logger.info(
      `Pinellas: updated server profile`
      + `${needsNick ? ` nick="${PINELLAS_NICKNAME}"` : ''}`
      + `${needsAvatar ? ' avatar' : ''}`
      + `${needsBanner ? ' banner' : ''}`
      + `${needsBio ? ' bio' : ''}.`,
    );
    return true;
  } catch (error) {
    // Fall back to smaller edits so a banner/avatar rate-limit does not block nick/bio.
    const fallback = { reason: 'Pinellas Operations server profile (partial)' };
    if (needsNick) fallback.nick = PINELLAS_NICKNAME;
    if (needsBio) fallback.bio = PINELLAS_BIO;
    if (fallback.nick || fallback.bio) {
      try {
        await guild.members.editMe(fallback);
        const nextState = {
          ...state,
          nick: PINELLAS_NICKNAME,
          updatedAt: new Date().toISOString(),
        };
        if (needsBio) nextState.bio = PINELLAS_BIO;
        await writeProfileState(nextState);
        logger.info('Pinellas: applied nick/bio after a partial profile failure.');
      } catch (fallbackError) {
        logger.error('Pinellas: fallback nick/bio update failed', fallbackError);
      }
    }
    logger.error('Pinellas: failed to update server profile', error);
    return false;
  }
}

/** Post the Pinellas welcome message when a member joins that server. */
export async function sendPinellasWelcome(member) {
  if (String(member.guild?.id) !== PINELLAS_GUILD_ID) return false;
  if (member.user?.bot) return false;

  const channel = member.guild.channels.cache.get(PINELLAS_WELCOME_CHANNEL_ID)
    || await member.guild.channels.fetch(PINELLAS_WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Pinellas: welcome channel ${PINELLAS_WELCOME_CHANNEL_ID} unavailable.`);
    return false;
  }

  const memberCount = Number(member.guild.memberCount) || member.guild.members.cache.size || 0;
  const content = [
    `${WAVE_EMOJI} **Welcome** <@${member.id}> to the ${SLOGO_EMOJI} **Pinellas County Sheriff's Office**, protecting Clearwater & Pinellas County since 1912.`,
    `-# We are always in search of additional personnel, please apply in <#${PINELLAS_APPLICATIONS_CHANNEL_ID}>. We hope you enjoy your stay.`,
  ].join('\n');

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pinellas:welcome:members')
      .setEmoji(MEMBER_EMOJI)
      .setLabel(String(memberCount))
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setLabel('Information')
      .setStyle(ButtonStyle.Link)
      .setURL(PINELLAS_INFORMATION_CHANNEL_URL),
  );

  await channel.send({
    content,
    components: [row],
    allowedMentions: { users: [member.id] },
  });
  logger.info(`Pinellas: welcomed ${member.user?.tag || member.id}.`);
  return true;
}

/**
 * When a member receives the employee welcome role, post the PCSO welcome card.
 *
 * Important: never fetch() the previous member for this check — that loads the
 * post-update member and makes it look like they already had the role.
 */
export async function handlePinellasEmployeeRoleWelcome(previousMember, member) {
  if (String(member.guild?.id) !== PINELLAS_GUILD_ID) return false;
  if (member.user?.bot) return false;

  const roleId = PINELLAS_EMPLOYEE_WELCOME_ROLE_ID;
  const hasRole = Boolean(member.roles?.cache?.has(roleId));
  if (!hasRole) return false;

  // Use the pre-update snapshot only. Do not fetch partials here.
  const knownBefore = Boolean(
    previousMember
    && !previousMember.partial
    && previousMember.roles?.cache,
  );
  let gained = false;
  if (knownBefore) {
    const hadRole = previousMember.roles.cache.has(roleId);
    if (hadRole) {
      logger.info(`Pinellas: skip employee welcome for ${member.id} (already had role).`);
      return false;
    }
    gained = true;
  } else {
    gained = await memberGainedRoleViaAudit(member, roleId);
  }

  if (!gained) {
    logger.info(
      `Pinellas: skip employee welcome for ${member.id} (role ${roleId} not newly added).`,
    );
    return false;
  }

  const last = recentEmployeeWelcomes.get(member.id) || 0;
  if (Date.now() - last < EMPLOYEE_WELCOME_DEDUP_MS) {
    logger.info(`Pinellas: skip duplicate employee welcome for ${member.id}.`);
    return false;
  }
  recentEmployeeWelcomes.set(member.id, Date.now());

  try {
    return await sendPinellasEmployeeWelcome(member);
  } catch (error) {
    recentEmployeeWelcomes.delete(member.id);
    logger.error(
      `Pinellas: failed to post employee welcome for ${member.id}: ${error?.message || error}`,
    );
    throw error;
  }
}

/** Post the Components V2 employee welcome message for a newly role-granted member. */
export async function sendPinellasEmployeeWelcome(member) {
  if (String(member.guild?.id) !== PINELLAS_GUILD_ID) return false;
  if (member.user?.bot) return false;

  const channel = member.guild.channels.cache.get(PINELLAS_EMPLOYEE_WELCOME_CHANNEL_ID)
    || await member.guild.channels.fetch(PINELLAS_EMPLOYEE_WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Pinellas: employee welcome channel ${PINELLAS_EMPLOYEE_WELCOME_CHANNEL_ID} unavailable.`);
    return false;
  }

  const container = new ContainerBuilder().clearAccentColor();
  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${SAVE_EMOJI} Welcome`,
        '',
        `> <@${member.id}> Welcome to the **${SLOGO_EMOJI} Pinellas County Sheriff's Office!**`,
        '',
        '> We’re glad to have you here! You can find important information about the department, including resources, guidelines, and other helpful information, by using the buttons below.',
        '',
        '> We hope you enjoy your time with PCSO and consider becoming a part of our department in the future!',
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Employee Information')
          .setStyle(ButtonStyle.Link)
          .setURL(EMPLOYEE_INFO_CHANNEL_URL),
        new ButtonBuilder()
          .setLabel('Divisions')
          .setStyle(ButtonStyle.Link)
          .setURL(DIVISIONS_CHANNEL_URL),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    );

  const files = [];
  try {
    const footer = await readFile(EMPLOYEE_FOOTER_PATH);
    files.push(new AttachmentBuilder(footer, { name: 'pcso-application-footer.png' }));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-application-footer.png'),
      ),
    );
  } catch (error) {
    logger.warn(
      `Pinellas: employee welcome footer unavailable; posting without it (${error?.message || error}).`,
    );
  }

  await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    files,
    allowedMentions: { parse: [], users: [member.id] },
  });
  logger.info(`Pinellas: posted employee welcome for ${member.user?.tag || member.id}.`);
  return true;
}
