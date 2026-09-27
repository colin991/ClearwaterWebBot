import { resolve } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

export const UPDATE_STATUS_PREFIX = '<:ERLC:1553560080937652285>';
export const UPDATE_COUNTDOWN_TICK_MS = 10_000;
const EASTERN_TIME_ZONE = 'America/New_York';

function easternParts(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function easternWallTimeToUtc(year, month, day, hour, minute) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
  let instant = wanted;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const actual = easternParts(new Date(instant));
    const shown = Date.UTC(Number(actual.year), Number(actual.month) - 1, Number(actual.day), Number(actual.hour), Number(actual.minute), Number(actual.second));
    instant += wanted - shown;
  }
  return instant;
}

export function parseEasternUpdateTime(input, now = Date.now()) {
  const text = String(input || '').trim().toLowerCase().replace(/\s+/g, '');
  const match = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(text);
  if (!match) throw new Error('Enter an Eastern time like `9:00pm`, `9pm`, or `21:00`.');
  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const meridiem = match[3] || '';
  if (minute > 59) throw new Error('Minutes must be between 00 and 59.');
  if (meridiem) {
    if (hour < 1 || hour > 12) throw new Error('Use an hour from 1 through 12 with AM or PM.');
    if (hour === 12) hour = 0;
    if (meridiem === 'pm') hour += 12;
  } else if (hour > 23) {
    throw new Error('Use a 24-hour time from 00:00 through 23:59.');
  }

  const current = easternParts(new Date(now));
  let target = easternWallTimeToUtc(Number(current.year), Number(current.month), Number(current.day), hour, minute);
  if (target <= now) {
    const tomorrow = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) + 1));
    target = easternWallTimeToUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate(), hour, minute);
  }
  return target;
}

export function formatUpdateCountdown(milliseconds) {
  let seconds = Math.max(0, Math.ceil(Number(milliseconds || 0) / 1000));
  const days = Math.floor(seconds / 86_400); seconds %= 86_400;
  const hours = Math.floor(seconds / 3_600); seconds %= 3_600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  const parts = [];
  if (days) parts.push(`${days} Day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} Hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} Minute${minutes === 1 ? '' : 's'}`);
  parts.push(`${seconds} Second${seconds === 1 ? '' : 's'}`);
  return parts.join(' ');
}

export function updateCountdownStatus(endsAt, now = Date.now()) {
  if (Number(endsAt) <= now) return `**${UPDATE_STATUS_PREFIX} Update OUT!**`;
  return `**${UPDATE_STATUS_PREFIX} Update In:** ${formatUpdateCountdown(Number(endsAt) - now)}`;
}

function normalizeTimers(value) {
  const rows = Array.isArray(value?.timers) ? value.timers : [];
  return rows.filter((row) => row?.channelId && Number(row.endsAt) > 0).map((row) => ({
    guildId: String(row.guildId || ''),
    channelId: String(row.channelId),
    endsAt: Number(row.endsAt),
    createdBy: String(row.createdBy || ''),
  }));
}

export function createUpdateCountdownService({ client, load, save, now = Date.now } = {}) {
  let timers = [];
  let loaded = false;
  let running = null;
  const lastStatuses = new Map();

  async function ensureLoaded() {
    if (loaded) return;
    timers = normalizeTimers(await load());
    loaded = true;
  }

  async function setVoiceStatus(channelId, status) {
    await client.rest.put(`/channels/${channelId}/voice-status`, { body: { status } });
    lastStatuses.set(String(channelId), status);
  }

  async function cycle() {
    await ensureLoaded();
    const time = now();
    let changed = false;
    for (const timer of [...timers]) {
      const status = updateCountdownStatus(timer.endsAt, time);
      if (lastStatuses.get(timer.channelId) !== status) await setVoiceStatus(timer.channelId, status);
      if (timer.endsAt <= time) {
        timers = timers.filter((row) => row.channelId !== timer.channelId);
        changed = true;
      }
    }
    if (changed) await save({ timers });
    return timers;
  }

  return {
    get timers() { return [...timers]; },
    tick() {
      if (!running) running = cycle().finally(() => { running = null; });
      return running;
    },
    async setCountdown({ guildId, channelId, endsAt, createdBy }) {
      await ensureLoaded();
      const row = { guildId: String(guildId || ''), channelId: String(channelId), endsAt: Number(endsAt), createdBy: String(createdBy || '') };
      timers = timers.filter((timer) => timer.channelId !== row.channelId);
      timers.push(row);
      await save({ timers });
      await setVoiceStatus(row.channelId, updateCountdownStatus(row.endsAt, now()));
      return row;
    },
  };
}

export function startUpdateCountdown(client) {
  const path = resolve('data', 'update-countdowns.json');
  const service = createUpdateCountdownService({
    client,
    load: () => readJsonFile(path, { timers: [] }, { corruptFallback: false }),
    save: (value) => writeJsonFile(path, value),
  });
  client.updateCountdown = service;
  let stopped = false;
  let timer;
  const run = async () => {
    await service.tick().catch((error) => logger.error('Update countdown failed', error));
    if (!stopped) {
      timer = setTimeout(run, UPDATE_COUNTDOWN_TICK_MS);
      timer.unref?.();
    }
  };
  void run();
  logger.info('Voice-channel update countdown service enabled.');
  return () => { stopped = true; clearTimeout(timer); };
}
