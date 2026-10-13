/**
 * Radio auto-moderation: someone who keeps talking over dispatch (a !C name) gets flagged for
 * staff. Three times inside 10 minutes is a flag; after a flag they start from zero.
 */
export const TALK_OVER_LIMIT = 3;
export const TALK_OVER_WINDOW_MS = 10 * 60 * 1000;

export function createTalkOverWatch({ limit = TALK_OVER_LIMIT, windowMs = TALK_OVER_WINDOW_MS, now = Date.now } = {}) {
  const hits = new Map();
  return {
    /** Counts one talk-over; returns how many in the window when it reaches the limit (time to flag), else 0. */
    hit(userId) {
      const at = now();
      const id = String(userId);
      const recent = (hits.get(id) || []).filter((time) => at - time < windowMs);
      recent.push(at);
      if (recent.length >= limit) {
        hits.delete(id);
        return recent.length;
      }
      hits.set(id, recent);
      return 0;
    },
  };
}

/** Members sitting in the scene / traffic stop voice channels, with when each joined. */
export function createSceneClock({ now = Date.now } = {}) {
  const since = new Map(); // `${channelId}:${memberId}` -> joined at
  return {
    /** rooms: [{ id, name, members: [{ id, name }] }] -> [{ id, name, channel, since }], longest first. */
    update(rooms) {
      const at = now();
      const seen = new Set();
      const list = [];
      for (const room of rooms || []) {
        for (const member of room.members || []) {
          const key = `${room.id}:${member.id}`;
          seen.add(key);
          if (!since.has(key)) since.set(key, at);
          list.push({ id: String(member.id), name: String(member.name || 'Member').slice(0, 40), channel: String(room.name || 'Scene').slice(0, 40), since: since.get(key) });
        }
      }
      for (const key of [...since.keys()]) if (!seen.has(key)) since.delete(key);
      return list.sort((a, b) => a.since - b.since);
    },
  };
}

/** Scene voice channels are found by name: "Scene" or "Traffic Stop" anywhere in it, any case. */
export function isSceneChannelName(name) {
  return /scene|traffic[\s_-]*stop/i.test(String(name || ''));
}

/** Every voice channel in the server whose name marks it as a scene or traffic stop. */
export function findSceneChannels(channels, guildId = '') {
  const found = new Map();
  for (const channel of channels || []) {
    if (!channel?.id || found.has(channel.id) || !channel.isVoiceBased?.()) continue;
    if (guildId && channel.guild?.id && channel.guild.id !== guildId) continue;
    if (isSceneChannelName(channel.name)) found.set(channel.id, channel);
  }
  return [...found.values()].slice(0, 50);
}
