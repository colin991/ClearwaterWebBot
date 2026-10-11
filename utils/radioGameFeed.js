/**
 * Game data on the radio: nearest postal, street, and a speed and heading estimate for each
 * member on a radio, from the ER:LC player list. The ER:LC API only gives position (no speed or
 * heading), so both are worked out from how far the player moved between two updates.
 */

export const GAME_TICK_MS = 5_000;
/** Roblox studs per second to mph (1 stud is about 0.28 m). An estimate, not the car's speedometer. */
export const MPH_PER_STUD_PER_SECOND = 0.63;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
/** Roblox studs to miles (1 stud is about 0.28 m). */
const MILES_PER_STUD = 0.28 / 1609.34;
/** How long a radio stays damaged (very weak) after its member is downed. */
export const DOWNED_MS = 20_000;
/** Kill log entries older than this are history, not a fresh down. */
const KILL_FRESH_MS = 30_000;
/** Moving less than this between updates counts as standing still (GPS-style jitter). */
const STILL_STUDS = 6;

/** Compass heading for a move on the Liberty map, where north is -Z (the top of the map). */
export function headingFrom(dx, dz) {
  const degrees = (Math.atan2(dx, -dz) * 180) / Math.PI;
  return COMPASS[Math.round(((degrees + 360) % 360) / 45) % 8];
}

/**
 * Speed (mph) and heading from two samples ({ x, z, at }). Too short or too long a gap gives no
 * speed; standing still keeps the last heading.
 */
export function estimateMotion(previous, next) {
  if (!previous || !next) return { speed: null, heading: previous?.heading || '' };
  const seconds = (next.at - previous.at) / 1000;
  if (!(seconds >= 1 && seconds <= 30)) return { speed: null, heading: previous.heading || '' };
  const dx = next.x - previous.x;
  const dz = next.z - previous.z;
  const distance = Math.hypot(dx, dz);
  if (!Number.isFinite(distance)) return { speed: null, heading: previous.heading || '' };
  if (distance < STILL_STUDS) return { speed: 0, heading: previous.heading || '' };
  return {
    speed: Math.round((distance / seconds) * MPH_PER_STUD_PER_SECOND),
    heading: headingFrom(dx, dz),
  };
}

/**
 * The nearest other radio users in game to one member: [{ name, postal, miles }], closest first.
 * located: userId -> { x, z, postal }; names: userId -> name on the radio.
 */
const hasXz = (spot) => [spot?.x, spot?.z].every((value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)));

export function nearestUnits(userId, located, names, count = 3) {
  const me = located.get(userId);
  if (!hasXz(me)) return [];
  return [...located].filter(([id, spot]) => id !== userId && hasXz(spot))
    .map(([id, spot]) => ({ id, spot, studs: Math.hypot(Number(spot.x) - Number(me.x), Number(spot.z) - Number(me.z)) }))
    .sort((a, b) => a.studs - b.studs)
    .slice(0, count)
    .map(({ id, spot, studs }) => ({
      name: String(names.get(id) || 'Unit').slice(0, 32),
      postal: String(spot.postal || ''),
      miles: Math.round(studs * MILES_PER_STUD * 10) / 10,
    }));
}

/**
 * Radio damage: when a member on a radio shows up as killed in the ER:LC kill log, their radio
 * goes very weak for DOWNED_MS. update() returns the members who were just downed.
 */
export function createDamageTracker({ now = Date.now } = {}) {
  const until = new Map();
  const seen = new Set();
  return {
    /** kills: parsed kill log entries ({ username, robloxId, at }); located: userId -> { player }. */
    update(kills, located) {
      const at = now();
      const downed = [];
      const fresh = (kills || []).filter((kill) => kill && Number(kill.at) > at - KILL_FRESH_MS);
      for (const [userId, spot] of located) {
        const player = spot?.player;
        if (!player) continue;
        const name = String(player.username || '').toLowerCase();
        const kill = fresh.find((entry) => (player.robloxId && String(entry.robloxId) === String(player.robloxId))
          || (name && String(entry.username || '').toLowerCase() === name));
        if (!kill) continue;
        const key = `${kill.robloxId || kill.username}:${kill.at}`;
        if (seen.has(key)) continue;
        seen.add(key);
        until.set(userId, at + DOWNED_MS);
        downed.push(userId);
      }
      // Forget old kills so the set stays small.
      if (seen.size > 500) seen.clear();
      for (const [userId, end] of until) if (end <= at) until.delete(userId);
      return downed;
    },
    /** True while the member's radio is damaged. */
    isDamaged: (userId) => (until.get(String(userId)) || 0) > now(),
    /** When the next damaged radio recovers (ms timestamp), or 0. */
    nextEnd() {
      const ends = [...until.values()].filter((end) => end > now());
      return ends.length ? Math.min(...ends) : 0;
    },
  };
}

/**
 * Off-team check: a member on the police radio while on the Civilian team in game. Flags once
 * per stretch on that team, after two updates in a row so a quick team switch isn't flagged.
 */
export function createTeamWatch({ isOffTeam }) {
  const streak = new Map();
  return {
    /** Returns the members to flag now: [{ userId, team, player }]. */
    update(users, located) {
      const flags = [];
      const active = new Set(users.map((user) => user.userId));
      for (const id of [...streak.keys()]) if (!active.has(id)) streak.delete(id);
      for (const user of users) {
        const spot = located.get(user.userId);
        if (!spot || !isOffTeam(spot.team)) {
          streak.delete(user.userId);
          continue;
        }
        const count = (streak.get(user.userId) || 0) + 1;
        streak.set(user.userId, count);
        if (count === 2) flags.push({ userId: user.userId, team: spot.team, player: spot.player });
      }
      return flags;
    },
  };
}

/**
 * Remembers each member's last position and hands their radio its game data when it changes.
 * send(userId, info) gets { postal, street, speed, heading, nearest } or null when they're not in game.
 */
export function createGameFeed({ send, now = Date.now }) {
  const last = new Map(); // userId -> { x, z, at, heading, info }

  return {
    /** users: radio users now; located: userId -> { x, z, postal, street } from the player list. */
    update(users, located) {
      const at = now();
      const names = new Map(users.map((user) => [user.userId, user.name]));
      const active = new Set(users.map((user) => user.userId));
      for (const id of [...last.keys()]) if (!active.has(id)) last.delete(id);
      for (const user of users) {
        const spot = located.get(user.userId);
        const previous = last.get(user.userId);
        if (!spot) {
          if (previous?.info) send(user.userId, null);
          last.delete(user.userId);
          continue;
        }
        const sample = { x: Number(spot.x), z: Number(spot.z), at };
        const hasCoords = hasXz(spot);
        const motion = hasCoords ? estimateMotion(previous, sample) : { speed: null, heading: previous?.heading || '' };
        const info = {
          postal: String(spot.postal || ''),
          street: String(spot.street || ''),
          speed: motion.speed,
          heading: motion.heading,
          nearest: nearestUnits(user.userId, located, names),
        };
        const changed = JSON.stringify(info) !== JSON.stringify(previous?.info);
        last.set(user.userId, { ...(hasCoords ? sample : { x: previous?.x, z: previous?.z, at: previous?.at }), heading: motion.heading, info });
        if (changed) send(user.userId, info);
      }
    },
    /** The last game data for a member (for a radio that just signed in). */
    info: (userId) => last.get(String(userId))?.info || null,
  };
}
