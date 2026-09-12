import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
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
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { fetchErlcServer, libertyMapPoint, parseErlcPlayer } from './erlc.js';
import { getIdentityCache } from './identityStore.js';
import { renderLibertyLocationMap } from './libertyMapImage.js';
import { logger } from './logger.js';
import { syncPinellasAfkWarnings } from './pinellasAfk.js';
import {
  fetchMelonlyMemberDiscordId,
  fetchRecentMelonlyShifts,
  isActiveMelonlyShift,
  isMelonlyRateLimited,
  resolveMelonlyDiscordId,
  shiftCreatedMs,
} from './melonly.js';
import {
  getHighestPinellasRank,
  PINELLAS_RANKS,
} from './pinellasPromote.js';
import {
  PINELLAS_EMPLOYEE_WELCOME_ROLE_ID,
  PINELLAS_GUILD_ID,
} from './pinellasServer.js';

export const PINELLAS_SHIFT_PANEL_CHANNEL_ID = '1546298062568165396';
export const PINELLAS_ON_DUTY_ROLE_ID = '1514462780575715418';
/** Guild used for â€œVoice Chatâ€ lookup on the deputy card (Clearwater main). */
export const PINELLAS_SHIFT_VC_GUILD_ID = '1514026810348671026';
export const PINELLAS_SHIFT_REFRESH_MS = 30_000;

export const PINELLAS_SHIFT_REPORTS_ID = 'pcs:shift:reports';
export const PINELLAS_SHIFT_LOOKUP_ID = 'pcs:shift:lookup';

export const PINELLAS_SHIFT_REPORT_CHANNELS = Object.freeze({
  ois: '1514667548468314242',
  mva: '1514667590608486400',
  arrest: '1514667694920827000',
  citation: '1514667738516295680',
  warrant: '1524493216555208744',
});

/** Melonly department id for Pinellas County Sheriffâ€™s Office. */
export const PINELLAS_MELONLY_DEPARTMENT_ID = '7470323914464301056';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'pinellas-shift-panel.json');
const MEMBER_MAP_PATH = path.join(ROOT, 'data', 'pinellas-melonly-members-v2.json');
const REPORT_SESSION_PATH = path.join(ROOT, 'data', 'pinellas-report-sessions.json');
const REPORT_CASE_NUMBER_PATH = path.join(ROOT, 'data', 'pinellas-report-case-number.json');
const BANNER_PATH = path.join(ROOT, 'assets', 'pcso-shift-banner.webp');
const FOOTER_PATH = path.join(ROOT, 'assets', 'pcso-shift-footer.webp');

const SLOGO_EMOJI = '<:slogo:1546245229420744804>';
const ATIME_EMOJI = '<:atime:1546336942785044490>';
const SHEET_EMOJI = '<:sheet:1546293540827701329>';

/** Melonly memberId â†’ discordId */
const memberDiscordCache = new Map();
/** discordId â†’ Melonly memberId */
const discordMemberCache = new Map();
const reportSessions = new Map();
let reportCaseQueue = Promise.resolve();
/** Last successful on-duty snapshot (used when Melonly 429s). */
let lastSnapshot = null;

const REPORT_OPTIONS = Object.freeze([
  { label: 'OIS Report', value: 'ois' },
  { label: 'MVA Report', value: 'mva' },
  { label: 'Arrest Report', value: 'arrest' },
  { label: 'Citation Report', value: 'citation' },
  { label: 'Warrant Log', value: 'warrant' },
]);

const REPORT_DEFINITIONS = Object.freeze({
  ois: {
    title: 'OIS Report',
    heading: 'Pinellas County Sheriff Office OIS Report',
    steps: [
      [['date', 'Date', false], ['time', 'Time (in game)', false], ['location', 'Location', true], ['weather', 'Weather conditions', false]],
      [['badge', 'Badge #', false], ['suspectDescription', 'Suspect Description', true], ['vehicle', 'Vehicle Involved', false], ['weapon', 'Suspect weapon', false]],
      [['roundsAmount', 'Amount of rounds fired', false], ['roundsFired', 'Rounds Fired', false], ['direction', 'Direction of fire', false], ['weaponUsed', 'Weapon Used', false], ['subjectInjuries', 'Subject Injuries', true]],
      [['deputyInjuries', 'Deputy Injuries', true], ['propertyDamage', 'Property Damage', true], ['narrative', 'Narrative Scene Summary', true]],
    ],
  },
  mva: {
    title: 'MVA Report',
    heading: 'Pinellas County Sheriff Office MVA Report',
    steps: [
      [['date', 'Date', false], ['time', 'Time (in game)', false], ['location', 'Location', true], ['weather', 'Weather conditions', false]],
      [['badge', 'Deputy Reporting Badge #', false], ['citation', 'Any Citation given?', false], ['arrest', 'Any Arrest made?', false], ['person1', 'Person 1: name and DOB', true], ['person1Vehicle', 'Person 1: plate and license #', true]],
      [['person2', 'Person 2: name and DOB', true], ['person2Vehicle', 'Person 2: plate and license #', true], ['injuriesDamage', 'Injuries and vehicle damage', true], ['narrative', 'Narrative Scene Summary', true]],
    ],
  },
  arrest: {
    title: 'Arrest Report',
    heading: 'PCSO Arrest Log',
    steps: [
      [['assisting', 'Assisting Officer(s)', true], ['date', 'Date', false], ['time', 'Time of Arrest', false], ['suspect', 'Suspect', true]],
      [['suspectDescription', 'Suspect Description', true], ['background', 'Background clear', false], ['cad', 'Registered in CAD', false], ['charges', 'Charges', true], ['vehicleColor', 'Vehicle Color', false]],
      [['vehicleModel', 'Vehicle Exact Model', false], ['vehiclePlate', 'Vehicle Plate', false], ['narrative', 'Detailed Scene Narrative', true]],
    ],
  },
  citation: {
    title: 'Citation Report',
    heading: 'PCSO Citation Log',
    steps: [
      [['assisting', 'Assisting Officer(s)', true], ['date', 'Date', false], ['time', 'Time of Citation', false], ['location', 'Location', true]],
      [['citedFor', 'Cited for', true], ['suspect', 'Suspect', true], ['background', 'Background clear', false], ['cad', 'Registered in CAD', false], ['vehicleColor', 'Vehicle Color', false]],
      [['vehicleModel', 'Vehicle Exact Model', false], ['vehiclePlate', 'Vehicle Plate', false], ['narrative', 'Detailed Scene Narrative', true]],
    ],
  },
  warrant: {
    title: 'Warrant Arrest Log',
    heading: 'PCSO Warrant Arrest Log',
    steps: [
      [['assisting', 'Assisting Deputy(s)', true], ['date', 'Date', false], ['time', 'Time of Arrest', false], ['warrantType', 'Warrant Type (Search / Arrest)', false]],
      [['warrantNumber', 'Warrant Number', false], ['charges', 'Charge(s)', true], ['suspect', 'Suspect', true], ['background', 'Background clear (Y / N)', false], ['cad', 'Registered in CAD (Y / N)', false]],
      [['gang', 'Gang Documented (Y / N)', false], ['vehicleColor', 'Vehicle Color', false], ['vehicleModel', 'Vehicle Exact Model', false], ['vehiclePlate', 'Vehicle Plate', false], ['narrative', 'Detailed Scene Narrative', true]],
    ],
  },
});

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

/** Resolve and persist Melonly's internal member ID to its linked Discord ID. */
export async function resolvePinellasMelonlyMemberDiscordId(apiKey, memberId) {
  const id = String(memberId || '').trim();
  if (!id) return null;
  await loadMemberDiscordMap();
  if (memberDiscordCache.has(id)) return memberDiscordCache.get(id);

  const discordId = await fetchMelonlyMemberDiscordId(apiKey, id);
  if (discordId) await rememberMemberDiscord(id, discordId);
  return discordId;
}

/**
 * Build Melonly memberId â†” Discord map from active shift member IDs.
 * Uses official GET /server/members/{id}/discord (main Melonly API).
 */
async function ensureMelonlyDiscordIndex(apiKey, neededMemberIds = []) {
  await loadMemberDiscordMap();

  const missing = [...new Set(neededMemberIds.map(String))].filter((id) => id && !memberDiscordCache.has(id));
  if (!missing.length) return;

  let linked = 0;
  for (const memberId of missing) {
    try {
      const discordId = await resolvePinellasMelonlyMemberDiscordId(apiKey, memberId);
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
    const discordId = await resolvePinellasMelonlyMemberDiscordId(apiKey, memberId);
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
 * Parse callsign / roleplay name from a Discord server nickname.
 * Supports:
 * - `1A-12 | John Doe`
 * - `On Duty | 1A-12 | John Doe`
 * - `1111 | 3W-05 | Andre Terrance` (unit | radio callsign | name)
 */
export function parseDeputyNickname(nickname) {
  const raw = String(nickname || '').trim();
  if (!raw) return { callsign: 'â€”', roleplayName: 'â€”', altCallsigns: [] };

  let parts = raw.split('|').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return { callsign: 'â€”', roleplayName: 'â€”', altCallsigns: [] };

  // Strip leading duty/status prefixes.
  while (parts.length >= 2 && /^(on\s*duty|off\s*duty|on\s*break|duty)$/i.test(parts[0])) {
    parts = parts.slice(1);
  }

  if (parts.length >= 3 && looksLikeCallsignToken(parts[1])) {
    return {
      callsign: parts[0],
      roleplayName: parts.slice(2).join(' | '),
      altCallsigns: [parts[1]],
    };
  }

  if (parts.length >= 2) {
    return { callsign: parts[0], roleplayName: parts.slice(1).join(' | '), altCallsigns: [] };
  }
  return { callsign: 'â€”', roleplayName: parts[0], altCallsigns: [] };
}

/** Tokens that look like unit/radio callsigns (not a person's name). */
export function looksLikeCallsignToken(value) {
  const raw = String(value || '').trim();
  if (!raw || /\s/.test(raw)) return false;
  if (/^(on\s*duty|off\s*duty|on\s*break|duty)$/i.test(raw)) return false;
  return /^(?:\d{2,5}|\d{1,4}[A-Za-z]\d{0,4}|[A-Za-z]?\d+[A-Za-z]?-\d+|\d+[A-Za-z]+-\d+)$/i.test(raw);
}

function nicknameCallsignCandidates(...nicknames) {
  const found = [];
  const seen = new Set();
  for (const nickname of nicknames) {
    const parsed = parseDeputyNickname(nickname);
    for (const value of [parsed.callsign, ...(parsed.altCallsigns || [])]) {
      const key = normalizeCallsign(value);
      if (!key || value === 'â€”' || seen.has(key)) continue;
      seen.add(key);
      found.push(value);
    }
    for (const part of String(nickname || '').split('|').map((entry) => entry.trim()).filter(Boolean)) {
      if (!looksLikeCallsignToken(part)) continue;
      const key = normalizeCallsign(part);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      found.push(part);
    }
  }
  return found;
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

function isSheriffTeam(team) {
  return /sheriff/i.test(String(team || ''));
}

function normalizeCallsign(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

/** Other departments use callsigns starting with 2 or 3 â€” exclude those only. */
export function isOtherDepartmentCallsign(callsign) {
  const raw = String(callsign || '').trim();
  if (!raw || raw === 'â€”') return false;
  return /^[23]/.test(raw);
}

/** @deprecated use isOtherDepartmentCallsign (unknown callsigns should still show). */
export function isPcsoCallsign(callsign) {
  return !isOtherDepartmentCallsign(callsign);
}

function shiftDepartmentIds(shift) {
  return [
    shift?.serverId,
    shift?.departmentId,
    shift?.deptId,
    shift?.melonlyServerId,
    shift?.server?.id,
    shift?.department?.id,
  ].map((value) => String(value || '').trim()).filter(Boolean);
}

export function isPinellasDepartmentShift(shift) {
  return shiftDepartmentIds(shift).includes(PINELLAS_MELONLY_DEPARTMENT_ID);
}

/** Pinellas Discord staff via employee role or PCSO rank (not the on-duty role). */
export function isPinellasDiscordStaff(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(
    member.roles.cache.has(PINELLAS_EMPLOYEE_WELCOME_ROLE_ID)
    || getHighestPinellasRank(member),
  );
}

/**
 * Whether Melonly is labeling shifts with the Pinellas department id.
 * Note: every Melonly shift has *some* serverId (usually the main panel), so we
 * must look specifically for the Pinellas department id â€” not "any serverId".
 */
export function melonlyLabelsPinellasDepartment(shifts = []) {
  return (Array.isArray(shifts) ? shifts : []).some(isPinellasDepartmentShift);
}

/**
 * Load ER:LC players indexed by Roblox id and by callsign (Sheriff team preferred).
 */
async function loadErlcPlayerIndexes(serverKey) {
  const empty = { byRobloxId: new Map(), byCallsign: new Map(), sheriffByCallsign: new Map() };
  if (!serverKey) return empty;
  try {
    const server = await fetchErlcServer(serverKey);
    const players = (server.Players || server.players || []).map(parseErlcPlayer);
    const byRobloxId = new Map();
    const byCallsign = new Map();
    const sheriffByCallsign = new Map();
    for (const player of players) {
      if (player.robloxId) byRobloxId.set(String(player.robloxId), player);
      const key = normalizeCallsign(player.callsign);
      if (!key) continue;
      byCallsign.set(key, player);
      if (isSheriffTeam(player.team)) sheriffByCallsign.set(key, player);
    }
    return { byRobloxId, byCallsign, sheriffByCallsign };
  } catch (error) {
    logger.warn(`Pinellas shift panel: ER:LC fetch failed (${error?.message || error})`);
    return empty;
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
 * Prefer callsign|name from server nicknames:
 * `On Duty | 1A-12 | John Doe` or `1A-12 | John Doe`.
 */
function resolveDeputyIdentity(pinellasMember, clearwaterMember, player) {
  const candidates = [
    pinellasMember?.nickname,
    clearwaterMember?.nickname,
    // displayName includes nick when set
    pinellasMember?.displayName,
    clearwaterMember?.displayName,
  ].filter(Boolean);

  let parsed = { callsign: 'â€”', roleplayName: 'â€”', altCallsigns: [] };
  for (const candidate of candidates) {
    const next = parseDeputyNickname(candidate);
    if (next.callsign !== 'â€”') {
      parsed = next;
      break;
    }
    if (parsed.roleplayName === 'â€”' && next.roleplayName !== 'â€”') parsed = next;
  }

  const callsign = parsed.callsign !== 'â€”'
    ? parsed.callsign
    : (player?.callsign || 'â€”');
  const roleplayName = parsed.roleplayName !== 'â€”'
    ? parsed.roleplayName
    : (
      player?.username
      || pinellasMember?.user?.globalName
      || clearwaterMember?.user?.globalName
      || pinellasMember?.user?.username
      || clearwaterMember?.user?.username
      || 'Unknown'
    );

  const callsignCandidates = nicknameCallsignCandidates(
    ...candidates,
    callsign,
    ...(parsed.altCallsigns || []),
    player?.callsign,
  );

  return { callsign, roleplayName, callsignCandidates };
}

function findErlcPlayerForDeputy({
  robloxId,
  callsign,
  callsignCandidates = [],
  erlcByRoblox,
  erlcByCallsign,
  sheriffByCallsign,
}) {
  if (robloxId) {
    const byId = erlcByRoblox.get(String(robloxId));
    if (byId) return byId;
  }
  const tried = new Set();
  for (const value of [callsign, ...callsignCandidates]) {
    const key = normalizeCallsign(value);
    if (!key || tried.has(key)) continue;
    tried.add(key);
    const player = sheriffByCallsign.get(key) || erlcByCallsign.get(key);
    if (player) return player;
  }
  return null;
}

function locationMapPin(player) {
  if (!player?.location) return null;
  if (!Number.isFinite(player.location.x) || !Number.isFinite(player.location.z)) return null;
  return libertyMapPoint(player.location.x, player.location.z);
}

/**
 * Build on-duty deputy rows for the Pinellas shift panel.
 *
 * Shows people on an active Melonly shift for the Pinellas department only.
 * The Discord on-duty role is never used as a panel inclusion source.
 */
export async function collectOnDutyDeputies(client, {
  apiKey = config.melonlyApiKey,
  erlcServerKey = config.erlcServerKey,
} = {}) {
  if (!apiKey) {
    throw new Error(
      'MELONLY_API_KEY is not configured. Create a token on the main Melonly panel '
      + '(Settings â†’ Panel â†’ API Tokens).',
    );
  }

  await loadMemberDiscordMap();

  // Main Melonly API (department Melonly has no API tokens).
  const recentShifts = await fetchRecentMelonlyShifts(apiKey, { cacheTtlMs: 25_000, maxPages: 3 });
  const activeShifts = recentShifts.filter(isActiveMelonlyShift);
  // Only treat Melonly as department-tagged when the Pinellas department id appears.
  // Plain serverId on every shift is the main panel id and must not disable the staff fallback.
  const labelsPinellasDept = melonlyLabelsPinellasDepartment(recentShifts);

  const pinellas = client.guilds.cache.get(PINELLAS_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
  const vcGuild = client.guilds.cache.get(PINELLAS_SHIFT_VC_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_SHIFT_VC_GUILD_ID).catch(() => null);
  const clearwater = config.guildId
    ? (client.guilds.cache.get(config.guildId)
      || await client.guilds.fetch(config.guildId).catch(() => null))
    : null;

  if (pinellas) await pinellas.members.fetch().catch(() => null);
  if (clearwater) await clearwater.members.fetch().catch(() => null);
  if (vcGuild && vcGuild.id !== clearwater?.id && vcGuild.id !== pinellas?.id) {
    await vcGuild.members.fetch().catch(() => null);
  }

  const neededIds = activeShifts.map((shift) => String(shift?.memberId || '')).filter(Boolean);
  await ensureMelonlyDiscordIndex(apiKey, neededIds);

  const [identityCache, erlcIndexes] = await Promise.all([
    getIdentityCache().catch(() => ({ byDiscord: {} })),
    loadErlcPlayerIndexes(erlcServerKey),
  ]);
  const { byRobloxId: erlcByRoblox, byCallsign: erlcByCallsign, sheriffByCallsign } = erlcIndexes;

  const guilds = [pinellas, clearwater, vcGuild].filter(Boolean);
  const nowMs = Date.now();
  const byDiscord = new Map();
  let unresolved = 0;
  let skippedMainStaff = 0;
  let skippedOtherDept = 0;

  async function buildDeputyRow({
    discordId,
    memberId = null,
    shift = null,
    pinellasMember = null,
    clearwaterMember = null,
  }) {
    const identity = identityCache?.byDiscord?.[discordId] || null;
    const robloxId = identity?.robloxId ? String(identity.robloxId) : null;

    let { callsign, roleplayName, callsignCandidates } = resolveDeputyIdentity(
      pinellasMember,
      clearwaterMember,
      null,
    );

    let player = findErlcPlayerForDeputy({
      robloxId,
      callsign,
      callsignCandidates,
      erlcByRoblox,
      erlcByCallsign,
      sheriffByCallsign,
    });

    // Re-resolve name fields once we know the in-game player (fills gaps).
    ({ callsign, roleplayName, callsignCandidates } = resolveDeputyIdentity(
      pinellasMember,
      clearwaterMember,
      player,
    ));
    if (player?.callsign && callsign === 'â€”') callsign = player.callsign;

    if (isOtherDepartmentCallsign(callsign)) {
      skippedOtherDept += 1;
      return null;
    }

    // Any matched ER:LC player counts as in-game for location/map (already PCSO-filtered).
    const inGame = Boolean(player);
    const mapPin = locationMapPin(player);

    const rank = getHighestPinellasRank(pinellasMember);
    const startedMs = shift ? (shiftCreatedMs(shift) || nowMs) : nowMs;
    const thisShiftMs = shift ? Math.max(0, nowMs - startedMs) : 0;
    const totalWaveMs = shift
      ? (waveDurationMs(recentShifts, memberId, shift.wave, nowMs) || thisShiftMs)
      : 0;
    const voice = vcGuild ? memberVoiceChannel(vcGuild, discordId) : null;

    return {
      discordId,
      memberId,
      robloxId,
      callsign,
      callsignCandidates,
      roleplayName,
      rankName: rank?.name || 'Deputy',
      rank,
      isSupervisor: isSupervisorRank(rank),
      shift,
      startedMs: shift ? startedMs : null,
      thisShiftMs,
      totalWaveMs,
      inGame,
      erlcPosition: player?.location
        ? { x: player.location.x, z: player.location.z }
        : null,
      fromMelonly: true,
      locationLabel: formatInGameLocation(player),
      mapLeft: mapPin?.left ?? null,
      mapTop: mapPin?.top ?? null,
      voiceLabel: voice ? `<#${voice.id}>` : 'Not in VC',
      voiceChannelId: voice?.id || null,
    };
  }

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
      || (vcGuild && vcGuild.id !== clearwater?.id ? vcGuild.members.cache.get(discordId) : null)
      || await clearwater?.members?.fetch(discordId).catch(() => null)
      || await vcGuild?.members?.fetch(discordId).catch(() => null);

    const deptShift = isPinellasDepartmentShift(shift);
    // When Melonly never labels Pinellas department shifts, treat Melonly-active
    // Pinellas Discord staff (employee/rank) as department members.
    // Do NOT use the on-duty Discord role as an inclusion source.
    const staffProxy = !labelsPinellasDept && isPinellasDiscordStaff(pinellasMember);

    if (labelsPinellasDept) {
      if (!deptShift) {
        skippedMainStaff += 1;
        continue;
      }
    } else if (!staffProxy) {
      skippedMainStaff += 1;
      continue;
    }

    const row = await buildDeputyRow({
      discordId,
      memberId,
      shift,
      pinellasMember,
      clearwaterMember,
    });
    if (row) byDiscord.set(discordId, row);
  }

  const deputies = [...byDiscord.values()].sort((a, b) => {
    const left = `${a.callsign} ${a.roleplayName}`.toLowerCase();
    const right = `${b.callsign} ${b.roleplayName}`.toLowerCase();
    return left.localeCompare(right);
  });

  const sampleServerIds = [...new Set(
    activeShifts.flatMap((shift) => shiftDepartmentIds(shift)).slice(0, 8),
  )];

  logger.info(
    `Pinellas shift panel Melonly: recent=${recentShifts.length} active=${activeShifts.length} `
    + `shown=${deputies.length} unresolved=${unresolved} skippedMainStaff=${skippedMainStaff} `
    + `skippedOtherDept=${skippedOtherDept} pinellasTags=${labelsPinellasDept} `
    + `serverIds=[${sampleServerIds.join(',')}] linked=${memberDiscordCache.size}`,
  );

  const snapshot = {
    deputies,
    activeShiftCount: activeShifts.length,
    departmentShiftCount: deputies.length,
    unresolvedCount: unresolved,
    skippedMainStaffCount: skippedMainStaff,
    skippedOtherDeptCount: skippedOtherDept,
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

function reportModalId(type, step, token) {
  return `pcs:shift:report:${type}:${step}:${token}`;
}

async function persistReportSessions() {
  const now = Date.now();
  const stored = Object.fromEntries([...reportSessions.entries()]
    .filter(([, session]) => now - session.updatedAt < 30 * 60 * 1000));
  await mkdir(path.dirname(REPORT_SESSION_PATH), { recursive: true });
  await writeFile(REPORT_SESSION_PATH, `${JSON.stringify(stored)}\n`, 'utf8');
}

async function restoreReportSession(token) {
  const existing = reportSessions.get(token);
  if (existing) return existing;
  try {
    const stored = JSON.parse(await readFile(REPORT_SESSION_PATH, 'utf8')) || {};
    const session = stored[token];
    if (session && Date.now() - Number(session.updatedAt || 0) < 30 * 60 * 1000) {
      reportSessions.set(token, session);
      return session;
    }
  } catch {
    // No saved form state yet.
  }
  return null;
}

async function restoreReportSessionForUser(userId) {
  for (const session of reportSessions.values()) {
    if (session.mode === 'dm' && session.userId === userId) return session;
  }
  try {
    const stored = JSON.parse(await readFile(REPORT_SESSION_PATH, 'utf8')) || {};
    const found = Object.entries(stored).find(([, session]) => session.mode === 'dm' && session.userId === userId);
    if (found) {
      reportSessions.set(found[0], found[1]);
      return found[1];
    }
  } catch {
    // No saved form state yet.
  }
  return null;
}

async function nextReportCaseNumber() {
  const run = reportCaseQueue.then(async () => {
    let next = 1;
    try {
      const stored = JSON.parse(await readFile(REPORT_CASE_NUMBER_PATH, 'utf8')) || {};
      next = Math.max(1, Number(stored.next) || 1);
    } catch {
      // Start the case number sequence at PCSO-0001.
    }
    await mkdir(path.dirname(REPORT_CASE_NUMBER_PATH), { recursive: true });
    await writeFile(REPORT_CASE_NUMBER_PATH, `${JSON.stringify({ next: next + 1 })}\n`, 'utf8');
    return `PCSO-${String(next).padStart(4, '0')}`;
  });
  reportCaseQueue = run.catch(() => {});
  return run;
}

function buildReportModal(type, step, token) {
  const definition = REPORT_DEFINITIONS[type];
  const modal = new ModalBuilder()
    .setCustomId(reportModalId(type, step, token))
    .setTitle(`${definition.title} (${step + 1}/${definition.steps.length})`);

  for (const [fieldId, label, paragraph] of definition.steps[step]) {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(fieldId)
        .setLabel(label.slice(0, 45))
        .setStyle(paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(paragraph ? 1000 : 200),
    ));
  }
  return modal;
}

function reportText(value, maxLength = 1000) {
  const cleaned = String(value || '').replace(/[`]/g, '').trim();
  if (!cleaned) return 'N/A';
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength - 1)}â€¦` : cleaned;
}

function buildReportEmbed(type, values, submitter) {
  const definition = REPORT_DEFINITIONS[type];
  const fields = reportLines(type, values).map(({ label, value, fieldId }) => ({
    name: label,
    value,
    inline: !['narrative', 'injuriesDamage', 'suspectDescription', 'charges'].includes(fieldId),
  }));

  return new EmbedBuilder()
    .setColor(0x1f2937)
    .setTitle(definition.heading)
    .setDescription(`**Report submitted by:** ${submitter}`)
    .addFields(fields.slice(0, 25))
    .setFooter({ text: 'Pinellas County Sheriff Office â€¢ Official Report' })
    .setTimestamp();
}

function reportLines(type, values) {
  const definition = REPORT_DEFINITIONS[type];
  const automatic = type === 'ois'
    ? [{ fieldId: 'officerName', label: 'Involved Deputy', value: values.officerName }, { fieldId: 'signed', label: 'Signed (Deputy Name)', value: values.officerName }]
    : type === 'mva'
      ? [{ fieldId: 'officerName', label: 'Deputy Reporting', value: values.officerName }, { fieldId: 'signed', label: 'Signed (Deputy Name)', value: values.officerName }]
      : type === 'warrant'
        ? [{ fieldId: 'officerName', label: 'Deputy', value: values.officerName }]
        : [{ fieldId: 'officerName', label: 'Officer', value: values.officerName }];
  return [{ fieldId: 'caseNumber', label: 'Case #', value: reportText(values.caseNumber, 40) }, ...automatic, ...definition.steps.flatMap((step) => step.map(([fieldId, label]) => ({
    fieldId,
    label,
    value: reportText(values[fieldId]),
  })) )];
}

function wrapDocumentText(value, width = 62) {
  const words = String(value || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['N/A'];
}

function escapeSvg(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

async function buildReportDocuments(type, values, submitter) {
  const definition = REPORT_DEFINITIONS[type];
  const lines = reportLines(type, values);
  const width = 1200;
  const height = Math.max(1500, 250 + lines.reduce((total, entry) => total + 92 + (wrapDocumentText(entry.value).length - 1) * 28, 0));
  let y = 210;
  const svgRows = [];
  for (const entry of lines) {
    const wrapped = wrapDocumentText(entry.value);
    const rowHeight = 72 + (wrapped.length - 1) * 28;
    svgRows.push(`<rect x="70" y="${y - 38}" width="1060" height="${rowHeight}" rx="8" fill="#f5f6f8" stroke="#c6cbd3"/>`);
    svgRows.push(`<text x="100" y="${y}" class="label">${escapeSvg(entry.label)}</text>`);
    wrapped.forEach((line, index) => {
      svgRows.push(`<text x="100" y="${y + 32 + index * 28}" class="value">${escapeSvg(line)}</text>`);
    });
    y += rowHeight + 18;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <rect x="0" y="0" width="${width}" height="145" fill="#1f2937"/>
    <rect x="70" y="172" width="1060" height="4" fill="#d4a017"/>
    <text x="70" y="62" class="title">PINELLAS COUNTY SHERIFF OFFICE</text>
    <text x="70" y="112" class="subtitle">${escapeSvg(definition.heading)}</text>
    <text x="1130" y="62" text-anchor="end" class="small">OFFICIAL REPORT</text>
    <text x="1130" y="105" text-anchor="end" class="small">Submitted by ${escapeSvg(submitter)}</text>
    ${svgRows.join('\n')}
    <text x="70" y="${height - 45}" class="small">Pinellas County Sheriff Office â€¢ Official Report</text>
  <style>
    .title { font: 700 30px Arial; fill: #e7b329; letter-spacing: 1px; }
    .subtitle { font: 700 25px Arial; fill: #ffffff; }
    .small { font: 16px Arial; fill: #e5e7eb; }
    .label { font: 700 18px Arial; fill: #1f2937; }
    .value { font: 17px Arial; fill: #374151; }
  </style></svg>`;

  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  const pdf = await new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: 'LETTER', margin: 45 });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
    document.fillColor('#1f2937').fontSize(18).font('Helvetica-Bold').text('PINELLAS COUNTY SHERIFF OFFICE');
    document.moveDown(0.3).fillColor('#374151').fontSize(15).text(definition.heading);
    document.moveDown(0.2).font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Submitted by ${submitter}`);
    document.moveDown(0.8);
    for (const entry of lines) {
      document.font('Helvetica-Bold').fontSize(10).fillColor('#1f2937').text(entry.label);
      document.font('Helvetica').fontSize(10).fillColor('#374151').text(entry.value, { width: 510 });
      document.moveDown(0.35);
    }
    document.end();
  });
  return { png, pdf };
}

async function submitShiftReport(interaction, type, values) {
  const channelId = PINELLAS_SHIFT_REPORT_CHANNELS[type];
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`The ${REPORT_DEFINITIONS[type].title} log channel (${channelId}) could not be accessed.`);
  }

  const submitter = `<@${interaction.user.id}>`;
  let documents;
  try {
    documents = await buildReportDocuments(type, values, submitter);
  } catch (error) {
    logger.error(`Pinellas ${type} report document generation failed`, error);
    throw new Error('The report document could not be generated. Please contact command staff.');
  }
  const embed = buildReportEmbed(type, values, submitter)
    .setImage('attachment://pcso-report.png');
  const payload = {
    embeds: [embed],
    allowedMentions: { parse: [] },
    files: [
      new AttachmentBuilder(documents.png, { name: 'pcso-report.png' }),
      new AttachmentBuilder(documents.pdf, { name: 'pcso-report.pdf' }),
    ],
  };
  let message;
  try {
    message = await channel.send(payload);
  } catch (error) {
    logger.error(`Pinellas ${type} report could not be posted to channel ${channelId}`, error);
    throw new Error('The report channel rejected the upload. The bot needs View Channel, Send Messages, and Attach Files permissions there.');
  }
  return { channel, message };
}

function reportQuestions(type) {
  return REPORT_DEFINITIONS[type].steps.flatMap((step) => step.map(([fieldId, label]) => ({ fieldId, label })));
}

async function sendNextReportQuestion(message, session) {
  const questions = reportQuestions(session.type);
  const question = questions[session.step];
  if (!question) return false;
  await message.author.send([
    `**PCSO ${REPORT_DEFINITIONS[session.type].title}**`,
    `Question **${session.step + 1} of ${questions.length}**`,
    '',
    `**${question.label}**`,
    'Please reply with your answer below.',
    'Type `cancel` at any time to stop, or type `N/A` if the question does not apply.',
  ].join('\n'));
  return true;
}

export async function startPinellasShiftReportDm(interaction, type) {
  const existing = await restoreReportSessionForUser(interaction.user.id);
  if (existing) throw new Error('You already have a report questionnaire open in your DMs. Finish it or type `cancel`.');
  const token = randomBytes(5).toString('hex');
  const session = {
    mode: 'dm',
    userId: interaction.user.id,
    type,
    step: 0,
    values: {},
    updatedAt: Date.now(),
  };
  try {
    await interaction.user.send('Your PCSO report questionnaire is starting. I will ask each question one at a time.');
    await sendNextReportQuestion({ author: interaction.user }, session);
  } catch {
    throw new Error('I could not DM you. Please enable direct messages from server members and try again.');
  }
  reportSessions.set(token, session);
  await persistReportSessions();
}

export async function handlePinellasShiftReportDm(message) {
  if (!message?.author || message.author.bot || !message.channel?.isDMBased?.()) return false;
  const session = await restoreReportSessionForUser(message.author.id);
  if (!session) return false;
  const token = [...reportSessions.entries()].find(([, value]) => value === session)?.[0];
  const answer = String(message.content || '').trim();
  if (answer.toLowerCase() === 'cancel') {
    if (token) reportSessions.delete(token);
    await persistReportSessions();
    await message.reply('Your PCSO report questionnaire was cancelled.');
    return true;
  }
  const questions = reportQuestions(session.type);
  const question = questions[session.step];
  if (!question) return false;
  session.values[question.fieldId] = answer.slice(0, 1000);
  session.step += 1;
  session.updatedAt = Date.now();
  if (session.step < questions.length) {
    await persistReportSessions();
    await sendNextReportQuestion(message, session);
    return true;
  }

  if (token) reportSessions.delete(token);
  await persistReportSessions();
  session.values.caseNumber = await nextReportCaseNumber();
  session.values.officerName = message.author.globalName || message.author.username;
  try {
    const result = await submitShiftReport({ client: message.client, user: message.author }, session.type, session.values);
    await message.reply(`Your **${REPORT_DEFINITIONS[session.type].title}** was submitted to <#${result.channel.id}>. Case number: **${session.values.caseNumber}**`);
  } catch (error) {
    logger.error(`Pinellas ${session.type} DM report submission failed`, error);
    await message.reply([
      'Your answers were received, but I could not post the report to its log channel.',
      `Reason: ${error?.message || 'unknown posting error'}`,
      'Please contact command staff if the problem continues.',
    ].join('\n'));
  }
  return true;
}

/**
 * Re-fetch ER:LC right when Deputy Lookup opens so the map uses a live pin.
 */
export async function enrichDeputyLiveLocation(deputy, {
  erlcServerKey = config.erlcServerKey,
} = {}) {
  if (!deputy) return deputy;
  if (!erlcServerKey) {
    return {
      ...deputy,
      inGame: false,
      locationLabel: 'Not in game',
      mapLeft: null,
      mapTop: null,
    };
  }

  try {
    const indexes = await loadErlcPlayerIndexes(erlcServerKey);
    const player = findErlcPlayerForDeputy({
      robloxId: deputy.robloxId,
      callsign: deputy.callsign,
      callsignCandidates: deputy.callsignCandidates || [],
      erlcByRoblox: indexes.byRobloxId,
      erlcByCallsign: indexes.byCallsign,
      sheriffByCallsign: indexes.sheriffByCallsign,
    });

    if (!player) {
      return {
        ...deputy,
        inGame: false,
        locationLabel: 'Not in game',
        mapLeft: null,
        mapTop: null,
      };
    }

    const mapPin = locationMapPin(player);
    return {
      ...deputy,
      inGame: true,
      locationLabel: formatInGameLocation(player),
      mapLeft: mapPin?.left ?? null,
      mapTop: mapPin?.top ?? null,
    };
  } catch (error) {
    logger.warn(`Pinellas shift lookup: live ER:LC location failed (${error?.message || error})`);
    return deputy;
  }
}

async function buildLookupPayload(deputy, {
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

  let mapAttachment = null;
  if (
    includeFiles
    && Number.isFinite(deputy.mapLeft)
    && Number.isFinite(deputy.mapTop)
  ) {
    const mapBuffer = await renderLibertyLocationMap({
      left: deputy.mapLeft,
      top: deputy.mapTop,
    });
    if (mapBuffer) {
      mapAttachment = new AttachmentBuilder(mapBuffer, { name: 'pcso-shift-location-map.png' });
      files.push(mapAttachment);
    }
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
      ].join('\n').slice(0, 4000)),
    );

  // In-game map sits above the last divider (before the footer).
  if (mapAttachment || (!includeFiles && Number.isFinite(deputy.mapLeft))) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://pcso-shift-location-map.png'),
      ),
    );
  }

  container.addSeparatorComponents(
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
 * Sync Discord on-duty role from Melonly department shifts.
 * Grant when on a Pinellas Melonly department shift; remove from anyone who has
 * the role but is not on a Melonly department shift.
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

  // On-duty role tracks Melonly department shift only (not Discord role as a source).
  const shouldHave = new Set(
    (snapshot.deputies || [])
      .filter((entry) => entry.fromMelonly)
      .map((entry) => entry.discordId),
  );

  let added = 0;
  let removed = 0;

  for (const discordId of shouldHave) {
    const member = guild.members.cache.get(discordId);
    if (!member) continue;
    if (member.roles.cache.has(PINELLAS_ON_DUTY_ROLE_ID)) continue;
    try {
      await member.roles.add(PINELLAS_ON_DUTY_ROLE_ID, 'Pinellas Melonly department shift started');
      added += 1;
    } catch (error) {
      logger.warn(`Could not add on-duty role to ${discordId}: ${error?.message || error}`);
    }
  }

  for (const member of guild.members.cache.values()) {
    if (!member.roles.cache.has(PINELLAS_ON_DUTY_ROLE_ID)) continue;
    if (shouldHave.has(member.id)) continue;

    try {
      await member.roles.remove(
        PINELLAS_ON_DUTY_ROLE_ID,
        'Not on Pinellas Melonly department shift',
      );
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
        logger.warn(`Pinellas shift panel: Melonly 429 â€” reusing last snapshot (${error?.message || error})`);
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

  await syncPinellasAfkWarnings(client, snapshot).catch((error) => {
    logger.warn(`Pinellas AFK check failed: ${error?.message || error}`);
  });

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
  const reportModalMatch = /^pcs:shift:report:(ois|mva|arrest|citation|warrant):(\d+):([a-f0-9]+)$/.exec(id);

  if (reportModalMatch && interaction.isModalSubmit()) {
    const [, type, stepToken, token] = reportModalMatch;
    const step = Number(stepToken);
    const definition = REPORT_DEFINITIONS[type];
    const session = await restoreReportSession(token);
    if (!session || session.userId !== interaction.user.id || session.type !== type || session.step !== step) {
      await interaction.reply({
        content: 'That report form expired. Please choose the report again from the shift panel.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    for (const [fieldId] of definition.steps[step]) {
      session.values[fieldId] = interaction.fields.getTextInputValue(fieldId);
    }
    session.updatedAt = Date.now();

    if (step + 1 < definition.steps.length) {
      session.step += 1;
      await persistReportSessions();
      await interaction.showModal(buildReportModal(type, session.step, token));
      return true;
    }

    reportSessions.delete(token);
    await persistReportSessions();
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      session.values.caseNumber = await nextReportCaseNumber();
      session.values.officerName = interaction.member?.displayName
        || interaction.user.globalName
        || interaction.user.username;
      const result = await submitShiftReport(interaction, type, session.values);
      await interaction.editReply({
        content: `Your **${definition.title}** was submitted to <#${result.channel.id}>.`,
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      logger.error(`Pinellas ${type} report submission failed`, error);
      await interaction.editReply({
        content: 'The report could not be submitted. Please try again or contact command staff.',
      }).catch(() => {});
    }
    return true;
  }

  if (id !== PINELLAS_SHIFT_REPORTS_ID && id !== PINELLAS_SHIFT_LOOKUP_ID) return false;
  if (!interaction.isStringSelectMenu()) return false;

  if (id === PINELLAS_SHIFT_REPORTS_ID) {
    const type = interaction.values?.[0];
    if (!REPORT_DEFINITIONS[type]) {
      await interaction.reply({ content: 'That report type is unavailable.', flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      await startPinellasShiftReportDm(interaction, type);
      await interaction.editReply({
        content: 'I sent the report questions to your DMs. Answer each question there; type `cancel` to stop.',
        allowedMentions: { parse: [] },
      });
    } catch (error) {
      await interaction.editReply({ content: String(error?.message || 'I could not start the report questionnaire.').slice(0, 1800) });
    }
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
    const liveDeputy = await enrichDeputyLiveLocation(deputy);
    const payload = await buildLookupPayload(liveDeputy);
    await interaction.editReply(payload);
  } catch (error) {
    logger.error('Pinellas shift lookup failed', error);
    await interaction.editReply({
      content: String(error?.message || 'Could not load shift information.').slice(0, 1800),
    }).catch(() => {});
  }
  return true;
}
