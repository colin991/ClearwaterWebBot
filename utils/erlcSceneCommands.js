import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { resolveZoneDiscordMember } from './erlcZoneVoice.js';
import { markBotVoiceMove } from './botVoiceMoves.js';
import { logger } from './logger.js';

export const SCENE_COMMANDS = Object.freeze({
  ss: { kind: 'numbered', baseName: 'Mod Scene' },
  ts: { kind: 'numbered', baseName: 'Traffic Stop' },
  scene: { kind: 'numbered', baseName: 'Scene' },
  fc: { kind: 'numbered', baseName: 'Frequency Change' },
  civ: { kind: 'numbered', baseName: 'Civilian' },
  team: { kind: 'team' },
});

export const TEAM_VOICE_CHANNEL_IDS = Object.freeze({
  fire: '1514128961951760515',
  police: '1514128904783139018',
  sheriff: '1514128904783139018',
  dot: '1514130037052407932',
});

const DEDUP_MS = 4_000;
const recentCommands = new Map();

function mappings(payload) {
  if (!payload || typeof payload !== 'object') return [];
  const nested = [payload.Data, payload.data, payload.Payload, payload.payload, payload.Event, payload.event];
  return [payload, ...nested.filter((value) => value && typeof value === 'object' && !Array.isArray(value))];
}

function firstString(objects, keys) {
  for (const object of objects) {
    for (const key of keys) {
      const value = object?.[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return '';
}

export function extractWebhookCommandText(payload) {
  return firstString(mappings(payload), [
    'Command', 'command', 'Message', 'message', 'Content', 'content', 'Text', 'text', 'ChatMessage', 'chatMessage',
  ]);
}

export function extractWebhookPlayer(payload) {
  const objects = mappings(payload);
  for (const object of objects) {
    const raw = object.Player || object.player || object.Caller || object.caller;
    if (typeof raw === 'string' && raw.trim()) {
      const text = raw.trim();
      const separator = text.lastIndexOf(':');
      if (separator > 0 && /^\d{1,20}$/.test(text.slice(separator + 1))) {
        return { username: text.slice(0, separator), robloxId: text.slice(separator + 1) };
      }
      return { username: text, robloxId: '' };
    }
    if (raw && typeof raw === 'object') {
      const username = String(raw.Name || raw.Username || raw.username || raw.Player || '').trim();
      const robloxId = String(raw.Id || raw.id || raw.PlayerId || raw.playerId || raw.UserId || raw.userId || '').trim();
      if (username || robloxId) return { username, robloxId };
    }
  }
  const username = firstString(objects, ['Username', 'username', 'PlayerName', 'playerName']);
  const robloxId = firstString(objects, ['PlayerId', 'playerId', 'UserId', 'userId', 'RobloxId', 'robloxId']);
  if (username || robloxId) return { username, robloxId };
  return { username: '', robloxId: '' };
}

export function parseCustomCommand(text) {
  const cleaned = String(text || '').trim();
  if (!cleaned.startsWith(';')) return null;
  const name = cleaned.slice(1).trim().split(/\s+/)[0]?.toLowerCase() || '';
  const spec = SCENE_COMMANDS[name];
  if (!spec) return null;
  return { name, ...spec, raw: cleaned };
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
  const command = parseCustomCommand(extractWebhookCommandText(payload));
  if (!command) return null;
  return { command, player: extractWebhookPlayer(payload) };
}

async function listGuildVoiceChannels(guild) {
  if (!guild?.channels?.cache) return [];
  if (guild.channels.cache.size < 8) {
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
  if (!parsed) return { handled: false, reason: 'not_scene_command' };

  const { command, player: webhookPlayer } = parsed;
  if (!webhookPlayer.username && !webhookPlayer.robloxId) {
    logger.warn(`ER:LC ;${command.name} ignored: webhook had no player.`);
    return { handled: false, reason: 'missing_player' };
  }

  if (wasRecentCommand(commandKey(webhookPlayer, command.name), now)) {
    return { handled: false, reason: 'duplicate' };
  }

  const guildId = config.guildId;
  if (!guildId || !client?.guilds) return { handled: false, reason: 'missing_guild' };
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return { handled: false, reason: 'guild_unavailable' };

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
    logger.warn(`ER:LC ;${command.name}: bot is missing Move Members.`);
    return { handled: false, reason: 'missing_move_members' };
  }

  let rosterPlayer = null;
  try {
    const server = snapshot
      ? await snapshot()
      : (config.erlcServerKey ? await fetchErlcServer(config.erlcServerKey) : null);
    const players = (server?.Players || server?.players || []).map((entry) => (
      entry?.username != null ? entry : parseErlcPlayer(entry)
    ));
    rosterPlayer = findRosterPlayer(players, webhookPlayer);
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
    return { handled: false, reason: 'unlinked' };
  }
  if (!member.voice?.channelId) {
    logger.info(`ER:LC ;${command.name}: <@${member.id}> is not in a Discord VC.`);
    return { handled: false, reason: 'not_in_voice' };
  }

  let destination = null;
  if (command.kind === 'team') {
    const channelId = teamVoiceChannelId(player.team);
    if (!channelId) {
      logger.info(`ER:LC ;team: ${player.username} is on ${player.team || 'no'} team — not dragging.`);
      return { handled: false, reason: 'no_team' };
    }
    destination = guild.channels.cache.get(channelId)
      || await guild.channels.fetch(channelId).catch(() => null);
    if (!destination || destination.type !== ChannelType.GuildVoice) {
      return { handled: false, reason: 'team_channel_missing' };
    }
  } else {
    if (alreadyInMatchingEmpty(member.voice.channel, command.baseName, member.id)) {
      markRecentCommand(commandKey(player, command.name), now);
      return { handled: true, reason: 'already_in_empty', channelId: member.voice.channelId };
    }
    const channels = await listGuildVoiceChannels(guild);
    destination = pickEmptyNumberedVoiceChannel(channels, command.baseName, { exceptMemberId: member.id });
    if (!destination) {
      logger.info(`ER:LC ;${command.name}: no empty "${command.baseName} {number}" VC.`);
      return { handled: false, reason: 'no_empty_channel' };
    }
  }

  if (member.voice.channelId === destination.id) {
    markRecentCommand(commandKey(player, command.name), now);
    return { handled: true, reason: 'already_there', channelId: destination.id };
  }

  try {
    await moveMember(
      member,
      destination,
      `In-game ;${command.name}`,
      { skipGreetingMark: command.name === 'fc' },
    );
    markRecentCommand(commandKey(player, command.name), now);
    logger.info(
      `ER:LC ;${command.name}: moved ${member.user?.tag || member.id} (${player.username}) `
      + `into #${destination.name} (${destination.id})${eventId ? ` event ${eventId}` : ''}.`,
    );
    return { handled: true, reason: 'moved', channelId: destination.id };
  } catch (error) {
    logger.error(`ER:LC ;${command.name}: could not move ${member.id}`, error);
    return { handled: false, reason: 'move_failed', error: error?.message || String(error) };
  }
}

export function startErlcSceneCommands(client) {
  const listener = (payload, eventId) => {
    void handleErlcSceneEvent(payload, { client, config: client.config, eventId }).catch((error) => {
      logger.error('ER:LC scene command failed', error);
    });
  };
  client.on('erlcEvent', listener);
  logger.info('ER:LC in-game scene commands armed (;ss ;ts ;scene ;fc ;civ ;team).');
  return () => client.off('erlcEvent', listener);
}
