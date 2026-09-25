import { resolve } from 'node:path';
import { executeErlcCommand, fetchErlcServer, parseErlcPlayer } from './erlc.js';
import { logger } from './logger.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

export const WEATHER_PROTECTED_USERNAME = 'notj3dah';
export const WEATHER_LOG_CHANNEL = '1549178818814812211';
export const WEATHER_SPIN_MS = 10 * 60 * 1000;
export const WEATHER_TICK_MS = 5_000;

export const WEATHER_CHANCES = Object.freeze([
  Object.freeze({ id: 'clear', weight: 70, command: ':weather clear' }),
  Object.freeze({ id: 'rain', weight: 15, command: ':weather rain' }),
  Object.freeze({ id: 'fog', weight: 11, command: ':weather fog' }),
  Object.freeze({ id: 'thunderstorm', weight: 4, command: ':weather thunderstorm' }),
]);

export function weatherCommand(id) {
  const match = WEATHER_CHANCES.find((entry) => entry.id === id);
  return match?.command || ':weather clear';
}

export function weatherDisplayName(id) {
  if (id === 'clear') return 'Clear';
  if (id === 'rain') return 'Rain';
  if (id === 'fog') return 'Fog';
  if (id === 'thunderstorm') return 'Thunderstorms';
  return 'Unknown';
}

export function isWeatherProtectedPlayer(player, username = WEATHER_PROTECTED_USERNAME) {
  return String(player?.username || '').trim().toLowerCase() === String(username).trim().toLowerCase();
}

export function weatherProtectedIsOnline(players, username = WEATHER_PROTECTED_USERNAME) {
  return (Array.isArray(players) ? players : []).some((player) => isWeatherProtectedPlayer(player, username));
}

/** Weighted roll: Clear 70%, rain 15%, fog 11%, thunderstorms 4%. */
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
    clearLockedUntil: Number(stored?.clearLockedUntil) || 0,
    clearLockedBy: String(stored?.clearLockedBy || ''),
  };
}

export function createServerWeatherService({
  snapshot,
  send,
  load,
  save,
  now = Date.now,
  random = Math.random,
  onLog = () => {},
  onError = (error) => logger.error('Server weather failed', error),
} = {}) {
  let state = normalizeStore(null);
  let loaded = false;
  let running;

  const log = (event) => {
    void Promise.resolve().then(() => onLog(event)).catch((error) => logger.error('Weather log delivery failed', error));
  };

  async function persist() {
    await save(state);
  }

  async function ensure() {
    if (loaded) return state;
    state = normalizeStore(await load());
    loaded = true;
    return state;
  }

  async function applyWeather(id, { spin = false, reason = 'spin' } = {}) {
    const kind = WEATHER_CHANCES.some((entry) => entry.id === id) ? id : 'clear';
    const previous = state.currentWeather;
    const changed = previous !== kind;
    const command = weatherCommand(kind);
    await send(command);
    const time = now();
    state.currentWeather = kind;
    if (spin) {
      state.lastSpinAt = time;
      state.nextSpinAt = time + WEATHER_SPIN_MS;
    }
    await persist();
    log({
      action: reason,
      weather: kind,
      previous,
      changed,
      command,
      sent: true,
    });
    return kind;
  }

  async function cycle() {
    await ensure();
    const time = now();
    if (state.clearLockedUntil > time) {
      if (state.currentWeather !== 'clear') {
        await applyWeather('clear', { reason: 'manual-clear-lock' });
      }
      return state;
    }
    if (state.clearLockedUntil) {
      state.clearLockedUntil = 0;
      state.clearLockedBy = '';
      state.nextSpinAt = time;
      await persist();
    }
    const { players = [] } = await snapshot();
    const online = weatherProtectedIsOnline(players);
    const wasOnline = state.protectedOnline;
    state.protectedOnline = online;

    if (online) {
      const spinDue = !state.nextSpinAt || state.nextSpinAt <= time;
      if (spinDue) state.nextSpinAt = time + WEATHER_SPIN_MS;
      if (state.currentWeather !== 'clear') {
        logger.info(`Server weather: ${WEATHER_PROTECTED_USERNAME} is in-game; setting weather to clear.`);
        await applyWeather('clear', { reason: 'forced-clear' });
      } else {
        if (spinDue) {
          log({
            action: 'skipped',
            weather: 'clear',
            previous: state.currentWeather,
            changed: false,
            command: weatherCommand('clear'),
            sent: false,
          });
        }
        await persist();
      }
      return state;
    }

    if (!state.nextSpinAt) state.nextSpinAt = time;
    if (time >= state.nextSpinAt) {
      const picked = pickWeather(random);
      logger.info(`Server weather: spinning the wheel → ${picked}.`);
      await applyWeather(picked, { spin: true, reason: 'spin' });
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
    async lockClear(minutes, actorId = '') {
      await ensure();
      const duration = Math.trunc(Number(minutes) || 0);
      if (duration <= 0) throw new Error('Time must be greater than 0 minutes.');
      const time = now();
      state.clearLockedUntil = time + duration * 60_000;
      state.clearLockedBy = String(actorId || '');
      state.nextSpinAt = state.clearLockedUntil;
      await applyWeather('clear', { reason: 'manual-clear-lock' });
      return { until: state.clearLockedUntil, minutes: duration };
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
    onLog: (event) => postWeatherLog(client, event),
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
  logger.info(`Server weather enabled (10 minute wheel unless ${WEATHER_PROTECTED_USERNAME} is in-game).`);
  return () => { stopped = true; clearTimeout(timer); };
}

export function weatherLogPayload(event) {
  const weather = weatherDisplayName(event?.weather);
  const previous = event?.previous ? weatherDisplayName(event.previous) : 'Unknown';
  const changed = event?.changed ? 'changed' : 'unchanged';
  const command = event?.command || weatherCommand(event?.weather);
  let description;
  if (event?.action === 'manual-clear-lock') {
    description = 'An administrator locked the server weather to **Clear**.';
  } else if (event?.action === 'forced-clear') {
    description = `Forced **Clear** because **${WEATHER_PROTECTED_USERNAME}** is in-game.`;
  } else if (event?.action === 'skipped') {
    description = `Skipped the wheel because **${WEATHER_PROTECTED_USERNAME}** is in-game. Weather stays **${weather}**.`;
  } else {
    description = `Wheel landed on **${weather}** (${changed}).`;
  }
  return {
    allowedMentions: { parse: [] },
    embeds: [{
      title: 'Server Weather',
      description,
      color: event?.changed ? 0x5b8def : 0x8a8f98,
      fields: [
        { name: 'Weather', value: weather, inline: true },
        { name: 'Previous', value: previous, inline: true },
        { name: 'In-game command', value: event?.sent === false ? 'not sent' : `\`${command}\``, inline: true },
      ],
      timestamp: new Date().toISOString(),
    }],
  };
}

export async function postWeatherLog(client, event) {
  const channel = await client.channels.fetch(WEATHER_LOG_CHANNEL);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') {
    throw new Error('Weather log channel unavailable.');
  }
  await channel.send(weatherLogPayload(event));
}
