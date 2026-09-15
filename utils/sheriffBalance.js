import { fetchErlcServer, parseErlcPlayer, executeErlcCommand } from './erlc.js';
import { logger } from './logger.js';
import { ensureGuildMembers } from './guildMemberSnapshot.js';
import { hasEnforcementExemption } from './enforcementExemptions.js';
import { getIdentityCache } from './identityStore.js';
import { matchingMembers } from './vcChecks.js';

export const SHERIFF_LIMIT = 23;
export const SHERIFF_LOG_CHANNEL = '1549178818814812211';
export const SHERIFF_FULL_MESSAGE = 'The Sheriff team is full (23 players maximum). Please choose another team and try again when a spot opens.';
export const SHERIFF_FULL_DISCORD_MESSAGE = 'You were wanted because the Sheriff team is full (23 players maximum). Please choose another team and try again when a spot opens.';

/** Linked Roblox ID first; otherwise a single unambiguous Discord name match. */
export function resolveSheriffDiscordId(player, members, identities = {}) {
  const robloxId = String(player?.robloxId || '');
  if (robloxId) {
    for (const [discordId, identity] of Object.entries(identities)) {
      if (String(identity?.robloxId || '') === robloxId && /^\d{16,22}$/.test(String(discordId))) return String(discordId);
    }
  }
  const matches = matchingMembers(members || new Map(), player?.username);
  return matches.length === 1 ? String(matches[0].id) : null;
}
const isSheriff = p => String(p.team).trim().toLowerCase() === 'sheriff';
const key = p => p.robloxId || p.username;

/** Wait for ER:LC 429 retry-after; use 60s exponential backoff for other failures. */
export function sheriffRetryDelaySeconds(error, failures = 1) {
  const apiRetry = Number(error?.retryAfter);
  if (Number(error?.status) === 429 && Number.isFinite(apiRetry) && apiRetry > 0) {
    return Math.min(60, Math.max(5, Math.ceil(apiRetry)));
  }
  return Math.min(300, 60 * 2 ** Math.min(Math.max(failures, 1) - 1, 3));
}

function isTransientLookupError(error) {
  const message = String(error?.message || error || '');
  return Number(error?.status) === 429
    || /rate limited|opcode\s*8|limiting member lookups|cooling down|Discord unavailable/i.test(message);
}

/**
 * Choose who to :wanted when Sheriff occupancy is over the cap.
 * Keep incumbents first, then the earliest new arrivals, up to the limit.
 * Everyone else who is not exempt is queued for :wanted.
 */
export function sheriffPlayersToEnforce(sheriffs, {
  limit = SHERIFF_LIMIT,
  pendingIds = new Set(),
  previous = null,
} = {}) {
  const list = (Array.isArray(sheriffs) ? sheriffs : []).filter(isSheriff);
  if (list.length <= limit) return [];
  const previousSet = previous || new Set();
  const incumbents = list.filter((player) => previousSet.has(key(player)));
  const newcomers = list.filter((player) => !previousSet.has(key(player)));
  const keep = [];
  for (const player of [...incumbents, ...newcomers]) {
    if (keep.length < limit) keep.push(player);
  }
  const keepIds = new Set(keep.map(key));
  return list.filter((player) => {
    const id = key(player);
    return id
      && !keepIds.has(id)
      && !player.enforcementExempt
      && !pendingIds.has(id)
      && /^[a-zA-Z0-9_]{3,20}$/.test(String(player.username || ''));
  });
}

export function safeBalanceError(error) {
  let message = String(error?.message || 'Unknown error');
  for (const [name, value] of Object.entries(process.env)) {
    if (/TOKEN|SECRET|KEY|PASSWORD/i.test(name) && value?.length >= 6) message = message.split(value).join('[redacted]');
  }
  return message.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 700);
}

export function createSheriffBalance({ snapshot, send, notifyDiscord, now = Date.now, onLog = () => {}, onError = e => logger.error('Sheriff team balance failed', e) }) {
  const log = event => {
    // Discord delivery must not delay enforcement or cause a game command to repeat.
    void Promise.resolve().then(() => onLog(event)).catch(e => logger.error('Sheriff log delivery failed', e));
  };
  let previous = null;
  let running;
  const pending = new Map();
  const enforced = new Set();
  async function cycle() {
    const players = await snapshot();
    const current = new Map(players.filter(isSheriff).map(p => [key(p), p]));
    for (const id of enforced) {
      if (!current.has(id)) enforced.delete(id);
    }
    for (const [id, entry] of pending) {
      if (!current.has(id) && !entry.wanted) pending.delete(id);
    }
    for (const player of sheriffPlayersToEnforce([...current.values()], {
      pendingIds: new Set([...pending.keys(), ...enforced]),
      previous,
    })) {
      pending.set(key(player), { player, wanted: false });
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
              try {
                const fresh = await snapshot();
                stage = 'Wanted command';
                return fresh.filter(isSheriff).length > SHERIFF_LIMIT
                  && fresh.some(p => key(p) === id && isSheriff(p) && !p.enforcementExempt);
              } catch (error) {
                if (!isTransientLookupError(error)) throw error;
                stage = 'Wanted command';
                return current.size > SHERIFF_LIMIT && current.has(id) && !entry.player.enforcementExempt;
              }
            },
          });
          if (applied === false) {
            log({ action: 'Enforcement cancelled after live recheck', player: entry.player, count: current.size });
            pending.delete(id); continue;
          }
          entry.wanted = true;
          entry.failures = 0;
          enforced.add(id);
          log({ action: 'Wanted command applied: Sheriff team full', player: entry.player, count: current.size });
        }
        if (typeof notifyDiscord === 'function' && !entry.discordNotified) {
          stage = 'Discord notice';
          try {
            const sent = await notifyDiscord(entry.player);
            entry.discordNotified = true;
            log({
              action: sent === false
                ? 'Discord notice skipped; no linked Discord user'
                : 'Discord notice sent',
              player: entry.player,
              count: current.size,
            });
          } catch (error) {
            entry.discordNotified = true;
            log({
              action: 'Discord notice failed',
              player: entry.player,
              count: current.size,
              detail: safeBalanceError(error),
              status: error?.status,
            });
          }
        }
        stage = 'Private notice';
        const notified = await send(':pm ' + entry.player.username + ' ' + SHERIFF_FULL_MESSAGE, {
          shouldExecute: async () => {
            stage = 'Live roster/role recheck before private notice';
            try {
              const fresh = await snapshot();
              stage = 'Private notice';
              // :wanted may already have removed them from Sheriff — still PM if they are in the server.
              return fresh.some(p => key(p) === id);
            } catch (error) {
              if (!isTransientLookupError(error)) throw error;
              stage = 'Private notice';
              return true;
            }
          },
        });
        if (notified === false) {
          log({ action: 'Private notice skipped; player left the server', player: entry.player, count: current.size });
          pending.delete(id);
          continue;
        }
        log({ action: 'Team-full private notice sent', player: entry.player, count: current.size });
        pending.delete(id);
      } catch (error) {
        entry.failures = (entry.failures || 0) + 1;
        const retrySeconds = sheriffRetryDelaySeconds(error, entry.failures);
        entry.retryAt = now() + retrySeconds * 1000;
        log({ action: `${stage} failed; retry in ${retrySeconds}s`, player: entry.player, count: current.size,
          detail: safeBalanceError(error), status: error?.status });
        onError(error);
        break;
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
      await ensureGuildMembers(guild, { allowStale: true });
      const identities = (await getIdentityCache()).byDiscord;
      const data = await fetchErlcServer(key);
      if (!Array.isArray(data.Players)) throw new Error('Player list unavailable; skipping Sheriff balance.');
      return data.Players.map(parseErlcPlayer).map(player => ({ ...player,
        enforcementExempt: hasEnforcementExemption(player, guild.members.cache, identities),
      }));
    },
    send: (command, options) => executeErlcCommand(key, command, options),
    async notifyDiscord(player) {
      if (!client.isReady()) return false;
      const guild = await client.guilds.fetch(client.config.guildId);
      const identities = (await getIdentityCache()).byDiscord;
      const discordId = resolveSheriffDiscordId(player, guild.members.cache, identities);
      if (!discordId) return false;
      const user = await client.users.fetch(discordId);
      await user.send({ content: SHERIFF_FULL_DISCORD_MESSAGE, allowedMentions: { parse: [] } });
      return true;
    },
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
