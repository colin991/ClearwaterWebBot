/**
 * Game data on the radio: nearest postal, street, and a speed and heading estimate for each
 * member on a radio, from the ER:LC player list. The ER:LC API only gives position (no speed or
 * heading), so both are worked out from how far the player moved between two updates.
 */

export const GAME_TICK_MS = 5_000;
/** Roblox studs per second to mph (1 stud is about 0.28 m). An estimate, not the car's speedometer. */
export const MPH_PER_STUD_PER_SECOND = 0.63;
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
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
 * Remembers each member's last position and hands their radio its game data when it changes.
 * send(userId, info) gets { postal, street, speed, heading } or null when they're not in game.
 */
export function createGameFeed({ send, now = Date.now }) {
  const last = new Map(); // userId -> { x, z, at, heading, info }

  return {
    /** users: radio users now; located: userId -> { x, z, postal, street } from the player list. */
    update(users, located) {
      const at = now();
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
        const hasCoords = Number.isFinite(sample.x) && Number.isFinite(sample.z);
        const motion = hasCoords ? estimateMotion(previous, sample) : { speed: null, heading: previous?.heading || '' };
        const info = {
          postal: String(spot.postal || ''),
          street: String(spot.street || ''),
          speed: motion.speed,
          heading: motion.heading,
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
