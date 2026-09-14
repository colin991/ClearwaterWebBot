import { fetchErlcServer, parseErlcPlayer, executeErlcCommand } from './erlc.js';
import { logger } from './logger.js';

export const SHERIFF_LIMIT = 23;
export const SHERIFF_FULL_MESSAGE = 'The Sheriff team is full (23 players maximum). Please choose another team and try again when a spot opens.';
const isSheriff = p => String(p.team).trim().toLowerCase() === 'sheriff';
const key = p => p.robloxId || p.username;

export function createSheriffBalance({ snapshot, send, onError = e => logger.error('Sheriff team balance failed', e) }) {
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
      if (occupied < SHERIFF_LIMIT) occupied += 1;
      else pending.set(id, { player, wanted: false });
    }
    previous = new Set(current.keys());
    for (const [id, entry] of pending) {
      if (!/^[a-zA-Z0-9_]{3,20}$/.test(entry.player.username)) { pending.delete(id); continue; }
      try {
        if (!entry.wanted) {
          const applied = await send(':wanted ' + entry.player.username, {
            shouldExecute: async () => {
              const fresh = await snapshot();
              return fresh.filter(isSheriff).length > SHERIFF_LIMIT && fresh.some(p => key(p) === id && isSheriff(p));
            },
          });
          if (applied === false) { pending.delete(id); continue; }
          entry.wanted = true;
        }
        await send(':pm ' + entry.player.username + ' ' + SHERIFF_FULL_MESSAGE, {
          shouldExecute: async () => (await snapshot()).some(p => key(p) === id),
        });
        pending.delete(id);
      } catch (error) { onError(error); }
    }
  }
  return {
    tick() {
      if (!running) running = cycle().catch(onError).finally(() => { running = null; });
      return running;
    },
  };
}

export function startSheriffBalance(client) {
  const key = client.config.erlcServerKey;
  const service = createSheriffBalance({
    snapshot: async () => {
      const data = await fetchErlcServer(key);
      if (!Array.isArray(data.Players)) throw new Error('Player list unavailable; skipping Sheriff balance.');
      return data.Players.map(parseErlcPlayer);
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
