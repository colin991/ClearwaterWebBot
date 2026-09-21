import { resolve } from 'node:path';
import { executeErlcCommand, fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { logger } from './logger.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

export const WEATHER_PROTECTED_USERNAME = 'notj3dah';
export const WEATHER_SPIN_MS = 30 * 60 * 1000;
export const WEATHER_TICK_MS = 5_000;

export const WEATHER_CHANCES = Object.freeze([
  Object.freeze({ id: 'clear', weight: 65, command: ':weather clear' }),
  Object.freeze({ id: 'rain', weight: 15, command: ':weather rain' }),
  Object.freeze({ id: 'fog', weight: 11, command: ':weather fog' }),
  Object.freeze({ id: 'thunderstorm', weight: 9, command: ':weather thunderstorm' }),
]);

export function weatherCommand(id) {
  const match = WEATHER_CHANCES.find((entry) => entry.id === id);
  return match?.command || ':weather clear';
}

export function isWeatherProtectedPlayer(player, username = WEATHER_PROTECTED_USERNAME) {
  return String(player?.username || '').trim().toLowerCase() === String(username).trim().toLowerCase();
}

export function weatherProtectedIsOnline(players, username = WEATHER_PROTECTED_USERNAME) {
  return (Array.isArray(players) ? players : []).some((player) => isWeatherProtectedPlayer(player, username));
}

/** Weighted roll: Clear 65%, rain 15%, fog 11%, thunderstorms 9%. */
export function pickWeather(random = Math.random) {
  const total = WEATHER_CHANCES.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Number(random()) * total;
  if (!Number.isFinite(roll) || roll < 0) roll = 0;
  for (const entry of WEATHER_CHANCES) {
    if (roll < entry.weight) return entry.id;
    roll -= entry.weight;
  }
  return 'clear';
}

function normalizeStore(stored) {
  const current = String(stored?.currentWeather || '').trim().toLowerCase();
  const known = WEATHER_CHANCES.some((entry) => entry.id === current);
  return {
    currentWeather: known ? current : null,
    nextSpinAt: Number(stored?.nextSpinAt) || 0,
    lastSpinAt: Number(stored?.lastSpinAt) || 0,
    protectedOnline: Boolean(stored?.protectedOnline),
  };
}

export function createServerWeatherService({
  snapshot,
  send,
  load,
  save,
  now = Date.now,
  random = Math.random,
  onError = (error) => logger.error('Server weather failed', error),
} = {}) {
  let state = normalizeStore(null);
  let loaded = false;
  let running;

  async function persist() {
    await save(state);
  }

  async function ensure() {
    if (loaded) return state;
    state = normalizeStore(await load());
    loaded = true;
    return state;
  }

  async function applyWeather(id, { spin = false } = {}) {
    const kind = WEATHER_CHANCES.some((entry) => entry.id === id) ? id : 'clear';
    await send(weatherCommand(kind));
    const time = now();
    state.currentWeather = kind;
    if (spin) {
      state.lastSpinAt = time;
      state.nextSpinAt = time + WEATHER_SPIN_MS;
    }
    await persist();
    return kind;
  }

  async function cycle() {
    await ensure();
    const { players = [] } = await snapshot();
    const online = weatherProtectedIsOnline(players);
    const time = now();
    const wasOnline = state.protectedOnline;
    state.protectedOnline = online;

    if (online) {
      if (!state.nextSpinAt || state.nextSpinAt <= time) {
        state.nextSpinAt = time + WEATHER_SPIN_MS;
      }
      if (state.currentWeather !== 'clear') {
        logger.info(`Server weather: ${WEATHER_PROTECTED_USERNAME} is in-game; setting weather to clear.`);
        await applyWeather('clear');
      } else {
        await persist();
      }
      return state;
    }

    if (!state.nextSpinAt) state.nextSpinAt = time;
    if (time >= state.nextSpinAt) {
      const picked = pickWeather(random);
      logger.info(`Server weather: spinning the wheel → ${picked}.`);
      await applyWeather(picked, { spin: true });
    } else if (wasOnline) {
      await persist();
    }
    return state;
  }

  return {
    get state() {
      return state;
    },
    tick() {
      if (!running) running = cycle().catch(onError).finally(() => { running = null; });
      return running;
    },
  };
}

export function startServerWeather(client) {
  const key = client.config.erlcServerKey;
  const path = resolve('data', 'server-weather.json');
  const service = createServerWeatherService({
    load: () => readJsonFile(path, {}, { corruptFallback: false }),
    save: (value) => writeJsonFile(path, value),
    async snapshot() {
      const data = await fetchErlcServer(key);
      if (!Array.isArray(data.Players) && !Array.isArray(data.players)) {
        throw new Error('Player list unavailable; skipping server weather.');
      }
      return { players: (data.Players || data.players || []).map(parseErlcPlayer) };
    },
    send: (command, options) => executeErlcCommand(key, command, options),
  });
  client.serverWeather = service;
  let stopped = false;
  let timer;
  const run = async () => {
    await service.tick();
    if (!stopped) {
      timer = setTimeout(run, WEATHER_TICK_MS);
      timer.unref();
    }
  };
  void run();
  logger.info(`Server weather enabled (30 minute wheel unless ${WEATHER_PROTECTED_USERNAME} is in-game).`);
  return () => { stopped = true; clearTimeout(timer); };
}
