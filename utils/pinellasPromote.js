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
import { PINELLAS_GUILD_ID, requirePinellasCommandAccess } from './pinellasServer.js';
import { logger } from './logger.js';

/** Channel where PCSO promotion announcements are posted. */
export const PINELLAS_PROMOTE_CHANNEL_ID = '1514666004637024336';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROMOTIONS_BANNER_PATH = path.join(ROOT, 'assets', 'pcso-promotions.png');
const PROMOTIONS_FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-application-footer.png');

const CONFETTI_EMOJI = '<:pc_confetti:1514355064804872262>';

/**
 * PCSO ranks from highest to lowest.
 * @type {ReadonlyArray<{ name: string, roleId: string }>}
 */
export const PINELLAS_RANKS = Object.freeze([
  { name: 'Sheriff', roleId: '1514323734100574361' },
  { name: 'Undersheriff', roleId: '1514324116662915112' },
  { name: 'Assistant Sheriff', roleId: '1514324416375423098' },
  { name: 'Chief Deputy', roleId: '1514444362300391424' },
  { name: 'Commander', roleId: '1524227875597844571' },
  { name: 'Major', roleId: '1514360227082797176' },
  { name: 'Captain', roleId: '1514324978831720629' },
  { name: 'Lieutenant', roleId: '1514359334631637123' },
  { name: 'Staff Sergeant', roleId: '1515143846969737408' },
  { name: 'Sergeant', roleId: '1514359714128072784' },
  { name: 'Corporal', roleId: '1514359815915438140' },
  { name: 'Lance Corporal', roleId: '1528176882250682560' },
  { name: 'Master Deputy', roleId: '1514360768559054858' },
  { name: 'Deputy Second Class', roleId: '1514359908978397254' },
  { name: 'Deputy First Class', roleId: '1514360005476749322' },
]);

const RANK_BY_KEY = new Map(
  PINELLAS_RANKS.map((rank) => [rankKey(rank.name), rank]),
);

const RANK_ROLE_IDS = new Set(PINELLAS_RANKS.map((rank) => rank.roleId));

function rankKey(name) {
  return String(name || '').trim().toLowerCase();
}

export function getPinellasRankByName(name) {
  return RANK_BY_KEY.get(rankKey(name)) || null;
}

export function getPinellasRankByRoleId(roleId) {
  return PINELLAS_RANKS.find((rank) => rank.roleId === String(roleId)) || null;
}

export function getMemberPinellasRanks(member) {
  if (!member?.roles?.cache) return [];
  return PINELLAS_RANKS.filter((rank) => member.roles.cache.has(rank.roleId));
}

/** Highest PCSO rank on the member, or null. */
export function getHighestPinellasRank(member) {
  const ranks = getMemberPinellasRanks(member);
  return ranks[0] || null;
}

function rankIndex(rank) {
  return PINELLAS_RANKS.findIndex((entry) => entry.roleId === rank.roleId);
}

/**
 * Build and send the Components V2 promotion announcement.
 */
export async function sendPinellasPromotionAnnouncement({
  guild,
  target,
  rank,
  reason,
  issuer,
}) {
  const channel = guild.channels.cache.get(PINELLAS_PROMOTE_CHANNEL_ID)
    || await guild.channels.fetch(PINELLAS_PROMOTE_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Promotion channel \`${PINELLAS_PROMOTE_CHANNEL_ID}\` is unavailable.`);
  }

  const files = [];
  const container = new ContainerBuilder().clearAccentColor();

  try {
    const banner = await readFile(PROMOTIONS_BANNER_PATH);
    files.push(new AttachmentBuilder(banner, { name: 'pcso-promotions.png' }));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-promotions.png'),
      ),
    );
  } catch (error) {
    logger.warn(`Pinellas promote: banner unavailable (${error?.message || error}).`);
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${CONFETTI_EMOJI} Promotion`,
        '',
        `> Congrats, <@${target.id}>! We would like to thank you for your hard work, professionalism, dedication, and more. With this, you've been promoted to **${rank.name}**!`,
        '',
        `**Reason:** ${reason}`,
        `-# **Issued By:** <@${issuer.id}>`,
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    );

  try {
    const footer = await readFile(PROMOTIONS_FOOTER_PATH);
    files.push(new AttachmentBuilder(footer, { name: 'pcso-application-footer.png' }));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-application-footer.png'),
      ),
    );
  } catch (error) {
    logger.warn(`Pinellas promote: footer unavailable (${error?.message || error}).`);
  }

  const message = await channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    files,
    allowedMentions: { parse: [], users: [target.id, issuer.id] },
  });

  return { message, channel };
}

/**
 * Promote a Pinellas member: swap PCSO rank roles and announce.
 */
export async function promotePinellasMember({
  guild,
  targetMember,
  issuerMember,
  rankName,
  reason,
}) {
  if (String(guild.id) !== PINELLAS_GUILD_ID) {
    throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
  }

  const rank = getPinellasRankByName(rankName);
  if (!rank) throw new Error('Unknown rank. Pick a rank from the list.');

  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('Provide a promotion reason.');
  if (cleanReason.length > 900) throw new Error('Keep the reason under 900 characters.');

  if (targetMember.user?.bot) throw new Error('You cannot promote a bot.');
  if (targetMember.id === issuerMember.id) {
    throw new Error('You cannot promote yourself.');
  }

  requirePinellasCommandAccess(issuerMember);

  const issuerRank = getHighestPinellasRank(issuerMember);
  if (issuerRank) {
    if (rankIndex(issuerRank) >= rankIndex(rank)) {
      throw new Error(
        `You can only promote members to ranks below your own (**${issuerRank.name}**).`,
      );
    }
  }

  if (targetMember.roles.cache.has(rank.roleId) && getMemberPinellasRanks(targetMember).length === 1) {
    throw new Error(`<@${targetMember.id}> already holds **${rank.name}**.`);
  }

  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('I need the **Manage Roles** permission to promote members.');
  }

  const newRole = guild.roles.cache.get(rank.roleId)
    || await guild.roles.fetch(rank.roleId).catch(() => null);
  if (!newRole) throw new Error(`Could not find the **${rank.name}** role in this server.`);
  if (newRole.managed) throw new Error(`The **${rank.name}** role is managed and cannot be assigned.`);
  if (newRole.position >= me.roles.highest.position) {
    throw new Error(
      `My highest role must be above **${rank.name}** so I can assign it.`,
    );
  }

  const previousRanks = getMemberPinellasRanks(targetMember);
  const removeRoleIds = previousRanks
    .map((entry) => entry.roleId)
    .filter((roleId) => roleId !== rank.roleId)
    .filter((roleId) => {
      const role = guild.roles.cache.get(roleId);
      return role && role.position < me.roles.highest.position && !role.managed;
    });

  const reasonText = `PCSO promotion to ${rank.name} by ${issuerMember.user?.tag || issuerMember.id}`;

  if (removeRoleIds.length) {
    await targetMember.roles.remove(removeRoleIds, reasonText);
  }
  if (!targetMember.roles.cache.has(rank.roleId)) {
    await targetMember.roles.add(rank.roleId, reasonText);
  }

  // Re-check after role edits in case the cache still shows old ranks.
  const refreshed = await guild.members.fetch(targetMember.id).catch(() => targetMember);
  const leftover = [...refreshed.roles.cache.keys()].filter(
    (roleId) => RANK_ROLE_IDS.has(roleId) && roleId !== rank.roleId,
  );
  if (leftover.length) {
    const removable = leftover.filter((roleId) => {
      const role = guild.roles.cache.get(roleId);
      return role && role.position < me.roles.highest.position && !role.managed;
    });
    if (removable.length) {
      await targetMember.roles.remove(removable, `${reasonText} (cleanup)`).catch((error) => {
        logger.warn(`Pinellas promote: leftover rank cleanup failed: ${error?.message || error}`);
      });
    }
  }

  const announcement = await sendPinellasPromotionAnnouncement({
    guild,
    target: targetMember.user,
    rank,
    reason: cleanReason,
    issuer: issuerMember.user,
  });

  logger.info(
    `Pinellas: ${issuerMember.user?.tag || issuerMember.id} promoted ${targetMember.user?.tag || targetMember.id} to ${rank.name}.`,
  );

  return {
    rank,
    previousRanks,
    announcement,
  };
}
