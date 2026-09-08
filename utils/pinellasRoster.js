import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  EmbedBuilder,
  Events,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { batchUpdateGoogleSheetValues, isGoogleSheetsConfigured, readGoogleSheetValues } from './googleSheets.js';
import { listPinellasInfractions } from './pinellasInfract.js';
import { getHighestPinellasRank } from './pinellasPromote.js';
import { PINELLAS_EMPLOYEE_WELCOME_ROLE_ID, PINELLAS_GUILD_ID } from './pinellasServer.js';
import { logger } from './logger.js';
import {
  fetchMelonlyLoas,
  fetchMelonlyMemberDiscordId,
  fetchMelonlyShiftsSince,
  isActiveMelonlyLoa,
  resolveMelonlyDiscordId,
  shiftLastActivityMs,
} from './melonly.js';
import {
  isPinellasDepartmentShift,
  PINELLAS_MELONLY_DEPARTMENT_ID,
  resolvePinellasMelonlyMemberDiscordId,
} from './pinellasShiftPanel.js';

export const PINELLAS_ROSTER_SHEET = 'PCSO I Main Database';
export const PINELLAS_CALLSIGN_CHANNEL_ID = '1514659568435859546';
export const PINELLAS_CALLSIGN_LOG_CHANNEL_ID = '1546668194171981874';
export const PINELLAS_CALLSIGN_PUBLIC_ID = 'pcs:cs:public';
export const PINELLAS_CALLSIGN_PUBLIC_MODAL_PREFIX = 'pcs:cs:public-modal:';
export const PINELLAS_ROSTER_RANGE = `'${PINELLAS_ROSTER_SHEET}'!D11:P1380`;
export const PINELLAS_ROSTER_SYNC_MS = 60 * 1000;
export const PINELLAS_INACTIVE_AFTER_MS = 4 * 24 * 60 * 60 * 1000;
export const PINELLAS_WARNING_HISTORY_AFTER_MS = 4 * 24 * 60 * 60 * 1000;
export const PINELLAS_CALLSIGN_OPEN_PREFIX = 'pcs:cs:open:';
export const PINELLAS_CALLSIGN_MODAL_PREFIX = 'pcs:cs:modal:';

const ROLEPLAY_NAME_INPUT_ID = 'roleplay-name';
const AUTOMATED_ACTIVITY_VALUES = new Set(['N/A', 'LOA', 'Suspension']);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVITY_STATE_PATH = path.join(ROOT, 'data', 'pinellas-roster-activity.json');
const CALLSIGN_UPDATE_NOTICE_PATH = path.join(ROOT, 'data', 'pinellas-callsign-update-notice.json');
const CALLSIGN_UPDATE_NOTICE_VERSION = 2;

let rosterQueue = Promise.resolve();

function serializeRosterWork(work) {
  const run = rosterQueue.then(work, work);
  rosterQueue = run.catch(() => {});
  return run;
}

function rankKey(value) {
  return String(value || '').trim().toLowerCase();
}

function text(value) {
  return String(value ?? '').trim();
}

function isPinellasDiscordStaff(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(
    member.roles?.cache?.has(PINELLAS_EMPLOYEE_WELCOME_ROLE_ID)
    || getHighestPinellasRank(member),
  );
}

function rosterCell(column, rowNumber) {
  return `'${PINELLAS_ROSTER_SHEET}'!${column}${rowNumber}`;
}

async function logPinellasCallsignDatabaseChange(client, {
  title,
  description,
  color = 0x5865f2,
}) {
  const channel = client.channels.cache.get(PINELLAS_CALLSIGN_LOG_CHANNEL_ID)
    || await client.channels.fetch(PINELLAS_CALLSIGN_LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await channel.send({
    embeds: [new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp()],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    logger.warn(`PCSO callsign database log failed: ${error?.message || error}`);
  });
}

async function dmPinellasCallsignChange(member, nickname, reason = 'your PCSO rank changed') {
  const updateUrl = `https://discord.com/channels/${PINELLAS_GUILD_ID}/${PINELLAS_CALLSIGN_CHANNEL_ID}`;
  await member?.user?.send(
    `Your PCSO callsign was changed to **${nickname}** because ${reason}. Update your roleplay name here: ${updateUrl}`,
  ).catch(() => {});
}

async function notifyAssignedPinellasCallsigns(client, guild, rows) {
  if (!guild) return 0;
  let stored = {};
  try {
    stored = JSON.parse(await readFile(CALLSIGN_UPDATE_NOTICE_PATH, 'utf8')) || {};
  } catch {
    // The first sync after this update notifies all assigned members.
  }

  let dmsSent = 0;
  const currentAssignments = {};
  for (const row of rows) {
    if (!/^\d{16,22}$/.test(row.discordId) || !row.callsign) continue;
    currentAssignments[row.discordId] = row.callsign;
    if (stored?.version === CALLSIGN_UPDATE_NOTICE_VERSION
      && stored.assignments?.[row.discordId] === row.callsign) continue;
    const member = await guild.members.fetch(row.discordId).catch(() => null);
    if (!member) continue;
    await member.user.send(
      `Your PCSO callsign has been updated to **${row.callsign}**. If your roleplay name needs updating, use the callsign panel here: https://discord.com/channels/${PINELLAS_GUILD_ID}/${PINELLAS_CALLSIGN_CHANNEL_ID}`,
    ).then(() => { dmsSent += 1; }).catch(() => {});
  }

  await mkdir(path.dirname(CALLSIGN_UPDATE_NOTICE_PATH), { recursive: true });
  await writeFile(CALLSIGN_UPDATE_NOTICE_PATH, JSON.stringify({
    version: CALLSIGN_UPDATE_NOTICE_VERSION,
    sentAt: new Date().toISOString(),
    assignments: currentAssignments,
  }, null, 2));
  if (dmsSent) {
    await logPinellasCallsignDatabaseChange(client, {
      title: 'Callsign update notices sent',
      description: `Sent the callsign update notice to ${dmsSent} assigned roster member(s).`,
      color: 0x5865f2,
    });
  }
  return dmsSent;
}

export function parsePinellasRosterRows(values = []) {
  return values.map((row, index) => ({
    rowNumber: index + 11,
    rank: text(row?.[0]),
    callsign: text(row?.[2]),
    roleplayName: text(row?.[4]),
    discordId: text(row?.[6]),
    notes: text(row?.[8]),
    activity: text(row?.[10]),
    punishment: text(row?.[12]),
  }));
}

function infractionIsActive(entry, now = Date.now()) {
  if (entry?.status !== 'active') return false;
  if (!entry.expiresAt) return true;
  const expires = new Date(entry.expiresAt).getTime();
  return Number.isFinite(expires) && expires > now;
}

export function summarizePinellasPunishments(entries = [], now = Date.now()) {
  const valid = entries.filter((entry) => entry && entry.status !== 'voided');
  const active = valid.filter((entry) => infractionIsActive(entry, now));
  if (active.some((entry) => entry.type === 'suspension')) return 'Suspended';

  const activeStrikes = active.filter((entry) => entry.type === 'strike').length;
  if (activeStrikes >= 2) return 'Strike 2';
  if (activeStrikes === 1) return 'Strike 1';
  if (valid.some((entry) => entry.type === 'suspension')) return 'Previously Suspended';
  if (valid.some((entry) => entry.type === 'demotion' || entry.type === 'termination')) {
    return 'Previously Demoted';
  }
  const recentWarningOrStrike = valid.some((entry) => {
    if (entry.type !== 'warning' && entry.type !== 'strike') return false;
    const createdAt = new Date(entry.createdAt).getTime();
    return Number.isFinite(createdAt) && now - createdAt < PINELLAS_WARNING_HISTORY_AFTER_MS;
  });
  if (recentWarningOrStrike) {
    return 'Previously Warned/Striked';
  }
  return 'Clean Record';
}

export function activityForPinellasRoster(current, { suspended = false, onLoa = false } = {}) {
  if (suspended) return 'Suspension';
  if (onLoa === true) return 'LOA';

  const existing = text(current);
  if (existing === 'LOA' && onLoa == null) return existing;
  if (!existing || existing === 'N/A' || AUTOMATED_ACTIVITY_VALUES.has(existing)) return 'Active';
  // Preserve manual states; the four-day inactivity overlay is applied below.
  return existing;
}

async function readActivityState() {
  try {
    const stored = JSON.parse(await readFile(ACTIVITY_STATE_PATH, 'utf8'));
    return {
      baseByUser: stored?.baseByUser && typeof stored.baseByUser === 'object'
        ? { ...stored.baseByUser }
        : {},
      inactiveByUser: stored?.inactiveByUser && typeof stored.inactiveByUser === 'object'
        ? { ...stored.inactiveByUser }
        : {},
    };
  } catch {
    return { baseByUser: {}, inactiveByUser: {} };
  }
}

async function writeActivityState(state) {
  await mkdir(path.dirname(ACTIVITY_STATE_PATH), { recursive: true });
  await writeFile(ACTIVITY_STATE_PATH, `${JSON.stringify({
    baseByUser: state.baseByUser,
    inactiveByUser: state.inactiveByUser,
  }, null, 2)}\n`, 'utf8');
}

function groupInfractionsByUser(infractions) {
  const byUser = new Map();
  for (const entry of infractions || []) {
    const id = text(entry?.userId);
    if (!id) continue;
    const list = byUser.get(id) || [];
    list.push(entry);
    byUser.set(id, list);
  }
  return byUser;
}

function loaServerId(loa) {
  return text(
    loa?.departmentId
    || loa?.serverId
    || loa?.department?.id
    || loa?.server?.id,
  );
}

async function activePinellasLoaDiscordIds(settings) {
  if (!settings?.melonlyApiKey) return null;
  const loas = await fetchMelonlyLoas(settings.melonlyApiKey, {
    cacheTtlMs: 60_000,
    maxPages: 5,
  });
  const active = loas.filter((loa) => (
    loaServerId(loa) === PINELLAS_MELONLY_DEPARTMENT_ID
    && isActiveMelonlyLoa(loa)
  ));
  const discordIds = new Set();

  for (const loa of active) {
    let discordId = resolveMelonlyDiscordId(loa);
    if (!discordId && loa?.memberId) {
      discordId = await fetchMelonlyMemberDiscordId(settings.melonlyApiKey, loa.memberId)
        .catch((error) => {
          logger.warn(`PCSO roster: could not resolve Melonly LOA member ${loa.memberId}: ${error?.message || error}`);
          return null;
        });
    }
    if (discordId) discordIds.add(discordId);
  }
  return discordIds;
}

async function recentPinellasShiftDiscordIds(client, settings, now = Date.now()) {
  if (!settings?.melonlyApiKey) return null;
  const cutoff = now - PINELLAS_INACTIVE_AFTER_MS;
  const result = await fetchMelonlyShiftsSince(settings.melonlyApiKey, cutoff, {
    cacheTtlMs: 60_000,
    maxPages: 10,
  });
  const recentShifts = result.shifts.filter((shift) => (
    (shiftLastActivityMs(shift) || 0) >= cutoff
  ));
  // Melonly's main-panel API often omits the Pinellas department id. When
  // that happens, use the member's current Pinellas employee/rank role to
  // distinguish Pinellas shifts from other departments on the same panel.
  const labelsPinellasDepartment = recentShifts.some(isPinellasDepartmentShift);
  const shifts = labelsPinellasDepartment
    ? recentShifts.filter(isPinellasDepartmentShift)
    : recentShifts;
  const pinellas = !labelsPinellasDepartment
    ? (client.guilds.cache.get(PINELLAS_GUILD_ID)
      || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null))
    : null;
  const discordIds = new Set();
  let unresolved = 0;
  const byMember = new Map();

  for (const shift of shifts) {
    const memberId = text(shift?.memberId);
    if (!memberId || byMember.has(memberId)) continue;
    let discordId = resolveMelonlyDiscordId(shift);
    if (!discordId) {
      discordId = await resolvePinellasMelonlyMemberDiscordId(settings.melonlyApiKey, memberId)
        .catch((error) => {
          logger.warn(`PCSO roster: could not resolve recent-shift member ${memberId}: ${error?.message || error}`);
          return null;
        });
    }
    if (!discordId && /^\d{16,22}$/.test(memberId)) {
      const member = pinellas?.members.cache.get(memberId)
        || await pinellas?.members.fetch(memberId).catch(() => null);
      if (member) discordId = memberId;
    }
    if (discordId && !labelsPinellasDepartment) {
      const member = pinellas?.members.cache.get(discordId)
        || await pinellas?.members.fetch(discordId).catch(() => null);
      if (!isPinellasDiscordStaff(member)) discordId = null;
    }
    byMember.set(memberId, discordId || null);
    if (discordId) discordIds.add(discordId);
    else unresolved += 1;
  }

  return {
    discordIds,
    complete: Boolean(result.complete && unresolved === 0),
    unresolved,
    cutoff,
  };
}

async function loadRosterState(client) {
  const settings = client.config;
  const [values, infractions, loaIds, recentShiftState, activityState] = await Promise.all([
    readGoogleSheetValues(settings, settings.pcsoRosterSpreadsheetId, PINELLAS_ROSTER_RANGE),
    listPinellasInfractions(),
    activePinellasLoaDiscordIds(settings).catch((error) => {
      logger.warn(`PCSO roster: Melonly LOA refresh failed; preserving existing LOA cells (${error?.message || error}).`);
      return null;
    }),
    recentPinellasShiftDiscordIds(client, settings).catch((error) => {
      logger.warn(`PCSO roster: recent Melonly shift refresh failed; preserving inactivity cells (${error?.message || error}).`);
      return null;
    }),
    readActivityState(),
  ]);
  return {
    rows: parsePinellasRosterRows(values),
    infractionsByUser: groupInfractionsByUser(infractions),
    loaIds,
    recentShiftState,
    activityState,
    activityStateChanged: false,
  };
}

export function resolvePinellasRosterMemberStatus(state, discordId, currentActivity) {
  const entries = state.infractionsByUser.get(discordId) || [];
  const punishment = summarizePinellasPunishments(entries);
  const suspended = punishment === 'Suspended';
  const onLoa = state.loaIds == null ? null : state.loaIds.has(discordId);
  const current = text(currentActivity);
  const overlay = suspended ? 'Suspension' : onLoa === true ? 'LOA' : null;
  const savedBase = text(state.activityState.baseByUser[discordId]);
  const autoInactive = Boolean(state.activityState.inactiveByUser[discordId]);

  if (overlay) {
    if (current && !autoInactive && !AUTOMATED_ACTIVITY_VALUES.has(current) && current !== 'Active') {
      if (savedBase !== current) {
        state.activityState.baseByUser[discordId] = current;
        state.activityStateChanged = true;
      }
    }
    return { punishment, activity: overlay };
  }

  if (current === 'LOA' && onLoa == null) {
    return { punishment, activity: current };
  }
  let baseActivity = current;
  if (current === 'LOA' || current === 'Suspension') {
    if (savedBase) {
      delete state.activityState.baseByUser[discordId];
      state.activityStateChanged = true;
      baseActivity = savedBase;
    } else {
      baseActivity = autoInactive ? 'Inactive' : 'Active';
    }
  } else if (savedBase) {
    delete state.activityState.baseByUser[discordId];
    state.activityStateChanged = true;
  }

  const shiftState = state.recentShiftState;
  if (!shiftState?.complete) {
    return {
      punishment,
      activity: activityForPinellasRoster(baseActivity, { suspended, onLoa }),
    };
  }

  const shiftedRecently = shiftState.discordIds.has(discordId);
  if (baseActivity === 'Activity Exempt') {
    if (autoInactive) {
      delete state.activityState.inactiveByUser[discordId];
      state.activityStateChanged = true;
    }
    return { punishment, activity: baseActivity };
  }
  if (!shiftedRecently) {
    if (baseActivity !== 'Inactive') {
      state.activityState.inactiveByUser[discordId] = true;
      state.activityStateChanged = true;
    }
    return { punishment, activity: 'Inactive' };
  }
  if (autoInactive) {
    delete state.activityState.inactiveByUser[discordId];
    state.activityStateChanged = true;
    if (baseActivity === 'Inactive') baseActivity = 'Active';
  }
  return {
    punishment,
    activity: activityForPinellasRoster(baseActivity, { suspended, onLoa }),
  };
}

function assertRosterConfigured(client) {
  if (!isGoogleSheetsConfigured(client.config)) {
    throw new Error(
      'The PCSO roster connection is not configured on the bot host yet. Add the Google service-account email and private key, then restart.',
    );
  }
}

function cleanRoleplayName(value) {
  const name = String(value || '').replace(/[\r\n|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (name.length < 2) throw new Error('Enter a roleplay name with at least 2 characters.');
  if (name.length > 25) throw new Error('Keep the roleplay name to 25 characters or fewer.');
  return name;
}

export async function assignPinellasCallsign(client, member, roleplayName) {
  assertRosterConfigured(client);
  if (String(member?.guild?.id) !== PINELLAS_GUILD_ID) {
    throw new Error('Callsigns can only be assigned in the Pinellas County Sheriff\'s Office server.');
  }

  const rank = getHighestPinellasRank(member);
  if (!rank) throw new Error('That member does not have a supported PCSO rank role.');
  const name = cleanRoleplayName(roleplayName);

  return serializeRosterWork(async () => {
    const state = await loadRosterState(client);
    const current = state.rows.find((row) => row.discordId === member.id) || null;
    const sameRank = current
      && rankKey(current.rank) === rankKey(rank.name)
      && current.callsign;
    const target = sameRank
      ? current
      : state.rows.find((row) => (
        rankKey(row.rank) === rankKey(rank.name)
        && row.callsign
        && !row.roleplayName
        && !row.discordId
        && !row.notes
      ));

    if (!target) {
      throw new Error(`No open **${rank.name}** callsign row is available in the roster.`);
    }

    const status = resolvePinellasRosterMemberStatus(state, member.id, current?.activity || target.activity);
    const nickname = `${target.callsign} | ${name}`;
    if (nickname.length > 32) throw new Error('That roleplay name is too long for the Discord nickname.');

    const updates = [
      { range: rosterCell('H', target.rowNumber), value: name },
      { range: rosterCell('J', target.rowNumber), value: member.id },
      { range: rosterCell('N', target.rowNumber), value: status.activity },
      { range: rosterCell('P', target.rowNumber), value: status.punishment },
    ];

    if (current && current.rowNumber !== target.rowNumber) {
      if (current.notes) updates.push({ range: rosterCell('L', target.rowNumber), value: current.notes });
      updates.push(
        { range: rosterCell('H', current.rowNumber), value: '' },
        { range: rosterCell('J', current.rowNumber), value: '' },
        { range: rosterCell('L', current.rowNumber), value: '' },
        { range: rosterCell('N', current.rowNumber), value: 'N/A' },
        { range: rosterCell('P', current.rowNumber), value: 'Clean Record' },
      );
    }

    await batchUpdateGoogleSheetValues(
      client.config,
      client.config.pcsoRosterSpreadsheetId,
      updates,
    );
    if (state.activityStateChanged) await writeActivityState(state.activityState);

    await logPinellasCallsignDatabaseChange(client, {
      title: 'Callsign database updated',
      description: `<@${member.id}> assigned **${nickname}** to the **${rank.name}** roster spot (row ${target.rowNumber}).`,
      color: 0x3ba55d,
    });

    if (current && current.callsign !== target.callsign) {
      await dmPinellasCallsignChange(member, nickname, 'your roster callsign changed');
    }

    return {
      callsign: target.callsign,
      rank: rank.name,
      roleplayName: name,
      nickname,
      rowNumber: target.rowNumber,
      moved: Boolean(current && current.rowNumber !== target.rowNumber),
      activity: status.activity,
      punishment: status.punishment,
    };
  });
}

export async function refreshPinellasCallsignAfterRankChange(client, member) {
  const nickname = text(member?.nickname);
  const roleplayName = nickname.includes('|')
    ? nickname.split('|').slice(1).join('|').trim()
    : '';
  if (!roleplayName) return null;
  return assignPinellasCallsign(client, member, roleplayName).catch((error) => {
    logger.warn(`PCSO callsign: could not assign a new rank callsign for ${member.id}: ${error?.message || error}`);
    return null;
  });
}

export async function removePinellasCallsign(client, member, { resetNickname = false } = {}) {
  assertRosterConfigured(client);
  return serializeRosterWork(async () => {
    const values = await readGoogleSheetValues(
      client.config,
      client.config.pcsoRosterSpreadsheetId,
      PINELLAS_ROSTER_RANGE,
    );
    const row = parsePinellasRosterRows(values).find((entry) => entry.discordId === member.id);
    if (row) {
      await batchUpdateGoogleSheetValues(client.config, client.config.pcsoRosterSpreadsheetId, [
        { range: rosterCell('H', row.rowNumber), value: '' },
        { range: rosterCell('J', row.rowNumber), value: '' },
        { range: rosterCell('L', row.rowNumber), value: '' },
        { range: rosterCell('N', row.rowNumber), value: 'N/A' },
        { range: rosterCell('P', row.rowNumber), value: 'Clean Record' },
      ]);
      await logPinellasCallsignDatabaseChange(client, {
        title: 'Callsign database entry removed',
        description: `Removed <@${member.id}> from the **${row.rank}** roster spot (row ${row.rowNumber}).`,
        color: 0xed4245,
      });
    }
    if (resetNickname) await member.setNickname(null, 'PCSO callsign reset').catch(() => {});
    return { rowNumber: row?.rowNumber || null, removed: Boolean(row) };
  });
}

export async function resetPinellasCallsignRoster(client, guild) {
  assertRosterConfigured(client);
  const values = await readGoogleSheetValues(
    client.config,
    client.config.pcsoRosterSpreadsheetId,
    PINELLAS_ROSTER_RANGE,
  );
  const rows = parsePinellasRosterRows(values);
  const updates = [];
  const members = [];
  for (const row of rows) {
    if (row.roleplayName || row.discordId || row.activity !== 'N/A' || row.punishment !== 'Clean Record') {
      updates.push(
        { range: rosterCell('H', row.rowNumber), value: '' },
        { range: rosterCell('J', row.rowNumber), value: '' },
        { range: rosterCell('L', row.rowNumber), value: '' },
        { range: rosterCell('N', row.rowNumber), value: 'N/A' },
        { range: rosterCell('P', row.rowNumber), value: 'Clean Record' },
      );
    }
    if (/^\d{16,22}$/.test(row.discordId)) {
      const member = await guild.members.fetch(row.discordId).catch(() => null);
      if (member) members.push(member);
    }
  }
  if (updates.length) {
    await batchUpdateGoogleSheetValues(client.config, client.config.pcsoRosterSpreadsheetId, updates);
  }
  const updateUrl = `https://discord.com/channels/${PINELLAS_GUILD_ID}/${PINELLAS_CALLSIGN_CHANNEL_ID}`;
  let dmsSent = 0;
  for (const member of members) {
    await member.setNickname(null, 'PCSO callsign database reset').catch(() => {});
    await member.user.send(`The PCSO callsign database was reset. Click here to set your callsign again: ${updateUrl}`).then(() => { dmsSent += 1; }).catch(() => {});
  }
  await logPinellasCallsignDatabaseChange(client, {
    title: 'Callsign database reset',
    description: `An administrator reset ${updates.length / 5} roster row(s), reset nicknames, and sent the callsign panel link to ${dmsSent} member(s).`,
    color: 0xed4245,
  });
  return { rowsReset: updates.length / 5, dmsSent };
}

export async function syncPinellasRoster(client) {
  assertRosterConfigured(client);
  return serializeRosterWork(async () => {
    const state = await loadRosterState(client);
    const updates = [];
    let members = 0;
    const guild = client.guilds.cache.get(PINELLAS_GUILD_ID)
      || await client.guilds.fetch(PINELLAS_GUILD_ID).catch(() => null);
    // Fetch each roster member directly so role changes are current even when
    // the bot cannot perform a full guild-member refresh.
    const roleStateAvailable = Boolean(guild);
    let removed = 0;

    for (const row of state.rows) {
      if (!/^\d{16,22}$/.test(row.discordId)) continue;
      members += 1;
      let member = null;
      if (roleStateAvailable) {
        try {
          member = await guild.members.fetch(row.discordId);
        } catch (error) {
          // Discord error 10007 means the member left. Other failures are
          // transient and should not erase a valid roster assignment.
          if (Number(error?.code) !== 10007) {
            logger.warn(`PCSO roster: could not refresh member ${row.discordId}; preserving assignment (${error?.message || error}).`);
            continue;
          }
        }
        const rank = getHighestPinellasRank(member);
        if (!rank) {
          updates.push(
            { range: rosterCell('H', row.rowNumber), value: '' },
            { range: rosterCell('J', row.rowNumber), value: '' },
            { range: rosterCell('N', row.rowNumber), value: 'N/A' },
            { range: rosterCell('P', row.rowNumber), value: 'Clean Record' },
          );
          removed += 1;
          continue;
        }
        if (rankKey(rank.name) !== rankKey(row.rank)) {
          logger.info(`PCSO roster: preserving row ${row.rowNumber} for ${row.discordId} while rank changes from ${row.rank} to ${rank.name}.`);
          continue;
        }
        const expectedNickname = row.roleplayName && row.callsign
          ? `${row.callsign} | ${row.roleplayName}`
          : null;
        if (expectedNickname && member.nickname !== expectedNickname) {
          const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
          if (me?.permissions?.has(PermissionFlagsBits.ManageNicknames) && member.manageable) {
            await member.setNickname(expectedNickname, 'PCSO callsign database synchronization').catch((error) => {
              logger.warn(`PCSO roster: database updated but nickname could not be changed for ${member.id} (${error?.message || error}).`);
            });
          }
        }
      }
      const desired = resolvePinellasRosterMemberStatus(state, row.discordId, row.activity);
      if (desired.activity !== row.activity) {
        updates.push({ range: rosterCell('N', row.rowNumber), value: desired.activity });
      }
      if (desired.punishment !== row.punishment) {
        updates.push({ range: rosterCell('P', row.rowNumber), value: desired.punishment });
      }
    }

    if (updates.length) {
      await batchUpdateGoogleSheetValues(
        client.config,
        client.config.pcsoRosterSpreadsheetId,
        updates,
      );
      logger.info(`PCSO roster: synchronized ${updates.length} roster cell(s) across ${members} members; cleared ${removed} missing or mismatched rank assignment(s).`);
    }
    if (state.activityStateChanged) await writeActivityState(state.activityState);
    const noticesSent = await notifyAssignedPinellasCallsigns(client, guild, state.rows);
    return { members, cellsUpdated: updates.length, noticesSent };
  });
}

function requireCallsignAdmin(member) {
  if (!member?.permissions?.has(PermissionFlagsBits.Administrator)) {
    throw new Error('You must have Administrator permission to use `-callsign`.');
  }
}

function parseInteractionIds(customId, prefix) {
  if (!customId.startsWith(prefix)) return null;
  const [ownerId, targetId] = customId.slice(prefix.length).split(':');
  if (!/^\d{16,22}$/.test(ownerId) || !/^\d{16,22}$/.test(targetId)) return null;
  return { ownerId, targetId };
}

export function buildPinellasCallsignPrompt(ownerId, target) {
  return {
    embeds: [
      new EmbedBuilder()
        .setTitle('PCSO Callsign Database')
        .setDescription([
          `Assign or update the roster record for <@${target.id}>.`,
          '',
          'Click below, enter the roleplay name, and submit. The callsign is selected from the first open row for the member\'s current PCSO rank.',
          '-# Appointment / Notes stays under manual document-editor control.',
        ].join('\n'))
        .setColor(0x1f2937),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PINELLAS_CALLSIGN_OPEN_PREFIX}${ownerId}:${target.id}`)
          .setLabel('Enter roleplay name')
          .setStyle(ButtonStyle.Primary),
      ),
    ],
    allowedMentions: { parse: [] },
  };
}

export async function sendPinellasCallsignPanel(channel) {
  const container = new ContainerBuilder().clearAccentColor();
  container
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://media.discordapp.net/attachments/1514131887914745906/1546695632587202610/pcso_banner_1_1.png?ex=6aa0b80f&is=6a9f668f&hm=a649d2aed6b4212c098d8c6ee1275b494efc04cc0d523d16243d8ea411515638&=&format=webp&quality=lossless'),
    ))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large));
  container
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# <:Save:1517217415098798280> Callsign Request',
      '> Below click the "Set Name" button to set your roleplay name. If you want to change your roleplay name, click it again and then the "Change Name" button to update your name. It will tell you your callsign once you set your name.',
    ].join('\n')))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(PINELLAS_CALLSIGN_PUBLIC_ID)
        .setLabel('Set Name')
        .setEmoji({ id: '1517217487165460591', name: 'rightarrow' })
        .setStyle(ButtonStyle.Secondary),
    ));
  container
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Large))
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
      new MediaGalleryItemBuilder().setURL('https://cdn.discordapp.com/attachments/1514443793607295058/1546271578147524618/pcso-application-footer.png?ex=6aa07ea0&is=6a9f2d20&hm=c57d1c77ef57a419089fd63ef73cf4668cbe0bdffd25feae85dbf4a9adbd9ebf'),
    ));
  return channel.send({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  });
}

function callsignModal(ownerId, targetId, publicFlow = false) {
  return new ModalBuilder()
    .setCustomId(publicFlow
      ? `${PINELLAS_CALLSIGN_PUBLIC_MODAL_PREFIX}${targetId}`
      : `${PINELLAS_CALLSIGN_MODAL_PREFIX}${ownerId}:${targetId}`)
    .setTitle('PCSO Callsign')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(ROLEPLAY_NAME_INPUT_ID)
          .setLabel('Roleplay name')
          .setPlaceholder('First Last')
          .setStyle(TextInputStyle.Short)
          .setMinLength(2)
          .setMaxLength(25)
          .setRequired(true),
      ),
    );
}

export async function handlePinellasCallsignInteraction(interaction, client) {
  const isButton = interaction.isButton?.();
  const isModal = interaction.isModalSubmit?.();
  const isPublicButton = isButton && interaction.customId === PINELLAS_CALLSIGN_PUBLIC_ID;
  const isPublicModal = isModal && interaction.customId.startsWith(PINELLAS_CALLSIGN_PUBLIC_MODAL_PREFIX);
  const publicModalTargetId = isPublicModal
    ? interaction.customId.slice(PINELLAS_CALLSIGN_PUBLIC_MODAL_PREFIX.length)
    : null;
  const parsed = isButton
    ? parseInteractionIds(interaction.customId, PINELLAS_CALLSIGN_OPEN_PREFIX)
    : isModal
      ? parseInteractionIds(interaction.customId, PINELLAS_CALLSIGN_MODAL_PREFIX)
      : null;
  if (!parsed && !isPublicButton && !/^\d{16,22}$/.test(publicModalTargetId || '')) return false;
  const publicFlow = isPublicButton || isPublicModal;
  const targetId = isPublicButton ? interaction.user.id : isPublicModal ? publicModalTargetId : parsed.targetId;

  if (String(interaction.guildId) !== PINELLAS_GUILD_ID) {
    throw new Error('This callsign panel only works in the PCSO server.');
  }
  if (!publicFlow && interaction.user.id !== parsed?.ownerId) {
    throw new Error('Only the administrator who opened this panel can use it.');
  }

  if (!publicFlow) {
    const issuer = interaction.member
      || await interaction.guild.members.fetch(interaction.user.id);
    requireCallsignAdmin(issuer);
  }

  if (isButton) {
    await interaction.showModal(callsignModal(
      isPublicButton ? interaction.user.id : parsed.ownerId,
      isPublicButton ? interaction.user.id : parsed.targetId,
      isPublicButton,
    ));
    return true;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const target = await interaction.guild.members.fetch(targetId).catch(() => null);
  if (!target) throw new Error('That member is no longer in this server.');
  if (target.user.bot) throw new Error('Bots cannot receive a PCSO callsign.');

  const roleplayName = interaction.fields.getTextInputValue(ROLEPLAY_NAME_INPUT_ID);
  const result = await assignPinellasCallsign(client, target, roleplayName);
  let nicknameUpdated = true;
  try {
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!me.permissions.has(PermissionFlagsBits.ManageNicknames) || !target.manageable) {
      nicknameUpdated = false;
    } else {
      await target.setNickname(
        result.nickname,
        `PCSO callsign assigned by ${interaction.user.tag || interaction.user.id}`,
      );
    }
  } catch (error) {
    nicknameUpdated = false;
    logger.warn(`PCSO callsign: database updated but nickname could not be changed: ${error?.message || error}`);
  }

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setTitle('Callsign assigned')
        .setDescription([
          nicknameUpdated
            ? `<@${target.id}> is now **${result.nickname}**.`
            : `<@${target.id}> was added to the database as **${result.nickname}**. Unable to update nickname.`,
          `**Rank:** ${result.rank}`,
          `**Activity:** ${result.activity}`,
          `**Punishments:** ${result.punishment}`,
          `-# Roster row ${result.rowNumber}${result.moved ? ' Â· previous manual notes were carried to the new rank row' : ''}`,
        ].join('\n'))
        .setColor(0x3ba55d),
    ],
    allowedMentions: { parse: [] },
  });
  return true;
}

export function startPinellasRosterSync(client) {
  if (!isGoogleSheetsConfigured(client.config)) {
    logger.warn('PCSO roster sync disabled: GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY missing.');
    return () => {};
  }

  let timer = null;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      await syncPinellasRoster(client);
    } catch (error) {
      logger.error('PCSO roster two-minute sync failed', error);
    }
  };
  const begin = () => {
    if (stopped || timer) return;
    void tick();
    timer = setInterval(() => { void tick(); }, PINELLAS_ROSTER_SYNC_MS);
    timer.unref?.();
  };

  if (client.isReady()) begin();
  else client.once(Events.ClientReady, begin);

  return () => {
    stopped = true;
    client.off(Events.ClientReady, begin);
    if (timer) clearInterval(timer);
  };
}
