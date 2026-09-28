import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, parseErlcPlayer, parseErlcCommandLog } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { resolveZoneDiscordMember } from './erlcZoneVoice.js';
import { markBotVoiceMove } from './botVoiceMoves.js';
import { logger } from './logger.js';
import { postProximityLog, proximityStyleContent, VC_ACTION_LOG_CHANNEL_ID } from './vcActionLog.js';
import { PINELLAS_GUILD_ID } from './pinellasServer.js';
import { CLEARWATER_GUILD_ID } from './staffRanks.js';

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

export const SCENE_NEARBY_STUDS = 60;

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

export const SCENE_COMMAND_ALIASES = Object.freeze({
  seen: 'scene',
  scn: 'scene',
  tstop: 'ts',
  traffic: 'ts',
  trafficstop: 'ts',
  freq: 'fc',
  frequency: 'fc',
});

export function parseCustomCommand(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned) return null;
  const token = cleaned.replace(/^[:;]+/, '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  const name = SCENE_COMMAND_ALIASES[token] || token;
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

export function teamVoiceNamePattern(team) {
  const label = String(team || '').replace(/[_-]+/g, ' ');
  if (/\bfire\b/i.test(label)) return /^(?:fire|fd)\b/i;
  if (/\bpolice\b/i.test(label)) return /^(?:police|leo|pd)\b/i;
  if (/\bsheriff\b/i.test(label)) return /^(?:sheriff|so|pcso)\b/i;
  if (/\bdot\b/i.test(label)) return /^(?:dot|transport)\b/i;
  return null;
}

export function findTeamVoiceChannel(channels, team) {
  const list = Array.isArray(channels) ? channels : [];
  const id = teamVoiceChannelId(team);
  const byId = channelById(list, id);
  if (byId && (byId.type === ChannelType.GuildVoice || byId.type === 2)) return byId;
  const pattern = teamVoiceNamePattern(team);
  if (!pattern) return null;
  const found = [];
  for (const channel of list) {
    if (channel?.type !== ChannelType.GuildVoice && channel?.type !== 2) continue;
    if (pattern.test(String(channel.name || '').trim())) found.push(channel);
  }
  found.sort((left, right) => String(left.name).localeCompare(String(right.name)));
  return found[0] || null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const SCENE_VC_NAME_ALIASES = Object.freeze({
  'Traffic Stop': ['traffic\\s*stop', 't\\s*stop', 'ts'],
  'Mod Scene': ['mod\\s*scene'],
  Scene: ['scene'],
  'Frequency Change': ['frequency\\s*change', 'freq(?:uency)?\\s*change', 'fc'],
  Civilian: ['civilian', 'civ'],
});

export function numberedVoiceNamePattern(baseName) {
  const aliases = SCENE_VC_NAME_ALIASES[baseName] || [escapeRegExp(baseName).replace(/\\s+/g, '\\s+')];
  const body = aliases.join('|');
  return new RegExp(`^(?:${body})(?:\\s*[-#:]\\s*|\\s+)(\\d+)$`, 'i');
}

export function parseNumberedVoiceName(channelName, baseName) {
  const trimmed = String(channelName || '').trim();
  const match = trimmed.match(numberedVoiceNamePattern(baseName));
  if (match) {
    if (baseName === 'Scene' && /^mod\s*scene/i.test(trimmed)) return null;
    return Number(match[1]);
  }
  return null;
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

export function pickLowestNumberedVoiceChannel(channels, baseName) {
  const found = [];
  for (const channel of Array.isArray(channels) ? channels : []) {
    const type = channel?.type;
    if (type !== ChannelType.GuildVoice && type !== 2) continue;
    const number = parseNumberedVoiceName(channel.name, baseName);
    if (!Number.isInteger(number)) continue;
    found.push({ channel, number });
  }
  found.sort((left, right) => left.number - right.number);
  return found[0]?.channel || null;
}

function channelById(channels, id) {
  const want = String(id || '');
  if (!want) return null;
  return (Array.isArray(channels) ? channels : []).find((channel) => String(channel?.id) === want) || null;
}

export function voiceChannelIdOf(member, guild = member?.guild) {
  return String(
    member?.voice?.channelId
    || guild?.voiceStates?.cache?.get?.(member?.id)?.channelId
    || '',
  );
}

function linkedDiscordId(identityMap, robloxId) {
  const key = String(robloxId || '').trim();
  if (!key || !identityMap) return '';
  return String(identityMap.get(key) || identityMap.get(robloxId) || '');
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
  return `${player?.robloxId || player?.username || player?.discordId || '?'}|${commandName}`;
}

async function guildsToSearch(client, config) {
  const preferred = [config?.guildId, CLEARWATER_GUILD_ID, PINELLAS_GUILD_ID]
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const list = [];
  const seen = new Set();
  for (const id of preferred) {
    if (seen.has(id)) continue;
    seen.add(id);
    const guild = client?.guilds?.cache?.get(id) || await client?.guilds?.fetch?.(id).catch(() => null);
    if (guild) list.push(guild);
  }
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    if (seen.has(guild.id)) continue;
    seen.add(guild.id);
    list.push(guild);
  }
  return list;
}

export async function findVoicedDiscordMember(client, discordId, config = {}) {
  const id = String(discordId || '').trim();
  if (!id || !client?.guilds) return null;
  for (const guild of await guildsToSearch(client, config)) {
    const voiceId = guild.voiceStates?.cache?.get?.(id)?.channelId;
    const member = guild.members.cache.get(id)
      || await guild.members.fetch(id).catch(() => null);
    if (voiceId || member?.voice?.channelId) {
      if (!member) continue;
      return { guild, member };
    }
  }
  return null;
}

async function resolveVoicedSceneMember(client, config, player, identityMap) {
  const linkedId = linkedDiscordId(identityMap, player?.robloxId);
  if (linkedId) {
    const voiced = await findVoicedDiscordMember(client, linkedId, config);
    if (voiced) return voiced;
  }
  for (const guild of await guildsToSearch(client, config)) {
    const resolved = await resolveZoneDiscordMember(guild, player, identityMap);
    if (resolved.member && voiceChannelIdOf(resolved.member, guild)) {
      return { guild, member: resolved.member };
    }
  }
  for (const guild of await guildsToSearch(client, config)) {
    const resolved = await resolveZoneDiscordMember(guild, player, identityMap);
    if (resolved.member) return { guild, member: resolved.member };
  }
  return null;
}

function wasRecentCommand(key, now) {
  const last = recentCommands.get(key);
  return Boolean(last && now >= last && now - last < DEDUP_MS);
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

function pickNumberedDestination(channels, command, member, groupMembers = []) {
  const group = [member, ...groupMembers].filter(Boolean);
  const clustered = majorityMatchingVoiceChannel(group, command.baseName, { channels });
  const sitting = voiceChannelForMember(member, channels);
  const sittingEmpty = alreadyInMatchingEmpty(sitting, command.baseName, member.id) ? sitting : null;
  return clustered
    || sittingEmpty
    || pickEmptyNumberedVoiceChannel(channels, command.baseName, { exceptMemberId: member.id })
    || pickLowestNumberedVoiceChannel(channels, command.baseName);
}

async function executeErlcSceneCommand(payload, parsed, {
  client,
  config,
  eventId = '',
  now = Date.now(),
  snapshot,
  identities,
  voiceOverride = null,
} = {}) {
  if (!parsed.command) {
    if (isStealCommandText(parsed.text)) {
      return runStealCommand(payload, {
        client, config, snapshot, player: parsed.player, text: parsed.text,
      });
    }
    return { handled: false, reason: 'unknown_command', player: parsed.player };
  }

  const { command, player: webhookPlayer } = parsed;
  if (!voiceOverride && !webhookPlayer.username && !webhookPlayer.robloxId) {
    logger.warn(`ER:LC ;${command.name} ignored: webhook had no player.`);
    return { handled: false, reason: 'missing_player', player: webhookPlayer };
  }

  if (wasRecentCommand(commandKey(webhookPlayer, command.name), now)
    || (voiceOverride?.id && wasRecentCommand(commandKey({ discordId: voiceOverride.id }, command.name), now))) {
    return { handled: false, reason: 'duplicate', player: webhookPlayer };
  }

  if (!client?.guilds) return { handled: false, reason: 'missing_guild', player: webhookPlayer };

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
    discordId: voiceOverride?.id || '',
    team: rosterPlayer?.team || firstString(mappings(payload), ['Team', 'team']),
  };

  const identityMap = identities || await discordIdsByRobloxId();
  const voiced = voiceOverride
    ? { guild: voiceOverride.guild, member: voiceOverride }
    : await resolveVoicedSceneMember(client, config, player, identityMap);
  const guild = voiced?.guild;
  const member = voiced?.member;
  if (!member) {
    logger.info(`ER:LC ;${command.name}: no Discord member for ${player.username || player.robloxId}.`);
    return { handled: false, reason: 'unlinked', player };
  }
  if (!guild) return { handled: false, reason: 'guild_unavailable', player };
  if (!voiceChannelIdOf(member, guild)) {
    logger.info(`ER:LC ;${command.name}: <@${member.id}> is not in a Discord VC.`);
    return { handled: false, reason: 'not_in_voice', player };
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
    logger.warn(`ER:LC ;${command.name}: bot is missing Move Members.`);
    return { handled: false, reason: 'missing_move_members', player };
  }

  const nearbyEntries = [];
  const seenNearby = new Set([String(member.id)]);
  const rememberNearby = (entry) => {
    const id = String(entry?.member?.id || '');
    if (!id || seenNearby.has(id) || !voiceChannelIdOf(entry.member, entry.guild)) return;
    seenNearby.add(id);
    nearbyEntries.push(entry);
  };

  if (rosterPlayer) {
    for (const nearby of playersWithinStuds(rosterPlayer, rosterPlayers)) {
      try {
        const nearbyVoiced = await resolveVoicedSceneMember(client, config, nearby, identityMap);
        if (nearbyVoiced) rememberNearby({ ...nearbyVoiced, player: nearby });
      } catch (error) {
        logger.warn(
          `ER:LC ;${command.name}: could not resolve nearby ${nearby.username || nearby.robloxId}: ${error?.message || error}`,
        );
      }
    }
  }

  const originChannelId = voiceChannelIdOf(member, guild);
  const originChannel = member.voice?.channel
    || guild.channels?.cache?.get?.(originChannelId)
    || await guild.channels?.fetch?.(originChannelId).catch(() => null);
  for (const other of humanVoiceMembers(originChannel, member.id)) {
    rememberNearby({ guild: other.guild || guild, member: other, player: null });
  }

  const nearbyMembers = nearbyEntries.map((entry) => entry.member);

  let destination = null;
  let originReason = 'moved';
  if (command.kind === 'team') {
    if (!teamVoiceChannelId(player.team) && !teamVoiceNamePattern(player.team)) {
      logger.info(`ER:LC ;team: ${player.username} is on ${player.team || 'no'} team — not dragging.`);
      return { handled: false, reason: 'no_team', player };
    }
    let channels = await listGuildVoiceChannels(guild);
    destination = findTeamVoiceChannel(channels, player.team);
    if (!destination) {
      channels = await listGuildVoiceChannels(guild, { forceFetch: true });
      destination = findTeamVoiceChannel(channels, player.team);
    }
    if (!destination || (destination.type !== ChannelType.GuildVoice && destination.type !== 2)) {
      return { handled: false, reason: 'team_channel_missing', player };
    }
  } else {
    let channels = await listGuildVoiceChannels(guild);
    let picked = pickNumberedDestination(channels, command, member, nearbyMembers);
    if (!picked) {
      channels = await listGuildVoiceChannels(guild, { forceFetch: true });
      picked = pickNumberedDestination(channels, command, member, nearbyMembers);
    }
    destination = picked;
    if (!destination) {
      logger.info(`ER:LC ;${command.name}: no empty "${command.baseName} {number}" VC.`);
      return { handled: false, reason: 'no_empty_channel', player };
    }
    const sitting = voiceChannelForMember(member, channels);
    if (majorityMatchingVoiceChannel([member, ...nearbyMembers], command.baseName, { channels })?.id === destination.id
      && voiceChannelIdOf(member, guild) === destination.id) {
      originReason = 'already_there';
    } else if (alreadyInMatchingEmpty(sitting, command.baseName, member.id) && sitting?.id === destination.id) {
      originReason = 'already_in_empty';
    }
  }

  if (!destination) return { handled: false, reason: 'no_empty_channel', player };
  if (voiceChannelIdOf(member, guild) === destination.id && originReason === 'moved') {
    originReason = 'already_there';
  }

  const skipGreetingMark = command.name === 'fc';
  try {
    if (voiceChannelIdOf(member, guild) !== destination.id) {
      await moveMember(member, destination, `In-game ;${command.name}`, { skipGreetingMark });
      originReason = 'moved';
    }
  } catch (error) {
    logger.error(`ER:LC ;${command.name}: could not move ${member.id}`, error);
    return { handled: false, reason: 'move_failed', error: error?.message || String(error), player };
  }

  let nearbyMoved = 0;
  for (const entry of nearbyEntries) {
    try {
      let dest = destination;
      const otherGuild = entry.guild || guild;
      const sameGuild = String(otherGuild?.id || guild.id) === String(guild.id);
      if (command.kind === 'team' || !sameGuild) {
        const channels = await listGuildVoiceChannels(otherGuild, { forceFetch: !sameGuild });
        dest = command.kind === 'team'
          ? findTeamVoiceChannel(channels, entry.player?.team || player.team)
          : pickNumberedDestination(channels, command, entry.member, []);
      }
      if (!dest || voiceChannelIdOf(entry.member, otherGuild) === dest.id) continue;
      const otherMe = otherGuild.members?.me || await otherGuild.members?.fetchMe?.().catch(() => null);
      if (otherMe && !otherMe.permissions?.has(PermissionFlagsBits.MoveMembers)) continue;
      await moveMember(
        entry.member,
        dest,
        `In-game ;${command.name} nearby ${player.username || player.robloxId}`,
        { skipGreetingMark },
      );
      nearbyMoved += 1;
    } catch (error) {
      logger.warn(
        `ER:LC ;${command.name}: could not move nearby ${entry.member.user?.tag || entry.member.id}: ${error?.message || error}`,
      );
    }
  }

  markRecentCommand(commandKey(player, command.name), now);
  if (member?.id) markRecentCommand(commandKey({ discordId: member.id }, command.name), now);
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

function robloxIdForDiscord(identityMap, discordId) {
  const want = String(discordId || '');
  if (!want || !identityMap) return '';
  for (const [robloxId, linked] of identityMap) {
    if (String(linked) === want) return String(robloxId);
  }
  return '';
}

export async function runDiscordSceneCommand({
  client,
  member,
  commandName,
  now = Date.now(),
  snapshot,
  identities,
} = {}) {
  const name = String(commandName || '').replace(/^[-:;]+/, '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  const spec = SCENE_COMMANDS[name];
  if (!spec) return { handled: false, reason: 'unknown_command', player: {} };
  if (!member?.id || !client?.guilds) return { handled: false, reason: 'missing_guild', player: {} };

  let voiced = voiceChannelIdOf(member, member.guild) && member.guild
    ? { guild: member.guild, member }
    : await findVoicedDiscordMember(client, member.id, client.config || {});
  if (!voiceChannelIdOf(voiced?.member, voiced?.guild)) {
    return {
      handled: false,
      reason: 'not_in_voice',
      player: { username: member.displayName || member.user?.username || '', discordId: member.id },
    };
  }

  const identityMap = identities || await discordIdsByRobloxId().catch(() => new Map());
  const robloxId = robloxIdForDiscord(identityMap, member.id);
  const player = {
    username: member.displayName || member.user?.username || '',
    robloxId,
    discordId: member.id,
  };
  const override = voiced.member.guild ? voiced.member : { ...voiced.member, guild: voiced.guild };

  return executeErlcSceneCommand(
    { Type: 'Command', Player: robloxId ? `${player.username}:${robloxId}` : player.username, Command: `;${name}` },
    { command: { name, ...spec }, player, text: `;${name}` },
    {
      client,
      config: client.config || {},
      now,
      snapshot,
      identities: identityMap,
      voiceOverride: override,
    },
  );
}

const sceneLogSeen = new Set();
let sceneLogsPrimed = false;

export function commandLogToScenePayload(entry) {
  const command = String(entry?.command || '').trim();
  const username = String(entry?.username || '').trim();
  const robloxId = String(entry?.robloxId || '').trim();
  const player = robloxId ? `${username || 'Player'}:${robloxId}` : username;
  return {
    Type: 'Command',
    Player: player,
    Command: command,
    Message: command,
  };
}

export async function scanSceneCommandLogs(client, { snapshot, identities } = {}) {
  if (!snapshot && !client?.config?.erlcServerKey) return { scanned: 0 };
  const server = snapshot
    ? await snapshot()
    : await fetchErlcServer(client.config.erlcServerKey, { timeoutMs: 4_000 }).catch(() => null);
  const logs = (server?.CommandLogs || server?.commandLogs || []).map((entry) => (
    entry?.command != null || entry?.username != null ? entry : parseErlcCommandLog(entry)
  ));
  if (!sceneLogsPrimed) {
    for (const entry of logs) sceneLogSeen.add(`${entry.at || 0}:${entry.username || ''}:${entry.command || ''}`);
    sceneLogsPrimed = true;
    return { scanned: logs.length, primed: true };
  }
  let handled = 0;
  for (const entry of logs) {
    if (isStealCommandText(entry.command)) continue;
    if (!parseCustomCommand(entry.command)) continue;
    const id = `${entry.at || 0}:${entry.username || ''}:${entry.command || ''}`;
    if (sceneLogSeen.has(id)) continue;
    sceneLogSeen.add(id);
    try {
      const result = await handleErlcSceneEvent(commandLogToScenePayload(entry), {
        client,
        config: client?.config || {},
        snapshot: async () => server,
        identities,
      });
      if (result?.handled) handled += 1;
    } catch (error) {
      logger.warn(`ER:LC ; command from logs failed: ${error?.message || error}`);
    }
  }
  if (sceneLogSeen.size > 400) {
    const keep = [...sceneLogSeen].slice(-200);
    sceneLogSeen.clear();
    for (const id of keep) sceneLogSeen.add(id);
  }
  return { scanned: logs.length, handled };
}

export function resetSceneLogScannerForTests() {
  sceneLogSeen.clear();
  sceneLogsPrimed = false;
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
  const timer = setInterval(() => {
    void scanSceneCommandLogs(client).catch((error) => {
      logger.warn(`ER:LC scene command log scan failed: ${error?.message || error}`);
    });
  }, 5_000);
  timer.unref?.();
  void scanSceneCommandLogs(client).catch((error) => {
    logger.warn(`ER:LC scene command log scan failed: ${error?.message || error}`);
  });
  logger.info('ER:LC in-game scene commands armed (;ss ;ts ;scene ;fc ;civ ;team).');
  return () => {
    client.off('erlcEvent', listener);
    clearInterval(timer);
  };
}
