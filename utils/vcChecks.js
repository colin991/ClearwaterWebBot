import { fetchErlcServer, parseErlcPlayer, executeErlcCommand } from './erlc.js';
import { logger } from './logger.js';
import { ensureGuildMembers, isDiscordRosterReady } from './guildMemberSnapshot.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { resolve } from 'node:path';
import { isVcExempt } from './enforcementExemptions.js';
import { getIdentityCache } from './identityStore.js';
import { enforcementLogBody, postProximityLog } from './vcActionLog.js';
import { membersForPlayer, playerIsInVoice } from './robloxDiscordMatch.js';
import { loadVcWhitelist } from './vcWhitelist.js';

export { matchingMembers, membersForPlayer, robloxNameMatchesText } from './robloxDiscordMatch.js';

export const VC_MESSAGES = ['Please hop in a Clearwater Roleplay voice chat.', 'Please stay in a Clearwater Roleplay voice chat.'];
export const COMMS_MESSAGES = [
  'Please get in Clearwater comms. Code: CWRP VC',
  'Please join Clearwater comms now. Code: CWRP VC',
  'Get in Clearwater comms. Code: CWRP VC',
];
export const JAIL_MESSAGES = Object.freeze({
  comms: 'You are held until you are in Clearwater comms. Code: CWRP VC',
  voice: 'You are held until you are in a Clearwater Roleplay voice chat.',
});

// Inject I/O so tests cannot issue commands to the live game.
export function createVcChecks({ snapshot, send, load = async () => [], save = async () => {}, now = Date.now, onError = error => logger.error('VC checks failed', error), onLog = () => {}, enabled: initialEnabled = false }) {
  const log = event => {
    void Promise.resolve().then(() => onLog(event)).catch(error => logger.error('VC check log failed', error));
  };
  const states = new Map();
  let loaded = false;
  let enabled = Boolean(initialEnabled);
  let running;
  async function apply(command, player, reason, shouldExecute) {
    const verb = String(command || '').trim().split(/\s+/)[0].toLowerCase();
    if (![':pm', ':jail', ':unjail'].includes(verb)) return false;
    const result = await send(command, shouldExecute);
    if (result === false) return false;
    const kind = verb === ':unjail' ? 'UNJAIL' : verb === ':jail' ? 'JAIL' : 'PM';
    const message = kind === 'PM' ? command.replace(/^:pm\s+\S+\s+/i, '').slice(0, 120) : '';
    log({ action: kind, player, reason, message, command });
    return result;
  }
  async function cycle() {
    if (!loaded) {
      for (const [id, state] of await load()) states.set(id, state);
      loaded = true;
    }
    const { players, members, inVoice, identities = {}, membersReady = true, voiceStates } = await snapshot();
    const online = new Set(players.map(p => p.robloxId || p.username));
    for (const id of states.keys()) if (!online.has(id)) states.delete(id);
    for (const player of players) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(player.username)) continue;
      const id = player.robloxId || player.username;
      let state = states.get(id);
      if (!state) { state = { jailed: false, mode: null, since: now(), lastPm: -Infinity, index: 0, needJailNotice: false }; states.set(id, state); }
      try {
        const matches = membersForPlayer(player, members, identities);
        const inVc = playerIsInVoice(player, members, identities, inVoice, voiceStates);
        const compliant = inVc;
        if (!enabled || compliant || isVcExempt(player, members, identities)) {
          if (state.jailed) {
            const reason = !enabled ? 'checks disabled' : isVcExempt(player, members, identities) ? 'exempt' : 'joined voice';
            const released = await apply(':unjail ' + player.username, player, reason);
            if (released !== false) {
              state.jailed = false;
              await save([...states]);
            }
          }
          if (!state.jailed) {
            state.mode = null;
            state.since = now();
            state.lastPm = -Infinity;
            state.index = 0;
            state.needJailNotice = false;
          }
          continue;
        }
        if (!membersReady && !matches.length) continue;
        const mode = matches.length ? 'voice' : 'comms';
        if (state.mode !== mode) {
          state.mode = mode; state.since = now(); state.lastPm = -Infinity; state.index = 0; state.needJailNotice = false;
        }
        const stillNeeded = () => {
          if (!enabled || isVcExempt(player, members, identities)) return false;
          if (playerIsInVoice(player, members, identities, inVoice, voiceStates)) return false;
          const current = membersForPlayer(player, members, identities);
          return (current.length ? 'voice' : 'comms') === mode;
        };
        // Never jail someone we could not prove is missing from Discord.
        // Nickname matches must count; unmatched players only get comms PMs.
        if (mode === 'comms') {
          if (state.jailed) {
            const released = await apply(':unjail ' + player.username, player, 'nickname or Discord match uncertain');
            if (released !== false) {
              state.jailed = false;
              await save([...states]);
            }
          }
          if (now() - state.lastPm >= 60000) {
            const result = await apply(':pm ' + player.username + ' ' + COMMS_MESSAGES[state.index % COMMS_MESSAGES.length], player, 'comms reminder', stillNeeded);
            if (result !== false) { state.lastPm = now(); state.index += 1; }
          }
          continue;
        }
        if (!state.jailed && now() - state.since >= 300000) {
          const jailReason = 'not in voice for 5 minutes';
          if (stillNeeded()) {
            try {
              const pmResult = await apply(':pm ' + player.username + ' ' + JAIL_MESSAGES[mode], player, 'jail notice', stillNeeded);
              if (pmResult !== false) {
                state.needJailNotice = false;
                state.lastPm = now();
              } else {
                state.needJailNotice = true;
              }
            } catch (error) {
              onError(error);
              state.needJailNotice = true;
            }
          }
          if (!stillNeeded()) continue;
          const result = await apply(':jail ' + player.username, player, jailReason, stillNeeded);
          if (result !== false) {
            state.jailed = true;
            await save([...states]);
          }
          continue;
        }
        if (state.needJailNotice) {
          const pmResult = await apply(':pm ' + player.username + ' ' + JAIL_MESSAGES[mode], player, 'jail notice', stillNeeded);
          if (pmResult !== false) { state.needJailNotice = false; state.lastPm = now(); }
          continue;
        }
        if (now() - state.lastPm >= 60000) {
          const messages = mode === 'voice' ? VC_MESSAGES : COMMS_MESSAGES;
          const result = await apply(':pm ' + player.username + ' ' + messages[state.index % messages.length], player, mode === 'voice' ? 'voice reminder' : 'comms reminder', stillNeeded);
          if (result !== false) { state.lastPm = now(); state.index += 1; }
        }
      } catch (error) { onError(error); }
    }
    await save([...states]);
  }
  function tick() {
    if (!running) running = cycle().catch(onError).finally(() => { running = null; });
    return running;
  }
  return {
    get enabled() { return enabled; },
    tick,
    async setEnabled(value) {
      enabled = Boolean(value);
      if (running) await running;
      await tick();
      return { pendingReleases: [...states.values()].filter(s => s.jailed).length };
    },
  };
}

export function startVcChecks(client, config) {
  const statePath = resolve('data', 'vc-checks.json');
  const service = createVcChecks({
    load: () => readJsonFile(statePath, [], { corruptFallback: false }),
    save: states => writeJsonFile(statePath, states),
    async snapshot() {
      if (!client.isReady()) throw new Error('Discord is disconnected; skipping VC enforcement.');
      const guild = await client.guilds.fetch(config.guildId);
      // An incomplete member cache must never be treated as confirmed absence.
      await ensureGuildMembers(guild, { allowStale: true });
      const server = await fetchErlcServer(config.erlcServerKey);
      const raw = server.Players ?? server.players;
      if (!Array.isArray(raw)) throw new Error('ER:LC player list unavailable; skipping VC enforcement.');
      return { players: raw.map(parseErlcPlayer), members: guild.members.cache,
        identities: (await getIdentityCache()).byDiscord,
        membersReady: isDiscordRosterReady(guild),
        voiceStates: guild.voiceStates.cache,
        inVoice: id => {
          const key = String(id || '');
          const vs = guild.voiceStates.cache.get(key) || guild.voiceStates.cache.get(id);
          return Boolean(vs?.channelId);
        },
      };
    },
    send: (command, shouldExecute) => executeErlcCommand(config.erlcServerKey, command, {
      shouldExecute: () => {
        if (!client.isReady()) throw new Error('Discord disconnected before VC command; retrying later.');
        return !shouldExecute || shouldExecute();
      },
      allowJail: /^:jail\b/i.test(String(command || '')),
    }),
    onLog: event => postProximityLog(client, {
      tag: 'VcCheck',
      body: enforcementLogBody(event),
    }),
  });
  client.vcChecks = service;
  let stopped = false;
  let timer;
  const run = async () => {
    await service.tick();
    if (!stopped) { timer = setTimeout(run, 15000); timer.unref(); }
  };
  void loadVcWhitelist().catch((error) => logger.error('VC whitelist failed to load', error)).finally(() => { void run(); });
  logger.info('VC checks start off until /vc checks on.');
  return () => { stopped = true; clearTimeout(timer); };
}
