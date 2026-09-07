import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { getIdentityCache } from './identityStore.js';
import { logger } from './logger.js';
import {
  fetchMelonlyCadForDiscord,
  fetchMelonlyMemberDiscordId,
  fetchRecentMelonlyShifts,
  formatCadAttachedCalls,
  formatCadStatus,
  isActiveMelonlyShift,
  isMelonlyRateLimited,
  resolveMelonlyDiscordId,
  shiftCreatedMs,
} from './melonly.js';
import {
  getHighestPinellasRank,
  PINELLAS_RANKS,
} from './pinellasPromote.js';
import { PINELLAS_EMPLOYEE_WELCOME_ROLE_ID, PINELLAS_GUILD_ID } from './pinellasServer.js';

export const PINELLAS_SHIFT_PANEL_CHANNEL_ID = '1546298062568165396';
export const PINELLAS_ON_DUTY_ROLE_ID = '1514462780575715418';
/** Guild used for “Voice Chat” lookup on the deputy card (Clearwater main). */
export const PINELLAS_SHIFT_VC_GUILD_ID = '1514026810348671026';
export const PINELLAS_SHIFT_REFRESH_MS = 30_000;

export const PINELLAS_SHIFT_REPORTS_ID = 'pcs:shift:reports';
export const PINELLAS_SHIFT_LOOKUP_ID = 'pcs:shift:lookup';

/** Melonly department id — create the API token on this Melonly (Settings → Panel). */
export const PINELLAS_MELONLY_DEPARTMENT_ID = '7470323914464301056';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-shift-panel.json');
const MEMBER_MAP_PATH = path.join(ROOT, 'data', 'pinellas-melonly-members.json');
const BANNER_PATH = path.join(ROOT, 'assets', 'pcso-shift-banner.webp');
const FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-shift-footer.webp');

const SLOGO_EMOJI = '<:slogo:1546245229420744804>';
const ATIME_EMOJI = '<:atime:1546336942785044490>';
const SHEET_EMOJI = '<:sheet:1546293540827701329>';
const CLICK_EMOJI = '<:click:1517217194067628062>';

/** Melonly memberId → discordId */
const memberDiscordCache = new Map();
/** discordId → Melonly memberId */
const discordMemberCache = new Map();
/** Last successful on-duty snapshot (used when Melonly 429s). */
let lastSnapshot = null;

const REPORT_OPTIONS = Object.freeze([
  { label: 'OIS Report', value: 'ois' },
  { label: 'MVA Report', value: 'mva' },
  { label: 'Arrest Report', value: 'arrest' },
  { label: 'Citation Report', value: 'citation' },
  { label: 'Warrant Log', value: 'warrant' },
]);

const CORPORAL_INDEX = PINELLAS_RANKS.findIndex((rank) => rank.name === 'Corporal');

/** @type {ReturnType<typeof setInterval> | null} */
let refreshTimer = null;
/** @type {Promise<void> | null} */
let refreshInFlight = null;

async function loadMemberDiscordMap() {
  try {
    const raw = JSON.parse(await readFile(MEMBER_MAP_PATH, 'utf8'));
    const map = raw?.byMemberId && typeof raw.byMemberId === 'object' ? raw.byMemberId : {};
    for (const [memberId, discordId] of Object.entries(map)) {
      if (memberId && /^\d{16,22}$/.test(String(discordId))) {
        memberDiscordCache.set(String(memberId), String(discordId));
        discordMemberCache.set(String(discordId), String(memberId));
      }
    }
  } catch {
    // first run
  }
}

async function saveMemberDiscordMap() {
  const byMemberId = Object.fromEntries(memberDiscordCache.entries());
  await mkdir(path.dirname(MEMBER_MAP_PATH), { recursive: true });
  await writeFile(MEMBER_MAP_PATH, `${JSON.stringify({ byMemberId }, null, 2)}\n`, 'utf8');
}

async function rememberMemberDiscord(memberId, discordId) {
  if (!memberId || !/^\d{16,22}$/.test(String(discordId))) return;
  const key = String(memberId);
  const value = String(discordId);
  const changed = memberDiscordCache.get(key) !== value;
  memberDiscordCache.set(key, value);
  discordMemberCache.set(value, key);
  if (changed) await saveMemberDiscordMap().catch(() => {});
}

function isPcsoMember(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(
    member.roles.cache.has(PINELLAS_EMPLOYEE_WELCOME_ROLE_ID)
    || member.roles.cache.has(PINELLAS_ON_DUTY_ROLE_ID)
    || getHighestPinellasRank(member),
  );
}

/**
 * Build Melonly memberId ↔ Discord map from active shift member IDs.
 * Uses official GET /server/members/{id}/discord (main Melonly API).
 */
async function ensureMelonlyDiscordIndex(apiKey, neededMemberIds = []) {
  await loadMemberDiscordMap();

  const missing = [...new Set(neededMemberIds.map(String))].filter((id) => id && !memberDiscordCache.has(id));
  if (!missing.length) return;

  let linked = 0;
  for (const memberId of missing) {
    try {
      const discordId = await fetchMelonlyMemberDiscordId(apiKey, memberId);
      if (discordId) {
        await rememberMemberDiscord(memberId, discordId);
        linked += 1;
      }
    } catch (error) {
      if (error?.status === 429) {
        logger.warn('Pinellas shift panel: Melonly rate limited while linking Discord IDs.');
        break;
      }
      // 404 = no Discord link on Melonly
    }
  }
  if (linked) {
    logger.info(`Pinellas shift panel: linked ${linked}/${missing.length} Melonly members via /discord.`);
  }
}

/**
 * Resolve Discord ID for a Melonly shift (main Melonly API).
 */
async function resolveDiscordIdForShift(apiKey, shift, guilds = []) {
  const memberId = String(shift?.memberId || '');
  if (!memberId) return null;

  if (memberDiscordCache.has(memberId)) return memberDiscordCache.get(memberId);

  const explicit = resolveMelonlyDiscordId(shift);
  if (explicit) {
    await rememberMemberDiscord(memberId, explicit);
    return explicit;
  }

  try {
    const discordId = await fetchMelonlyMemberDiscordId(apiKey, memberId);
    if (discordId) {
      await rememberMemberDiscord(memberId, discordId);
      return discordId;
    }
  } catch (error) {
    if (error?.status === 429) throw error;
  }

  // Last resort: memberId is already a Discord snowflake present in a known guild.
  if (/^\d{16,22}$/.test(memberId)) {
    for (const guild of guilds) {
      if (!guild) continue;
      const member = guild.members.cache.get(memberId)
        || await guild.members.fetch(memberId).catch(() => null);
      if (member) {
        await rememberMemberDiscord(memberId, memberId);
        return memberId;
      }
    }
  }

  return null;
}

function isSupervisorRank(rank) {
  if (!rank) return false;
  const index = PINELLAS_RANKS.findIndex((entry) => entry.roleId === rank.roleId);
  if (index < 0) return false;
  // Corporal and above (higher ranks have lower index).
  return CORPORAL_INDEX < 0 ? false : index <= CORPORAL_INDEX;
}

async function readStore() {
  try {
    const store = JSON.parse(await readFile(STORE_PATH, 'utf8'));
    return {
      channelId: store.channelId || PINELLAS_SHIFT_PANEL_CHANNEL_ID,
      messageId: store.messageId || null,
      guildId: store.guildId || PINELLAS_GUILD_ID,
      updatedAt: store.updatedAt || null,
    };
  } catch {
    return {
      channelId: PINELLAS_SHIFT_PANEL_CHANNEL_ID,
      messageId: null,
      guildId: PINELLAS_GUILD_ID,
      updatedAt: null,
    };
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
    logger.warn(`Pinellas shift panel: missing asset ${name} (${error?.message || error})`);
    return null;
  }
}

export function formatShiftDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '0m';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Parse callsign / roleplay name from a Discord nickname like `1A-12 | John Doe`.
 */
export function parseDeputyNickname(nickname) {
  const raw = String(nickname || '').trim();
  if (!raw) return { callsign: '—', roleplayName: '—' };
  const parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { callsign: parts[0], roleplayName: parts.slice(1).join(' | ') };
  }
  return { callsign: '—', roleplayName: raw };
}

function memberVoiceChannel(guild, userId) {
  if (!guild?.members?.cache && !guild?.channels?.cache) return null;
  const member = guild.members.cache.get(String(userId));
  const channel = member?.voice?.channel;
  if (channel) return channel;
  for (const ch of guild.channels.cache.values()) {
    if (!ch.isVoiceBased?.()) continue;
    if (ch.members?.has?.(String(userId))) return ch;
  }
  return null;
}

function formatInGameLocation(player) {
  if (!player) return 'Not in game';
  const parts = [
    player.location?.building,
    player.location?.street,
    player.location?.postal ? `Postal ${player.location.postal}` : '',
  ].filter(Boolean);
  if (parts.length) return parts.join(', ');
  if (player.team) return `In game (${player.team})`;
  return 'In game';
}

async function loadErlcPlayersByRobloxId(serverKey) {
  if (!serverKey) return new Map();
  try {
    const server = await fetchErlcServer(serverKey);
    const players = (server.Players || server.players || []).map(parseErlcPlayer);
    const map = new Map();
    for (const player of players) {
      if (player.robloxId) map.set(String(player.robloxId), player);
    }
    return map;
  } catch (error) {
    logger.warn(`Pinellas shift panel: ER:LC fetch failed (${error?.message || error})`);
    return new Map();
  }
}

function waveDurationMs(allShifts, memberId, wave, nowMs) {
  const id = String(memberId || '');
  const waveNum = Number(wave);
  let total = 0;
  for (const shift of allShifts) {
    if (String(shift?.memberId || '') !== id) continue;
    if (Number.isFinite(waveNum) && Number(shift?.wave) !== waveNum) continue;
    const start = shiftCreatedMs(shift);
    if (!start) continue;
    const endRaw = Number(shift?.endedAt);
    const end = (!endRaw || endRaw === 0)
      ? nowMs
      : (endRaw > 1e12 ? endRaw : endRaw * 1000);
    if (end > start) total += end - start;
  }
  return total;
}

/**
 * Prefer callsign|name from Pinellas nick, then Clearwater nick, then display name.
 */
function resolveDeputyIdentity(pinellasMember, clearwaterMember, player) {
  const candidates = [
    pinellasMember?.nickname,
    clearwaterMember?.nickname,
    pinellasMember?.displayName,
    clearwaterMember?.displayName,
    pinellasMember?.user?.globalName,
    clearwaterMember?.user?.globalName,
    pinellasMember?.user?.username,
    clearwaterMember?.user?.username,
  ].filter(Boolean);

  let parsed = { callsign: '—', roleplayName: '—' };
  for (const candidate of candidates) {
    parsed = parseDeputyNickname(candidate);
    if (parsed.callsign !== '—') break;
  }

  const callsign = parsed.callsign !== '—'
    ? parsed.callsign
    : (player?.callsign || '—');
  const roleplayName = parsed.roleplayName !== '—'
    ? parsed.roleplayName
    : (player?.username || candidates[0] || 'Unknown');

  return { callsign, roleplayName };
}

/**
 * Build enriched on-duty deputy rows from main Melonly + Discord + ER:LC.
 * API token comes from the main Melonly panel; Pinellas deputies are filtered via PCSO Discord roles.
 */
export async function collectOnDutyDeputies(client, {
  apiKey = config.melonlyApiKey,
  erlcServerKey = config.erlcServerKey,
} = {}) {
  if (!apiKey) {
    throw new Error(
      'MELONLY_API_KEY is not configured. Create a token on the main Melonly panel '
      + '(Settings → Panel → API Tokens).',
    );
  }

  await loadMemberDiscordMap();

  // Main Melonly API (department has no API tokens).
  const recentShifts = await fetchRecentMelonlyShifts(apiKey, { cacheTtlMs: 25_000, maxPages: 3 });
  let activeShifts = recentShifts.filter(isActiveMelonlyShift);

  // If Melonly returns shifts tagged with the Pinellas department serverId, prefer those.
  const deptTagged = activeShifts.filter(
    (shift) => String(shift?.serverId || '') === PINELLAS_MELONLY_DEPARTMENT_ID,
  );
  if (deptTagged.length) activeShifts = deptTagged;

  const pinellas = client.guilds.cache.get(PINELLAS_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
  const vcGuild = client.guilds.cache.get(PINELLAS_SHIFT_VC_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_SHIFT_VC_GUILD_ID).catch(() => null);
  const clearwater = config.guildId
    ? (client.guilds.cache.get(config.guildId)
      || await client.guilds.fetch(config.guildId).catch(() => null))
    : null;

  if (pinellas) await pinellas.members.fetch().catch(() => null);

  const neededIds = activeShifts.map((shift) => String(shift?.memberId || '')).filter(Boolean);
  await ensureMelonlyDiscordIndex(apiKey, neededIds);

  const [identityCache, erlcByRoblox] = await Promise.all([
    getIdentityCache().catch(() => ({ byDiscord: {} })),
    loadErlcPlayersByRobloxId(erlcServerKey),
  ]);

  const guilds = [pinellas, clearwater, vcGuild].filter(Boolean);
  const nowMs = Date.now();
  const byDiscord = new Map();
  let unresolved = 0;

  for (const shift of activeShifts) {
    const memberId = String(shift.memberId || '');
    if (!memberId) continue;

    const discordId = await resolveDiscordIdForShift(apiKey, shift, guilds);
    if (!discordId) {
      unresolved += 1;
      continue;
    }
    if (byDiscord.has(discordId)) continue;

    const pinellasMember = pinellas?.members?.cache?.get(discordId)
      || await pinellas?.members?.fetch(discordId).catch(() => null);
    const clearwaterMember = clearwater?.members?.cache?.get(discordId)
      || vcGuild?.members?.cache?.get(discordId)
      || null;

    // Pinellas panel: only PCSO staff (main Melonly includes every department / staff type).
    if (!isPcsoMember(pinellasMember)) continue;

    const rank = getHighestPinellasRank(pinellasMember);
    const startedMs = shiftCreatedMs(shift) || nowMs;
    const thisShiftMs = Math.max(0, nowMs - startedMs);
    const totalWaveMs = waveDurationMs(recentShifts, memberId, shift.wave, nowMs) || thisShiftMs;

    const identity = identityCache?.byDiscord?.[discordId] || null;
    const robloxId = identity?.robloxId ? String(identity.robloxId) : null;
    let player = robloxId ? erlcByRoblox.get(robloxId) : null;

    const { callsign, roleplayName } = resolveDeputyIdentity(pinellasMember, clearwaterMember, player);
    if (!player && callsign !== '—') {
      for (const entry of erlcByRoblox.values()) {
        if (String(entry.callsign || '').toLowerCase() === callsign.toLowerCase()) {
          player = entry;
          break;
        }
      }
    }

    const voice = vcGuild ? memberVoiceChannel(vcGuild, discordId) : null;

    byDiscord.set(discordId, {
      discordId,
      memberId,
      callsign,
      roleplayName,
      rankName: rank?.name || 'Deputy',
      rank,
      isSupervisor: isSupervisorRank(rank),
      shift,
      startedMs,
      thisShiftMs,
      totalWaveMs,
      inGame: Boolean(player),
      locationLabel: formatInGameLocation(player),
      voiceLabel: voice ? `<#${voice.id}>` : 'Not in VC',
      voiceChannelId: voice?.id || null,
    });
  }

  const deputies = [...byDiscord.values()].sort((a, b) => {
    const left = `${a.callsign} ${a.roleplayName}`.toLowerCase();
    const right = `${b.callsign} ${b.roleplayName}`.toLowerCase();
    return left.localeCompare(right);
  });

  logger.info(
    `Pinellas shift panel Melonly: recent=${recentShifts.length} active=${activeShifts.length} `
    + `shown=${deputies.length} unresolved=${unresolved} linked=${memberDiscordCache.size}`,
  );

  const snapshot = {
    deputies,
    activeShiftCount: activeShifts.length,
    unresolvedCount: unresolved,
    supervisorCount: deputies.filter((entry) => entry.isSupervisor).length,
    fetchedAt: new Date().toISOString(),
  };
  lastSnapshot = snapshot;
  return snapshot;
}

function onDutyLines(deputies) {
  if (!deputies.length) return '- Nobody is currently on shift.';
  return deputies.map((entry) => (
    `- ${entry.callsign}, ${entry.roleplayName}, ${entry.rankName}`
    + `  | <@${entry.discordId}> | ${formatShiftDuration(entry.thisShiftMs)}`
  )).join('\n');
}

function lookupOptions(deputies) {
  return deputies.slice(0, 25).map((entry) => {
    const label = `${entry.callsign}, ${entry.roleplayName}`.slice(0, 100);
    return {
      label: label || entry.discordId,
      description: String(entry.rankName || 'Deputy').slice(0, 100),
      value: entry.discordId,
    };
  });
}

async function buildShiftPanelPayload(snapshot, { includeFiles = true } = {}) {
  const files = [];
  const banner = includeFiles
    ? await loadAttachment(BANNER_PATH, 'pcso-shift-banner.webp')
    : null;
  const footer = includeFiles
    ? await loadAttachment(FOOTER_PATH, 'pcso-shift-footer.webp')
    : null;
  if (banner) files.push(banner);
  if (footer) files.push(footer);

  const hasBanner = Boolean(banner) || !includeFiles;
  const hasFooter = Boolean(footer) || !includeFiles;
  const deputies = snapshot.deputies || [];

  const container = new ContainerBuilder().clearAccentColor();

  if (hasBanner) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-shift-banner.webp'),
      ),
    );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${SLOGO_EMOJI} Shift Panel`,
        '',
        'Below is the shift panel you can find the active on-duty deputys and more information',
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `## ${ATIME_EMOJI} On Shift`,
        onDutyLines(deputies),
      ].join('\n').slice(0, 4000)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(PINELLAS_SHIFT_REPORTS_ID)
          .setPlaceholder('Reports')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(REPORT_OPTIONS.map((option) => ({
            label: option.label,
            value: option.value,
          }))),
      ),
    );

  const options = lookupOptions(deputies);
  const lookup = new StringSelectMenuBuilder()
    .setCustomId(PINELLAS_SHIFT_LOOKUP_ID)
    .setPlaceholder('Deputy Lookup')
    .setMinValues(1)
    .setMaxValues(1);
  if (options.length) {
    lookup.addOptions(options);
  } else {
    lookup
      .setDisabled(true)
      .addOptions([{ label: 'Nobody on duty', value: 'none', description: 'No active Melonly shifts' }]);
  }
  container.addActionRowComponents(new ActionRowBuilder().addComponents(lookup));

  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('pcs:shift:count:on')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
          .setLabel(`On Shift: ${deputies.length}`),
        new ButtonBuilder()
          .setCustomId('pcs:shift:count:sup')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
          .setLabel(`Supervisors: ${snapshot.supervisorCount || 0}`),
      ),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Large),
    );

  if (hasFooter) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-shift-footer.webp'),
      ),
    );
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: {
      parse: [],
      users: deputies.map((entry) => entry.discordId),
    },
  };
  if (includeFiles && files.length) payload.files = files;
  return payload;
}

async function buildLookupPayload(deputy, {
  apiKey = config.melonlyApiKey,
  includeFiles = true,
} = {}) {
  const files = [];
  const banner = includeFiles
    ? await loadAttachment(BANNER_PATH, 'pcso-shift-banner.webp')
    : null;
  const footer = includeFiles
    ? await loadAttachment(FOOTER_PATH, 'pcso-shift-footer.webp')
    : null;
  if (banner) files.push(banner);
  if (footer) files.push(footer);

  let cad = null;
  try {
    cad = await fetchMelonlyCadForDiscord(apiKey, deputy.discordId);
  } catch (error) {
    logger.warn(`Pinellas shift lookup CAD failed: ${error?.message || error}`);
  }

  const container = new ContainerBuilder().clearAccentColor();
  if (banner || !includeFiles) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-shift-banner.webp'),
      ),
    );
  }

  container
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${SHEET_EMOJI} <@${deputy.discordId}> Shift Information`,
        `**Callsign:** ${deputy.callsign}`,
        `**Roleplay Name:** ${deputy.roleplayName}`,
        `**Rank:** ${deputy.rankName}`,
        '',
        `**Shift Time:** ${formatShiftDuration(deputy.thisShiftMs)}`,
        `**Total Time:** ${formatShiftDuration(deputy.totalWaveMs)}`,
        '',
        `**In-Game Location:** ${deputy.locationLabel}`,
        `**Voice Chat:** ${deputy.voiceLabel}`,
        '',
        `## ${CLICK_EMOJI} CAD Information`,
        `**Current status:** ${formatCadStatus(cad)}`,
        `**Attached Calls:** ${formatCadAttachedCalls(cad)}`,
      ].join('\n').slice(0, 4000)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large),
    );

  if (footer || !includeFiles) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-shift-footer.webp'),
      ),
    );
  }

  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [], users: [deputy.discordId] },
  };
  if (includeFiles && files.length) payload.files = files;
  return payload;
}

/**
 * Sync Discord on-duty role from Melonly active shifts + in-game presence.
 * Role is granted when on Melonly shift and in ER:LC; removed when off shift or left game.
 */
export async function syncPinellasOnDutyRoles(client, snapshot) {
  const guild = client.guilds.cache.get(PINELLAS_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
  if (!guild) return { added: 0, removed: 0 };

  const role = guild.roles.cache.get(PINELLAS_ON_DUTY_ROLE_ID)
    || await guild.roles.fetch(PINELLAS_ON_DUTY_ROLE_ID).catch(() => null);
  if (!role) {
    logger.warn(`Pinellas shift panel: on-duty role ${PINELLAS_ON_DUTY_ROLE_ID} missing.`);
    return { added: 0, removed: 0 };
  }

  await guild.members.fetch().catch(() => null);

  const erlcConfigured = Boolean(config.erlcServerKey);
  const shouldHave = new Set(
    (snapshot.deputies || [])
      .filter((entry) => (erlcConfigured ? entry.inGame : true))
      .map((entry) => entry.discordId),
  );

  let added = 0;
  let removed = 0;

  for (const discordId of shouldHave) {
    const member = guild.members.cache.get(discordId);
    if (!member) continue;
    if (member.roles.cache.has(PINELLAS_ON_DUTY_ROLE_ID)) continue;
    try {
      await member.roles.add(PINELLAS_ON_DUTY_ROLE_ID, 'Pinellas Melonly shift started (in game)');
      added += 1;
    } catch (error) {
      logger.warn(`Could not add on-duty role to ${discordId}: ${error?.message || error}`);
    }
  }

  for (const member of guild.members.cache.values()) {
    if (!member.roles.cache.has(PINELLAS_ON_DUTY_ROLE_ID)) continue;
    if (shouldHave.has(member.id)) continue;
    try {
      await member.roles.remove(PINELLAS_ON_DUTY_ROLE_ID, 'Pinellas Melonly shift ended or left game');
      removed += 1;
    } catch (error) {
      logger.warn(`Could not remove on-duty role from ${member.id}: ${error?.message || error}`);
    }
  }

  return { added, removed };
}

/**
 * Refresh Melonly snapshot, sync roles, and update the posted panel message.
 */
export async function refreshPinellasShiftPanel(client, { forceResend = false } = {}) {
  if (!config.melonlyApiKey) {
    logger.warn('Pinellas shift panel refresh skipped: MELONLY_API_KEY missing.');
    return null;
  }

  let snapshot;
  try {
    snapshot = await collectOnDutyDeputies(client);
  } catch (error) {
    if (error?.status === 429 || error?.rateLimited || isMelonlyRateLimited()) {
      if (lastSnapshot) {
        logger.warn(`Pinellas shift panel: Melonly 429 — reusing last snapshot (${error?.message || error})`);
        snapshot = lastSnapshot;
      } else {
        throw new Error(
          'Melonly is rate limiting the main API right now. Wait a minute and try `-shiftpanel` again.',
        );
      }
    } else {
      throw error;
    }
  }

  await syncPinellasOnDutyRoles(client, snapshot).catch((error) => {
    logger.warn(`Pinellas on-duty role sync failed: ${error?.message || error}`);
  });

  const store = await readStore();
  const payload = await buildShiftPanelPayload(snapshot, { includeFiles: true });

  const channel = await client.channels.fetch(store.channelId || PINELLAS_SHIFT_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Shift panel channel \`${PINELLAS_SHIFT_PANEL_CHANNEL_ID}\` is unavailable.`);
  }

  let message = null;
  if (!forceResend && store.messageId) {
    message = await channel.messages.fetch(store.messageId).catch(() => null);
  }

  if (message) {
    const editPayload = await buildShiftPanelPayload(snapshot, { includeFiles: false });
    try {
      await message.edit(editPayload);
    } catch (error) {
      logger.warn(`Pinellas shift panel edit failed; posting a new message (${error?.message || error})`);
      message = await channel.send(payload);
    }
  } else {
    message = await channel.send(payload);
  }

  store.messageId = message.id;
  store.channelId = channel.id;
  store.guildId = channel.guildId || PINELLAS_GUILD_ID;
  store.updatedAt = new Date().toISOString();
  await writeStore(store);
  return { message, snapshot };
}

/**
 * Admin posts (or refreshes) the live shift panel in the dedicated channel.
 */
export async function postPinellasShiftPanel(client, { issuer } = {}) {
  if (!config.melonlyApiKey) {
    throw new Error('MELONLY_API_KEY is not configured on the host.');
  }

  const me = issuer?.guild?.members?.me;
  if (me) {
    const channel = await client.channels.fetch(PINELLAS_SHIFT_PANEL_CHANNEL_ID).catch(() => null);
    const perms = channel?.permissionsFor?.(me);
    if (perms && (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.SendMessages))) {
      throw new Error('I need View Channel and Send Messages in the shift panel channel.');
    }
  }

  const result = await refreshPinellasShiftPanel(client, { forceResend: true });
  logger.info(
    `Pinellas shift panel posted by ${issuer?.user?.tag || issuer?.id || 'unknown'} `
    + `(${result?.snapshot?.deputies?.length || 0} on duty).`,
  );
  return result;
}

export function startPinellasShiftPanel(client) {
  if (refreshTimer) return () => {};

  const tick = async () => {
    if (refreshInFlight) return;
    refreshInFlight = refreshPinellasShiftPanel(client)
      .catch((error) => {
        logger.error('Pinellas shift panel refresh failed', error);
      })
      .finally(() => {
        refreshInFlight = null;
      });
    await refreshInFlight;
  };

  refreshTimer = setInterval(() => { void tick(); }, PINELLAS_SHIFT_REFRESH_MS);
  refreshTimer.unref?.();

  // First refresh shortly after ready so Melonly/ER:LC caches settle.
  setTimeout(() => { void tick(); }, 5_000).unref?.();

  logger.info(
    `Pinellas shift panel armed (channel ${PINELLAS_SHIFT_PANEL_CHANNEL_ID}; `
    + `refresh every ${PINELLAS_SHIFT_REFRESH_MS / 1000}s; on-duty role ${PINELLAS_ON_DUTY_ROLE_ID}).`,
  );

  return () => {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  };
}

export async function handlePinellasShiftPanelInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (id !== PINELLAS_SHIFT_REPORTS_ID && id !== PINELLAS_SHIFT_LOOKUP_ID) return false;
  if (!interaction.isStringSelectMenu()) return false;

  if (id === PINELLAS_SHIFT_REPORTS_ID) {
    await interaction.reply({
      content: 'Reports are not set up yet.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const discordId = interaction.values?.[0];
  if (!discordId || discordId === 'none') {
    await interaction.reply({
      content: 'Nobody is currently on duty.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const snapshot = await collectOnDutyDeputies(interaction.client);
    const deputy = snapshot.deputies.find((entry) => entry.discordId === discordId);
    if (!deputy) {
      await interaction.editReply({ content: 'That deputy is no longer on shift.' });
      return true;
    }
    const payload = await buildLookupPayload(deputy);
    await interaction.editReply(payload);
  } catch (error) {
    logger.error('Pinellas shift lookup failed', error);
    await interaction.editReply({
      content: String(error?.message || 'Could not load shift information.').slice(0, 1800),
    }).catch(() => {});
  }
  return true;
}
