import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { resolveZoneDiscordMember } from './erlcZoneVoice.js';
import { markBotVoiceMove } from './botVoiceMoves.js';
import { logger } from './logger.js';
import { postProximityLog, proximityStyleContent, VC_ACTION_LOG_CHANNEL_ID } from './vcActionLog.js';

export const SCENE_COMMANDS = Object.freeze({
  ss: { kind: 'numbered', baseName: 'Mod Scene' },
  ts: { kind: 'numbered', baseName: 'Traffic Stop' },
  scene: { kind: 'numbered', baseName: 'Scene' },
  fc: { kind: 'numbered', baseName: 'Frequency Change' },
  civ: { kind: 'numbered', baseName: 'Civilian' },
  team: { kind: 'team' },
});

export const SCENE_COMMAND_LOG_CHANNEL_ID = VC_ACTION_LOG_CHANNEL_ID;

export const SCENE_COMMAND_FAILURE_REASONS = Object.freeze({
  unknown_command: 'not a known ;ss ;ts ;scene ;fc ;civ ;team command',
  steal: 'in-game steal processed',
  steal_rejected: 'steal command rejected',
  missing_player: 'webhook had no player',
  duplicate: 'duplicate of the same command from the last 4 seconds',
  missing_guild: 'bot is missing DISCORD_GUILD_ID',
  guild_unavailable: 'Discord guild is unavailable',
  missing_move_members: 'bot is missing Move Members',
  unlinked: 'no Discord member linked for that Roblox user',
  not_in_voice: 'player is not in a Discord voice channel',
  no_team: 'player team has no mapped voice channel (Fire / Police / Sheriff / DOT only)',
  team_channel_missing: 'mapped team voice channel is missing',
  no_empty_channel: 'no empty numbered scene voice channel',
  move_failed: 'Discord refused the voice move',
  unparsed_event: 'webhook was not a recognized ; command payload',
  received: 'webhook received',
  handler_error: 'scene command handler threw',
});

export const TEAM_VOICE_CHANNEL_IDS = Object.freeze({
  fire: '1514128961951760515',
  police: '1514128904783139018',
  sheriff: '1514128904783139018',
  dot: '1514130037052407932',
});

export const SCENE_NEARBY_STUDS = 50;

const DEDUP_MS = 4_000;
const recentCommands = new Map();

function asObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text.startsWith('{') || !text.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mappings(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const seen = new Set();
  const out = [];
  const add = (value) => {
    const object = asObject(value) || (value && typeof value === 'object' && !Array.isArray(value) ? value : null);
    if (!object || seen.has(object)) return;
    seen.add(object);
    out.push(object);
  };
  add(payload);
  for (const key of ['Data', 'data', 'Payload', 'payload', 'Body', 'body', 'Origin', 'origin', 'Player', 'player', 'User', 'user', 'Actor', 'actor', 'Source', 'source']) {
    add(payload[key]);
    const nested = asObject(payload[key]);
    if (nested) {
      for (const inner of ['Data', 'data', 'Player', 'player', 'User', 'user', 'Origin', 'origin']) {
        add(nested[inner]);
      }
    }
  }
  return out;
}

function playerFromRaw(raw, { allowPlainName = false } = {}) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return playerFromRaw(String(Math.trunc(raw)), { allowPlainName });
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const parsed = playerFromRaw(item, { allowPlainName });
      if (parsed) return parsed;
    }
    return null;
  }
  if (typeof raw === 'string' && raw.trim()) {
    const text = raw.trim();
    const parsedObject = asObject(text);
    if (parsedObject) return playerFromRaw(parsedObject, { allowPlainName });
    const separator = text.lastIndexOf(':');
    if (separator > 0 && /^\d{1,20}$/.test(text.slice(separator + 1))) {
      return { username: text.slice(0, separator), robloxId: text.slice(separator + 1) };
    }
    if (/^\d{1,20}$/.test(text)) return { username: '', robloxId: text };
    if (allowPlainName && !/^(command|customcommand|event|origin|server|webhook)$/i.test(text)) {
      return { username: text, robloxId: '' };
    }
    return null;
  }
  if (raw && typeof raw === 'object') {
    const username = String(raw.Name || raw.Username || raw.username || raw.Player || raw.player || raw.DisplayName || '').trim();
    const robloxId = String(raw.Id || raw.id || raw.PlayerId || raw.playerId || raw.UserId || raw.userId || raw.RobloxId || raw.robloxId || '').trim();
    if (username || robloxId) return { username, robloxId };
    for (const value of Object.values(raw)) {
      if (typeof value === 'string' && value.includes(':')) {
        const nested = playerFromRaw(value);
        if (nested?.robloxId) return nested;
      }
    }
  }
  return null;
}

export function extractWebhookCommandText(payload) {
  return firstString(mappings(payload), [
    'Command', 'command', 'Message', 'message', 'Content', 'content', 'Text', 'text', 'ChatMessage', 'chatMessage',
  ]);
}

export function extractWebhookPlayer(payload) {
  const objects = mappings(payload);
  for (const object of objects) {
    for (const key of ['Player', 'player', 'Caller', 'caller']) {
      const parsed = playerFromRaw(object[key], { allowPlainName: true });
      if (parsed) return parsed;
    }
    for (const key of [
      'User', 'user', 'Origin', 'origin', 'Actor', 'actor', 'Source', 'source',
      'Executioner', 'executioner', 'Sender', 'sender', 'Author', 'author',
    ]) {
      const parsed = playerFromRaw(object[key]);
      if (parsed) return parsed;
    }
  }
  const username = firstString(objects, ['Username', 'username', 'PlayerName', 'playerName', 'DisplayName', 'displayName']);
  const robloxId = firstString(objects, ['PlayerId', 'playerId', 'UserId', 'userId', 'RobloxId', 'robloxId']);
  if (username || (robloxId && /^\d{1,20}$/.test(robloxId))) {
    return { username, robloxId: /^\d{1,20}$/.test(robloxId) ? robloxId : '' };
  }
  return { username: '', robloxId: '' };
}

function firstString(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
  }
  return '';
}

export function extractWebhookEventType(payload) {
  return firstString(mappings(payload), [
    'Type', 'type', 'Event', 'event', 'EventType', 'eventType', 'Name', 'name',
  ]);
}

export function isStealCommandText(text) {
  return /^[:;]?\s*steal\b/i.test(String(text || '').trim());
}

export function parseCustomCommand(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return null;
  const name = cleaned.replace(/^;+/, '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  const spec = SCENE_COMMANDS[name];
  if (!spec) return null;
  return { name, ...spec, raw: cleaned };
}

export function isCustomCommandEvent(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const type = extractWebhookEventType(payload);
  if (/custom\s*command/i.test(type) || /^commands?$/i.test(type)) return true;
  const text = extractWebhookCommandText(payload);
  if (isStealCommandText(text)) return true;
  if (text.startsWith(';')) return true;
  if (parseCustomCommand(text)) return true;
  const commandField = firstString(mappings(payload), ['Command', 'command']);
  if (!commandField) return false;
  return Boolean(parseCustomCommand(commandField));
}

export function looksLikeEmergencyCallEvent(payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (isCustomCommandEvent(payload)) return false;
  const type = extractWebhookEventType(payload);
  if (/emergency\s*call/i.test(type) || /^calls?$/i.test(type) || /^911$/i.test(type)) return true;
  const team = firstString(mappings(payload), ['Team', 'team']);
  const description = firstString(mappings(payload), ['Description', 'description']);
  const callNumber = firstString(mappings(payload), ['CallNumber', 'callNumber', 'call_number']);
  return Boolean(team && (description || callNumber));
}

export function erlcEventPayloads(payload) {
  if (Array.isArray(payload)) {
    return payload.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  }
  if (!payload || typeof payload !== 'object') return [];
  const nested = payload.events || payload.Events;
  if (Array.isArray(nested)) {
    return nested.filter((item) => item && typeof item === 'object' && !Array.isArray(item));
  }
  return [payload];
}

export function teamVoiceChannelId(team) {
  const label = String(team || '').replace(/[_-]+/g, ' ');
  if (/\bfire\b/i.test(label)) return TEAM_VOICE_CHANNEL_IDS.fire;
  if (/\b(police|sheriff)\b/i.test(label)) return TEAM_VOICE_CHANNEL_IDS.police;
  if (/\bdot\b/i.test(label)) return TEAM_VOICE_CHANNEL_IDS.dot;
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function numberedVoiceNamePattern(baseName) {
  const escaped = escapeRegExp(baseName).replace(/\s+/g, '\\s+');
  return new RegExp(`^${escaped}\\s+(\\d+)$`, 'i');
}

export function parseNumberedVoiceName(channelName, baseName) {
  const match = String(channelName || '').trim().match(numberedVoiceNamePattern(baseName));
  return match ? Number(match[1]) : null;
}

function memberList(channel) {
  const members = channel?.members;
  if (!members) return [];
  if (typeof members.values === 'function') return [...members.values()];
  if (Array.isArray(members)) return members;
  return Object.values(members);
}

export function humanVoiceMembers(channel, exceptMemberId = '') {
  const except = String(exceptMemberId || '');
  return memberList(channel).filter((member) => {
    if (member?.user?.bot) return false;
    if (except && String(member.id) === except) return false;
    return true;
  });
}

export function pickEmptyNumberedVoiceChannel(channels, baseName, { exceptMemberId = '' } = {}) {
  const empty = [];
  for (const channel of Array.isArray(channels) ? channels : []) {
    const type = channel?.type;
    if (type !== ChannelType.GuildVoice && type !== 2) continue;
    const number = parseNumberedVoiceName(channel.name, baseName);
    if (!Number.isInteger(number)) continue;
    if (humanVoiceMembers(channel, exceptMemberId).length) continue;
    empty.push({ channel, number });
  }
  empty.sort((left, right) => left.number - right.number);
  return empty[0]?.channel || null;
}

function channelById(channels, id) {
  const want = String(id || '');
  if (!want) return null;
  return (Array.isArray(channels) ? channels : []).find((channel) => String(channel?.id) === want) || null;
}

export function voiceChannelForMember(member, channels = []) {
  return member?.voice?.channel
    || channelById(channels, member?.voice?.channelId);
}

/**
 * If most of the in-voice group is already in the same matching numbered VC
 * (Civilian 4, Scene 2, …), keep that channel instead of opening a new empty one.
 */
export function majorityMatchingVoiceChannel(members, baseName, { channels = [] } = {}) {
  const group = (Array.isArray(members) ? members : []).filter((member) => member?.voice?.channelId);
  if (!group.length) return null;
  const counts = new Map();
  for (const member of group) {
    const channel = voiceChannelForMember(member, channels);
    if (!channel || parseNumberedVoiceName(channel.name, baseName) == null) continue;
    const id = String(channel.id);
    const entry = counts.get(id) || { channel, count: 0 };
    entry.count += 1;
    counts.set(id, entry);
  }
  let best = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry;
  }
  if (!best || best.count * 2 <= group.length) return null;
  return best.channel;
}

function alreadyInMatchingEmpty(channel, baseName, memberId) {
  if (!channel || parseNumberedVoiceName(channel.name, baseName) == null) return false;
  return humanVoiceMembers(channel, memberId).length === 0;
}

function commandKey(player, commandName) {
  return `${player.robloxId || player.username || '?'}|${commandName}`;
}

function wasRecentCommand(key, now) {
  const last = recentCommands.get(key);
  return Boolean(last && now - last < DEDUP_MS);
}

function markRecentCommand(key, now) {
  recentCommands.set(key, now);
  if (recentCommands.size > 200) {
    for (const [entry, at] of recentCommands) {
      if (now - at > DEDUP_MS * 4) recentCommands.delete(entry);
    }
  }
}

export function playerStudDistance(left, right) {
  const ax = Number(left?.location?.x);
  const az = Number(left?.location?.z);
  const bx = Number(right?.location?.x);
  const bz = Number(right?.location?.z);
  if (![ax, az, bx, bz].every(Number.isFinite)) return null;
  return Math.hypot(ax - bx, az - bz);
}

export function sameRosterPlayer(left, right) {
  const leftId = String(left?.robloxId || '').trim();
  const rightId = String(right?.robloxId || '').trim();
  if (leftId && rightId) return leftId === rightId;
  const leftName = String(left?.username || '').trim().toLowerCase();
  const rightName = String(right?.username || '').trim().toLowerCase();
  return Boolean(leftName && rightName && leftName === rightName);
}

export function playersWithinStuds(origin, players = [], maxStuds = SCENE_NEARBY_STUDS) {
  return (Array.isArray(players) ? players : []).filter((player) => {
    if (!player || sameRosterPlayer(origin, player)) return false;
    const distance = playerStudDistance(origin, player);
    return distance != null && distance <= maxStuds;
  });
}

function findRosterPlayer(players, webhookPlayer) {
  const id = String(webhookPlayer.robloxId || '').trim();
  const name = String(webhookPlayer.username || '').trim().toLowerCase();
  if (id) {
    const match = players.find((player) => String(player.robloxId) === id);
    if (match) return match;
  }
  if (name) {
    return players.find((player) => String(player.username || '').toLowerCase() === name) || null;
  }
  return null;
}

export function resolveSceneCommand(payload) {
  if (!isCustomCommandEvent(payload)) return null;
  const text = extractWebhookCommandText(payload);
  const player = extractWebhookPlayer(payload);
  const command = parseCustomCommand(text);
  if (!command) {
    return { command: null, player, text, reason: 'unknown_command' };
  }
  return { command, player, text };
}

function payloadKeyHint(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'no payload object';
  const keys = Object.keys(payload).slice(0, 12);
  const parts = [keys.length ? `payload keys ${keys.join(', ')}` : 'empty payload'];
  for (const nest of ['data', 'Data', 'origin', 'Origin']) {
    const value = payload[nest];
    if (typeof value === 'string' && value.trim()) {
      parts.push(`${nest} ${value.trim().slice(0, 80)}`);
      continue;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      parts.push(`${nest} ${value}`);
      continue;
    }
    const nested = asObject(value);
    if (nested) {
      const nestedKeys = Object.keys(nested).slice(0, 12);
      if (nestedKeys.length) parts.push(`${nest} keys ${nestedKeys.join(', ')}`);
    }
  }
  return parts.join(' · ');
}

export function sceneCommandLogBody({
  handled = false,
  reason = '',
  commandName = '',
  rawText = '',
  player = {},
  channelName = '',
  nearbyMoved = 0,
  error = '',
  payloadHint = '',
} = {}) {
  const who = `${player?.username || 'unknown'} (${player?.robloxId || 'unknown'})`;
  const cmd = commandName ? `;${commandName}` : String(rawText || 'unknown command').slice(0, 80);
  if (reason === 'received') {
    const detail = [payloadHint].map((part) => String(part || '').trim()).filter(Boolean).join(' · ');
    return `RECV — ${cmd} ${who}${detail ? ` · ${detail}` : ''}`;
  }
  if (handled) {
    const extra = nearbyMoved ? ` · dragged ${nearbyMoved} nearby` : '';
    return `OK — ${cmd} ${who} ${reason || 'moved'} into #${channelName || 'unknown'}${extra}`;
  }
  const why = SCENE_COMMAND_FAILURE_REASONS[reason] || reason || 'unknown failure';
  const detail = [error, payloadHint].map((part) => String(part || '').trim()).filter(Boolean).join(' · ');
  return `FAIL — ${cmd} ${who} · ${why}${detail ? ` · ${detail}` : ''}`;
}

export async function logSceneCommandResult(client, details = {}) {
  const body = sceneCommandLogBody(details);
  logger.info(`[SceneCmd] ${body}`);
  if (!client?.channels) return false;
  try {
    const channel = client.channels?.cache?.get(SCENE_COMMAND_LOG_CHANNEL_ID)
      || await client.channels?.fetch?.(SCENE_COMMAND_LOG_CHANNEL_ID).catch((error) => {
        logger.error(`Scene command log channel fetch failed (${SCENE_COMMAND_LOG_CHANNEL_ID})`, error);
        return null;
      });
    if (channel?.isTextBased?.() && typeof channel.send === 'function') {
      await channel.send({ content: proximityStyleContent('SceneCmd', body) });
      return true;
    }
    return await postProximityLog(client, {
      channelId: SCENE_COMMAND_LOG_CHANNEL_ID,
      tag: 'SceneCmd',
      body,
    });
  } catch (error) {
    logger.warn(`Scene command Discord log failed: ${error?.message || error}`);
    return false;
  }
}

export async function logIncomingErlcWebhook(client, payload, eventId = '') {
  const items = erlcEventPayloads(payload);
  if (!items.length && payload != null) {
    await logSceneCommandResult(client, {
      handled: false,
      reason: 'unparsed_event',
      rawText: 'erlc event',
      payloadHint: `${payloadKeyHint(payload)}${eventId ? ` · id ${String(eventId).slice(0, 12)}` : ''}`,
    });
    return;
  }
  for (const item of items) {
    if (looksLikeEmergencyCallEvent(item)) continue;
    const text = extractWebhookCommandText(item);
    const type = extractWebhookEventType(item);
    const command = parseCustomCommand(text);
    await logSceneCommandResult(client, {
      handled: false,
      reason: 'received',
      commandName: command?.name || '',
      rawText: text || type || 'erlc event',
      player: extractWebhookPlayer(item),
      payloadHint: `${payloadKeyHint(item)}${eventId ? ` · id ${String(eventId).slice(0, 12)}` : ''}`,
    });
  }
}

async function listGuildVoiceChannels(guild, { forceFetch = false } = {}) {
  if (!guild?.channels?.cache) return [];
  if (forceFetch || guild.channels.cache.size < 8) {
    await guild.channels.fetch().catch(() => {});
  }
  return [...guild.channels.cache.values()].filter((channel) => channel.type === ChannelType.GuildVoice);
}

async function moveMember(member, voiceChannel, reason, { skipGreetingMark = false } = {}) {
  if (!skipGreetingMark) markBotVoiceMove(member.id);
  await member.voice.setChannel(voiceChannel, reason);
}

export async function handleErlcSceneEvent(payload, {
  client,
  config = client?.config || {},
  eventId = '',
  now = Date.now(),
  snapshot,
  identities,
} = {}) {
  const parsed = resolveSceneCommand(payload);
  const stealText = extractWebhookCommandText(payload);
  if ((!parsed || !parsed.command) && isStealCommandText(stealText || parsed?.text)) {
    const player = parsed?.player || extractWebhookPlayer(payload);
    let result;
    try {
      result = await runStealCommand(payload, {
        client, config, snapshot, player, text: stealText || parsed?.text,
      });
    } catch (error) {
      result = {
        handled: false,
        reason: 'steal_rejected',
        error: error?.message || String(error),
        player,
      };
    }
    await logSceneCommandResult(client, {
      handled: result.handled,
      reason: result.reason,
      commandName: 'steal',
      rawText: stealText || parsed?.text,
      player: result.player || player,
      error: result.error,
      payloadHint: result.handled ? '' : payloadKeyHint(payload),
    });
    return result;
  }
  if (!parsed) {
    if (!looksLikeEmergencyCallEvent(payload)) {
      await logSceneCommandResult(client, {
        handled: false,
        reason: 'unparsed_event',
        rawText: extractWebhookCommandText(payload) || extractWebhookEventType(payload) || 'erlc event',
        player: extractWebhookPlayer(payload),
        payloadHint: payloadKeyHint(payload),
      });
    }
    return { handled: false, reason: 'not_scene_command' };
  }

  let result;
  try {
    result = await executeErlcSceneCommand(payload, parsed, {
      client, config, eventId, now, snapshot, identities,
    });
  } catch (error) {
    logger.error('ER:LC scene command failed', error);
    result = {
      handled: false,
      reason: 'handler_error',
      error: error?.message || String(error),
      player: parsed.player,
    };
  }

  await logSceneCommandResult(client, {
    handled: result.handled,
    reason: result.reason,
    commandName: parsed.command?.name || '',
    rawText: parsed.text,
    player: result.player || parsed.player,
    channelName: result.channelName,
    nearbyMoved: result.nearbyMoved,
    error: result.error,
    payloadHint: result.handled ? '' : payloadKeyHint(payload),
  });
  return result;
}

async function runStealCommand(payload, { client, config, snapshot, player, text }) {
  const server = snapshot
    ? await snapshot()
    : (config.erlcServerKey ? await fetchErlcServer(config.erlcServerKey) : null);
  const { handleStealCommand } = await import('./economyService.js');
  try {
    const result = await handleStealCommand({
      player,
      snapshot: server,
      client,
      rawText: text,
    });
    return {
      handled: true,
      reason: result?.success ? 'steal' : 'steal_rejected',
      player,
      error: result?.success ? '' : (result?.message || result?.reason || ''),
    };
  } catch (error) {
    const message = String(error?.message || 'Your steal attempt failed.');
    const { pmEconomyPlayer } = await import('./economyService.js');
    await pmEconomyPlayer(client, player?.username, message);
    return {
      handled: false,
      reason: 'steal_rejected',
      player,
      error: message,
    };
  }
}

async function executeErlcSceneCommand(payload, parsed, {
  client,
  config,
  eventId = '',
  now = Date.now(),
  snapshot,
  identities,
}) {
  if (!parsed.command) {
    if (isStealCommandText(parsed.text)) {
      return runStealCommand(payload, {
        client, config, snapshot, player: parsed.player, text: parsed.text,
      });
    }
    return { handled: false, reason: 'unknown_command', player: parsed.player };
  }

  const { command, player: webhookPlayer } = parsed;
  if (!webhookPlayer.username && !webhookPlayer.robloxId) {
    logger.warn(`ER:LC ;${command.name} ignored: webhook had no player.`);
    return { handled: false, reason: 'missing_player', player: webhookPlayer };
  }

  if (wasRecentCommand(commandKey(webhookPlayer, command.name), now)) {
    return { handled: false, reason: 'duplicate', player: webhookPlayer };
  }

  const guildId = config.guildId;
  if (!guildId || !client?.guilds) return { handled: false, reason: 'missing_guild', player: webhookPlayer };
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { handled: false, reason: 'guild_unavailable', player: webhookPlayer };

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
    logger.warn(`ER:LC ;${command.name}: bot is missing Move Members.`);
    return { handled: false, reason: 'missing_move_members', player: webhookPlayer };
  }

  let rosterPlayer = null;
  let rosterPlayers = [];
  try {
    const server = snapshot
      ? await snapshot()
      : (config.erlcServerKey ? await fetchErlcServer(config.erlcServerKey) : null);
    rosterPlayers = (server?.Players || server?.players || []).map((entry) => {
      const mapped = parseErlcPlayer(entry);
      if (entry?.username == null) return mapped;
      return {
        ...mapped,
        username: entry.username || mapped.username,
        robloxId: entry.robloxId || mapped.robloxId,
        team: entry.team || mapped.team,
        location: entry.location || mapped.location,
      };
    });
    rosterPlayer = findRosterPlayer(rosterPlayers, webhookPlayer);
  } catch (error) {
    logger.warn(`ER:LC ;${command.name}: player list unavailable (${error?.message || error})`);
  }

  const player = {
    username: rosterPlayer?.username || webhookPlayer.username,
    robloxId: rosterPlayer?.robloxId || webhookPlayer.robloxId,
    team: rosterPlayer?.team || firstString(mappings(payload), ['Team', 'team']),
  };

  const identityMap = identities || await discordIdsByRobloxId();
  const resolved = await resolveZoneDiscordMember(guild, player, identityMap);
  const member = resolved.member;
  if (!member) {
    logger.info(`ER:LC ;${command.name}: no Discord member for ${player.username || player.robloxId}.`);
    return { handled: false, reason: 'unlinked', player };
  }
  if (!member.voice?.channelId) {
    logger.info(`ER:LC ;${command.name}: <@${member.id}> is not in a Discord VC.`);
    return { handled: false, reason: 'not_in_voice', player };
  }

  const nearbyMembers = [];
  if (command.kind === 'numbered' && rosterPlayer) {
    for (const nearby of playersWithinStuds(rosterPlayer, rosterPlayers)) {
      try {
        const nearbyMember = (await resolveZoneDiscordMember(guild, nearby, identityMap)).member;
        if (!nearbyMember?.voice?.channelId) continue;
        if (nearbyMember.id === member.id) continue;
        nearbyMembers.push(nearbyMember);
      } catch (error) {
        logger.warn(
          `ER:LC ;${command.name}: could not resolve nearby ${nearby.username || nearby.robloxId}: ${error?.message || error}`,
        );
      }
    }
  }

  let destination = null;
  let originReason = 'moved';
  if (command.kind === 'team') {
    const channelId = teamVoiceChannelId(player.team);
    if (!channelId) {
      logger.info(`ER:LC ;team: ${player.username} is on ${player.team || 'no'} team — not dragging.`);
      return { handled: false, reason: 'no_team', player };
    }
    destination = guild.channels.cache.get(channelId)
      || await guild.channels.fetch(channelId).catch(() => null);
    if (!destination || destination.type !== ChannelType.GuildVoice) {
      return { handled: false, reason: 'team_channel_missing', player };
    }
  } else {
    let channels = await listGuildVoiceChannels(guild);
    const group = [member, ...nearbyMembers];
    const pickDestination = (list) => {
      const clustered = majorityMatchingVoiceChannel(group, command.baseName, { channels: list });
      const sittingEmpty = alreadyInMatchingEmpty(
        voiceChannelForMember(member, list),
        command.baseName,
        member.id,
      ) ? voiceChannelForMember(member, list) : null;
      return {
        clustered,
        sittingEmpty,
        channel: clustered
          || sittingEmpty
          || pickEmptyNumberedVoiceChannel(list, command.baseName, { exceptMemberId: member.id }),
      };
    };
    let picked = pickDestination(channels);
    if (!picked.channel) {
      channels = await listGuildVoiceChannels(guild, { forceFetch: true });
      picked = pickDestination(channels);
    }
    destination = picked.channel;
    if (!destination) {
      logger.info(`ER:LC ;${command.name}: no empty "${command.baseName} {number}" VC.`);
      return { handled: false, reason: 'no_empty_channel', player };
    }
    if (picked.clustered && picked.clustered.id === destination.id && member.voice.channelId === destination.id) {
      originReason = 'already_there';
    } else if (picked.sittingEmpty && picked.sittingEmpty.id === destination.id) {
      originReason = 'already_in_empty';
    }
  }

  if (!destination) return { handled: false, reason: 'no_empty_channel', player };
  if (member.voice.channelId === destination.id && originReason === 'moved') {
    originReason = 'already_there';
  }

  const skipGreetingMark = command.name === 'fc';
  try {
    if (member.voice.channelId !== destination.id) {
      await moveMember(member, destination, `In-game ;${command.name}`, { skipGreetingMark });
      originReason = 'moved';
    }
  } catch (error) {
    logger.error(`ER:LC ;${command.name}: could not move ${member.id}`, error);
    return { handled: false, reason: 'move_failed', error: error?.message || String(error), player };
  }

  let nearbyMoved = 0;
  for (const nearbyMember of nearbyMembers) {
    if (nearbyMember.voice.channelId === destination.id) continue;
    try {
      await moveMember(
        nearbyMember,
        destination,
        `In-game ;${command.name} nearby ${player.username || player.robloxId}`,
        { skipGreetingMark },
      );
      nearbyMoved += 1;
    } catch (error) {
      logger.warn(
        `ER:LC ;${command.name}: could not move nearby ${nearbyMember.user?.tag || nearbyMember.id}: ${error?.message || error}`,
      );
    }
  }

  markRecentCommand(commandKey(player, command.name), now);
  logger.info(
    `ER:LC ;${command.name}: ${originReason} ${member.user?.tag || member.id} (${player.username}) `
    + `into #${destination.name} (${destination.id})`
    + `${nearbyMoved ? `, dragged ${nearbyMoved} nearby` : ''}`
    + `${eventId ? ` event ${eventId}` : ''}.`,
  );
  return {
    handled: true,
    reason: originReason,
    channelId: destination.id,
    channelName: destination.name,
    nearbyMoved,
    player,
  };
}

export function startErlcSceneCommands(client) {
  const listener = (payload, eventId) => {
    void (async () => {
      const items = erlcEventPayloads(payload);
      if (!items.length) {
        await logIncomingErlcWebhook(client, payload, eventId);
        return;
      }
      for (const item of items) {
        await handleErlcSceneEvent(item, { client, config: client.config, eventId });
      }
    })().catch(async (error) => {
      logger.error('ER:LC scene command failed', error);
      await logSceneCommandResult(client, {
        handled: false,
        reason: 'handler_error',
        error: error?.message || String(error),
        payloadHint: payloadKeyHint(payload),
      });
    });
  };
  client.on('erlcEvent', listener);
  logger.info('ER:LC in-game scene commands armed (;ss ;ts ;scene ;fc ;civ ;team).');
  return () => client.off('erlcEvent', listener);
}
