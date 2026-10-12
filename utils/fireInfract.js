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
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIRE_OPS_GUILD_ID } from './fireOpsServer.js';
import {
  getFireRankByName,
  getHighestFireRank,
  isChiefOfficer,
  rankIndex,
} from './firePromote.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

/** Channel where CWFR infraction records are posted. */
export const FIRE_INFRACTION_CHANNEL_ID = '1514804888742269114';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'fire-infractions.json');

// Unsigned Discord CDN links, like the other CWFR panels: Discord re-signs its own
// attachment URLs when it renders a message, so these don't expire.
const BANNER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353669510111313/cwfd_5.png?format=webp&quality=lossless';
const FOOTER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353658131222580/cwfd_footer_5.png?format=webp&quality=lossless';
const SHIELD_EMOJI = '<:MP_Shield:1557159361804247124>';
const CLOCK_EMOJI = '<:clock:1557167759123677214>';
const CLIPBOARD_EMOJI = '<:clipboard:1557159385107529889>';
const MEMBER_EMOJI = '<:d_member:1548411945437110412>';

const DAY_MS = 24 * 60 * 60 * 1000;

export const FIRE_INFRACTION_TYPES = Object.freeze([
  Object.freeze({ value: 'warning', label: 'Warning', defaultExpiry: '15d' }),
  Object.freeze({ value: 'strike', label: 'Strike', defaultExpiry: '15d' }),
  Object.freeze({ value: 'suspension', label: 'Suspension', defaultExpiry: '7d' }),
  Object.freeze({ value: 'termination', label: 'Termination', defaultExpiry: 'never' }),
]);

export const FIRE_INFRACTION_EXPIRIES = Object.freeze([
  Object.freeze({ value: '1d', label: '1 day', ms: DAY_MS }),
  Object.freeze({ value: '3d', label: '3 days', ms: 3 * DAY_MS }),
  Object.freeze({ value: '7d', label: '7 days', ms: 7 * DAY_MS }),
  Object.freeze({ value: '15d', label: '15 days', ms: 15 * DAY_MS }),
  Object.freeze({ value: '30d', label: '30 days', ms: 30 * DAY_MS }),
  Object.freeze({ value: '60d', label: '60 days', ms: 60 * DAY_MS }),
  Object.freeze({ value: '90d', label: '90 days', ms: 90 * DAY_MS }),
  Object.freeze({ value: 'never', label: 'Never', ms: null }),
]);

/** Lowest ranks in each track that may issue infractions. */
const SUPERVISOR_FLOOR = Object.freeze({
  fire: getFireRankByName('Lieutenant'),
  medical: getFireRankByName('EMS Lieutenant'),
});

function infractionType(value) {
  return FIRE_INFRACTION_TYPES.find((type) => type.value === value) || null;
}

function isSupervisor(member) {
  return Object.entries(SUPERVISOR_FLOOR).some(([track, floor]) => {
    const rank = getHighestFireRank(member, track);
    return rank && rankIndex(rank) <= rankIndex(floor);
  });
}

/**
 * Throws unless the issuer may infract the target: they need a supervisor rank
 * (Lieutenant / EMS Lieutenant or above) and must outrank the target in every
 * track the target holds a rank in. Chief officers outrank all EMS ranks;
 * server administrators bypass the ladder.
 */
export function assertCanInfract({ issuerMember, targetMember }) {
  if (issuerMember.permissions?.has?.(PermissionFlagsBits.Administrator) === true) return;

  if (!isSupervisor(issuerMember)) {
    throw new Error('You need a Lieutenant or EMS Lieutenant rank or higher to issue infractions.');
  }

  for (const track of ['fire', 'medical']) {
    const targetRank = getHighestFireRank(targetMember, track);
    if (!targetRank) continue;
    const issuerRank = getHighestFireRank(issuerMember, track);
    if (issuerRank) {
      if (rankIndex(issuerRank) >= rankIndex(targetRank)) {
        throw new Error(`You can only infract members below your own rank (**${issuerRank.name}**).`);
      }
    } else if (!(track === 'medical' && isChiefOfficer(issuerMember))) {
      throw new Error(`You can't infract a **${targetRank.name}** without outranking them.`);
    }
  }
}

function expiryFor(type, expiryValue) {
  const value = expiryValue || type.defaultExpiry;
  const expiry = FIRE_INFRACTION_EXPIRIES.find((entry) => entry.value === value);
  if (!expiry) throw new Error('Unknown expiry. Pick one from the list.');
  return expiry;
}

/** Components V2 infraction record payload. */
export function buildFireInfractionPayload({ target, issuer, type, policy, issuedAt, expiresAt }) {
  const issuedTs = Math.floor(new Date(issuedAt).getTime() / 1000);
  const expiresTs = expiresAt ? Math.floor(new Date(expiresAt).getTime() / 1000) : null;

  const container = new ContainerBuilder()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL)),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${SHIELD_EMOJI} Personnel Infraction`,
        `> <@${target.id}> has received a **${type.label.toLowerCase()}** for **${policy}** on <t:${issuedTs}:D> at <t:${issuedTs}:t>.`,
      ].join('\n')),
      new TextDisplayBuilder().setContent([
        `${CLOCK_EMOJI} **Expires In:** ${expiresTs ? `<t:${expiresTs}:R> (<t:${expiresTs}:f>)` : 'Never'}`,
        `${CLIPBOARD_EMOJI} **Policy Broken:** ${policy}`,
        `${MEMBER_EMOJI} **Issued By:** <@${issuer.id}>`,
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

async function recordInfraction(entry) {
  const store = await readJsonFile(STORE_PATH, { infractions: [] }, { corruptFallback: false });
  const infractions = Array.isArray(store.infractions) ? store.infractions : [];
  infractions.push(entry);
  await writeJsonFile(STORE_PATH, { ...store, infractions }, { backup: true });
}

/**
 * Issue a CWFR infraction: post the record in the infractions channel and save it.
 */
export async function infractFireMember({
  guild,
  targetMember,
  issuerMember,
  typeValue,
  policy,
  expiryValue = null,
  now = Date.now(),
}) {
  if (String(guild.id) !== FIRE_OPS_GUILD_ID) {
    throw new Error('This command can only be used in the Clearwater Fire & Rescue server.');
  }

  const type = infractionType(typeValue);
  if (!type) throw new Error('Unknown infraction type. Pick one from the list.');

  const cleanPolicy = String(policy || '').trim();
  if (!cleanPolicy) throw new Error('Provide the policy that was broken.');
  if (cleanPolicy.length > 200) throw new Error('Keep the policy under 200 characters.');

  if (targetMember.user?.bot) throw new Error('You cannot infract a bot.');
  if (targetMember.id === issuerMember.id) throw new Error('You cannot infract yourself.');

  assertCanInfract({ issuerMember, targetMember });

  const expiry = expiryFor(type, expiryValue);
  const issuedAt = new Date(now).toISOString();
  const expiresAt = expiry.ms ? new Date(now + expiry.ms).toISOString() : null;

  const channel = guild.channels.cache.get(FIRE_INFRACTION_CHANNEL_ID)
    || await guild.channels.fetch(FIRE_INFRACTION_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Infraction channel \`${FIRE_INFRACTION_CHANNEL_ID}\` is unavailable.`);
  }

  const message = await channel.send(buildFireInfractionPayload({
    target: targetMember.user,
    issuer: issuerMember.user,
    type,
    policy: cleanPolicy,
    issuedAt,
    expiresAt,
  }));

  const entry = {
    id: randomBytes(4).toString('hex'),
    guildId: guild.id,
    targetId: targetMember.id,
    issuerId: issuerMember.id,
    type: type.value,
    policy: cleanPolicy,
    issuedAt,
    expiresAt,
    channelId: channel.id,
    messageId: message.id,
  };
  await recordInfraction(entry).catch((error) => {
    logger.warn(`CWFR infract: could not save record ${entry.id}: ${error?.message || error}`);
  });

  logger.info(
    `CWFR: ${issuerMember.user?.tag || issuerMember.id} issued a ${type.value} to ${targetMember.user?.tag || targetMember.id} (${cleanPolicy}).`,
  );

  return { entry, type, expiry, channel, message };
}
