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
  parseErlcKill,
  parseErlcPlayer,
  parseErlcVehicle,
} from './erlc.js';
import { discordIdsByRobloxId, getIdentityCache } from './identityStore.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';
import { memberIsStaff } from './prefixHelpers.js';

export const PRIORITY_REQUEST_CHANNEL = '1514341436139770017';
export const PRIORITY_REQUEST_STAFF_ROLE = '1515107822432419971';
export const PRIORITY_REQUEST_SECONDS = 1800;
export const PRIORITY_PEACE_SECONDS = 600;
export const PRIORITY_PENDING_MS = 25 * 60 * 1000;
export const PRIORITY_INFO_EMOJI = '<:info:1514347280105209928>';
const HEADER = 'https://media.discordapp.net/attachments/1529616984755540088/1546535995736858644/clearwater_ban.png?format=webp&quality=lossless';
const FOOTER = 'https://media.discordapp.net/attachments/1529616984755540088/1545833442040619018/clearwater_footer.png?format=webp&quality=lossless';

const PREFIX = 'prq:';
const drafts = new Map();

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

export function allPriorityParticipantsDied({ kills = [], participants = [], startedAt } = {}) {
  const people = (Array.isArray(participants) ? participants : []).filter((player) => player?.username || player?.robloxId);
  if (!people.length) return false;
  return people.every((player) => playerDiedDuringPriority({
    kills,
    robloxId: player.robloxId,
    username: player.username,
    startedAt,
  }));
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
  if (request.endsAt) lines.push(`- **Ends:** ${ts(request.endsAt)}`);
  lines.push(`- **Background:** ${clip(request.background, 500)}`);
  lines.push(`- **Priority Details:** ${clip(request.details, 500)}`);
  if (request.approvedBy) lines.push(`- **Approved by:** <@${request.approvedBy}>`);
  if (request.voidedBy) lines.push(`- **Voided by:** <@${request.voidedBy}>`);
  if (request.deniedBy) lines.push(`- **Denied by:** <@${request.deniedBy}>`);
  return `## Details\n${lines.join('\n')}`;
}

function pendingPayload(request) {
  return v2Message({
    title: 'Priority Request — Pending',
    body: `Staff: approve or deny this request. It auto-denies <t:${Math.floor(request.pendingExpiresAt / 1000)}:R> if nobody responds.\n\n${detailsBody(request)}\n- **Requested by:** <@${request.requesterId}>`,
    buttons: [[
      { type: 2, style: 3, label: 'Approve', custom_id: `${PREFIX}approve:${request.id}` },
      { type: 2, style: 4, label: 'Deny', custom_id: `${PREFIX}deny:${request.id}` },
    ]],
    allowedMentions: { parse: [], users: uniqueMentionUsers(request.requesterId, request.participantDiscordIds) },
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
    body: `<@&${PRIORITY_REQUEST_STAFF_ROLE}> <@${request.requesterId}> asked for **${minutes}m** more on the active priority.`,
    buttons: [[
      { type: 2, style: 3, label: 'Approve time', custom_id: `${PREFIX}timeok:${request.id}:${minutes}` },
      { type: 2, style: 4, label: 'Deny time', custom_id: `${PREFIX}timeno:${request.id}` },
    ]],
    allowedMentions: { parse: [], users: uniqueMentionUsers(request.requesterId), roles: [PRIORITY_REQUEST_STAFF_ROLE] },
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

export function resolvePriorityPlayers(players, selectedValues, typedNames = '') {
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
  return picked.slice(0, 4);
}

export function resolvePriorityVehicles(vehicles, selectedValues, typedNames = '') {
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
  return picked.slice(0, 2);
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
      .setDescription('Type to search, then pick one in-game user. Add more names below.')
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
        .setDescription('Type to filter, pick one, or choose None. Add another below if needed.')
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
      .setDescription('Comma-separated extra in-game names or vehicle/owner names.')
      .setTextInputComponent(
        new TextInputBuilder()
          .setCustomId('more_users')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(150)
          .setPlaceholder('Name2, Name3, vehicle or owner'),
      ),
    new LabelBuilder().setLabel('Background').setTextInputComponent(
      new TextInputBuilder().setCustomId('background').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800),
    ),
    new LabelBuilder().setLabel('Priority Details').setTextInputComponent(
      new TextInputBuilder().setCustomId('details').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800),
    ),
  );
  modal.addLabelComponents(...labels.slice(0, 5));
  return modal;
}

export function createPriorityRequestService({
  snapshot,
  send,
  load,
  save,
  postStaff,
  editStaff,
  dmUser,
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
    state = stored && typeof stored === 'object' ? { request: stored.request || null } : { request: null };
    loaded = true;
    return state;
  }

  async function refreshStaff(request, payload) {
    if (!request?.staffMessageId) return;
    await editStaff(request.staffChannelId || PRIORITY_REQUEST_CHANNEL, request.staffMessageId, payload);
  }

  async function endInGame() {
    await send(':prty 0');
    await send(`:pt ${PRIORITY_PEACE_SECONDS}`);
  }

  async function closeActive(request, status, { staffId, intro, title, dm } = {}) {
    request.status = status;
    request.endedAt = now();
    if (staffId && status === 'voided') request.voidedBy = staffId;
    try {
      await endInGame();
    } catch (error) {
      onError(error);
    }
    await persist();
    await refreshStaff(request, closedPayload(request, title, intro));
    if (dm) {
      try { await dmUser(request.requesterId, dm); } catch (error) { onError(error); }
    }
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
      await persist();
      await refreshStaff(request, closedPayload(
        request,
        'Priority Request — Denied',
        'This request was **automatically denied** because staff did not respond within 25 minutes.',
      ));
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
      if (allPriorityParticipantsDied({
        kills,
        participants: listedPriorityParticipants(request),
        startedAt: request.startedAt,
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
        throw new Error(`A priority request is ${status}. Wait until staff finish it before submitting another.`);
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
      const identities = await discordIdsByRobloxId();
      const { text, discordIds } = await participantLine(selectedPlayers, identities);
      const identity = (await getIdentityCache()).byDiscord[user.id];
      const request = {
        id: newId(),
        status: 'pending',
        requesterId: user.id,
        requesterRobloxId: String(identity?.robloxId || selectedPlayers.find(p => identities.get(String(p.robloxId)) === user.id)?.robloxId || ''),
        requesterUsername: selectedPlayers[0]?.username || identity?.robloxUsername || user.username,
        participantsText: text,
        participants: selectedPlayers.map((player) => ({
          username: player.username,
          robloxId: String(player.robloxId || ''),
        })),
        participantDiscordIds: uniqueMentionUsers(user.id, discordIds),
        vehicles: selectedVehicles.map(formatPriorityVehicle),
        background: clip(background, 800),
        details: clip(details, 800),
        submittedAt: now(),
        pendingExpiresAt: now() + PRIORITY_PENDING_MS,
        staffChannelId: PRIORITY_REQUEST_CHANNEL,
      };
      const posted = await postStaff(pendingPayload(request));
      request.staffMessageId = posted?.id || null;
      current.request = request;
      await persist();
      return request;
    },

    async approve(requestId, staffUser) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'pending') throw new Error('That priority request is no longer pending.');
      request.status = 'active';
      request.approvedBy = staffUser.id;
      request.startedAt = now();
      request.endsAt = request.startedAt + PRIORITY_REQUEST_SECONDS * 1000;
      await send(`:prty ${PRIORITY_REQUEST_SECONDS}`);
      await persist();
      await refreshStaff(request, activePayload(request));
      try { await dmUser(request.requesterId, startedDmPayload(request)); } catch (error) { onError(error); }
      return request;
    },

    async deny(requestId, staffUser) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'pending') throw new Error('That priority request is no longer pending.');
      request.status = 'denied';
      request.deniedBy = staffUser?.id || null;
      request.endedAt = now();
      await persist();
      await refreshStaff(request, closedPayload(
        request,
        'Priority Request — Denied',
        staffUser ? `This request was **denied** by <@${staffUser.id}>.` : 'This request was denied.',
      ));
      return request;
    },

    async voidActive(requestId, staffUser) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'active') throw new Error('That priority is not running.');
      await closeActive(request, 'voided', {
        staffId: staffUser.id,
        title: 'Priority Request — Voided',
        intro: `This priority was **voided** by <@${staffUser.id}>. A **10 minute** peace timer is now running.`,
        dm: voidedDmPayload(staffUser.id),
      });
      return request;
    },

    async addApprovedTime(requestId, extraMinutes) {
      const current = await ensure();
      const request = current.request;
      if (!request || request.id !== requestId || request.status !== 'active') throw new Error('That priority is not running.');
      const seconds = extraTimeCommandSeconds(request.endsAt, extraMinutes, now());
      request.endsAt = now() + seconds * 1000;
      await send(`:prty ${seconds}`);
      await persist();
      await refreshStaff(request, activePayload(request));
      try {
        await dmUser(request.requesterId, v2Message({
          title: '📶 Extra Time Approved',
          body: `Staff added **${extraMinutes}m**. The in-game timer now ends ${ts(request.endsAt)}.`,
        }));
      } catch (error) { onError(error); }
      return request;
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
  const id = interaction.customId || '';
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

  try {
    if (isCommand) {
      if (!interaction.inGuild() || interaction.guildId !== interaction.client.config.guildId) {
        await interaction.reply({ content: 'Use `/request-priority` in the Clearwater Discord server.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const server = await fetchErlcServer(interaction.client.config.erlcServerKey, { vehicles: true });
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
      );
      if (!selectedPlayers.length) {
        await interaction.reply({ content: 'Select or type at least one in-game user.', flags: MessageFlags.Ephemeral });
        return true;
      }
      const selectedVehicles = resolvePriorityVehicles(
        draft.vehicles,
        optionalSelectValues(interaction.fields, 'vehs'),
        extra,
      );
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await service.submitRequest({
        user: interaction.user,
        selectedPlayers,
        selectedVehicles,
        background: interaction.fields.getTextInputValue('background'),
        details: interaction.fields.getTextInputValue('details'),
      });
      service.clearDraft(interaction.user.id);
      await interaction.editReply('Your priority request was sent to staff.');
      return true;
    }

    if (interaction.isButton() && id.startsWith(`${PREFIX}addtime:`)) {
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

    if (interaction.isButton() && /^(prq:(approve|deny|void|timeok|timeno)):/.test(id)) {
      await requireStaff();
      await interaction.deferUpdate();
      const parts = id.split(':');
      const action = parts[1];
      const requestId = parts[2];
      if (action === 'approve') await service.approve(requestId, interaction.user);
      else if (action === 'deny') await service.deny(requestId, interaction.user);
      else if (action === 'void') await service.voidActive(requestId, interaction.user);
      else if (action === 'timeok') await service.addApprovedTime(requestId, Number(parts[3]));
      else if (action === 'timeno') await interaction.followUp({ content: 'Extra time was denied.', flags: MessageFlags.Ephemeral });
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
    load: () => readJsonFile(path, { request: null }, { corruptFallback: false }),
    save: value => writeJsonFile(path, value),
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
  });
  client.priorityRequest = service;
  const timer = setInterval(() => { void service.tick(); }, 10000);
  timer.unref();
  void service.tick();
  logger.info('Priority requests enabled in channel 1514341436139770017.');
  return () => clearInterval(timer);
}
