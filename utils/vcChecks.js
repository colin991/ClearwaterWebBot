import { fetchErlcServer, parseErlcPlayer, executeErlcCommand } from './erlc.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { resolve } from 'node:path';
import { isVcExempt } from './enforcementExemptions.js';
import { getIdentityCache } from './identityStore.js';

export const VC_MESSAGES = ['Please join a Voice Channel inside of Clewarwater Roleplay', 'Please join a Voice Channel'];
export const COMMS_MESSAGES = ['⚠️ Please join out comms code: cwrpvc', '🚨 Join our server code: cwrpvc', '⚠️ Join our comms server now to not get jailed code: cwrpvc'];

export function matchingMembers(members, username) {
  const name = username.toLowerCase();
  return [...members.values()].filter(m => !m.user?.bot &&
    [m.nickname, m.displayName, m.user?.globalName, m.user?.username].some(text =>
      String(text || '').toLowerCase().includes(name)));
}

// Inject I/O so tests cannot issue commands to the live game.
export function createVcChecks({ snapshot, send, load = async () => [], save = async () => {}, now = Date.now, onError = error => logger.error('VC checks failed', error) }) {
  const states = new Map();
  let loaded = false;
  let enabled = true;
  let running;
  async function cycle() {
    if (!loaded) {
      for (const [id, state] of await load()) states.set(id, state);
      loaded = true;
    }
    const { players, members, inVoice, identities = {} } = await snapshot();
    const online = new Set(players.map(p => p.robloxId || p.username));
    for (const id of states.keys()) if (!online.has(id)) states.delete(id);
    for (const player of players) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(player.username)) continue;
      const id = player.robloxId || player.username;
      let state = states.get(id);
      if (!state) { state = { jailed: false, mode: null, since: now(), lastPm: -Infinity, index: 0 }; states.set(id, state); }
      try {
        const matches = matchingMembers(members, player.username);
        const compliant = matches.some(m => inVoice(m.id));
        if (!enabled || compliant || isVcExempt(player, members, identities)) {
          if (state.jailed) {
            await send(':unjail ' + player.username);
            state.jailed = false;
            await save([...states]);
          }
          state.mode = null;
          state.since = now();
          state.lastPm = -Infinity;
          state.index = 0;
          continue;
        }
        const mode = matches.length ? 'voice' : 'comms';
        if (state.mode !== mode) {
          state.mode = mode; state.since = now(); state.lastPm = -Infinity; state.index = 0;
        }
        const stillNeeded = () => {
          const current = matchingMembers(members, player.username);
          return enabled && !isVcExempt(player, members, identities) && (current.length ? 'voice' : 'comms') === mode && !current.some(m => inVoice(m.id));
        };
        if (!state.jailed && (mode === 'comms' || now() - state.since >= 300000)) {
          const result = await send(':jail ' + player.username, stillNeeded);
          if (result !== false) state.jailed = true;
          await save([...states]);
        }
        if (!stillNeeded()) continue;
        if (now() - state.lastPm >= 60000) {
          const messages = mode === 'voice' ? VC_MESSAGES : COMMS_MESSAGES;
          const result = await send(':pm ' + player.username + ' ' + messages[state.index % messages.length], stillNeeded);
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
      await ensureGuildMembers(guild);
      const server = await fetchErlcServer(config.erlcServerKey);
      const raw = server.Players ?? server.players;
      if (!Array.isArray(raw)) throw new Error('ER:LC player list unavailable; skipping VC enforcement.');
      return { players: raw.map(parseErlcPlayer), members: guild.members.cache,
        identities: (await getIdentityCache()).byDiscord,
        inVoice: id => Boolean(guild.voiceStates.cache.get(id)?.channelId) };
    },
    send: (command, shouldExecute) => executeErlcCommand(config.erlcServerKey, command, {
      shouldExecute: () => {
        if (!client.isReady()) throw new Error('Discord disconnected before VC command; retrying later.');
        return !shouldExecute || shouldExecute();
      },
    }),
  });
  client.vcChecks = service;
  let stopped = false;
  let timer;
  const run = async () => {
    await service.tick();
    if (!stopped) { timer = setTimeout(run, 15000); timer.unref(); }
  };
  void run();
  logger.info('VC checks enabled on startup.');
  return () => { stopped = true; clearTimeout(timer); };
}
