/**
 * Radio coverage: cell towers and weak-signal areas that staff place on the Liberty County map
 * (cwpcso.com/radio-staff). Points are fractions of the official map image (0-1, like map pins).
 * A unit's signal comes from where they are in game: close to a tower is clear, far from every
 * tower or inside a weak area is static-y and muffled, but always still comes through.
 */

export const COVERAGE_LIMITS = Object.freeze({
  towers: 60,
  zones: 40,
  zonePoints: 40,
  name: 40,
  minRange: 0.03,
  maxRange: 0.6,
  minStrength: 0.1,
  maxStrength: 0.9,
});
export const DEFAULT_TOWER_RANGE = 0.2;
export const DEFAULT_ZONE_STRENGTH = 0.35;
/** The weakest a signal ever gets: transmissions still come through. */
export const MIN_SIGNAL = 0.1;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const fraction = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1 ? Math.round(number * 100000) / 100000 : null;
};
const cleanName = (value, fallback) => String(value ?? '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, COVERAGE_LIMITS.name) || fallback;
const cleanId = (value, prefix, index) => (/^[a-z0-9-]{1,40}$/i.test(String(value || '')) ? String(value) : `${prefix}-${index + 1}`);

/** Keeps only valid towers and areas, so whatever the website sends is safe to save and use. */
export function normalizeCoverage(raw = {}) {
  const towers = (Array.isArray(raw?.towers) ? raw.towers : []).slice(0, COVERAGE_LIMITS.towers).flatMap((tower, index) => {
    const left = fraction(tower?.left);
    const top = fraction(tower?.top);
    if (left === null || top === null) return [];
    const range = Number(tower?.range);
    return [{
      id: cleanId(tower?.id, 'tower', index),
      name: cleanName(tower?.name, `Tower ${index + 1}`),
      left,
      top,
      range: Number.isFinite(range) ? Math.round(clamp(range, COVERAGE_LIMITS.minRange, COVERAGE_LIMITS.maxRange) * 1000) / 1000 : DEFAULT_TOWER_RANGE,
    }];
  });
  const zones = (Array.isArray(raw?.zones) ? raw.zones : []).slice(0, COVERAGE_LIMITS.zones).flatMap((zone, index) => {
    const points = (Array.isArray(zone?.points) ? zone.points : []).slice(0, COVERAGE_LIMITS.zonePoints)
      .map((point) => ({ left: fraction(point?.left), top: fraction(point?.top) }))
      .filter((point) => point.left !== null && point.top !== null);
    if (points.length < 3) return [];
    const strength = Number(zone?.strength);
    return [{
      id: cleanId(zone?.id, 'area', index),
      name: cleanName(zone?.name, `Weak area ${index + 1}`),
      points,
      strength: Number.isFinite(strength) ? Math.round(clamp(strength, COVERAGE_LIMITS.minStrength, COVERAGE_LIMITS.maxStrength) * 100) / 100 : DEFAULT_ZONE_STRENGTH,
    }];
  });
  // Ids must be unique so the website can pick one.
  const seen = new Set();
  for (const [index, item] of [...towers, ...zones].entries()) {
    if (seen.has(item.id)) item.id = `${item.id}-${index + 1}`;
    seen.add(item.id);
  }
  return { towers, zones };
}

export function hasCoverage(coverage) {
  return Boolean(coverage?.towers?.length || coverage?.zones?.length);
}

/** Ray casting: true when the point is inside the polygon. */
export function pointInArea(point, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const a = points[i];
    const b = points[j];
    if ((a.top > point.top) !== (b.top > point.top)
      && point.left < ((b.left - a.left) * (point.top - a.top)) / (b.top - a.top) + a.left) inside = !inside;
  }
  return inside;
}

/**
 * Signal from one tower: full strength out to 60% of its range, fading to 0.55 at the edge of its
 * range and to the minimum at twice its range.
 */
export function towerSignal(distance, range) {
  const r = Math.max(COVERAGE_LIMITS.minRange, Number(range) || DEFAULT_TOWER_RANGE);
  if (distance <= r * 0.6) return 1;
  if (distance <= r) return 1 - 0.45 * ((distance - r * 0.6) / (r * 0.4));
  return Math.max(0.15, 0.55 - 0.4 * ((distance - r) / r));
}

/**
 * Signal strength (MIN_SIGNAL-1) at a map point, or null when the point is unknown (not in game):
 * a unit we can't place keeps a clear signal.
 */
export function signalAt(point, coverage) {
  if (!point || !Number.isFinite(point.left) || !Number.isFinite(point.top) || !hasCoverage(coverage)) return null;
  let signal = 1;
  if (coverage.towers.length) {
    signal = Math.max(...coverage.towers.map((tower) => towerSignal(Math.hypot(point.left - tower.left, point.top - tower.top), tower.range)));
  }
  for (const zone of coverage.zones) {
    if (pointInArea(point, zone.points)) signal *= zone.strength;
  }
  return Math.round(Math.max(MIN_SIGNAL, Math.min(1, signal)) * 100) / 100;
}

/** Bars on the radio for a signal: 4 is clear, 1 is barely there. Unknown shows full bars. */
export function signalBars(signal) {
  if (signal === null || signal === undefined || !Number.isFinite(Number(signal))) return 4;
  const value = Number(signal);
  if (value >= 0.8) return 4;
  if (value >= 0.55) return 3;
  if (value >= 0.3) return 2;
  return 1;
}

/**
 * Keeps every radio's signal up to date. update(points) takes where each member on a radio is
 * (userId -> { left, top } on the map) and hands their signals to the relay; recompute()
 * re-applies a just-saved coverage map to the last known positions.
 */
export function createCoverageTracker({ users, setSignals, getCoverage }) {
  let points = new Map();

  function apply() {
    const coverage = getCoverage();
    const signals = new Map();
    if (hasCoverage(coverage)) {
      for (const user of users()) signals.set(user.userId, signalAt(points.get(user.userId), coverage));
    }
    setSignals(signals);
  }

  return {
    update(next) {
      points = new Map(next);
      apply();
    },
    recompute: apply,
    clear() {
      points = new Map();
      setSignals(new Map());
    },
    /** Where each located member is and their signal, for the staff map. */
    positions() {
      const coverage = getCoverage();
      return users().filter((user) => points.has(user.userId)).map((user) => {
        const point = points.get(user.userId);
        return { userId: user.userId, name: user.name, left: point.left, top: point.top, signal: signalAt(point, coverage) };
      });
    },
  };
}
