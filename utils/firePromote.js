import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import { FIRE_OPS_GUILD_ID } from './fireOpsServer.js';
import { FIRE_MEDICAL_RANKS, FIRE_RANKS } from './fireShiftPanel.js';
import { logger } from './logger.js';

/** Channel where CWFR promotion announcements are posted. */
export const FIRE_PROMOTE_CHANNEL_ID = '1514804888742269113';

// Unsigned Discord CDN links, like the other CWFR panels: Discord re-signs its own
// attachment URLs when it renders a message, so these don't expire.
const BANNER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353693522632704/cwfd_3.png?format=webp&quality=lossless';
const FOOTER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353694701096960/cwfd_footer_3.png?format=webp&quality=lossless';
const TROPHY_EMOJI = '<:trophie:1548411752142872790>';

/** Chief officers (District Chief and above) can also promote within the EMS track. */
const CHIEF_OFFICER_ROLE_IDS = new Set(
  FIRE_RANKS.slice(0, FIRE_RANKS.findIndex((rank) => rank.name === 'District Chief') + 1)
    .map((rank) => rank.roleId),
);

/**
 * Every CWFR rank, highest first within each track. Fire and medical ranks are
 * separate ladders: a promotion only swaps ranks in its own track.
 * @type {ReadonlyArray<{ name: string, roleId: string, track: 'fire' | 'medical' }>}
 */
export const FIRE_PROMOTION_RANKS = Object.freeze([
  ...FIRE_RANKS.map((rank) => Object.freeze({ ...rank, track: 'fire' })),
  ...FIRE_MEDICAL_RANKS.map((rank) => Object.freeze({ ...rank, track: 'medical' })),
]);

const RANK_BY_KEY = new Map(
  FIRE_PROMOTION_RANKS.map((rank) => [rankKey(rank.name), rank]),
);

function rankKey(name) {
  return String(name || '').trim().toLowerCase();
}

function trackRanks(track) {
  return FIRE_PROMOTION_RANKS.filter((rank) => rank.track === track);
}

/** Position of a rank within its own track; 0 is the top. */
export function rankIndex(rank) {
  return trackRanks(rank.track).findIndex((entry) => entry.roleId === rank.roleId);
}

export function getFireRankByName(name) {
  return RANK_BY_KEY.get(rankKey(name)) || null;
}

export function getMemberFireRanks(member, track) {
  if (!member?.roles?.cache) return [];
  return trackRanks(track).filter((rank) => member.roles.cache.has(rank.roleId));
}

/** Highest rank the member holds in a track, or null. */
export function getHighestFireRank(member, track) {
  return getMemberFireRanks(member, track)[0] || null;
}

export function isChiefOfficer(member) {
  return [...CHIEF_OFFICER_ROLE_IDS].some((roleId) => member?.roles?.cache?.has(roleId));
}

/**
 * Throws unless the issuer outranks both the new rank and the target's current
 * rank in that track. Chief officers (District Chief and up) may also promote
 * within the medical track; server administrators bypass the ladder.
 */
export function assertCanPromote({ issuerMember, targetMember, rank }) {
  const isAdmin = issuerMember.permissions?.has?.(PermissionFlagsBits.Administrator) === true;
  if (isAdmin) return;

  const issuerRank = getHighestFireRank(issuerMember, rank.track);
  if (!issuerRank) {
    if (rank.track === 'medical' && isChiefOfficer(issuerMember)) return;
    throw new Error(rank.track === 'medical'
      ? 'You need a higher EMS rank or a chief officer rank to promote to EMS ranks.'
      : 'You need a CWFR rank to promote members.');
  }

  if (rankIndex(issuerRank) >= rankIndex(rank)) {
    throw new Error(`You can only promote members to ranks below your own (**${issuerRank.name}**).`);
  }
  // The target must also currently sit below the issuer, so nobody can re-rank a superior.
  const targetRank = getHighestFireRank(targetMember, rank.track);
  if (targetRank && rankIndex(targetRank) <= rankIndex(issuerRank)) {
    throw new Error(`You can only promote members below your own rank (**${issuerRank.name}**).`);
  }
}

/** Components V2 promotion announcement payload. */
export function buildFirePromotionPayload({ target, rank, reason, issuer }) {
  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL)),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${TROPHY_EMOJI} Personnel Promotion`,
        `> Congratulations <@${target.id}> on your promotion. We'd like to extend our appreciation for all of your hard work, dedication, and commitment.`,
      ].join('\n')),
      new TextDisplayBuilder().setContent([
        `- **Reason:** ${reason}`,
        `- **Promoted By:** <@${issuer.id}>`,
        `- **New Rank:** <@&${rank.roleId}>`,
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL)),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], users: [...new Set([target.id, issuer.id])], roles: [] },
  };
}

export async function sendFirePromotionAnnouncement({ guild, ...details }) {
  const channel = guild.channels.cache.get(FIRE_PROMOTE_CHANNEL_ID)
    || await guild.channels.fetch(FIRE_PROMOTE_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Promotion channel \`${FIRE_PROMOTE_CHANNEL_ID}\` is unavailable.`);
  }
  const message = await channel.send(buildFirePromotionPayload(details));
  return { message, channel };
}

/**
 * Promote a CWFR member: swap rank roles within the rank's track and announce.
 */
export async function promoteFireMember({
  guild,
  targetMember,
  issuerMember,
  rankName,
  reason,
}) {
  if (String(guild.id) !== FIRE_OPS_GUILD_ID) {
    throw new Error('This command can only be used in the Clearwater Fire & Rescue server.');
  }

  const rank = getFireRankByName(rankName);
  if (!rank) throw new Error('Unknown rank. Pick a rank from the list.');

  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw new Error('Provide a promotion reason.');
  if (cleanReason.length > 900) throw new Error('Keep the reason under 900 characters.');

  if (targetMember.user?.bot) throw new Error('You cannot promote a bot.');
  if (targetMember.id === issuerMember.id) throw new Error('You cannot promote yourself.');

  assertCanPromote({ issuerMember, targetMember, rank });

  const previousRanks = getMemberFireRanks(targetMember, rank.track);
  if (targetMember.roles.cache.has(rank.roleId) && previousRanks.length === 1) {
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
    throw new Error(`My highest role must be above **${rank.name}** so I can assign it.`);
  }

  const removeRoleIds = previousRanks
    .map((entry) => entry.roleId)
    .filter((roleId) => roleId !== rank.roleId)
    .filter((roleId) => {
      const role = guild.roles.cache.get(roleId);
      return role && role.position < me.roles.highest.position && !role.managed;
    });

  const reasonText = `CWFR promotion to ${rank.name} by ${issuerMember.user?.tag || issuerMember.id}`;
  if (removeRoleIds.length) await targetMember.roles.remove(removeRoleIds, reasonText);
  if (!targetMember.roles.cache.has(rank.roleId)) await targetMember.roles.add(rank.roleId, reasonText);

  const announcement = await sendFirePromotionAnnouncement({
    guild,
    target: targetMember.user,
    rank,
    reason: cleanReason,
    issuer: issuerMember.user,
  });

  logger.info(
    `CWFR: ${issuerMember.user?.tag || issuerMember.id} promoted ${targetMember.user?.tag || targetMember.id} to ${rank.name}.`,
  );

  return { rank, previousRanks, announcement };
}
