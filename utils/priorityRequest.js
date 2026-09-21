import {
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import {
  civilianVehicles,
  executeErlcCommand,
  fetchErlcServer,
  formatPriorityVehicle,
  isCivilianTeam,
  parseErlcKill,
  parseErlcPlayer,
  parseErlcVehicle,
} from './erlc.js';
import { discordIdsByRobloxId, getIdentityCache } from './identityStore.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';
import { memberIsStaff } from './prefixHelpers.js';
import { ensureGuildVoiceConnection, playMp3QueueInVoiceChannel, SAY_VOICE, synthesizeSpeechMp3 } from './vcSpeak.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PRIORITY_REQUEST_CHANNEL = '1514341436139770017';
export const PRIORITY_REQUEST_STAFF_ROLE = '1515107822432419971';
export const PRIORITY_ANNOUNCE_VOICE_CHANNEL_ID = '1514128904783139018';
export const PRIORITY_BEEP_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'priority-beep.mp3');
export const PRIORITY_REQUEST_SECONDS = 1800;
export const PRIORITY_PEACE_SECONDS = 600;
export const PRIORITY_PENDING_MS = 25 * 60 * 1000;
export const PRIORITY_MAX_PARTICIPANTS = 4;
export const PRIORITY_MAX_VEHICLES = 2;
export const PRIORITY_TYPE_MAX = 25;
export const PRIORITY_CIVILIAN_KILL_PM = 'There is an active Priority. Please do not kill anyone.';
export const PRIORITY_INFO_EMOJI = '<:info:1514347280105209928>';
const HEADER = 'https://media.discordapp.net/attachments/1529616984755540088/1546535995736858644/clearwater_ban.png?format=webp&quality=lossless';
const FOOTER = 'https://media.discordapp.net/attachments/1529616984755540088/1545833442040619018/clearwater_footer.png?format=webp&quality=lossless';

const PREFIX = 'prq:';
const drafts = new Map();

export function parsePriorityButton(customId) {
  const match = String(customId || '').match(/^prq:(approve|deny|void|timeok|timeno):([^:]+)(?::(\d+))?$/);
  if (!match) return null;
  const extra = match[3] == null ? null : Number(match[3]);
  return {
    action: match[1],
    requestId: match[2],
    extraMinutes: Number.isInteger(extra) ? extra : null,
  };
}

export function memberHasPriorityStaffRole(member) {
  const roles = member?.roles;
  if (!roles) return false;
  if (typeof roles.cache?.has === 'function') return roles.cache.has(PRIORITY_REQUEST_STAFF_ROLE);
  if (typeof roles.has === 'function') return roles.has(PRIORITY_REQUEST_STAFF_ROLE);
  const list = Array.isArray(roles) ? roles : [];
  return list.map((role) => String(role?.id || role)).includes(PRIORITY_REQUEST_STAFF_ROLE);
}

export function canApprovePriorityExtraTime(member) {
  return memberIsStaff(member) || memberHasPriorityStaffRole(member);
}

function interactionCustomId(interaction) {
  return String(
    interaction?.customId
    || interaction?.component?.customId
    || interaction?.component?.data?.custom_id
    || '',
  );
}

function newId() {
  return `p${randomBytes(4).toString('hex')}`;
}

function ts(ms) {
  const sec = Math.floor(Number(ms || Date.now()) / 1000);
  return `<t:${sec}:f> (<t:${sec}:R>)`;
}

function clip(value, max = 400) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) || '—';
}

export function extraTimeCommandSeconds(endsAt, extraMinutes, now = Date.now()) {
  const extra = Math.max(1, Math.min(30, Math.trunc(Number(extraMinutes) || 0))) * 60;
  const remaining = Math.max(0, Math.ceil((Number(endsAt) - now) / 1000));
  return remaining + extra;
}

export function playerDiedDuringPriority({ kills = [], robloxId, username, startedAt } = {}) {
  const started = Number(startedAt) || 0;
  if (!started) return false;
  const id = String(robloxId || '');
  const name = String(username || '').toLowerCase();
  if (!id && !name) return false;
  return kills.some((kill) => {
    const at = Number(kill.at || 0);
    if (!at || at < started) return false;
    return (id && String(kill.robloxId) === id) || (name && String(kill.username || '').toLowerCase() === name);
  });
}

export function listedPriorityParticipants(request) {
  const listed = Array.isArray(request?.participants) ? request.participants.filter((player) => player?.username || player?.robloxId) : [];
  if (listed.length) return listed;
  if (request?.requesterRobloxId || request?.requesterUsername) {
    return [{ robloxId: request.requesterRobloxId, username: request.requesterUsername }];
  }
  return [];
}

function participantKey(player) {
  const id = String(player?.robloxId || '').trim();
  if (id) return `id:${id}`;
  const name = String(player?.username || '').trim().toLowerCase();
  return name ? `name:${name}` : '';
}

export function recordedPriorityDeathMatches(player, recordedDeaths = []) {
  const key = participantKey(player);
  if (!key) return false;
  return (Array.isArray(recordedDeaths) ? recordedDeaths : []).some((entry) => participantKey(entry) === key);
}

function findSnapshotPlayer(players, player) {
  const id = String(player?.robloxId || '').trim();
  const name = String(player?.username || '').trim().toLowerCase();
  const list = Array.isArray(players) ? players : [];
  return list.find((entry) => (id && String(entry?.robloxId || '') === id)
    || (name && String(entry?.username || '').toLowerCase() === name)) || null;
}

export function priorityKillFingerprint(kill) {
  const killer = participantKey({ robloxId: kill?.killerRobloxId, username: kill?.killerUsername });
  const victim = participantKey({ robloxId: kill?.robloxId, username: kill?.username });
  if (!killer) return '';
  return `${Number(kill?.at) || 0}|${killer}|${victim}`;
}

export function civilianKillersOutsidePriority({
  kills = [],
  players = [],
  participants = [],
  startedAt,
  recordedWarnings = [],
} = {}) {
  const people = (Array.isArray(participants) ? participants : []).filter((player) => player?.username || player?.robloxId);
  const started = Number(startedAt) || 0;
  const warned = new Set((Array.isArray(recordedWarnings) ? recordedWarnings : []).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const kill of Array.isArray(kills) ? kills : []) {
    if (!started || !kill?.at || Number(kill.at) < started) continue;
    const killer = { robloxId: kill.killerRobloxId, username: kill.killerUsername };
    const killerKey = participantKey(killer);
    if (!killerKey) continue;
    if (people.some((player) => participantKey(player) === killerKey)) continue;
    const victimKey = participantKey({ robloxId: kill.robloxId, username: kill.username });
    if (victimKey && victimKey === killerKey) continue;
    const live = findSnapshotPlayer(players, killer);
    if (!live || !isCivilianTeam(live.team)) continue;
    const fingerprint = priorityKillFingerprint(kill);
    if (!fingerprint || warned.has(fingerprint) || seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    out.push({
      fingerprint,
      username: live.username || killer.username,
      robloxId: String(live.robloxId || killer.robloxId || ''),
    });
  }
  return out;
}

function civilianKillDmPayload() {
  return v2Message({
    title: '📶 Active Priority',
    body: 'There is an **active Priority**. Please do not kill anyone.',
  });
}

export function recordPriorityParticipantDeaths(request, kills = []) {
  if (!request) return false;
  const people = listedPriorityParticipants(request);
  const recorded = Array.isArray(request.deadParticipants) ? [...request.deadParticipants] : [];
  const seen = new Set(recorded.map(participantKey).filter(Boolean));
  let added = false;
  for (const player of people) {
    const key = participantKey(player);
    if (!key || seen.has(key)) continue;
    if (!playerDiedDuringPriority({
      kills,
      robloxId: player.robloxId,
      username: player.username,
      startedAt: request.startedAt,
    })) continue;
    recorded.push({
      robloxId: String(player.robloxId || ''),
      username: String(player.username || ''),
    });
    seen.add(key);
    added = true;
  }
  request.deadParticipants = recorded;
  return added;
}

export function allPriorityParticipantsDied({
  kills = [],
  participants = [],
  startedAt,
  recordedDeaths = [],
} = {}) {
  const people = (Array.isArray(participants) ? participants : []).filter((player) => player?.username || player?.robloxId);
  if (!people.length) return false;
  return people.every((player) => recordedPriorityDeathMatches(player, recordedDeaths) || playerDiedDuringPriority({
    kills,
    robloxId: player.robloxId,
    username: player.username,
    startedAt,
  }));
}

export function normalizePriorityStore(stored) {
  if (!stored || typeof stored !== 'object') return { request: null };
  if (stored.request !== undefined) {
    return { request: stored.request && typeof stored.request === 'object' ? stored.request : null };
  }
  if (stored.id && stored.status) return { request: stored };
  return { request: null };
}

export function hasBlockingPriority(request) {
  const status = String(request?.status || '');
  return status === 'pending' || status === 'active';
}

export function uniqueMentionUsers(...lists) {
  return [...new Set(lists.flat(Infinity).map((id) => String(id || '').trim()).filter(Boolean))];
}

function gallery(url) {
  return { type: 12, items: [{ media: { url } }] };
}

function gap() {
  return { type: 14, divider: false, spacing: 1 };
}

function buttonRow(buttons) {
  return { type: 1, components: buttons };
}

function v2Message({ title, body, buttons = [], allowedMentions, ephemeral = false }) {
  let flags = MessageFlags.IsComponentsV2;
  if (ephemeral) flags |= MessageFlags.Ephemeral;
  return {
    flags,
    allowedMentions: allowedMentions || { parse: [] },
    components: [{
      type: 17,
      components: [
        gallery(HEADER),
        gap(),
        { type: 10, content: `# ${PRIORITY_INFO_EMOJI} ${title}\n${body}`.slice(0, 4000) },
        ...buttons.map(buttonRow),
        gap(),
        gallery(FOOTER),
      ],
    }],
  };
}

function detailsBody(request) {
  const vehicles = (request.vehicles || []).length
    ? request.vehicles.map(name => `**${clip(name, 80)}**`).join(', ')
    : '—';
  const lines = [
    `- **Participants:** ${request.participantsText || '—'}`,
    `- **Vehicles:** ${vehicles}`,
    `- **Requested time:** **30m**`,
    `- **Submitted:** ${ts(request.submittedAt)}`,
  ];
  if (request.startedAt) lines.push(`- **Started:** ${ts(request.startedAt)}`);
  if (request.endedAt) lines.push(`- **Ended:** ${ts(request.endedAt)}`);
  else if (request.endsAt) lines.push(`- **Ends:** ${ts(request.endsAt)}`);
  lines.push(`- **Background:** ${clip(request.background, 500)}`);
  lines.push(`- **Priority Type:** ${clip(request.details, PRIORITY_TYPE_MAX)}`);
  if (request.approvedBy) lines.push(`- **Approved by:** <@${request.approvedBy}>`);
  if (request.voidedBy) lines.push(`- **Voided by:** <@${request.voidedBy}>`);
  if (request.deniedBy) lines.push(`- **Denied by:** <@${request.deniedBy}>`);
  return `## Details\n${lines.join('\n')}`;
}

function pendingPayload(request) {
  return v2Message({
    title: 'Priority Request — Pending',
    body: `<@&${PRIORITY_REQUEST_STAFF_ROLE}> A new priority request is ready. Anyone can **approve** or **deny**. It auto-denies <t:${Math.floor(request.pendingExpiresAt / 1000)}:R> if nobody responds.\n\n${detailsBody(request)}\n- **Requested by:** <@${request.requesterId}>`,
    buttons: [
      [{ type: 2, style: 3, label: 'Approve', custom_id: `${PREFIX}approve:${request.id}`, id: 11 }],
      [{ type: 2, style: 4, label: 'Deny', custom_id: `${PREFIX}deny:${request.id}`, id: 12 }],
    ],
    allowedMentions: {
      parse: [],
      users: uniqueMentionUsers(request.requesterId, request.participantDiscordIds),
      roles: [PRIORITY_REQUEST_STAFF_ROLE],
    },
  });
}

function activePayload(request) {
  return v2Message({
    title: 'Priority Request — Active',
    body: `This priority was **approved** and the in-game timer is running.\n\n${detailsBody(request)}`,
    buttons: [
      [{ type: 2, style: 2, label: 'Void', custom_id: `${PREFIX}void:${request.id}` }],
      [{ type: 2, style: 3, label: 'Started', custom_id: `${PREFIX}started:${request.id}`, disabled: true }],
    ],
    allowedMentions: { parse: [], users: uniqueMentionUsers(request.requesterId, request.approvedBy, request.participantDiscordIds) },
  });
}

function closedPayload(request, title, intro) {
  return v2Message({
    title,
    body: `${intro}\n\n${detailsBody(request)}`,
    allowedMentions: { parse: [], users: uniqueMentionUsers(request.requesterId, request.approvedBy, request.voidedBy, request.deniedBy) },
  });
}

export function endedPayload(request, intro) {
  const text = intro
    || request?.endIntro
    || 'This priority has **ended**. A **10 minute** peace timer is now running.';
  return v2Message({
    title: 'Priority Request — Ended',
    body: `${text}\n\n${detailsBody(request)}`,
    buttons: [
      [{ type: 2, style: 4, label: 'Ended', custom_id: `${PREFIX}ended:${request?.id || 'x'}`, disabled: true }],
    ],
    allowedMentions: { parse: [], users: uniqueMentionUsers(request?.requesterId, request?.approvedBy, request?.voidedBy) },
  });
}

function staffPayloadFor(request) {
  const status = String(request?.status || '');
  if (status === 'pending') return pendingPayload(request);
  if (status === 'active') return activePayload(request);
  if (status === 'ended') return endedPayload(request);
  if (status === 'voided') {
    return closedPayload(
      request,
      request.endTitle || 'Priority Request — Voided',
      request.endIntro || 'This priority was **voided**. A **10 minute** peace timer is now running.',
    );
  }
  if (status === 'denied') {
    return closedPayload(
      request,
      request.endTitle || 'Priority Request — Denied',
      request.endIntro || 'This request was denied.',
    );
  }
  return null;
}

function startedDmPayload(request) {
  return v2Message({
    title: '📶 Priority Started',
    body: `The in-game timer is **30 minutes**.\nEnds ${ts(request.endsAt)}.\nNeed more time? Ask staff with the button below.`,
    buttons: [[{ type: 2, style: 2, label: 'Request Added Time', custom_id: `${PREFIX}addtime:${request.id}` }]],
  });
}

function voidedDmPayload(staffId) {
  return v2Message({
    title: '📶 Priority Request — Voided',
    body: `Your priority was **voided** by <@${staffId}>. It cannot be started.`,
    allowedMentions: { parse: [], users: uniqueMentionUsers(staffId) },
  });
}

function extraTimePayload(request, minutes) {
  return v2Message({
    title: 'Priority Extra Time',
    body: `<@&${PRIORITY_REQUEST_STAFF_ROLE}> <@${request.requesterId}> asked for **${minutes}m** more on the active priority. Staff or <@&${PRIORITY_REQUEST_STAFF_ROLE}> can **approve** or **deny**.`,
    buttons: [[
      { type: 2, style: 3, label: 'Approve time', custom_id: `${PREFIX}timeok:${request.id}:${minutes}`, id: 21 },
    ], [
      { type: 2, style: 4, label: 'Deny time', custom_id: `${PREFIX}timeno:${request.id}:${minutes}`, id: 22 },
    ]],
    allowedMentions: { parse: [], users: uniqueMentionUsers(request.requesterId), roles: [PRIORITY_REQUEST_STAFF_ROLE] },
  });
}

export function extraTimeResolvedPayload(request, minutes, approved, userId) {
  const extra = Math.trunc(Number(minutes) || 0);
  const amount = extra > 0 ? `**${extra}m** extra time` : 'extra time';
  const verb = approved ? 'approved' : 'denied';
  return v2Message({
    title: approved ? 'Priority Extra Time — Approved' : 'Priority Extra Time — Denied',
    body: `<@${userId}> **${verb}** ${amount}${approved && request?.endsAt ? `. The in-game timer now ends ${ts(request.endsAt)}.` : '.'}\n\n${detailsBody(request)}`,
    allowedMentions: { parse: [], users: uniqueMentionUsers(request?.requesterId, userId) },
  });
}

async function participantLine(players, identities) {
  const mentions = [];
  const discordIds = [];
  for (const player of players) {
    const discordId = player.robloxId ? identities.get(String(player.robloxId)) : null;
    if (discordId) {
      mentions.push(`<@${discordId}>`);
      discordIds.push(discordId);
    } else {
      mentions.push(`**${clip(player.username, 32)}**`);
    }
  }
  return { text: mentions.join(' ') || '—', discordIds };
}

function playerOptions(players) {
  return players.slice(0, 25).map((player, index) => ({
    label: clip(`${player.username} · ${player.team || 'Civilian'}`, 100),
    value: String(index),
    description: clip(player.robloxId ? `ID ${player.robloxId}` : 'In-game', 100),
  }));
}

function vehicleOptions(vehicles) {
  if (!vehicles.length) return [];
  const none = [{
    label: 'None',
    value: 'none',
    description: 'No civilian vehicle on this request',
  }];
  const opts = vehicles.slice(0, 24).map((vehicle, index) => {
    const title = formatPriorityVehicle(vehicle);
    const owner = String(vehicle.ownerUsername || '').trim();
    return {
      label: clip(owner ? `${owner} · ${title}` : title, 100),
      value: String(index),
      description: clip(title, 100),
    };
  });
  return none.concat(opts);
}

function byUsername(left, right) {
  return String(left?.username || '').localeCompare(String(right?.username || ''), undefined, { sensitivity: 'base' });
}

export function resolvePriorityPlayers(players, selectedValues, typedNames = '', { limit = PRIORITY_MAX_PARTICIPANTS } = {}) {
  const picked = [];
  const seen = new Set();
  const add = (player) => {
    if (!player) return;
    const key = String(player.robloxId || player.username).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(player);
  };
  for (const value of selectedValues || []) {
    const index = Number(value);
    if (Number.isInteger(index)) add(players[index]);
  }
  for (const token of String(typedNames || '').split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)) {
    const lower = token.toLowerCase();
    add(players.find((player) => player.username.toLowerCase() === lower)
      || players.find((player) => player.username.toLowerCase().includes(lower)));
  }
  return Number.isFinite(limit) ? picked.slice(0, limit) : picked;
}

export function mergePriorityParticipants(selectedPlayers, requester) {
  const picked = [];
  const seen = new Set();
  const add = (player) => {
    if (!player?.username && !player?.robloxId) return;
    const key = participantKey(player);
    if (!key || seen.has(key)) return;
    seen.add(key);
    picked.push({
      username: player.username || '',
      robloxId: String(player.robloxId || ''),
    });
  };
  add(requester);
  for (const player of selectedPlayers || []) add(player);
  return picked.slice(0, PRIORITY_MAX_PARTICIPANTS);
}

export function resolvePriorityVehicles(vehicles, selectedValues, typedNames = '', { limit = PRIORITY_MAX_VEHICLES } = {}) {
  const picked = [];
  const seen = new Set();
  const add = (vehicle) => {
    if (!vehicle) return;
    const key = [
      vehicle.ownerRobloxId || vehicle.ownerUsername || '',
      vehicle.plate || '',
      vehicle.name || '',
    ].join(':').toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    picked.push(vehicle);
  };
  for (const value of selectedValues || []) {
    if (value === 'none') continue;
    const index = Number(value);
    if (Number.isInteger(index)) add(vehicles[index]);
  }
  for (const token of String(typedNames || '').split(/[,;\n]+/).map((part) => part.trim()).filter(Boolean)) {
    const lower = token.toLowerCase();
    add(vehicles.find((vehicle) => formatPriorityVehicle(vehicle).toLowerCase() === lower)
      || vehicles.find((vehicle) => String(vehicle.name || '').toLowerCase().includes(lower))
      || vehicles.find((vehicle) => String(vehicle.ownerUsername || '').toLowerCase() === lower)
      || vehicles.find((vehicle) => String(vehicle.ownerUsername || '').toLowerCase().includes(lower)));
  }
  return Number.isFinite(limit) ? picked.slice(0, limit) : picked;
}

function optionalSelectValues(fields, customId) {
  try {
    return fields.getStringSelectValues(customId);
  } catch {
    return [];
  }
}

function optionalText(fields, customId) {
  try {
    return fields.getTextInputValue(customId);
  } catch {
    return '';
  }
}

function buildPriorityFormModal({ id, players, vehicles }) {
  const playerOpts = playerOptions(players);
  const vehicleOpts = vehicleOptions(vehicles);
  const modal = new ModalBuilder().setCustomId(`${PREFIX}form:${id}`).setTitle('Priority request');
  // Discord only shows type-to-search on single-select menus. Extra people/cars are typed.
  const labels = [
    new LabelBuilder()
      .setLabel('Search users')
      .setDescription('Type to search, then pick one in-game user. Extra names below — max 4 people including you.')
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('users')
          .setPlaceholder('Type to search in-game users')
          .setMinValues(1)
          .setMaxValues(1)
          .setRequired(true)
          .addOptions(playerOpts),
      ),
  ];
  if (vehicleOpts.length) {
    labels.push(
      new LabelBuilder()
        .setLabel('Search vehicles')
        .setDescription('Type to filter, pick one, or choose None. Extra car below — max 2 cars.')
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('vehs')
            .setPlaceholder('Type to search civilian vehicles')
            .setMinValues(1)
            .setMaxValues(1)
            .setRequired(true)
            .addOptions(vehicleOpts),
        ),
    );
  }
  labels.push(
    new LabelBuilder()
      .setLabel('Additional users or vehicles')
      .setDescription('Comma-separated extras. Max 4 participants including you, and 2 cars total.')
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('more_users')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(150)
          .setPlaceholder('Name2, Name3, Name4, second car'),
      ),
    new LabelBuilder().setLabel('Background').setTextInputComponent(
      new TextInputBuilder().setCustomId('background').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800),
    ),
    new LabelBuilder().setLabel('Priority Type').setTextInputComponent(
      new TextInputBuilder()
        .setCustomId('details')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(PRIORITY_TYPE_MAX)
        .setPlaceholder('e.g. bank robbery'),
    ),
  );
  modal.addLabelComponents(...labels.slice(0, 5));
  return modal;
}

export const PRIORITY_START_HINT = ':h The priority timer is active, please refrain from triggering any priorities at this time.';
export const PRIORITY_VOICE = SAY_VOICE;
export const PRIORITY_VOICE_RATE = 1.15;

export function priorityStartVehicleSpeech(request) {
  const list = (Array.isArray(request?.vehicles) ? request.vehicles : [])
    .map((name) => String(name || '').replace(/\s+/g, ' ').trim())
    .filter((name) => name && name !== '—')
    .map((name) => name.slice(0, 80));
  return list.length ? list.join(', ') : 'no vehicle';
}

export function priorityStartSpeech(request) {
  const username = String(request?.requesterUsername || 'unknown').replace(/\s+/g, ' ').trim().slice(0, 40) || 'unknown';
  const vehicles = priorityStartVehicleSpeech(request);
  const type = String(request?.details || 'unknown').replace(/\s+/g, ' ').trim().slice(0, PRIORITY_TYPE_MAX) || 'unknown';
  return `A new priority has been started by ${username}, vehicle description and priority is as follows: ${vehicles}, and ${type}.`;
}

export function priorityStartMessageCommand(_request) {
  return PRIORITY_START_HINT;
}

export function formatActivePriorityStatus(request, nowMs = Date.now()) {
  if (!request || request.status !== 'active') {
    return {
      title: 'Priority',
      description: 'There is no active priority right now.',
    };
  }
  const remainingMs = Math.max(0, Number(request.endsAt || 0) - Number(nowMs || Date.now()));
  const remainingMin = Math.max(0, Math.ceil(remainingMs / 60000));
  const people = (request.participants || [])
    .map((player) => String(player?.username || '').trim())
    .filter(Boolean);
  const names = people.length ? people.map((name) => `**${clip(name, 40)}**`).join(', ') : (request.participantsText || '—');
  const vehicles = (request.vehicles || []).length
    ? request.vehicles.map((name) => `**${clip(name, 80)}**`).join(', ')
    : '—';
  return {
    title: 'Active priority',
    description: [
      `**Who:** ${names}`,
      `**Requested by:** ${clip(request.requesterUsername, 40) || '—'}`,
      `**Priority Type:** ${clip(request.details, PRIORITY_TYPE_MAX) || '—'}`,
      `**Vehicles:** ${vehicles}`,
      `**Time left:** **${remainingMin}m** (ends ${ts(request.endsAt)})`,
    ].join('\n'),
  };
}

export async function playPriorityStartAnnouncement(channel, request, {
  join = ensureGuildVoiceConnection,
  synthesize = synthesizeSpeechMp3,
  playQueue = playMp3QueueInVoiceChannel,
  beepPath = PRIORITY_BEEP_PATH,
} = {}) {
  const text = priorityStartSpeech(request);
  const speechPromise = synthesize(text, PRIORITY_VOICE, { rate: PRIORITY_VOICE_RATE });
  logger.info(`Priority announce: joining voice channel ${channel.id}`);
  await join(channel, channel.guild.voiceAdapterCreator);
  logger.info(`Priority announce: playing beep in ${channel.id}`);
  try {
    await playQueue(channel, channel.guild.voiceAdapterCreator, [beepPath], {
      leaveAfter: false,
      speakDelayMs: 400,
      volume: 0.7,
      idleTimeoutMs: 5_000,
      minPlayMs: 2_000,
    });
  } catch (error) {
    logger.warn('Priority announce beep failed; continuing with speech', error);
  }
  let speech;
  try {
    speech = await speechPromise;
  } catch (error) {
    logger.warn('Priority announce first TTS failed; retrying a fallback voice', error);
    speech = await synthesize(text, PRIORITY_VOICE, { rate: PRIORITY_VOICE_RATE });
  }
  logger.info(`Priority announce: playing speech in ${channel.id}`);
  await playQueue(channel, channel.guild.voiceAdapterCreator, [speech], {
    leaveAfter: true,
    speakDelayMs: 350,
    volume: 1,
  });
}

export async function announcePriorityStart(client, request) {
  const channel = await client.channels.fetch(PRIORITY_ANNOUNCE_VOICE_CHANNEL_ID).catch(() => null);
  if (!channel?.isVoiceBased?.()) {
    throw new Error(`Priority announce voice channel ${PRIORITY_ANNOUNCE_VOICE_CHANNEL_ID} is unavailable.`);
  }
  const me = channel.guild.members.me || await channel.guild.members.fetchMe().catch(() => null);
  if (me) {
    const perms = channel.permissionsFor(me);
    if (perms && !perms.has(['Connect', 'Speak'])) {
      throw new Error('The bot needs Connect and Speak in the priority announce voice channel.');
    }
  }
  return playPriorityStartAnnouncement(channel, request);
}

export function createPriorityRequestService({
  snapshot,
  send,
  load,
  save,
  postStaff,
  editStaff,
  dmUser,
  announceStart,
  resolveDiscordIds = discordIdsByRobloxId,
  now = Date.now,
  onError = error => logger.error('Priority request failed', error),
} = {}) {
  let state = { request: null };
  let loaded = false;
  let running;

  async function persist() {
    await save(state);
  }

  async function ensure() {
    if (loaded) return state;
    const stored = await load();
    state = normalizePriorityStore(stored);
    loaded = true;
    const restored = state.request;
    if (restored && (restored.status === 'pending' || restored.status === 'active')) {
      logger.info(`Priority requests: restored ${restored.status} request ${restored.id}.`);
    }
    return state;
  }

  async function refreshStaff(request, payload) {
    if (!payload) return false;
    if (!request?.staffMessageId) return false;
    await editStaff(request.staffChannelId || PRIORITY_REQUEST_CHANNEL, request.staffMessageId, payload);
    request.staffCardStatus = request.status;
    return true;
  }

  async function syncStaffCard(request) {
    if (!request || request.staffCardStatus === request.status) return;
    const payload = staffPayloadFor(request);
    try {
      await refreshStaff(request, payload);
      await persist();
    } catch (error) {
      onError(error);
    }
  }

  async function endInGame() {
    await send(':prty 0');
    await send(`:pt ${PRIORITY_PEACE_SECONDS}`);
  }

  async function closeActive(request, status, {
    staffId,
    intro,
    title,
    dm,
    skipStaffRefresh = false,
    waitForInGame = true,
    waitForDm = true,
  } = {}) {
    request.status = status;
    request.endedAt = now();
    request.endTitle = title || (status === 'ended' ? 'Priority Request — Ended' : title);
    request.endIntro = intro;
    if (staffId && status === 'voided') request.voidedBy = staffId;
    await persist();
    if (!skipStaffRefresh) {
      try {
        await refreshStaff(request, staffPayloadFor(request));
        await persist();
      } catch (error) {
        onError(error);
      }
    }
    if (dm) {
      const mail = dmUser(request.requesterId, dm).catch(onError);
      if (waitForDm) await mail;
    }
    const game = endInGame().catch(onError);
    if (waitForInGame) await game;
  }

  async function tick() {
    const current = await ensure();
    const request = current.request;
    if (!request) return;
    const time = now();
    if (request.status === 'pending' && time >= Number(request.pendingExpiresAt || 0)) {
      request.status = 'denied';
      request.deniedBy = null;
      request.endedAt = time;
      request.endTitle = 'Priority Request — Denied';
      request.endIntro = 'This request was **automatically denied** because nobody responded within 25 minutes.';
      await persist();
      await syncStaffCard(request);
      return;
    }
    if (request.status === 'ended' || request.status === 'voided' || request.status === 'denied') {
      await syncStaffCard(request);
      return;
    }
    if (request.status !== 'active') return;
    if (Number(request.endsAt) && time >= Number(request.endsAt)) {
      await closeActive(request, 'ended', {
        title: 'Priority Request — Ended',
        intro: 'The in-game priority timer ended. A **10 minute** peace timer is now running.',
      });
      return;
    }
    try {
      const server = await snapshot({ killLogs: true });
      const kills = (server.KillLogs || server.killLogs || []).map(parseErlcKill);
      const players = (server.Players || server.players || []).map(parseErlcPlayer);
      const recordedNewDeaths = recordPriorityParticipantDeaths(request, kills);
      if (!Array.isArray(request.warnedPriorityKills)) request.warnedPriorityKills = [];
      const warnings = civilianKillersOutsidePriority({
        kills,
        players,
        participants: listedPriorityParticipants(request),
        startedAt: request.startedAt,
        recordedWarnings: request.warnedPriorityKills,
      });
      if (warnings.length) {
        request.warnedPriorityKills.push(...warnings.map((entry) => entry.fingerprint));
      }
      if (recordedNewDeaths || warnings.length) await persist();
      if (warnings.length) {
        let identities = new Map();
        try {
          identities = await resolveDiscordIds();
        } catch (error) {
          onError(error);
        }
        for (const warning of warnings) {
          const username = String(warning.username || '').trim();
          if (username) {
            try {
              await send(`:pm ${username} ${PRIORITY_CIVILIAN_KILL_PM}`);
            } catch (error) {
              onError(error);
            }
          }
          const discordId = warning.robloxId ? identities.get(String(warning.robloxId)) : null;
          if (discordId) {
            try {
              await dmUser(discordId, civilianKillDmPayload());
            } catch (error) {
              onError(error);
            }
          }
        }
      }
      if (allPriorityParticipantsDied({
        kills,
        participants: listedPriorityParticipants(request),
        startedAt: request.startedAt,
        recordedDeaths: request.deadParticipants,
      })) {
        await closeActive(request, 'ended', {
          title: 'Priority Request — Ended',
          intro: 'Everyone listed on this priority died in-game. The priority ended and a **10 minute** peace timer is running.',
        });
      }
    } catch (error) {
      onError(error);
    }
  }

  return {
    async openForm(interaction, { players, vehicles }) {
      const current = await ensure();
      if (hasBlockingPriority(current.request)) {
        const status = current.request.status === 'active' ? 'already running' : 'already pending';
        throw new Error(`A priority request is ${status}. Wait until it finishes before submitting another.`);
      }
      const id = newId();
      const sorted = [...players].sort(byUsername);
      drafts.set(interaction.user.id, {
        id,
        userId: interaction.user.id,
        players: sorted,
        vehicles,
        selectedPlayers: [],
        selectedVehicles: [],
        createdAt: now(),
      });
      if (!sorted.length) throw new Error('No in-game players are available to add to a priority.');
      return buildPriorityFormModal({ id, players: sorted, vehicles });
    },

    async submitRequest({ user, selectedPlayers, selectedVehicles, background, details }) {
      const current = await ensure();
      if (hasBlockingPriority(current.request)) {
        throw new Error('A priority request is already pending or running.');
      }
      if ((selectedPlayers || []).length > PRIORITY_MAX_PARTICIPANTS) {
        throw new Error(`Priorities are limited to ${PRIORITY_MAX_PARTICIPANTS} participants.`);
      }
      if ((selectedVehicles || []).length > PRIORITY_MAX_VEHICLES) {
        throw new Error(`Priorities are limited to ${PRIORITY_MAX_VEHICLES} cars.`);
      }
      const identities = await discordIdsByRobloxId();
      const identity = (await getIdentityCache()).byDiscord[user.id];
      const requesterPlayer = {
        username: identity?.robloxUsername || user.username,
        robloxId: String(identity?.robloxId || selectedPlayers.find((player) => identities.get(String(player.robloxId)) === user.id)?.robloxId || ''),
      };
      const participants = mergePriorityParticipants(selectedPlayers, requesterPlayer);
      if (participants.length > PRIORITY_MAX_PARTICIPANTS) {
        throw new Error(`Priorities are limited to ${PRIORITY_MAX_PARTICIPANTS} participants.`);
      }
      if ((selectedVehicles || []).length > PRIORITY_MAX_VEHICLES) {
        throw new Error(`Priorities are limited to ${PRIORITY_MAX_VEHICLES} cars.`);
      }
      const { text, discordIds } = await participantLine(participants, identities);
      const request = {
        id: newId(),
        status: 'pending',
        requesterId: user.id,
        requesterRobloxId: String(requesterPlayer.robloxId || ''),
        requesterUsername: requesterPlayer.username,
        participantsText: text,
        participants,
        participantDiscordIds: uniqueMentionUsers(user.id, discordIds),
        vehicles: selectedVehicles.map(formatPriorityVehicle),
        background: clip(background, 800),
        details: clip(details, PRIORITY_TYPE_MAX),
        submittedAt: now(),
        pendingExpiresAt: now() + PRIORITY_PENDING_MS,
        staffChannelId: PRIORITY_REQUEST_CHANNEL,
        deadParticipants: [],
        warnedPriorityKills: [],
      };
      const posted = await postStaff(pendingPayload(request));
      request.staffMessageId = posted?.id || null;
      request.staffCardStatus = posted?.id ? 'pending' : null;
      current.request = request;
      await persist();
      return request;
    },

    async approve(requestId, staffUser, { skipStaffRefresh = false, waitForInGame = true } = {}) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'pending') throw new Error('That priority request is no longer pending.');
      request.status = 'active';
      request.approvedBy = staffUser.id;
      request.startedAt = now();
      request.endsAt = request.startedAt + PRIORITY_REQUEST_SECONDS * 1000;
      if (!Array.isArray(request.deadParticipants)) request.deadParticipants = [];
      if (!Array.isArray(request.warnedPriorityKills)) request.warnedPriorityKills = [];
      await persist();
      if (!skipStaffRefresh) {
        try {
          await refreshStaff(request, activePayload(request));
          await persist();
        } catch (error) { onError(error); }
      }
      const mail = dmUser(request.requesterId, startedDmPayload(request)).catch(onError);
      const voice = announceStart
        ? Promise.resolve().then(() => announceStart(request)).catch(onError)
        : Promise.resolve();
      const game = (async () => {
        await send(`:prty ${PRIORITY_REQUEST_SECONDS}`);
        try {
          await send(priorityStartMessageCommand(request));
        } catch (error) {
          onError(error);
        }
      })().catch(onError);
      if (waitForInGame) {
        await Promise.all([game, voice, mail]);
      }
      return request;
    },

    async deny(requestId, staffUser, { skipStaffRefresh = false } = {}) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'pending') throw new Error('That priority request is no longer pending.');
      request.status = 'denied';
      request.deniedBy = staffUser?.id || null;
      request.endedAt = now();
      request.endTitle = 'Priority Request — Denied';
      request.endIntro = staffUser ? `This request was **denied** by <@${staffUser.id}>.` : 'This request was denied.';
      await persist();
      if (!skipStaffRefresh) {
        try {
          await refreshStaff(request, staffPayloadFor(request));
          await persist();
        } catch (error) { onError(error); }
      }
      return request;
    },

    async voidActive(requestId, staffUser, options = {}) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'active') throw new Error('That priority is not running.');
      await closeActive(request, 'voided', {
        staffId: staffUser.id,
        title: 'Priority Request — Voided',
        intro: `This priority was **voided** by <@${staffUser.id}>. A **10 minute** peace timer is now running.`,
        dm: voidedDmPayload(staffUser.id),
        ...options,
      });
      return request;
    },

    async addApprovedTime(requestId, extraMinutes, { waitForInGame = true } = {}) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'active') throw new Error('That priority is not running.');
      const seconds = extraTimeCommandSeconds(request.endsAt, extraMinutes, now());
      request.endsAt = now() + seconds * 1000;
      await persist();
      const mail = dmUser(request.requesterId, v2Message({
        title: '📶 Extra Time Approved',
        body: `**${extraMinutes}m** was added. The in-game timer now ends ${ts(request.endsAt)}.`,
      })).catch(onError);
      const side = (async () => {
        await send(`:prty ${seconds}`);
        try {
          await refreshStaff(request, activePayload(request));
          await persist();
        } catch (error) { onError(error); }
      })().catch(onError);
      if (waitForInGame) {
        await side;
        await mail;
      }
      return request;
    },

    async markStaffCardSynced() {
      const request = state.request;
      if (!request) return;
      request.staffCardStatus = request.status;
      await persist();
    },

    tick() {
      if (!running) running = tick().catch(onError).finally(() => { running = null; });
      return running;
    },
    getDraft: userId => drafts.get(userId),
    setDraft(userId, patch) {
      const draft = drafts.get(userId);
      if (!draft) return null;
      Object.assign(draft, patch);
      drafts.set(userId, draft);
      return draft;
    },
    clearDraft(userId) { drafts.delete(userId); },
    get request() { return state.request; },
  };
}

export async function handlePriorityRequest(interaction) {
  const id = interactionCustomId(interaction);
  const isCommand = interaction.isChatInputCommand?.() && interaction.commandName === 'request-priority';
  if (!isCommand && !String(id).startsWith(PREFIX)) return false;
  const service = interaction.client.priorityRequest;
  if (!service) {
    const reply = { content: 'Priority requests are still starting. Try again shortly.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
    return true;
  }

  const requireStaff = async () => {
    const member = interaction.member || (interaction.guild ? await interaction.guild.members.fetch(interaction.user.id) : null);
    if (!memberIsStaff(member)) throw new Error('Only Clearwater staff can do that.');
  };

  const requireExtraTimeApprover = async () => {
    let member = interaction.member;
    if (interaction.guild) {
      member = await interaction.guild.members.fetch(interaction.user.id).catch(() => member);
    }
    if (!canApprovePriorityExtraTime(member)) {
      throw new Error('Only staff or the priority role can approve or deny extra time.');
    }
  };

  try {
    if (isCommand) {
      if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId) {
        await interaction.reply({ content: 'Use `/request-priority` in the Clearwater Discord server.', flags: MessageFlags.Ephemeral });
        return true;
      }
      if (!interaction.client.config.erlcServerKey) {
        await interaction.reply({
          content: 'The ER:LC server key is not set on the bot host. Add ERLC_SERVER_KEY to `.env` and restart.',
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const server = await fetchErlcServer(interaction.client.config.erlcServerKey, {
        timeoutMs: 1_200,
        vehicles: true,
      });
      const players = (server.Players || []).map(parseErlcPlayer).filter(p => p.username);
      const vehicles = civilianVehicles((server.Vehicles || []).map(parseErlcVehicle), players);
      await interaction.showModal(await service.openForm(interaction, { players, vehicles }));
      return true;
    }

    if (interaction.isModalSubmit() && id.startsWith(`${PREFIX}form:`)) {
      const draft = service.getDraft(interaction.user.id);
      if (!draft || !id.endsWith(`:${draft.id}`)) {
        await interaction.reply({ content: 'That form expired. Run `/request-priority` again.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const extra = optionalText(interaction.fields, 'more_users');
      const selectedPlayers = resolvePriorityPlayers(
        draft.players,
        interaction.fields.getStringSelectValues('users'),
        extra,
        { limit: Infinity },
      );
      if (!selectedPlayers.length) {
        await interaction.reply({ content: 'Select or type at least one in-game user.', flags: MessageFlags.Ephemeral });
        return true;
      }
      if (selectedPlayers.length > PRIORITY_MAX_PARTICIPANTS) {
        await interaction.reply({
          content: `Priorities are limited to **${PRIORITY_MAX_PARTICIPANTS} participants**. Remove extra names and try again.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      const selectedVehicles = resolvePriorityVehicles(
        draft.vehicles,
        optionalSelectValues(interaction.fields, 'vehs'),
        extra,
        { limit: Infinity },
      );
      if (selectedVehicles.length > PRIORITY_MAX_VEHICLES) {
        await interaction.reply({
          content: `Priorities are limited to **${PRIORITY_MAX_VEHICLES} cars**. Remove extra vehicles and try again.`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await service.submitRequest({
        user: interaction.user,
        selectedPlayers,
        selectedVehicles,
        background: interaction.fields.getTextInputValue('background'),
        details: interaction.fields.getTextInputValue('details'),
      });
      service.clearDraft(interaction.user.id);
      await interaction.editReply('Your priority request was posted.');
      return true;
    }

    if (id.startsWith(`${PREFIX}addtime:`)) {
      const requestId = id.split(':')[2];
      if (service.request?.id !== requestId || service.request?.status !== 'active' || interaction.user.id !== service.request.requesterId) {
        await interaction.reply({ content: 'You can only request extra time on your running priority.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const modal = new ModalBuilder().setCustomId(`${PREFIX}timemodal:${requestId}`).setTitle('Request extra time');
      modal.addLabelComponents(
        new LabelBuilder().setLabel('Extra minutes (1–30)').setTextInputComponent(
          new TextInputBuilder().setCustomId('minutes').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }

    if (interaction.isModalSubmit() && id.startsWith(`${PREFIX}timemodal:`)) {
      const minutes = Math.trunc(Number(interaction.fields.getTextInputValue('minutes')));
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 30) {
        await interaction.reply({ content: 'Enter a whole number of minutes from 1 to 30.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const request = service.request;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await interaction.client.channels.fetch(PRIORITY_REQUEST_CHANNEL).then(channel => channel.send(extraTimePayload(request, minutes)));
      await interaction.editReply('Staff were pinged for extra time.');
      return true;
    }

    const clicked = parsePriorityButton(id);
    if (clicked) {
      const { action, requestId, extraMinutes } = clicked;
      await interaction.deferUpdate();
      if (action === 'void') await requireStaff();
      if (action === 'timeok' || action === 'timeno') await requireExtraTimeApprover();
      const immediate = { skipStaffRefresh: true, waitForInGame: false, waitForDm: false };
      let payload;
      let started;
      if (action === 'approve') {
        started = await service.approve(requestId, interaction.user, immediate);
        payload = activePayload(started);
      } else if (action === 'deny') {
        const request = await service.deny(requestId, interaction.user, immediate);
        payload = closedPayload(
          request,
          'Priority Request — Denied',
          `This request was **denied** by <@${interaction.user.id}>.`,
        );
      } else if (action === 'void') {
        const request = await service.voidActive(requestId, interaction.user, immediate);
        payload = closedPayload(
          request,
          'Priority Request — Voided',
          `This priority was **voided** by <@${interaction.user.id}>. A **10 minute** peace timer is now running.`,
        );
      } else if (action === 'timeok') {
        const request = await service.addApprovedTime(requestId, extraMinutes, immediate);
        payload = extraTimeResolvedPayload(request, extraMinutes, true, interaction.user.id);
      } else if (action === 'timeno') {
        payload = extraTimeResolvedPayload(service.request, extraMinutes || 0, false, interaction.user.id);
      }
      if (payload) {
        await interaction.editReply(payload);
        await service.markStaffCardSynced();
      }
      return true;
    }
  } catch (error) {
    logger.error('Priority request interaction failed', error);
    const reply = { content: String(error?.message || 'That priority action failed.').slice(0, 1800), flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(reply).catch(() => {});
    else await interaction.reply(reply).catch(() => {});
  }
  return true;
}

export function startPriorityRequest(client) {
  const path = resolve('data', 'priority-request.json');
  const key = client.config.erlcServerKey;
  const service = createPriorityRequestService({
    snapshot: options => fetchErlcServer(key, options),
    send: command => executeErlcCommand(key, command),
    async load() {
      try {
        return await readJsonFile(path, { request: null }, { corruptFallback: false });
      } catch (error) {
        if (error?.code !== 'JSON_STORE_CORRUPT') throw error;
        logger.warn('Priority request store was corrupt; loading the backup if it exists.');
        return readJsonFile(`${path}.bak`, { request: null });
      }
    },
    save: value => writeJsonFile(path, value, { backup: true }),
    async postStaff(payload) {
      const channel = await client.channels.fetch(PRIORITY_REQUEST_CHANNEL);
      if (!channel?.isTextBased()) throw new Error('Priority request channel is unavailable.');
      return channel.send(payload);
    },
    async editStaff(channelId, messageId, payload) {
      const channel = await client.channels.fetch(channelId);
      const message = await channel.messages.fetch(messageId);
      await message.edit(payload);
    },
    async dmUser(userId, payload) {
      const user = await client.users.fetch(userId);
      await user.send(payload);
    },
    announceStart: (request) => announcePriorityStart(client, request),
  });
  client.priorityRequest = service;
  const timer = setInterval(() => { void service.tick(); }, 10000);
  timer.unref();
  void service.tick();
  logger.info('Priority requests enabled in channel 1514341436139770017.');
  return () => clearInterval(timer);
}
