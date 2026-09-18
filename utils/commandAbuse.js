import { fetchErlcServer, parseErlcCommandLog } from './erlc.js';
import { logger } from './logger.js';

export const COMMAND_ABUSE_CHANNEL = '1550330878360813618';
export const COMMAND_ABUSE_MASS = /^(?:heal|bring|bing|tp|teleport|kick|ban)\s+(?:all|everyone|others)\b/i;

export function normalizeErlcCommand(command) {
  return String(command || '').trim().replace(/^:+/, '').replace(/\s+/g, ' ').trim();
}

export function isCommandAbuse(command) {
  return COMMAND_ABUSE_MASS.test(normalizeErlcCommand(command));
}

export function commandAbuseKey(entry) {
  return `${entry.at || 0}:${entry.username || ''}:${entry.command || ''}`;
}

export function commandAbuseAlertText(entry) {
  const who = entry.username || 'Unknown player';
  const id = entry.robloxId ? ` (${entry.robloxId})` : '';
  const command = entry.command || 'unknown command';
  return `@here Command abuse detected: **${who}**${id} ran \`${command}\``;
}

export function createCommandAbuseMonitor({
  snapshot,
  alert,
  now = Date.now,
  onError = (error) => logger.error('Command-abuse detection failed', error),
} = {}) {
  const seen = new Set();
  let initialized = false;
  let running;

  async function cycle() {
    const logs = await snapshot();
    const list = (Array.isArray(logs) ? logs : []).map((entry) => (
      entry?.command != null || entry?.username != null ? entry : parseErlcCommandLog(entry)
    ));
    if (!initialized) {
      for (const entry of list) seen.add(commandAbuseKey(entry));
      initialized = true;
      return;
    }
    const visible = new Set();
    for (const entry of list) {
      const id = commandAbuseKey(entry);
      visible.add(id);
      if (seen.has(id) || !isCommandAbuse(entry.command)) continue;
      seen.add(id);
      try {
        await alert(entry, now());
      } catch (error) {
        seen.delete(id);
        onError(error);
        break;
      }
    }
    for (const id of seen) if (!visible.has(id)) seen.delete(id);
  }

  return {
    tick() {
      if (!running) running = cycle().catch(onError).finally(() => { running = null; });
      return running;
    },
  };
}

export function startCommandAbuse(client) {
  const monitor = createCommandAbuseMonitor({
    async snapshot() {
      const server = await fetchErlcServer(client.config.erlcServerKey);
      return server.CommandLogs || server.commandLogs || [];
    },
    async alert(entry) {
      if (!client.isReady()) throw new Error('Discord unavailable; skipping command-abuse alert.');
      const channel = await client.channels.fetch(COMMAND_ABUSE_CHANNEL);
      if (!channel?.isTextBased() || typeof channel.send !== 'function') {
        throw new Error('Command-abuse alert channel unavailable.');
      }
      await channel.send({
        content: commandAbuseAlertText(entry),
        allowedMentions: { parse: ['everyone'] },
      });
    },
  });
  let stopped = false;
  let timer;
  const run = async () => {
    await monitor.tick();
    if (!stopped) {
      timer = setTimeout(run, 5000);
      timer.unref();
    }
  };
  void run();
  logger.info('Command-abuse detection enabled on startup.');
  return () => { stopped = true; clearTimeout(timer); };
}
