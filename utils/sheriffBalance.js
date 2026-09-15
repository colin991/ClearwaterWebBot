import { fetchErlcServer, parseErlcPlayer, executeErlcCommand } from './erlc.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import { hasEnforcementExemption } from './enforcementExemptions.js';
import { getIdentityCache } from './identityStore.js';

export const SHERIFF_LIMIT = 23;
export const SHERIFF_LOG_CHANNEL = '1549178818814812211';
export const SHERIFF_FULL_MESSAGE = 'The Sheriff team is full (23 players maximum). Please choose another team and try again when a spot opens.';
const isSheriff = p => String(p.team).trim().toLowerCase() === 'sheriff';
const key = p => p.robloxId || p.username;

export function safeBalanceError(error) {
  let message = String(error?.message || 'Unknown error');
  for (const [name, value] of Object.entries(process.env)) {
    if (/TOKEN|SECRET|KEY|PASSWORD/i.test(name) && value?.length >= 6) message = message.split(value).join('[redacted]');
  }
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 700);
}

export function createSheriffBalance({ snapshot, send, now = Date.now, onLog = () => {}, onError = e => logger.error('Sheriff team balance failed', e) }) {
  const log = event => {
    // Discord delivery must not delay enforcement or cause a game command to repeat.
    void Promise.resolve().then(() => onLog(event)).catch(e => logger.error('Sheriff log delivery failed', e));
  };
  let previous = null;
  let running;
  const pending = new Map();
  async function cycle() {
    const players = await snapshot();
    const current = new Map(players.filter(isSheriff).map(p => [key(p), p]));
    if (previous === null) { previous = new Set(current.keys()); return; }
    for (const [id, entry] of pending) {
      if (!current.has(id) && !entry.wanted) pending.delete(id);
    }
    // Retain incumbents; give remaining slots to newly observed arrivals in snapshot order.
    let occupied = [...current.keys()].filter(id => previous.has(id) && !pending.has(id)).length;
    for (const [id, player] of current) {
      if (previous.has(id) || pending.has(id)) continue;
      if (player.enforcementExempt) {
        if (current.size > SHERIFF_LIMIT) log({ action: 'Exemption applied', player, count: current.size });
        occupied += 1; continue;
      }
      if (occupied < SHERIFF_LIMIT) occupied += 1;
      else pending.set(id, { player, wanted: false });
    }
    previous = new Set(current.keys());
    for (const [id, entry] of pending) {
      if (entry.retryAt > now()) continue;
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(entry.player.username)) { pending.delete(id); continue; }
      let stage = entry.wanted ? 'Private notice' : 'Wanted command';
      try {
        if (!entry.wanted) {
          const applied = await send(':wanted ' + entry.player.username, {
            shouldExecute: async () => {
              stage = 'Live roster/role recheck before wanted command';
              const fresh = await snapshot();
              stage = 'Wanted command';
              return fresh.filter(isSheriff).length > SHERIFF_LIMIT && fresh.some(p => key(p) === id && isSheriff(p) && !p.enforcementExempt);
            },
          });
          if (applied === false) {
            log({ action: 'Enforcement cancelled after live recheck', player: entry.player, count: current.size });
            pending.delete(id); continue;
          }
          entry.wanted = true;
          entry.failures = 0;
          log({ action: 'Wanted command applied: Sheriff team full', player: entry.player, count: current.size });
        }
        stage = 'Private notice';
        const notified = await send(':pm ' + entry.player.username + ' ' + SHERIFF_FULL_MESSAGE, {
          shouldExecute: async () => {
            stage = 'Live roster/role recheck before private notice';
            const fresh = await snapshot();
            stage = 'Private notice';
            return fresh.some(p => key(p) === id && !p.enforcementExempt);
          },
        });
        log({ action: notified === false ? 'Private notice skipped after live recheck' : 'Team-full private notice sent', player: entry.player, count: current.size });
        pending.delete(id);
      } catch (error) {
        entry.failures = (entry.failures || 0) + 1;
        const retrySeconds = Math.max(Number(error?.retryAfter) || 0, Math.min(300, 60 * 2 ** Math.min(entry.failures - 1, 3)));
        entry.retryAt = now() + retrySeconds * 1000;
        log({ action: `${stage} failed; retry in ${retrySeconds}s`, player: entry.player, count: current.size,
          detail: safeBalanceError(error), status: error?.status });
        onError(error);
      }
    }
  }
  return {
    tick() {
      if (!running) running = cycle().catch(onError).finally(() => { running = null; });
      return running;
    },
  };
}

export async function postSheriffBalanceLog(client, event) {
  const channel = await client.channels.fetch(SHERIFF_LOG_CHANNEL);
  if (!channel?.isTextBased() || typeof channel.send !== 'function') throw new Error('Sheriff balance log channel unavailable.');
  await channel.send({
    allowedMentions: { parse: [] },
    embeds: [{
      title: 'Sheriff Team Balance',
      description: event.action,
      color: event.action.includes('failed') ? 0xe05555 : 0x84b9a4,
      fields: [
        { name: 'Roblox player', value: String(event.player.username || 'Unknown'), inline: true },
        { name: 'Roblox ID', value: String(event.player.robloxId || 'Unknown'), inline: true },
        { name: 'Observed Sheriff count / limit', value: `${event.count} / ${SHERIFF_LIMIT}`, inline: true },
        ...(event.detail ? [{ name: 'Failure reason', value: event.detail }] : []),
        ...(Number.isInteger(event.status) ? [{ name: 'HTTP status', value: String(event.status), inline: true }] : []),
      ],
      timestamp: new Date().toISOString(),
    }],
  });
}

export function startSheriffBalance(client) {
  const key = client.config.erlcServerKey;
  const service = createSheriffBalance({
    onLog: event => postSheriffBalanceLog(client, event),
    snapshot: async () => {
      if (!client.isReady()) throw new Error('Discord unavailable; skipping Sheriff balance.');
      const guild = await client.guilds.fetch(client.config.guildId);
      await ensureGuildMembers(guild);
      const identities = (await getIdentityCache()).byDiscord;
      const data = await fetchErlcServer(key);
      if (!Array.isArray(data.Players)) throw new Error('Player list unavailable; skipping Sheriff balance.');
      return data.Players.map(parseErlcPlayer).map(player => ({ ...player,
        enforcementExempt: hasEnforcementExemption(player, guild.members.cache, identities),
      }));
    },
    send: (command, options) => executeErlcCommand(key, command, options),
  });
  let stopped = false;
  let timer;
  const run = async () => {
    await service.tick();
    if (!stopped) { timer = setTimeout(run, 5000); timer.unref(); }
  };
  void run();
  logger.info('Sheriff team balance enabled: 23 players maximum.');
  return () => { stopped = true; clearTimeout(timer); };
}
