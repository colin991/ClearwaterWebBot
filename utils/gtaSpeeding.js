import { resolve } from 'node:path';
import { fetchErlcServer, parseErlcPlayer, executeErlcCommand } from './erlc.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import { hasEnforcementExemption } from './enforcementExemptions.js';
import { getIdentityCache } from './identityStore.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { enforcementLogBody, postProximityLog } from './vcActionLog.js';

export const GTA_SPEED_LIMIT = 130;
export const GTA_SPEED_REPEAT_MS = 3 * 60 * 1000;
export const GTA_SPEED_WARN_PM = 'GTA Speeding is not allowed. Stay at or under 130.';
export const GTA_SPEED_LOAD_PM = 'You were loaded for GTA Speeding again within 3 minutes. Stay at or under 130.';
/** Roblox studs are treated as feet so estimated speed matches the in-game MPH gauge. */
export const STUDS_PER_SECOND_TO_MPH = 3600 / 5280;
const MAX_PLAUSIBLE_MPH = 250;
const validUsername = (player) => /^[a-zA-Z0-9_]{3,20}$/.test(String(player?.username || ''));
const playerKey = (player) => player?.robloxId || player?.username;

export function speedFromDisplacement({ x0, z0, x1, z1, dtMs }) {
  const dt = Number(dtMs) / 1000;
  if (!(dt >= 1 && dt <= 20)) return null;
  if (![x0, z0, x1, z1].every(Number.isFinite)) return null;
  const mph = (Math.hypot(x1 - x0, z1 - z0) / dt) * STUDS_PER_SECOND_TO_MPH;
  if (!Number.isFinite(mph) || mph > MAX_PLAUSIBLE_MPH) return null;
  return mph;
}

export function playerSpeedMph(player, previous, now) {
  const reported = Number(player?.speed);
  const fromApi = Number.isFinite(reported) && reported > 0 ? reported : null;
  const fromMove = previous
    ? speedFromDisplacement({
      x0: previous.x,
      z0: previous.z,
      x1: player?.location?.x,
      z1: player?.location?.z,
      dtMs: now - previous.at,
    })
    : null;
  if (fromApi != null && fromMove != null) return Math.max(fromApi, fromMove);
  return fromApi ?? fromMove;
}

function persistable(states) {
  return [...states.entries()].map(([id, state]) => [id, {
    lastOffenseAt: state.lastOffenseAt || 0,
    lastAction: state.lastAction || null,
  }]);
}

export function createGtaSpeeding({
  snapshot,
  send,
  load = async () => [],
  save = async () => {},
  now = Date.now,
  onError = (error) => logger.error('GTA speeding checks failed', error),
  onLog = () => {},
} = {}) {
  const states = new Map();
  let loaded = false;
  let running;

  const log = (event) => {
    void Promise.resolve().then(() => onLog(event)).catch((error) => logger.error('GTA speeding log failed', error));
  };

  async function apply(command, player, reason, shouldExecute) {
    const result = await send(command, shouldExecute);
    if (result === false) return false;
    const kind = command.startsWith(':load') ? 'LOAD' : 'PM';
    const message = kind === 'PM' ? command.replace(/^:pm\s+\S+\s+/i, '').slice(0, 160) : '';
    log({ action: kind, player, reason, message, command });
    return result;
  }

  async function cycle() {
    if (!loaded) {
      for (const [id, state] of await load()) {
        states.set(id, {
          lastOffenseAt: Number(state?.lastOffenseAt) || 0,
          lastAction: state?.lastAction || null,
        });
      }
      loaded = true;
    }
    const players = await snapshot();
    const online = new Set(players.map(playerKey).filter(Boolean));
    for (const id of [...states.keys()]) {
      if (!online.has(id)) states.delete(id);
    }
    const time = now();
    for (const player of players) {
      if (!validUsername(player) || player.enforcementExempt) continue;
      const id = playerKey(player);
      if (!id) continue;
      let state = states.get(id);
      if (!state) {
        state = { lastOffenseAt: 0, lastAction: null };
        states.set(id, state);
      }
      const mph = playerSpeedMph(player, state.sample, time);
      state.sample = Number.isFinite(player.location?.x) && Number.isFinite(player.location?.z)
        ? { x: player.location.x, z: player.location.z, at: time }
        : null;
      const over = Number.isFinite(mph) && mph > GTA_SPEED_LIMIT;
      if (!over) {
        state.speeding = false;
        continue;
      }
      if (state.speeding) continue;
      state.speeding = true;
      const repeat = state.lastAction === 'warn'
        && state.lastOffenseAt
        && time - state.lastOffenseAt <= GTA_SPEED_REPEAT_MS;
      const stillHere = async () => {
        const live = await snapshot();
        return live.some((entry) => playerKey(entry) === id && validUsername(entry) && !entry.enforcementExempt);
      };
      try {
        if (repeat) {
          const loadedPlayer = await apply(`:load ${player.username}`, player, `GTA Speeding ${Math.round(mph)} mph`, stillHere);
          if (loadedPlayer === false) {
            state.speeding = false;
            continue;
          }
          await apply(`:pm ${player.username} ${GTA_SPEED_LOAD_PM}`, player, 'GTA Speeding load notice', stillHere);
          state.lastAction = 'load';
          state.lastOffenseAt = time;
          state.sample = null;
        } else {
          const warned = await apply(`:pm ${player.username} ${GTA_SPEED_WARN_PM}`, player, `GTA Speeding ${Math.round(mph)} mph`, stillHere);
          if (warned === false) {
            state.speeding = false;
            continue;
          }
          state.lastAction = 'warn';
          state.lastOffenseAt = time;
        }
      } catch (error) {
        state.speeding = false;
        onError(error);
      }
    }
    await save(persistable(states));
  }

  return {
    tick() {
      if (!running) running = cycle().catch(onError).finally(() => { running = null; });
      return running;
    },
  };
}

export function startGtaSpeeding(client) {
  const key = client.config.erlcServerKey;
  const path = resolve('data', 'gta-speeding.json');
  const service = createGtaSpeeding({
    load: () => readJsonFile(path, [], { corruptFallback: false }),
    save: (states) => writeJsonFile(path, states),
    async snapshot() {
      if (!client.isReady()) throw new Error('Discord unavailable; skipping GTA speeding checks.');
      const guild = await client.guilds.fetch(client.config.guildId);
      await ensureGuildMembers(guild, { allowStale: true });
      const identities = (await getIdentityCache()).byDiscord;
      const data = await fetchErlcServer(key);
      if (!Array.isArray(data.Players)) throw new Error('Player list unavailable; skipping GTA speeding checks.');
      return data.Players.map(parseErlcPlayer).map((player) => ({
        ...player,
        enforcementExempt: hasEnforcementExemption(player, guild.members.cache, identities),
      }));
    },
    send: (command, shouldExecute) => executeErlcCommand(key, command, { shouldExecute }),
    onLog: (event) => postProximityLog(client, {
      tag: 'GtaSpeed',
      body: enforcementLogBody(event),
    }),
  });
  client.gtaSpeeding = service;
  let stopped = false;
  let timer;
  const run = async () => {
    await service.tick();
    if (!stopped) {
      timer = setTimeout(run, 5000);
      timer.unref();
    }
  };
  void run();
  logger.info('GTA speeding checks enabled on startup.');
  return () => { stopped = true; clearTimeout(timer); };
}
