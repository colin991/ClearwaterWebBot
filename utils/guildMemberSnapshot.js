// Discord opcode 8 (full member list) is shared across the bot.
// One gateway request per guild at most every 20 seconds; everyone else uses cache.
export const MEMBER_FETCH_INTERVAL_MS = 20_000;

export function createMemberSnapshotLoader({ now = Date.now, ttlMs = MEMBER_FETCH_INTERVAL_MS } = {}) {
  const states = new WeakMap();
  return async function ensureGuildMembers(guild, { allowStale = true } = {}) {
    let state = states.get(guild);
    if (!state) {
      state = { fetchedAt: null, retryAt: 0, pending: null };
      states.set(guild, state);
    }
    const cache = guild.members.cache;
    if (state.fetchedAt !== null && now() - state.fetchedAt < ttlMs) return cache;
    if (now() < state.retryAt) {
      if (allowStale) return cache;
      throw new Error(`Discord member list is cooling down. Please try again in ${Math.ceil((state.retryAt - now()) / 1000)} seconds.`);
    }
    if (state.pending) {
      try {
        return await state.pending;
      } catch (error) {
        if (allowStale) return cache;
        throw error;
      }
    }

    state.pending = Promise.resolve().then(() => guild.members.fetch()).then(() => {
      state.fetchedAt = now();
      state.retryAt = 0;
      return guild.members.cache;
    }).catch((error) => {
      const reportedSeconds = Number(String(error?.message || '').match(/Retry after\s+([\d.]+)/i)?.[1]);
      const seconds = Math.max(ttlMs / 1000, Number.isFinite(reportedSeconds) ? reportedSeconds : 20);
      state.retryAt = now() + seconds * 1000;
      if (/rate.limit|opcode 8|cooling down/i.test(String(error?.message || ''))) {
        throw new Error(`Discord is temporarily limiting member lookups. Please try again in ${Math.ceil(seconds)} seconds.`);
      }
      throw error;
    }).finally(() => {
      state.pending = null;
    });

    try {
      return await state.pending;
    } catch (error) {
      if (allowStale) return cache;
      throw error;
    }
  };
}

export const ensureGuildMembers = createMemberSnapshotLoader();

export function isDiscordRosterReady(guild) {
  const cache = guild?.members?.cache;
  if (!cache?.size) return false;
  const humans = [...cache.values()].filter((member) => !member.user?.bot).length;
  const expected = Number(guild.memberCount) || 0;
  if (humans <= 0) return false;
  if (!expected || expected <= humans) return true;
  // Never treat a 30% cache as complete — missing nicknames would look like
  // "not in Discord" and get jailed/PMed even when their nick is their Roblox user.
  return humans >= Math.min(expected, Math.max(Math.ceil(expected * 0.9), expected - 25));
}
