import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { discordIdsByRobloxId } from './identityStore.js';
import { resolveZoneDiscordMember } from './erlcZoneVoice.js';
import { markBotVoiceMove } from './botVoiceMoves.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';

export const MOD_CALL_ROOMS = ['1514131750559813733', '1514131852393320519', '1514131887914745906'];
const reservedRooms = new Set();

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

export function createModCallMonitor({ snapshot, move, now = Date.now, onError = e => logger.error('Mod-call voice move failed', e) }) {
  const done = new Set();
  const pending = new Map();
  let initialized = false;
  let running;
  const callKey = call => `${call.Timestamp}:${call.Caller}`;
  async function cycle() {
    const calls = await snapshot();
    if (!Array.isArray(calls)) throw new Error('Mod-call data unavailable');
    // Ignore historical accepted calls at startup, but observe later acceptances.
    if (!initialized) {
      for (const call of calls) if (call.Moderator) done.add(callKey(call));
      initialized = true;
      return;
    }
    for (const call of calls) {
      const id = callKey(call);
      if (!call.Caller || !call.Timestamp || !call.Moderator || done.has(id) || pending.has(id)) continue;
      pending.set(id, { call, expires: now() + 5 * 60000 });
    }
    for (const [id, entry] of pending) {
      if (now() >= entry.expires) { done.add(id); pending.delete(id); continue; }
      try {
        if (await move(entry.call)) { done.add(id); pending.delete(id); }
      } catch (error) { onError(error); }
    }
    const visible = new Set(calls.map(callKey));
    for (const id of done) if (!visible.has(id)) done.delete(id);
  }
  return { tick() {
    if (!running) running = cycle().catch(onError).finally(() => { running = null; });
    return running;
  } };
}

export function startModCallVoice(client) {
  const monitor = createModCallMonitor({
    snapshot: async () => (await fetchErlcServer(client.config.erlcServerKey, { modCalls: true })).ModCalls,
    move: async call => {
      if (!client.isReady()) return false;
      const guild = await client.guilds.fetch(client.config.guildId);
      await ensureGuildMembers(guild, { allowStale: true });
      const identities = await discordIdsByRobloxId();
      const caller = await resolveZoneDiscordMember(guild, parseErlcPlayer({ Player: call.Caller }), identities);
      const moderator = await resolveZoneDiscordMember(guild, parseErlcPlayer({ Player: call.Moderator }), identities);
      return moveModCallPair(guild, caller.member, moderator.member);
    },
  });
  let stopped = false, timer;
  const run = async () => { await monitor.tick(); if (!stopped) { timer = setTimeout(run, 5000); timer.unref(); } };
  void run();
  return () => { stopped = true; clearTimeout(timer); };
}
