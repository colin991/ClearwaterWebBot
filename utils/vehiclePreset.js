import { resolve } from 'node:path';
import {
  executeErlcCommand,
  fetchErlcServer,
  isEmergencyServiceTeam,
  parseErlcPlayer,
  parseErlcVehicle,
} from './erlc.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import { hasEnforcementExemption } from './enforcementExemptions.js';
import { getIdentityCache } from './identityStore.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { enforcementLogBody, postProximityLog } from './vcActionLog.js';

export const VEHICLE_PRESET_WARN_PM = 'Please use a server saved vehicle preset.';
export const VEHICLE_PRESET_REPEAT_PM = 'You still are not using a server saved vehicle preset.';
export const VEHICLE_PRESET_GRACE_TICKS = 2;
export const VEHICLE_PRESET_REPEAT_MS = 90 * 1000;

const validUsername = (player) => /^[a-zA-Z0-9_]{3,20}$/.test(String(player?.username || ''));
const playerKey = (player) => player?.robloxId || player?.username;

const STOCK_TEXTURES = new Set([
  '',
  'standard',
  'default',
  'none',
  'n/a',
  'na',
  'custom',
  'stock',
  'original',
  'blank',
  'solid',
  'color',
  'colour',
]);

const COLOR_WORDS = new Set(`
  black white grey gray red blue green yellow orange purple pink brown gold silver
  nougat violet cyan magenta lime maroon navy teal beige tan ivory bronze copper
  rust olive mint peach salmon lavender indigo crimson scarlet amber khaki charcoal
  sand stone brick moss forest sky steel gun slime lemon bronze copper rust
  institutional yeller yellerish beige mauve fuchsia rose wine burgundy cobalt
  aqua turquoise seafoam coral peach camo camouflage chrome nickel pewter
`.trim().split(/\s+/));

const COLOR_MODIFIERS = new Set(`
  really bright medium med dark light lig pastel cool neon deep hot new earth storm
  institutional sand transparent tr flu fluorescent yellowish bluish reddish
  greenish pale royal super metallic metalic medi lg
`.trim().split(/\s+/));

export function normalizeTexture(value) {
  return String(value || '').trim().toLowerCase().replace(/[_/]+/g, ' ').replace(/\s+/g, ' ');
}

export function isUtilityVehicle(vehicle) {
  return /\b(atv|quad|bike|bicycle|moped|scooter|segway|golf\s*cart|lawn\s*mower|mower|forklift|go-?kart|dirt\s*bike|hoverboard)\b/i
    .test(String(vehicle?.name || ''));
}

export function isColorLikeTexture(value) {
  const texture = normalizeTexture(value);
  if (STOCK_TEXTURES.has(texture)) return true;
  const words = texture.replace(/[().]/g, '').split(/[\s-]+/).filter(Boolean);
  if (!words.length) return true;
  return words.every((word) => COLOR_WORDS.has(word) || COLOR_MODIFIERS.has(word));
}

/** True when Texture looks like a named server livery, not a stock/custom paint. */
export function usesServerSavedPreset(vehicle) {
  const texture = String(vehicle?.texture || '').trim();
  const color = String(vehicle?.colorName || '').trim();
  if (!texture || isColorLikeTexture(texture)) return false;
  if (color && normalizeTexture(texture) === normalizeTexture(color)) return false;
  return true;
}

export function vehicleStateKey(player, vehicle) {
  const owner = playerKey(player) || '';
  const name = String(vehicle?.name || '').trim().toLowerCase();
  const plate = String(vehicle?.plate || '').trim().toLowerCase();
  return `${owner}:${name}:${plate}`;
}

export function vehiclesForPlayer(player, vehicles) {
  const id = String(player?.robloxId || '');
  const name = String(player?.username || '').trim().toLowerCase();
  return (Array.isArray(vehicles) ? vehicles : []).filter((vehicle) => {
    if (id && String(vehicle?.ownerRobloxId || '') === id) return true;
    return name && String(vehicle?.ownerUsername || '').trim().toLowerCase() === name;
  });
}

export function needsServerSavedPreset(player, vehicles) {
  if (!isEmergencyServiceTeam(player?.team)) return null;
  const owned = vehiclesForPlayer(player, vehicles).filter((vehicle) => !isUtilityVehicle(vehicle));
  return owned.find((vehicle) => !usesServerSavedPreset(vehicle)) || null;
}

function persistable(states) {
  return [...states.entries()].map(([id, state]) => [id, {
    lastPmAt: Number(state?.lastPmAt) || 0,
    lastAction: state?.lastAction || null,
  }]);
}

export function createVehiclePresetMonitor({
  snapshot,
  send,
  load = async () => [],
  save = async () => {},
  now = Date.now,
  onError = (error) => logger.error('Vehicle preset checks failed', error),
  onLog = () => {},
} = {}) {
  const states = new Map();
  let loaded = false;
  let running;

  const log = (event) => {
    void Promise.resolve().then(() => onLog(event)).catch((error) => logger.error('Vehicle preset log failed', error));
  };

  async function apply(command, player, reason, shouldExecute) {
    const verb = String(command || '').trim().split(/\s+/)[0].toLowerCase();
    if (verb !== ':pm') return false;
    const result = await send(command, shouldExecute);
    if (result === false) return false;
    const message = command.replace(/^:pm\s+\S+\s+/i, '').slice(0, 160);
    log({ action: 'PM', player, reason, message, command });
    return result;
  }

  async function cycle() {
    if (!loaded) {
      for (const [id, state] of await load()) {
        states.set(id, {
          lastPmAt: Number(state?.lastPmAt) || 0,
          lastAction: state?.lastAction || null,
        });
      }
      loaded = true;
    }

    const { players, vehicles } = await snapshot();
    const online = new Set(players.map(playerKey).filter(Boolean));
    for (const id of [...states.keys()]) {
      if (!online.has(id) && !String(id).includes(':')) states.delete(id);
    }

    const liveKeys = new Set();
    const time = now();
    for (const player of players) {
      if (!validUsername(player) || player.enforcementExempt) continue;
      const id = playerKey(player);
      if (!id) continue;
      const vehicle = needsServerSavedPreset(player, vehicles);
      if (!vehicle) {
        for (const key of [...states.keys()]) {
          if (key === id || key.startsWith(`${id}:`)) states.delete(key);
        }
        continue;
      }

      const key = vehicleStateKey(player, vehicle);
      liveKeys.add(key);
      let state = states.get(key);
      if (!state) {
        state = { lastPmAt: 0, lastAction: null, ticks: 0 };
        states.set(key, state);
      }
      state.ticks = (state.ticks || 0) + 1;
      if (state.ticks < VEHICLE_PRESET_GRACE_TICKS) continue;
      if (state.lastPmAt && time - state.lastPmAt < VEHICLE_PRESET_REPEAT_MS) continue;

      const stillHere = async () => {
        const live = await snapshot();
        const match = live.players.find((entry) => playerKey(entry) === id);
        return Boolean(match && validUsername(match) && !match.enforcementExempt && needsServerSavedPreset(match, live.vehicles));
      };

      const reason = `${player.team} ${vehicle.name || 'vehicle'} · ${vehicle.texture || vehicle.colorName || 'no preset'}`;
      const repeat = state.lastAction === 'warn';
      const message = repeat ? VEHICLE_PRESET_REPEAT_PM : VEHICLE_PRESET_WARN_PM;
      try {
        const noticed = await apply(`:pm ${player.username} ${message}`, player, reason, stillHere);
        if (noticed === false) continue;
        state.lastAction = repeat ? 'repeat' : 'warn';
        state.lastPmAt = time;
      } catch (error) {
        onError(error);
      }
    }

    for (const key of [...states.keys()]) {
      if (key.includes(':') && !liveKeys.has(key)) states.delete(key);
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

export function startVehiclePresetCheck(client) {
  const key = client.config.erlcServerKey;
  const path = resolve('data', 'vehicle-presets.json');
  const service = createVehiclePresetMonitor({
    load: () => readJsonFile(path, [], { corruptFallback: false }),
    save: (states) => writeJsonFile(path, states),
    async snapshot() {
      if (!client.isReady()) throw new Error('Discord unavailable; skipping vehicle preset checks.');
      const guild = await client.guilds.fetch(client.config.guildId);
      await ensureGuildMembers(guild, { allowStale: true });
      const identities = (await getIdentityCache()).byDiscord;
      const data = await fetchErlcServer(key);
      if (!Array.isArray(data.Players) && !Array.isArray(data.players)) {
        throw new Error('Player list unavailable; skipping vehicle preset checks.');
      }
      const players = (data.Players || data.players || []).map(parseErlcPlayer).map((player) => ({
        ...player,
        enforcementExempt: hasEnforcementExemption(player, guild.members.cache, identities),
      }));
      const vehicles = (data.Vehicles || data.vehicles || []).map(parseErlcVehicle);
      return { players, vehicles };
    },
    send: (command, shouldExecute) => executeErlcCommand(key, command, { shouldExecute }),
    onLog: (event) => postProximityLog(client, {
      tag: 'Preset',
      body: enforcementLogBody(event),
    }),
  });
  client.vehiclePresetCheck = service;
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
  logger.info('Vehicle preset checks enabled on startup.');
  return () => { stopped = true; clearTimeout(timer); };
}
