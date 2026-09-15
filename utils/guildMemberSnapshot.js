// Discord opcode 8 requests share a gateway limit. Coalesce callers and only
// refresh after five minutes; member join/update/remove events keep cache live.
export function createMemberSnapshotLoader({ now = Date.now, ttlMs = 300000 } = {}) {
  const states = new WeakMap();
  return async function ensureGuildMembers(guild, { allowStale = false } = {}) {
    let state = states.get(guild);
    if (!state) { state = { fetchedAt: null, retryAt: 0, pending: null }; states.set(guild, state); }
    const hasRoster = state.fetchedAt !== null || guild.members.cache.size > 1;
    if (state.fetchedAt !== null && now() - state.fetchedAt < ttlMs) return guild.members.cache;
    if (state.pending) return state.pending;
    if (now() < state.retryAt) {
      if (allowStale && hasRoster) return guild.members.cache;
      throw new Error(`Discord member list is cooling down. Please try again in ${Math.ceil((state.retryAt - now()) / 1000)} seconds.`);
    }
    state.pending = Promise.resolve().then(() => guild.members.fetch()).then(() => {
      state.fetchedAt = now(); state.retryAt = 0;
      return guild.members.cache;
    }).catch(error => {
      const reportedSeconds = Number(String(error?.message || '').match(/Retry after\s+([\d.]+)/i)?.[1]);
      const seconds = Math.max(30, Number.isFinite(reportedSeconds) ? reportedSeconds : 60);
      state.retryAt = now() + seconds * 1000;
      if (/rate.limit|opcode 8/i.test(String(error?.message || ''))) {
        if (allowStale && (state.fetchedAt !== null || guild.members.cache.size > 1)) {
          return guild.members.cache;
        }
        throw new Error(`Discord is temporarily limiting member lookups. Please try -dc again in ${Math.ceil(seconds)} seconds.`);
      }
      throw error;
    }).finally(() => { state.pending = null; });
    return state.pending;
  };
}

export const ensureGuildMembers = createMemberSnapshotLoader();
