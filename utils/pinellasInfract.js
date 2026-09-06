import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  LabelBuilder,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const PINELLAS_APPLY_APPROVED_ROLE_ID = '1514362658227490989';
import {
  PINELLAS_RANKS,
  getHighestPinellasRank,
  getMemberPinellasRanks,
  getPinellasRankByName,
} from './pinellasPromote.js';
import {
  PINELLAS_EMPLOYEE_WELCOME_ROLE_ID,
  PINELLAS_GUILD_ID,
} from './pinellasServer.js';
import { logger } from './logger.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-infractions.json');
const PANEL_BANNER_PATH = path.join(ROOT, 'assets', 'pcso-promotions.png');
const INFRACTION_BANNER_PATH = path.join(ROOT, 'assets', 'pcso-infractions.png');
const FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-application-footer.png');

const UNLOCK_EMOJI = '<:unlock:1517217312489472030>';
const CLOCK_EMOJI = '<:clock:1517217161246932992>';
const BOOKMARK_EMOJI = '<:bookmark:1517217548108693627>';
const SHEET_EMOJI = '<:sheet:1546293540827701329>';

export const PINELLAS_INFRACT_PICK_ID = 'pcs:inf:pick';
export const PINELLAS_INFRACT_USER_ID = 'pcs:inf:user';
export const PINELLAS_INFRACT_TYPE_PREFIX = 'pcs:inf:type:';
export const PINELLAS_INFRACT_DUR_PREFIX = 'pcs:inf:dur:';
export const PINELLAS_INFRACT_RANK_ID = 'pcs:inf:rank';
export const PINELLAS_INFRACT_MODAL_PREFIX = 'pcs:inf:modal:';

export const INFRACTION_TYPES = Object.freeze([
  'warning',
  'strike',
  'demotion',
  'suspension',
  'termination',
]);

const TYPE_LABELS = Object.freeze({
  warning: 'Warning',
  strike: 'Strike',
  demotion: 'Demotion',
  suspension: 'Suspension',
  termination: 'Termination',
});

const WARNING_STRIKE_DURATIONS = Object.freeze([
  { label: '12 hours', value: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '1 day', value: '1d', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', value: '3d', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 days', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
  { label: '14 days', value: '14d', ms: 14 * 24 * 60 * 60 * 1000 },
  { label: '30 days', value: '30d', ms: 30 * 24 * 60 * 60 * 1000 },
]);

const SUSPENSION_DURATIONS = Object.freeze([
  { label: '1 hour', value: '1h', ms: 60 * 60 * 1000 },
  { label: '6 hours', value: '6h', ms: 6 * 60 * 60 * 1000 },
  { label: '12 hours', value: '12h', ms: 12 * 60 * 60 * 1000 },
  { label: '1 day', value: '1d', ms: 24 * 60 * 60 * 1000 },
  { label: '3 days', value: '3d', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '7 days (max)', value: '7d', ms: 7 * 24 * 60 * 60 * 1000 },
]);

/** @type {Map<string, {
 *  targetId: string,
 *  type?: string,
 *  durationMs?: number,
 *  durationLabel?: string,
 *  demoteRankName?: string,
 *  channelId: string,
 *  guildId: string,
 *  updatedAt: number,
 * }>} */
const sessions = new Map();

function newId() {
  return randomBytes(4).toString('hex');
}

function typeLabel(type) {
  return TYPE_LABELS[type] || String(type || 'Infraction');
}

async function readStore() {
  try {
    const store = JSON.parse(await readFile(STORE_PATH, 'utf8'));
    return {
      infractions: Array.isArray(store.infractions) ? store.infractions : [],
    };
  } catch {
    return { infractions: [] };
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function getSession(userId) {
  const session = sessions.get(userId);
  if (!session) return null;
  if (Date.now() - session.updatedAt > 20 * 60 * 1000) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

function setSession(userId, patch) {
  const previous = getSession(userId) || {};
  const next = {
    ...previous,
    ...patch,
    updatedAt: Date.now(),
  };
  sessions.set(userId, next);
  return next;
}

function clearSession(userId) {
  sessions.delete(userId);
}

function parseDurationToken(raw) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text || text === 'never' || text === 'none' || text === 'permanent') {
    return { ms: null, label: 'Never' };
  }
  const match = text.match(/^(\d+)\s*(h|d|hour|hours|day|days)$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;
  const unit = match[2].startsWith('h') ? 'h' : 'd';
  const ms = unit === 'h' ? amount * 60 * 60 * 1000 : amount * 24 * 60 * 60 * 1000;
  return {
    ms,
    label: unit === 'h'
      ? `${amount} hour${amount === 1 ? '' : 's'}`
      : `${amount} day${amount === 1 ? '' : 's'}`,
  };
}

function formatExpires(expiresAt) {
  if (!expiresAt) return 'Never';
  const ts = Math.floor(new Date(expiresAt).getTime() / 1000);
  return `<t:${ts}:R> (<t:${ts}:f>)`;
}

function strikeLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('~~') && trimmed.endsWith('~~')) return line;
      return `~~${line}~~`;
    })
    .join('\n');
}

async function loadOptionalAttachment(filePath, name) {
  try {
    const buffer = await readFile(filePath);
    return new AttachmentBuilder(buffer, { name });
  } catch (error) {
    logger.warn(`Pinellas infract: missing asset ${name} (${error?.message || error})`);
    return null;
  }
}

function buildPanelContainer({
  body,
  files,
  components = [],
}) {
  const container = new ContainerBuilder().clearAccentColor();
  const available = new Set((files || []).map((file) => file.name || file.attachment?.name).filter(Boolean));

  if (available.has('pcso-promotions.png')) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-promotions.png'),
      ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(body),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
  );

  for (const row of components) {
    container.addActionRowComponents(row);
  }

  if (available.has('pcso-application-footer.png')) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Large),
    );
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-application-footer.png'),
      ),
    );
  }

  return container;
}

async function panelFiles() {
  const files = [];
  const banner = await loadOptionalAttachment(PANEL_BANNER_PATH, 'pcso-promotions.png');
  const footer = await loadOptionalAttachment(FOOTER_PATH, 'pcso-application-footer.png');
  if (banner) files.push(banner);
  if (footer) files.push(footer);
  return files;
}

async function buildInfractionPanelPayload({
  targetId = null,
  stage = 'pick',
  type = null,
} = {}) {
  const files = await panelFiles();
  const components = [];

  let body = [
    `# ${UNLOCK_EMOJI} Infraction Panel`,
    '',
    '> Please pick a user and the type of infraction below',
  ].join('\n');

  if (stage === 'pick') {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(PINELLAS_INFRACT_PICK_ID)
          .setLabel('Pick User')
          .setStyle(ButtonStyle.Secondary),
      ),
    );
  } else if (stage === 'user') {
    body = [
      `# ${UNLOCK_EMOJI} Infraction Panel`,
      '',
      '> Select the member to infract.',
    ].join('\n');
    components.push(
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(PINELLAS_INFRACT_USER_ID)
          .setPlaceholder('Pick a user')
          .setMinValues(1)
          .setMaxValues(1),
      ),
    );
  } else if (stage === 'type') {
    body = [
      `# ${UNLOCK_EMOJI} Infraction Panel`,
      '',
      `> Selected: <@${targetId}>`,
      '> Choose the infraction type.',
    ].join('\n');
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PINELLAS_INFRACT_TYPE_PREFIX}warning`).setLabel('Warning').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PINELLAS_INFRACT_TYPE_PREFIX}strike`).setLabel('Strike').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PINELLAS_INFRACT_TYPE_PREFIX}demotion`).setLabel('Demotion').setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${PINELLAS_INFRACT_TYPE_PREFIX}suspension`).setLabel('Suspension').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`${PINELLAS_INFRACT_TYPE_PREFIX}termination`).setLabel('Termination').setStyle(ButtonStyle.Danger),
      ),
    );
  } else if (stage === 'duration') {
    const options = type === 'suspension' ? SUSPENSION_DURATIONS : WARNING_STRIKE_DURATIONS;
    body = [
      `# ${UNLOCK_EMOJI} Infraction Panel`,
      '',
      `> Selected: <@${targetId}>`,
      `> Type: **${typeLabel(type)}**`,
      '> Choose how long until this expires.',
    ].join('\n');
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`${PINELLAS_INFRACT_DUR_PREFIX}${type}`)
          .setPlaceholder('Select duration')
          .addOptions(options.map((entry) => ({
            label: entry.label,
            value: entry.value,
          }))),
      ),
    );
  } else if (stage === 'rank') {
    body = [
      `# ${UNLOCK_EMOJI} Infraction Panel`,
      '',
      `> Selected: <@${targetId}>`,
      '> Choose the rank to demote them to.',
    ].join('\n');
    components.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(PINELLAS_INFRACT_RANK_ID)
          .setPlaceholder('Select demotion rank')
          .addOptions(
            PINELLAS_RANKS.slice(0, 25).map((rank) => ({
              label: rank.name,
              value: rank.name,
            })),
          ),
      ),
    );
  }

  const container = buildPanelContainer({ body, files, components });
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    files,
    allowedMentions: { parse: [], users: targetId ? [targetId] : [] },
  };
}

function detailsModal(type) {
  return new ModalBuilder()
    .setCustomId(`${PINELLAS_INFRACT_MODAL_PREFIX}${type}`)
    .setTitle(`${typeLabel(type)} details`)
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Policy Broken')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('policy')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(120),
        ),
      new LabelBuilder()
        .setLabel('Description')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('description')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(900),
        ),
    );
}

function buildInfractionBody(entry, { struck = false } = {}) {
  const createdTs = Math.floor(new Date(entry.createdAt).getTime() / 1000);
  const statusPrefix = entry.status === 'voided'
    ? '**VOIDED** — '
    : entry.status === 'expired'
      ? '**EXPIRED** — '
      : '';

  let body = [
    `> ${statusPrefix}<@${entry.userId}> has received a **${typeLabel(entry.type)}** for **${entry.policy}** on <t:${createdTs}:D> at <t:${createdTs}:t>.`,
    '',
    `**${CLOCK_EMOJI} Expires:** ${formatExpires(entry.expiresAt)}`,
    `**${BOOKMARK_EMOJI} Policy Broken:** ${entry.policy}`,
    `**${SHEET_EMOJI} Description:** ${entry.description}`,
  ];

  if (entry.type === 'demotion' && entry.rankAfter) {
    body.splice(2, 0, `**Demoted to:** **${entry.rankAfter}**`);
  }

  body.push(
    '-# If you have any questions or concerns, please contact our Professional Standards Bureau.',
    `-# ID: \`${entry.id}\` | Issued by: <@${entry.issuerId}>`,
  );

  const text = body.join('\n');
  if (struck || entry.status === 'voided' || entry.status === 'expired') {
    return strikeLines(text);
  }
  return text;
}

async function buildInfractionMessagePayload(entry, { struck = false } = {}) {
  const files = [];
  const banner = await loadOptionalAttachment(INFRACTION_BANNER_PATH, 'pcso-infractions.png');
  const footer = await loadOptionalAttachment(FOOTER_PATH, 'pcso-application-footer.png');
  if (banner) files.push(banner);
  if (footer) files.push(footer);

  const container = new ContainerBuilder().clearAccentColor();
  if (banner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-infractions.png'),
      ),
    );
    container.addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(buildInfractionBody(entry, { struck })),
  );

  container.addSeparatorComponents(
    new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
  );

  if (footer) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-application-footer.png'),
      ),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    files,
    allowedMentions: { parse: [], users: [entry.userId, entry.issuerId] },
  };
}

async function editInfractionMessage(client, entry, { struck = false } = {}) {
  if (!entry.channelId || !entry.messageId) return false;
  const channel = await client.channels.fetch(entry.channelId).catch(() => null);
  if (!channel?.messages?.fetch) return false;
  const message = await channel.messages.fetch(entry.messageId).catch(() => null);
  if (!message) return false;
  const payload = await buildInfractionMessagePayload(entry, { struck });
  await message.edit(payload);
  return true;
}

function assertCanInfract(issuerMember, targetMember, { demoteRank = null } = {}) {
  if (String(issuerMember.guild?.id || targetMember.guild?.id) !== PINELLAS_GUILD_ID) {
    throw new Error('Infractions can only be issued in the Pinellas County Sheriff\'s Office server.');
  }
  if (targetMember.user?.bot) throw new Error('You cannot infract a bot.');
  if (targetMember.id === issuerMember.id) throw new Error('You cannot infract yourself.');

  const isAdmin = issuerMember.permissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && !issuerMember.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('You need **Manage Roles** (or Administrator) to issue infractions.');
  }

  if (!isAdmin) {
    const issuerRank = getHighestPinellasRank(issuerMember);
    const targetRank = getHighestPinellasRank(targetMember);
    if (!issuerRank) {
      throw new Error('You need a PCSO rank to issue infractions.');
    }
    if (targetRank) {
      const issuerIdx = PINELLAS_RANKS.findIndex((rank) => rank.roleId === issuerRank.roleId);
      const targetIdx = PINELLAS_RANKS.findIndex((rank) => rank.roleId === targetRank.roleId);
      if (issuerIdx >= targetIdx) {
        throw new Error('You can only infract members below your own PCSO rank.');
      }
    }
    if (demoteRank) {
      const demoteIdx = PINELLAS_RANKS.findIndex((rank) => rank.roleId === demoteRank.roleId);
      const issuerIdx = PINELLAS_RANKS.findIndex((rank) => rank.roleId === issuerRank.roleId);
      if (issuerIdx >= demoteIdx) {
        throw new Error('You can only demote members to ranks below your own.');
      }
    }
  }
}

async function removableDepartmentRoleIds(member, me) {
  const ids = new Set([
    ...getMemberPinellasRanks(member).map((rank) => rank.roleId),
    PINELLAS_EMPLOYEE_WELCOME_ROLE_ID,
    PINELLAS_APPLY_APPROVED_ROLE_ID,
  ]);
  return [...ids].filter((roleId) => {
    if (!member.roles.cache.has(roleId)) return false;
    const role = member.guild.roles.cache.get(roleId);
    return role && !role.managed && role.position < me.roles.highest.position;
  });
}

async function applyTypeSideEffects({
  guild,
  targetMember,
  issuerMember,
  type,
  demoteRankName,
}) {
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('I need **Manage Roles** to apply this infraction.');
  }

  const reason = `PCSO ${typeLabel(type)} by ${issuerMember.user?.tag || issuerMember.id}`;
  const previousRanks = getMemberPinellasRanks(targetMember).map((rank) => rank.name);
  let rankAfter = null;
  let removedRoleIds = [];

  if (type === 'demotion') {
    const rank = getPinellasRankByName(demoteRankName);
    if (!rank) throw new Error('Unknown demotion rank.');
    assertCanInfract(issuerMember, targetMember, { demoteRank: rank });

    const newRole = guild.roles.cache.get(rank.roleId)
      || await guild.roles.fetch(rank.roleId).catch(() => null);
    if (!newRole) throw new Error(`Could not find the **${rank.name}** role.`);
    if (newRole.position >= me.roles.highest.position) {
      throw new Error(`My highest role must be above **${rank.name}**.`);
    }

    const removeIds = getMemberPinellasRanks(targetMember)
      .map((entry) => entry.roleId)
      .filter((roleId) => roleId !== rank.roleId)
      .filter((roleId) => {
        const role = guild.roles.cache.get(roleId);
        return role && !role.managed && role.position < me.roles.highest.position;
      });
    if (removeIds.length) await targetMember.roles.remove(removeIds, reason);
    if (!targetMember.roles.cache.has(rank.roleId)) {
      await targetMember.roles.add(rank.roleId, reason);
    }
    rankAfter = rank.name;
  }

  if (type === 'suspension') {
    removedRoleIds = await removableDepartmentRoleIds(targetMember, me);
    if (removedRoleIds.length) {
      await targetMember.roles.remove(removedRoleIds, reason);
    }
  }

  if (type === 'termination') {
    removedRoleIds = await removableDepartmentRoleIds(targetMember, me);
    if (removedRoleIds.length) {
      await targetMember.roles.remove(removedRoleIds, reason);
    }
  }

  return { previousRanks, rankAfter, removedRoleIds };
}

export async function createPinellasInfraction({
  client,
  guild,
  channel,
  issuerMember,
  targetMember,
  type,
  policy,
  description,
  durationMs = null,
  durationLabel = null,
  demoteRankName = null,
}) {
  if (!INFRACTION_TYPES.includes(type)) throw new Error('Unknown infraction type.');
  assertCanInfract(issuerMember, targetMember, {
    demoteRank: demoteRankName ? getPinellasRankByName(demoteRankName) : null,
  });

  const cleanPolicy = String(policy || '').trim();
  const cleanDescription = String(description || '').trim();
  if (!cleanPolicy) throw new Error('Provide the policy broken.');
  if (!cleanDescription) throw new Error('Provide a description.');

  if ((type === 'warning' || type === 'strike' || type === 'suspension') && !durationMs) {
    throw new Error('Choose an expiration duration.');
  }
  if (type === 'suspension' && durationMs > 7 * 24 * 60 * 60 * 1000) {
    throw new Error('Suspensions can last at most 1 week.');
  }
  if (type === 'demotion' && !demoteRankName) {
    throw new Error('Choose a demotion rank.');
  }

  const sideEffects = await applyTypeSideEffects({
    guild,
    targetMember,
    issuerMember,
    type,
    demoteRankName,
  });

  const createdAt = new Date().toISOString();
  const expiresAt = durationMs
    ? new Date(Date.now() + durationMs).toISOString()
    : null;

  const entry = {
    id: newId(),
    type,
    userId: targetMember.id,
    issuerId: issuerMember.id,
    policy: cleanPolicy.slice(0, 120),
    description: cleanDescription.slice(0, 900),
    createdAt,
    expiresAt,
    durationLabel: durationLabel || (expiresAt ? null : 'Never'),
    status: 'active',
    previousRanks: sideEffects.previousRanks,
    rankAfter: sideEffects.rankAfter,
    removedRoleIds: sideEffects.removedRoleIds,
    messageId: null,
    channelId: channel.id,
    guildId: guild.id,
    voidedAt: null,
    voidedBy: null,
    expiredAt: null,
  };

  const payload = await buildInfractionMessagePayload(entry);
  const message = await channel.send(payload);
  entry.messageId = message.id;

  const store = await readStore();
  store.infractions = [entry, ...(store.infractions || [])].slice(0, 2000);
  await writeStore(store);

  try {
    await targetMember.user.send({
      content: [
        `You received a PCSO **${typeLabel(type)}**.`,
        `**Policy:** ${entry.policy}`,
        `**Description:** ${entry.description}`,
        entry.expiresAt ? `**Expires:** ${formatExpires(entry.expiresAt)}` : null,
        `ID: \`${entry.id}\``,
      ].filter(Boolean).join('\n'),
    });
  } catch {
    // DMs may be closed.
  }

  logger.info(
    `Pinellas infract: ${issuerMember.user?.tag || issuerMember.id} issued ${type} ${entry.id} to ${targetMember.id}`,
  );
  return entry;
}

export async function getInfractionById(id) {
  const store = await readStore();
  return (store.infractions || []).find((entry) => entry.id === String(id).toLowerCase())
    || (store.infractions || []).find((entry) => entry.id === String(id))
    || null;
}

export async function editPinellasInfraction({
  client,
  issuerMember,
  id,
  voidInfraction = false,
  type = null,
  policy = null,
  description = null,
  expiresToken = null,
}) {
  if (String(issuerMember.guild?.id) !== PINELLAS_GUILD_ID) {
    throw new Error('This command can only be used in the Pinellas County Sheriff\'s Office server.');
  }
  const isAdmin = issuerMember.permissions?.has(PermissionFlagsBits.Administrator);
  if (!isAdmin && !issuerMember.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('You need **Manage Roles** (or Administrator) to edit infractions.');
  }

  const store = await readStore();
  const entry = (store.infractions || []).find((item) => item.id === String(id));
  if (!entry) throw new Error(`No infraction found with ID \`${id}\`.`);

  if (voidInfraction) {
    entry.status = 'voided';
    entry.voidedAt = new Date().toISOString();
    entry.voidedBy = issuerMember.id;
  }

  if (type) {
    if (!INFRACTION_TYPES.includes(type)) throw new Error('Unknown infraction type.');
    entry.type = type;
  }
  if (policy != null && String(policy).trim()) entry.policy = String(policy).trim().slice(0, 120);
  if (description != null && String(description).trim()) {
    entry.description = String(description).trim().slice(0, 900);
  }
  if (expiresToken != null && String(expiresToken).trim()) {
    const parsed = parseDurationToken(expiresToken);
    if (!parsed) throw new Error('Invalid expires value. Use like `12h`, `3d`, or `never`.');
    if (entry.type === 'suspension' && parsed.ms && parsed.ms > 7 * 24 * 60 * 60 * 1000) {
      throw new Error('Suspensions can last at most 1 week.');
    }
    entry.expiresAt = parsed.ms ? new Date(Date.now() + parsed.ms).toISOString() : null;
    entry.durationLabel = parsed.label;
    if (entry.status === 'expired' && (parsed.ms == null || parsed.ms > 0)) {
      entry.status = 'active';
      entry.expiredAt = null;
    }
  }

  await writeStore(store);
  await editInfractionMessage(client, entry, {
    struck: entry.status === 'voided' || entry.status === 'expired',
  });
  return entry;
}

async function restoreSuspendedRoles(guild, entry) {
  if (entry.type !== 'suspension') return;
  if (!Array.isArray(entry.removedRoleIds) || !entry.removedRoleIds.length) return;
  const member = await guild.members.fetch(entry.userId).catch(() => null);
  if (!member) return;
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) return;
  const restore = entry.removedRoleIds.filter((roleId) => {
    const role = guild.roles.cache.get(roleId);
    return role && !role.managed && role.position < me.roles.highest.position && !member.roles.cache.has(roleId);
  });
  if (restore.length) {
    await member.roles.add(restore, `PCSO suspension ${entry.id} expired`).catch((error) => {
      logger.warn(`Pinellas infract: restore roles failed for ${entry.id}: ${error?.message || error}`);
    });
  }
}

async function notifyExpiryDm(client, entry) {
  const user = await client.users.fetch(entry.userId).catch(() => null);
  if (!user) return;
  const kind = entry.type === 'suspension'
    ? 'suspension has ended'
    : `${typeLabel(entry.type).toLowerCase()} has expired`;
  await user.send({
    content: [
      `Your PCSO **${kind}**.`,
      `**Policy:** ${entry.policy}`,
      `ID: \`${entry.id}\``,
    ].join('\n'),
  }).catch(() => null);
}

export async function processExpiredPinellasInfractions(client) {
  const store = await readStore();
  const now = Date.now();
  let changed = 0;

  for (const entry of store.infractions || []) {
    if (entry.status !== 'active' || !entry.expiresAt) continue;
    if (new Date(entry.expiresAt).getTime() > now) continue;

    entry.status = 'expired';
    entry.expiredAt = new Date().toISOString();
    changed += 1;

    const guild = client.guilds.cache.get(entry.guildId)
      || await client.guilds.fetch(entry.guildId).catch(() => null);
    if (guild) {
      await restoreSuspendedRoles(guild, entry);
    }
    await editInfractionMessage(client, entry, { struck: true }).catch((error) => {
      logger.warn(`Pinellas infract: could not strike message ${entry.id}: ${error?.message || error}`);
    });
    await notifyExpiryDm(client, entry);
  }

  if (changed) await writeStore(store);
  return changed;
}

export function startPinellasInfractionExpiry(client) {
  const tick = async () => {
    try {
      const count = await processExpiredPinellasInfractions(client);
      if (count) logger.info(`Pinellas infract: expired ${count} infraction(s).`);
    } catch (error) {
      logger.error('Pinellas infract expiry job failed', error);
    }
  };
  const timer = setInterval(() => { void tick(); }, 60 * 1000);
  timer.unref?.();
  void tick();
  return () => clearInterval(timer);
}

export async function buildInitialInfractPanel() {
  return buildInfractionPanelPayload({ stage: 'pick' });
}

export async function handlePinellasInfractInteraction(interaction) {
  const id = interaction.customId || '';
  const isOurs = id === PINELLAS_INFRACT_PICK_ID
    || id === PINELLAS_INFRACT_USER_ID
    || id === PINELLAS_INFRACT_RANK_ID
    || id.startsWith(PINELLAS_INFRACT_TYPE_PREFIX)
    || id.startsWith(PINELLAS_INFRACT_DUR_PREFIX)
    || id.startsWith(PINELLAS_INFRACT_MODAL_PREFIX);
  if (!isOurs) return false;

  if (String(interaction.guildId) !== PINELLAS_GUILD_ID) {
    await interaction.reply({
      content: 'Infractions are only available in the Pinellas County Sheriff\'s Office server.',
      flags: MessageFlags.Ephemeral,
    }).catch(() => null);
    return true;
  }

  try {
    if (interaction.isButton() && id === PINELLAS_INFRACT_PICK_ID) {
      setSession(interaction.user.id, {
        channelId: interaction.channelId,
        guildId: interaction.guildId,
      });
      await interaction.update(await buildInfractionPanelPayload({ stage: 'user' }));
      return true;
    }

    if (interaction.isUserSelectMenu() && id === PINELLAS_INFRACT_USER_ID) {
      const targetId = interaction.values?.[0];
      if (!targetId) throw new Error('Pick a user.');
      setSession(interaction.user.id, {
        targetId,
        type: null,
        durationMs: null,
        durationLabel: null,
        demoteRankName: null,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
      });
      await interaction.update(await buildInfractionPanelPayload({
        stage: 'type',
        targetId,
      }));
      return true;
    }

    if (interaction.isButton() && id.startsWith(PINELLAS_INFRACT_TYPE_PREFIX)) {
      const type = id.slice(PINELLAS_INFRACT_TYPE_PREFIX.length);
      if (!INFRACTION_TYPES.includes(type)) throw new Error('Unknown type.');
      const session = getSession(interaction.user.id);
      if (!session?.targetId) throw new Error('Pick a user first.');
      setSession(interaction.user.id, { type });

      if (type === 'warning' || type === 'strike' || type === 'suspension') {
        await interaction.update(await buildInfractionPanelPayload({
          stage: 'duration',
          targetId: session.targetId,
          type,
        }));
        return true;
      }
      if (type === 'demotion') {
        await interaction.update(await buildInfractionPanelPayload({
          stage: 'rank',
          targetId: session.targetId,
          type,
        }));
        return true;
      }
      // termination → modal
      await interaction.showModal(detailsModal(type));
      return true;
    }

    if (interaction.isStringSelectMenu() && id.startsWith(PINELLAS_INFRACT_DUR_PREFIX)) {
      const type = id.slice(PINELLAS_INFRACT_DUR_PREFIX.length);
      const session = getSession(interaction.user.id);
      if (!session?.targetId) throw new Error('Pick a user first.');
      const value = interaction.values?.[0];
      const options = type === 'suspension' ? SUSPENSION_DURATIONS : WARNING_STRIKE_DURATIONS;
      const selected = options.find((entry) => entry.value === value);
      if (!selected) throw new Error('Invalid duration.');
      setSession(interaction.user.id, {
        type,
        durationMs: selected.ms,
        durationLabel: selected.label,
      });
      await interaction.showModal(detailsModal(type));
      return true;
    }

    if (interaction.isStringSelectMenu() && id === PINELLAS_INFRACT_RANK_ID) {
      const session = getSession(interaction.user.id);
      if (!session?.targetId) throw new Error('Pick a user first.');
      const demoteRankName = interaction.values?.[0];
      if (!getPinellasRankByName(demoteRankName)) throw new Error('Invalid rank.');
      setSession(interaction.user.id, {
        type: 'demotion',
        demoteRankName,
      });
      await interaction.showModal(detailsModal('demotion'));
      return true;
    }

    if (interaction.isModalSubmit() && id.startsWith(PINELLAS_INFRACT_MODAL_PREFIX)) {
      const type = id.slice(PINELLAS_INFRACT_MODAL_PREFIX.length);
      const session = getSession(interaction.user.id);
      if (!session?.targetId) throw new Error('Your infraction session expired. Run `/infract` again.');
      if (session.type && session.type !== type) {
        // allow termination modal without prior type write
      }
      const effectiveType = type;
      const policy = interaction.fields.getTextInputValue('policy');
      const description = interaction.fields.getTextInputValue('description');

      await interaction.deferUpdate();

      const guild = interaction.guild
        || await interaction.client.guilds.fetch(interaction.guildId);
      const targetMember = await guild.members.fetch(session.targetId);
      const issuerMember = interaction.member
        || await guild.members.fetch(interaction.user.id);
      const channel = interaction.channel
        || await interaction.client.channels.fetch(session.channelId);

      const entry = await createPinellasInfraction({
        client: interaction.client,
        guild,
        channel,
        issuerMember,
        targetMember,
        type: effectiveType,
        policy,
        description,
        durationMs: session.durationMs || null,
        durationLabel: session.durationLabel || null,
        demoteRankName: session.demoteRankName || null,
      });

      clearSession(interaction.user.id);

      await interaction.editReply({
        components: [
          new ContainerBuilder().clearAccentColor().addTextDisplayComponents(
            new TextDisplayBuilder().setContent([
              `# ${UNLOCK_EMOJI} Infraction Issued`,
              '',
              `Issued **${typeLabel(entry.type)}** to <@${entry.userId}>.`,
              `ID: \`${entry.id}\``,
              `Posted in <#${entry.channelId}>.`,
            ].join('\n')),
          ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
        files: [],
        allowedMentions: { parse: [] },
      });
      return true;
    }
  } catch (error) {
    logger.warn(`Pinellas infract interaction failed: ${error?.message || error}`);
    const content = String(error?.message || 'Could not continue this infraction.').slice(0, 1800);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
    } else if (interaction.isModalSubmit?.()) {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
    return true;
  }

  return false;
}
