import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { resolveZoneDiscordMember } from './erlcZoneVoice.js';
import { markBotVoiceMove } from './botVoiceMoves.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';

export const MOD_CALL_ROOMS = ['1514131750559813733', '1514131852393320519', '1514131887914745906'];
/** Do not drag if the in-game call is older than this when staff pick it up. */
export const MOD_CALL_MAX_AGE_MS = 2 * 60 * 1000;
/** Retry a failed live move only briefly — never keep pulling people minutes later. */
export const MOD_CALL_RETRY_MS = 30 * 1000;
/** Scare ping only if at least this many unpicked calls have sat this long. Does not infract. */
export const MOD_CALL_UNPICKED_MS = 2 * 60 * 1000;
export const MOD_CALL_REMIND_MIN_CALLS = 2;
export const MOD_CALL_REMIND_CHANNEL = '1514422317587890327';
export const MOD_CALL_REMIND_ROLE = '1514107930721517570';
export const MOD_CALL_REMIND_MESSAGE = `<@&${MOD_CALL_REMIND_ROLE}> - Pick up mod calls or be auto-infracted in 1 minutes`;
export const MOD_CALL_THANKS_MESSAGE = 'Thank you, for picking up the mod calls';
const reservedRooms = new Set();

export function modCallTimestampMs(call) {
  const raw = Number(call?.Timestamp ?? call?.timestamp ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return raw < 1e12 ? raw * 1000 : raw;
}

export function isModCallStale(call, now = Date.now(), maxAgeMs = MOD_CALL_MAX_AGE_MS) {
  const at = modCallTimestampMs(call);
  if (!at) return true;
  return now - at > maxAgeMs;
}

export function modCallCallerInGame(call, players = []) {
  const caller = parseErlcPlayer({ Player: call?.Caller });
  const id = String(caller.robloxId || '');
  const name = String(caller.username || '').toLowerCase();
  if (!id && !name) return false;
  return (Array.isArray(players) ? players : []).some((player) => {
    const parsed = player?.username ? player : parseErlcPlayer(player);
    if (id && String(parsed.robloxId || '') === id) return true;
    return Boolean(name && String(parsed.username || '').toLowerCase() === name);
  });
}

export async function moveModCallPair(guild, caller, moderator) {
  if (!caller || !moderator || caller.id === moderator.id || !caller.voice.channelId || !moderator.voice.channelId) return false;
  const me = guild.members.me || await guild.members.fetchMe();
  for (const id of MOD_CALL_ROOMS) {
    const room = await guild.channels.fetch(id);
    if (room?.type !== ChannelType.GuildVoice || room.members.size !== 0 || reservedRooms.has(id)) continue;
    if (room.userLimit && room.userLimit < 2) continue;
    if (!room.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers])) continue;
    const original = caller.voice.channelId;
    if (!moderator.voice.channelId || room.members.size) continue;
    reservedRooms.add(id);
    // Bridge gateway cache lag between successful moves and subsequent call polls.
    const release = setTimeout(() => reservedRooms.delete(id), 15000);
    release.unref();
    markBotVoiceMove(caller.id);
    await caller.voice.setChannel(room, 'Accepted in-game moderator call');
    try {
      // If another person entered during the first move, do not merge calls.
      if ([...room.members.keys()].some(memberId => memberId !== caller.id)) throw new Error('Mod-call room became occupied during move');
      markBotVoiceMove(moderator.id);
      await moderator.voice.setChannel(room, 'Accepted in-game moderator call');
    } catch (error) {
      if (caller.voice.channelId === room.id) {
        markBotVoiceMove(caller.id);
        await caller.voice.setChannel(original, 'Restore caller after incomplete mod-call move').catch(e => logger.error('Could not restore mod caller', e));
      }
      throw error;
    }
    return true;
  }
  return false;
}

export function createModCallMonitor({
  snapshot,
  move,
  remind = null,
  thanks = null,
  now = Date.now,
  onError = e => logger.error('Mod-call voice move failed', e),
  maxAgeMs = MOD_CALL_MAX_AGE_MS,
  retryMs = MOD_CALL_RETRY_MS,
  remindAfterMs = MOD_CALL_UNPICKED_MS,
  remindMinCalls = MOD_CALL_REMIND_MIN_CALLS,
}) {
  const done = new Set();
  const pending = new Map();
  let initialized = false;
  let reminderOutstanding = false;
  let running;
  const callKey = call => `${call.Timestamp}:${call.Caller}`;
  const readSnapshot = async () => {
    const data = await snapshot();
    if (Array.isArray(data)) return { calls: data, players: [] };
    return {
      calls: Array.isArray(data?.calls) ? data.calls : [],
      players: Array.isArray(data?.players) ? data.players : [],
    };
  };
  const abandon = (id) => {
    done.add(id);
    pending.delete(id);
  };
  function unpickedCalls(calls) {
    return (Array.isArray(calls) ? calls : []).filter((call) => call?.Caller && call?.Timestamp && !call.Moderator);
  }
  function overdueUnpicked(calls, time) {
    return unpickedCalls(calls).filter((call) => {
      const at = modCallTimestampMs(call);
      return at && time - at > remindAfterMs;
    });
  }
  async function cycle() {
    const { calls, players } = await readSnapshot();
    if (!Array.isArray(calls)) throw new Error('Mod-call data unavailable');
    // Ignore historical accepted/unpicked calls at startup; watch later ones.
    if (!initialized) {
      for (const call of calls) {
        if (call.Moderator) done.add(callKey(call));
      }
      initialized = true;
      return;
    }
    const havePlayers = players.length > 0;
    for (const call of calls) {
      const id = callKey(call);
      if (!call.Caller || !call.Timestamp || !call.Moderator || done.has(id) || pending.has(id)) continue;
      if (isModCallStale(call, now(), maxAgeMs) || (havePlayers && !modCallCallerInGame(call, players))) {
        done.add(id);
        continue;
      }
      pending.set(id, { call, expires: now() + retryMs });
    }
    for (const [id, entry] of pending) {
      if (now() >= entry.expires
        || isModCallStale(entry.call, now(), maxAgeMs)
        || (havePlayers && !modCallCallerInGame(entry.call, players))) {
        abandon(id);
        continue;
      }
      try {
        if (await move(entry.call)) abandon(id);
      } catch (error) { onError(error); }
    }
    const visible = new Set(calls.map(callKey));
    for (const id of done) if (!visible.has(id)) done.delete(id);
    const sitting = unpickedCalls(calls);
    const overdue = overdueUnpicked(calls, now());
    if (typeof remind === 'function' && !reminderOutstanding && overdue.length >= remindMinCalls) {
      try {
        await remind();
        reminderOutstanding = true;
      } catch (error) {
        onError(error);
      }
    }
    if (typeof thanks === 'function' && reminderOutstanding && sitting.length === 0) {
      try {
        await thanks();
        reminderOutstanding = false;
      } catch (error) {
        onError(error);
      }
    }
  }
  return { tick() {
    if (!running) running = cycle().catch(onError).finally(() => { running = null; });
    return running;
  } };
}

export function startModCallVoice(client) {
  const monitor = createModCallMonitor({
    snapshot: async () => {
      const server = await fetchErlcServer(client.config.erlcServerKey, { modCalls: true });
      return {
        calls: server.ModCalls,
        players: (server.Players || []).map(parseErlcPlayer),
      };
    },
    move: async call => {
      if (!client.isReady()) return false;
      const guild = await client.guilds.fetch(client.config.guildId);
      await ensureGuildMembers(guild, { allowStale: true });
      const identities = await discordIdsByRobloxId();
      const caller = await resolveZoneDiscordMember(guild, parseErlcPlayer({ Player: call.Caller }), identities);
      const moderator = await resolveZoneDiscordMember(guild, parseErlcPlayer({ Player: call.Moderator }), identities);
      return moveModCallPair(guild, caller.member, moderator.member);
    },
    remind: async () => {
      if (!client.isReady()) throw new Error('Discord unavailable; skipping mod-call reminder.');
      const channel = await client.channels.fetch(MOD_CALL_REMIND_CHANNEL);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new Error('Mod-call reminder channel unavailable.');
      }
      await channel.send({
        content: MOD_CALL_REMIND_MESSAGE,
        allowedMentions: { parse: [], roles: [MOD_CALL_REMIND_ROLE] },
      });
    },
    thanks: async () => {
      if (!client.isReady()) throw new Error('Discord unavailable; skipping mod-call thanks.');
      const channel = await client.channels.fetch(MOD_CALL_REMIND_CHANNEL);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new Error('Mod-call reminder channel unavailable.');
      }
      await channel.send({
        content: MOD_CALL_THANKS_MESSAGE,
        allowedMentions: { parse: [] },
      });
    },
  });
  let stopped = false, timer;
  const run = async () => { await monitor.tick(); if (!stopped) { timer = setTimeout(run, 5000); timer.unref(); } };
  void run();
  return () => { stopped = true; clearTimeout(timer); };
}
