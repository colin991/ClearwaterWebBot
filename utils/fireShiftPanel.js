import {
  ActionRowBuilder,
  AttachmentBuilder,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { FIRE_OPS_GUILD_ID } from './fireOpsServer.js';
import {
  fetchMelonlyMemberDiscordId,
  fetchPinellasDepartmentShifts,
  isActiveMelonlyShift,
  resolveMelonlyDiscordId,
  shiftCreatedMs,
} from './melonly.js';
import { logger } from './logger.js';
import { fetchErlcServer, libertyPlayerMapPoint, parseErlcPlayer } from './erlc.js';
import { getIdentityCache } from './identityStore.js';
import { renderLibertyLocationMap } from './libertyMapImage.js';

export const FIRE_SHIFT_PANEL_CHANNEL_ID = '1557563004986589296';
export const FIRE_MELONLY_DEPARTMENT_ID = '7471029576076890112';
export const FIRE_SHIFT_LOOKUP_ID = 'cfr:shift:lookup';
export const FIRE_SHIFT_REFRESH_MS = 30_000;

const BANNER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353702577995826/cwfd_2.png?format=webp&quality=lossless';
const FOOTER_URL =
  'https://media.discordapp.net/attachments/1514804887630643321/1555353701814771712/cwfd_footer_2.png?format=webp&quality=lossless';
const FLAG_EMOJI = '<:CWFR_americanflag:1555738513826259016>';
const ID_EMOJI = '<:ID:1557159365474127992>';

export const FIRE_RANKS = Object.freeze([
  Object.freeze({ name: 'Chief', roleId: '1514804886418755600' }),
  Object.freeze({ name: 'Deputy Chief', roleId: '1514804886418755599' }),
  Object.freeze({ name: 'Assistant Chief', roleId: '1514804886418755598' }),
  Object.freeze({ name: 'District Chief', roleId: '1514804886418755597' }),
  Object.freeze({ name: 'Captain', roleId: '1535517948494479380' }),
  Object.freeze({ name: 'Lieutenant', roleId: '1535518206377201727' }),
  Object.freeze({ name: 'Engineer', roleId: '1514804886393458855' }),
  Object.freeze({ name: 'Firefighter III', roleId: '1532920700996944082' }),
  Object.freeze({ name: 'Firefighter II', roleId: '1514804886393458854' }),
  Object.freeze({ name: 'Firefighter I', roleId: '1514804886393458853' }),
]);

export const FIRE_MEDICAL_RANKS = Object.freeze([
  Object.freeze({ name: 'EMS Chief', roleId: '1529653434171654175' }),
  Object.freeze({ name: 'Assistant EMS Chief', roleId: '1528263316919816202' }),
  Object.freeze({ name: 'EMS Captain', roleId: '1529653348125638866' }),
  Object.freeze({ name: 'EMS Lieutenant', roleId: '1535515556353155135' }),
  Object.freeze({ name: 'Paramedic', roleId: '1514804886368288856' }),
]);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const STORE_PATH = path.join(ROOT, 'data', 'fire-shift-panel.json');
const memberDiscordCache = new Map();
let lastSnapshot = { personnel: [], fetchedAt: null };
let refreshTimer = null;
let refreshInFlight = null;

async function readStore() {
  try {
    const value = JSON.parse(await readFile(STORE_PATH, 'utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.floor((Number(ms) || 0) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function fireRankNamesForMember(member) {
  const hasRole = (roleId) => Boolean(member?.roles?.cache?.has?.(roleId));
  const fireRank = FIRE_RANKS.find((rank) => hasRole(rank.roleId));
  const medicalRank = FIRE_MEDICAL_RANKS.find((rank) => hasRole(rank.roleId));
  return [fireRank?.name, medicalRank?.name].filter(Boolean);
}

export function fireIdentityForMembers(fireMember, mainMember = null) {
  const displayName = String(
    mainMember?.nickname
    || mainMember?.displayName
    || fireMember?.displayName
    || mainMember?.user?.globalName
    || fireMember?.user?.globalName
    || mainMember?.user?.username
    || fireMember?.user?.username
    || 'Unknown',
  );
  const callsignMatch = displayName.match(/\b([A-Z]{1,5}-\d{1,5})\b/i);
  const callsign = callsignMatch?.[1]?.toUpperCase() || '—';
  const name = callsignMatch
    ? displayName.replace(callsignMatch[0], '').replace(/^[\s|,.:;-]+|[\s|,.:;-]+$/g, '').trim()
    : displayName;
  const rankNames = fireRankNamesForMember(fireMember);
  return {
    callsign,
    name: name || displayName,
    rankNames,
    rankName: rankNames.length ? rankNames.join(' / ') : 'Unranked',
  };
}

function normalizedCallsign(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function inGameLocation(player) {
  if (!player) return 'Not in game';
  return [
    player.location?.building,
    player.location?.street,
    player.location?.postal ? `Postal ${player.location.postal}` : '',
  ].filter(Boolean).join(', ') || `In game${player.team ? ` (${player.team})` : ''}`;
}

function findFirePlayer(players, { robloxId, callsign }) {
  const wantedRobloxId = String(robloxId || '');
  const wantedCallsign = normalizedCallsign(callsign);
  return players.find((player) => wantedRobloxId && player.robloxId === wantedRobloxId)
    || players.find((player) => (
      wantedCallsign
      && normalizedCallsign(player.callsign) === wantedCallsign
      && /fire/i.test(String(player.team || ''))
    ))
    || players.find((player) => (
      wantedCallsign && normalizedCallsign(player.callsign) === wantedCallsign
    ))
    || null;
}

async function loadErlcPlayers(serverKey = config.erlcServerKey) {
  if (!serverKey) return [];
  try {
    const server = await fetchErlcServer(serverKey);
    return (server.Players || server.players || []).map(parseErlcPlayer);
  } catch (error) {
    logger.warn(`Fire shift panel: ER:LC fetch failed (${error?.message || error})`);
    return [];
  }
}

function applyPlayerLocation(entry, player) {
  const pin = player?.location ? libertyPlayerMapPoint(player.location) : null;
  return {
    ...entry,
    inGame: Boolean(player),
    robloxUsername: player?.username || entry.robloxUsername || null,
    locationLabel: inGameLocation(player),
    mapLeft: pin?.left ?? null,
    mapTop: pin?.top ?? null,
  };
}

async function discordIdForShift(apiKey, shift) {
  const memberId = String(shift?.memberId || '').trim();
  if (!memberId) return null;
  if (memberDiscordCache.has(memberId)) return memberDiscordCache.get(memberId);
  const explicit = resolveMelonlyDiscordId(shift);
  const discordId = explicit || await fetchMelonlyMemberDiscordId(apiKey, memberId, {
    departmentId: FIRE_MELONLY_DEPARTMENT_ID,
  }).catch(() => null);
  if (discordId) memberDiscordCache.set(memberId, String(discordId));
  return discordId ? String(discordId) : null;
}

export async function collectFireOnDutyPersonnel(client, { apiKey = config.melonlyApiKey } = {}) {
  if (!apiKey) throw new Error('MELONLY_API_KEY is not configured.');
  const guild = client.guilds.cache.get(FIRE_OPS_GUILD_ID)
    || await client.guilds.fetch(FIRE_OPS_GUILD_ID).catch(() => null);
  if (!guild) throw new Error(`Fire server ${FIRE_OPS_GUILD_ID} is unavailable.`);
  const mainGuild = config.guildId
    ? (client.guilds.cache.get(config.guildId)
      || await client.guilds.fetch(config.guildId).catch(() => null))
    : null;

  const recent = await fetchPinellasDepartmentShifts(apiKey, FIRE_MELONLY_DEPARTMENT_ID, {
    cacheTtlMs: 25_000,
    maxPages: 3,
  });
  const active = recent.filter(isActiveMelonlyShift);
  const now = Date.now();
  const personnel = [];
  const [identityCache, erlcPlayers] = await Promise.all([
    getIdentityCache().catch(() => ({ byDiscord: {} })),
    loadErlcPlayers(),
  ]);

  for (const shift of active) {
    const discordId = await discordIdForShift(apiKey, shift);
    if (!discordId || personnel.some((entry) => entry.discordId === discordId)) continue;
    const member = guild.members.cache.get(discordId)
      || await guild.members.fetch(discordId).catch(() => null);
    if (!member) continue;
    const mainMember = mainGuild?.members?.cache?.get(discordId)
      || await mainGuild?.members?.fetch(discordId).catch(() => null);
    const identity = fireIdentityForMembers(member, mainMember);
    const robloxId = String(identityCache?.byDiscord?.[discordId]?.robloxId || '');
    const player = findFirePlayer(erlcPlayers, { robloxId, callsign: identity.callsign });
    const startedMs = shiftCreatedMs(shift) || now;
    personnel.push(applyPlayerLocation({
      discordId,
      memberId: String(shift.memberId || ''),
      robloxId: robloxId || null,
      callsign: identity.callsign,
      name: identity.name,
      rankNames: identity.rankNames,
      rankName: identity.rankName,
      startedMs,
      shiftMs: Math.max(0, now - startedMs),
    }, player));
  }

  personnel.sort((left, right) => (
    left.callsign.localeCompare(right.callsign, undefined, { numeric: true })
    || left.name.localeCompare(right.name)
  ));
  lastSnapshot = { personnel, fetchedAt: new Date().toISOString() };
  return lastSnapshot;
}

function tickSnapshot(snapshot) {
  const now = Date.now();
  for (const entry of snapshot?.personnel || []) {
    entry.shiftMs = Math.max(0, now - (Number(entry.startedMs) || now));
  }
  return snapshot || { personnel: [] };
}

function onShiftText(personnel) {
  if (!personnel.length) return '- Nobody is currently on shift.';
  return personnel.map((entry) => (
    `- ${entry.callsign}, ${entry.rankName}, ${entry.name} | <@${entry.discordId}>`
    + ` | ${entry.locationLabel || 'Not in game'} | ${formatDuration(entry.shiftMs)}`
  )).join('\n');
}

export function buildFireShiftPanelPayload(snapshot) {
  const personnel = snapshot?.personnel || [];
  const container = new ContainerBuilder().clearAccentColor()
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_URL)),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${FLAG_EMOJI} Shift Panel`,
        '> Below is the shift panel. You can find the active on-duty personnel and more information.',
      ].join('\n')),
    )
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${ID_EMOJI} On Shift (${personnel.length})`,
        onShiftText(personnel),
      ].join('\n').slice(0, 4000)),
    );

  const lookup = new StringSelectMenuBuilder()
    .setCustomId(FIRE_SHIFT_LOOKUP_ID)
    .setPlaceholder('Personnel Lookup')
    .setMinValues(1)
    .setMaxValues(1);
  const options = personnel.slice(0, 25).map((entry) => ({
    label: `${entry.callsign}, ${entry.name}`.slice(0, 100),
    value: entry.discordId,
    description: entry.rankName.slice(0, 100),
  }));
  if (options.length) lookup.addOptions(options);
  else lookup.setDisabled(true).addOptions({
    label: 'Nobody on duty',
    value: 'none',
    description: 'No active Clearwater Fire shifts',
  });

  container
    .addActionRowComponents(new ActionRowBuilder().addComponents(lookup))
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL)),
    );

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
  };
}

async function enrichFireLiveLocation(entry) {
  const players = await loadErlcPlayers();
  const player = findFirePlayer(players, entry);
  return applyPlayerLocation(entry, player);
}

async function lookupPayload(entry) {
  const files = [];
  let map = null;
  if (Number.isFinite(entry.mapLeft) && Number.isFinite(entry.mapTop)) {
    const image = await renderLibertyLocationMap({ left: entry.mapLeft, top: entry.mapTop });
    if (image) {
      map = new AttachmentBuilder(image, { name: 'fire-shift-location-map.png' });
      files.push(map);
    }
  }
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent([
        `# ${ID_EMOJI} Personnel Information`,
        `**Member:** <@${entry.discordId}>`,
        `**Callsign:** ${entry.callsign}`,
        `**Name:** ${entry.name}`,
        `**Rank${entry.rankNames?.length > 1 ? 's' : ''}:** ${entry.rankName}`,
        `**Current Shift:** ${formatDuration(entry.shiftMs)}`,
        `**In-Game Location:** ${entry.locationLabel || 'Not in game'}`,
      ].join('\n')),
    );
  if (map) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL('attachment://fire-shift-location-map.png'),
      ),
    );
  }
  container
    .addSeparatorComponents(
      new SeparatorBuilder().setDivider(false).setSpacing(SeparatorSpacingSize.Small),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(FOOTER_URL)),
    );
  const payload = {
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
    allowedMentions: { parse: [], users: [], roles: [], repliedUser: false },
  };
  if (files.length) payload.files = files;
  return payload;
}

export async function refreshFireShiftPanel(client, { replace = false } = {}) {
  const store = await readStore();
  let snapshot;
  try {
    snapshot = await collectFireOnDutyPersonnel(client);
  } catch (error) {
    snapshot = tickSnapshot(store.snapshot?.personnel ? store.snapshot : lastSnapshot);
    logger.warn(`Fire shift panel: live shift fetch failed; using saved list (${error?.message || error})`);
  }

  const channel = await client.channels.fetch(FIRE_SHIFT_PANEL_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    throw new Error(`Fire shift panel channel ${FIRE_SHIFT_PANEL_CHANNEL_ID} is unavailable.`);
  }

  let message = null;
  if (store.messageId) {
    const oldMessage = await channel.messages.fetch(store.messageId).catch(() => null);
    if (replace && oldMessage) {
      const deleted = await oldMessage.delete().then(() => true).catch((error) => {
        logger.warn(`Fire shift panel: could not delete old panel ${store.messageId} (${error?.message || error})`);
        return false;
      });
      if (!deleted) message = oldMessage;
    }
    else message = oldMessage;
  }
  const payload = buildFireShiftPanelPayload(snapshot);
  if (message) await message.edit(payload);
  else message = await channel.send(payload);

  await writeStore({
    guildId: FIRE_OPS_GUILD_ID,
    channelId: channel.id,
    messageId: message.id,
    updatedAt: new Date().toISOString(),
    snapshot,
  });
  lastSnapshot = snapshot;
  return { message, snapshot };
}

export function startFireShiftPanel(client) {
  if (refreshTimer) return () => {};
  const tick = async (replace = false) => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = refreshFireShiftPanel(client, { replace })
      .catch((error) => logger.error('Fire shift panel refresh failed', error))
      .finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  };
  refreshTimer = setInterval(() => { void tick(false); }, FIRE_SHIFT_REFRESH_MS);
  refreshTimer.unref?.();
  // Every process start removes the previously tracked panel before posting a fresh one.
  setTimeout(() => { void tick(true); }, 5_000).unref?.();
  logger.info(
    `Fire shift panel armed (channel ${FIRE_SHIFT_PANEL_CHANNEL_ID}; rebuild on restart; `
    + `refresh every ${FIRE_SHIFT_REFRESH_MS / 1000}s).`,
  );
  return () => {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  };
}

export async function handleFireShiftPanelInteraction(interaction) {
  if (interaction.customId !== FIRE_SHIFT_LOOKUP_ID || !interaction.isStringSelectMenu()) return false;
  if (String(interaction.guildId) !== FIRE_OPS_GUILD_ID) return false;
  const selected = interaction.values?.[0];
  if (!selected || selected === 'none') {
    await interaction.reply({ content: 'Nobody is currently on duty.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const store = await readStore();
  const snapshot = tickSnapshot(store.snapshot?.personnel ? store.snapshot : lastSnapshot);
  const entry = snapshot.personnel.find((person) => person.discordId === selected);
  if (!entry) {
    await interaction.reply({ content: 'That person is no longer on shift.', flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const liveEntry = await enrichFireLiveLocation(entry);
  await interaction.editReply(await lookupPayload(liveEntry));
  return true;
}
