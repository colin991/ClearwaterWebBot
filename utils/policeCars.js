import { resolve } from 'node:path';
import {
  executeErlcCommand,
  fetchErlcServer,
  parseErlcPlayer,
  parseErlcVehicle,
} from './erlc.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import { hasEnforcementExemption } from './enforcementExemptions.js';
import { getIdentityCache } from './identityStore.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { resolveSheriffDiscordId } from './sheriffBalance.js';
import { vehiclesForPlayer } from './vehiclePreset.js';
import { v2Card } from './v2Message.js';
import { enforcementLogBody, postProximityLog } from './vcActionLog.js';

export const POLICE_ALLOWED_CARS = Object.freeze([
  'Falcon Advance XET',
  '2015 Bullhorn Prancer',
  '2021 Chevlon Camion',
  '2024 FPIU',
]);

export const POLICE_CAR_PM = 'Please switch to an allowed Police car and check your Discord DMs.';
export const POLICE_CAR_GRACE_TICKS = 2;
export const POLICE_CAR_REPEAT_MS = 3 * 60 * 1000;

const validUsername = (player) => /^[a-zA-Z0-9_]{3,20}$/.test(String(player?.username || ''));
const playerKey = (player) => player?.robloxId || player?.username;

export function normalizeCarName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function isPoliceTeam(team) {
  return String(team || '').trim().toLowerCase() === 'police';
}

export function isAllowedPoliceCar(vehicle) {
  const name = normalizeCarName(vehicle?.name || vehicle);
  if (!name) return false;
  if (name.includes('falcon advance') && name.includes('xet')) return true;
  if (name.includes('bullhorn prancer') && name.includes('2015')) return true;
  if (name.includes('chevlon camion') && name.includes('2021')) return true;
  if (/\bfpiu\b/.test(name)) return true;
  if (name.includes('2024') && name.includes('falcon interceptor') && name.includes('utility')) return true;
  return false;
}

export function disallowedPoliceCar(player, vehicles) {
  if (!isPoliceTeam(player?.team)) return null;
  const owned = vehiclesForPlayer(player, vehicles);
  return owned.find((vehicle) => !isAllowedPoliceCar(vehicle)) || null;
}

export function policeCarDmText(vehicle) {
  const current = String(vehicle?.name || 'your current car').trim() || 'your current car';
  return [
    'Police can only use these cars:',
    ...POLICE_ALLOWED_CARS.map((name) => `• **${name}**`),
    '',
    `You are in **${current}**. Switch to one of the cars above. In-game reminders keep going every 3 minutes until you do.`,
  ].join('\n');
}

function persistable(states) {
  return [...states.entries()].map(([id, state]) => [id, {
    lastPmAt: Number(state?.lastPmAt) || 0,
    lastDmAt: Number(state?.lastDmAt) || 0,
    lastCar: state?.lastCar || '',
  }]);
}

export function createPoliceCarMonitor({
  snapshot,
  send,
  dmDiscord = async () => {},
  load = async () => [],
  save = async () => {},
  now = Date.now,
  onError = (error) => logger.error('Police car checks failed', error),
  onLog = () => {},
} = {}) {
  const states = new Map();
  let loaded = false;
  let running;

  const log = (event) => {
    void Promise.resolve().then(() => onLog(event)).catch((error) => logger.error('Police car log failed', error));
  };

  async function cycle() {
    if (!loaded) {
      for (const [id, state] of await load()) {
        states.set(id, {
          lastPmAt: Number(state?.lastPmAt) || 0,
          lastDmAt: Number(state?.lastDmAt) || 0,
          lastCar: state?.lastCar || '',
        });
      }
      loaded = true;
    }

    const { players, vehicles, members, identities = {} } = await snapshot();
    const online = new Set(players.map(playerKey).filter(Boolean));
    for (const id of [...states.keys()]) {
      if (!online.has(id)) states.delete(id);
    }

    const time = now();
    for (const player of players) {
      if (!validUsername(player) || player.enforcementExempt) continue;
      const id = playerKey(player);
      if (!id) continue;
      const vehicle = disallowedPoliceCar(player, vehicles);
      if (!vehicle) {
        states.delete(id);
        continue;
      }

      let state = states.get(id);
      if (!state) {
        state = { lastPmAt: 0, lastDmAt: 0, lastCar: '', ticks: 0 };
        states.set(id, state);
      }
      const carName = String(vehicle.name || '').trim();
      if (state.lastCar && state.lastCar !== carName) {
        state.lastDmAt = 0;
        state.ticks = 0;
      }
      state.lastCar = carName;
      state.ticks = (state.ticks || 0) + 1;
      if (state.ticks < POLICE_CAR_GRACE_TICKS) continue;

      const stillHere = async () => {
        const live = await snapshot();
        const match = live.players.find((entry) => playerKey(entry) === id);
        return Boolean(match && validUsername(match) && !match.enforcementExempt && disallowedPoliceCar(match, live.vehicles));
      };

      try {
        if (!state.lastPmAt || time - state.lastPmAt >= POLICE_CAR_REPEAT_MS) {
          const noticed = await send(`:pm ${player.username} ${POLICE_CAR_PM}`, { shouldExecute: stillHere });
          if (noticed === false) continue;
          state.lastPmAt = time;
          log({ action: 'PM', player, reason: `Police car ${carName}`, message: POLICE_CAR_PM });
        }
        if (!state.lastDmAt) {
          const discordId = resolveSheriffDiscordId(player, members, identities);
          if (discordId) {
            await dmDiscord(discordId, v2Card({
              title: 'Allowed Police cars',
              description: policeCarDmText(vehicle),
            }));
            state.lastDmAt = time;
            log({ action: 'DM', player, reason: `Police car ${carName}` });
          }
        }
      } catch (error) {
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

export function startPoliceCarCheck(client) {
  const key = client.config.erlcServerKey;
  const path = resolve('data', 'police-cars.json');
  const service = createPoliceCarMonitor({
    load: () => readJsonFile(path, [], { corruptFallback: false }),
    save: (states) => writeJsonFile(path, states),
    async snapshot() {
      if (!client.isReady()) throw new Error('Discord unavailable; skipping Police car checks.');
      const guild = await client.guilds.fetch(client.config.guildId);
      await ensureGuildMembers(guild, { allowStale: true });
      const identities = (await getIdentityCache()).byDiscord;
      const data = await fetchErlcServer(key);
      if (!Array.isArray(data.Players) && !Array.isArray(data.players)) {
        throw new Error('Player list unavailable; skipping Police car checks.');
      }
      const players = (data.Players || data.players || []).map(parseErlcPlayer).map((player) => ({
        ...player,
        enforcementExempt: hasEnforcementExemption(player, guild.members.cache, identities),
      }));
      const vehicles = (data.Vehicles || data.vehicles || []).map(parseErlcVehicle);
      return { players, vehicles, members: guild.members.cache, identities };
    },
    send: (command, options) => executeErlcCommand(key, command, options),
    async dmDiscord(discordId, payload) {
      const user = await client.users.fetch(discordId);
      await user.send(payload);
    },
    onLog: (event) => postProximityLog(client, {
      tag: 'PoliceCar',
      body: enforcementLogBody(event),
    }),
  });
  client.policeCarCheck = service;
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
  logger.info('Police car checks enabled on startup.');
  return () => { stopped = true; clearTimeout(timer); };
}
