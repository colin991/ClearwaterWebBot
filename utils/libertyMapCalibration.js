import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIBERTY_POSTALS_PATH = path.join(ROOT, 'assets', 'liberty-postals.json');
export const LIBERTY_CALIBRATION_PATH = path.join(ROOT, 'data', 'liberty-map-calibration.json');

/**
 * Postal label centres read off the official api.erlc.gg postal map, as
 * fractions of the image. ER:LC reports PostalCode reliably, while the
 * LocationX/Z → pixel scale is undocumented and has changed between updates,
 * so pins are anchored to these labels and a fit is learned from live data.
 */
export const LIBERTY_POSTAL_POINTS = Object.freeze(loadPostalPoints());

const MAX_PER_POSTAL = 40;
const MAX_SAMPLES = 4000;
const MIN_POSTALS = 6;
const MIN_SAMPLES = 12;
const MAX_FIT_RMS = 0.045;
/** Fitted pins farther than this from their reported postal label fall back to the label. */
export const MAX_POSTAL_DRIFT = 0.08;
const SAVE_DEBOUNCE_MS = 30_000;

let samples = loadSamples();
let cachedFit;
let saveTimer = null;

function loadPostalPoints() {
  try {
    const raw = JSON.parse(readFileSync(LIBERTY_POSTALS_PATH, 'utf8'));
    const out = {};
    for (const [postal, point] of Object.entries(raw || {})) {
      const [left, top] = Array.isArray(point) ? point.map(Number) : [];
      if (Number.isFinite(left) && Number.isFinite(top)) out[String(postal)] = { left, top };
    }
    return out;
  } catch (error) {
    logger.warn(`Liberty postal table unavailable (${error?.message || error})`);
    return {};
  }
}

function loadSamples() {
  try {
    const raw = JSON.parse(readFileSync(LIBERTY_CALIBRATION_PATH, 'utf8'));
    return (Array.isArray(raw?.samples) ? raw.samples : [])
      .filter((entry) => Number.isFinite(entry?.x) && Number.isFinite(entry?.z) && LIBERTY_POSTAL_POINTS[entry?.p])
      .slice(-MAX_SAMPLES);
  } catch {
    return [];
  }
}

function normalizePostal(value) {
  const digits = String(value ?? '').trim().match(/^\d{3,5}/);
  return digits ? digits[0] : '';
}

export function postalMapPoint(postal) {
  const point = LIBERTY_POSTAL_POINTS[normalizePostal(postal)];
  return point ? { left: point.left, top: point.top } : null;
}

function solve3(m, v) {
  const a = m.map((row, index) => [...row, v[index]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = a[row][col] / a[col][col];
      for (let k = col; k < 4; k += 1) a[row][k] -= factor * a[col][k];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
}

/** Least-squares affine fit from world X/Z to map fractions (handles offset, scale, and axis swaps). */
export function fitLibertyAffine(points = []) {
  const usable = points.filter((entry) => LIBERTY_POSTAL_POINTS[entry?.p]
    && Number.isFinite(entry?.x) && Number.isFinite(entry?.z));
  const postals = new Set(usable.map((entry) => entry.p));
  if (usable.length < MIN_SAMPLES || postals.size < MIN_POSTALS) return null;

  const meanX = usable.reduce((sum, entry) => sum + entry.x, 0) / usable.length;
  const meanZ = usable.reduce((sum, entry) => sum + entry.z, 0) / usable.length;
  const span = Math.max(1, ...usable.map((entry) => Math.max(Math.abs(entry.x - meanX), Math.abs(entry.z - meanZ))));
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const vl = [0, 0, 0];
  const vt = [0, 0, 0];
  for (const entry of usable) {
    const row = [(entry.x - meanX) / span, (entry.z - meanZ) / span, 1];
    const target = LIBERTY_POSTAL_POINTS[entry.p];
    for (let i = 0; i < 3; i += 1) {
      vl[i] += row[i] * target.left;
      vt[i] += row[i] * target.top;
      for (let j = 0; j < 3; j += 1) m[i][j] += row[i] * row[j];
    }
  }
  const left = solve3(m, vl);
  const top = solve3(m, vt);
  if (!left || !top) return null;
  const det = left[0] * top[1] - left[1] * top[0];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-6) return null;

  const fit = { meanX, meanZ, span, left, top };
  let squared = 0;
  for (const entry of usable) {
    const point = applyLibertyFit(fit, entry.x, entry.z);
    const target = LIBERTY_POSTAL_POINTS[entry.p];
    squared += (point.left - target.left) ** 2 + (point.top - target.top) ** 2;
  }
  fit.rms = Math.sqrt(squared / usable.length);
  fit.samples = usable.length;
  fit.postals = postals.size;
  return fit.rms <= MAX_FIT_RMS ? fit : null;
}

export function applyLibertyFit(fit, x, z) {
  const u = (Number(x) - fit.meanX) / fit.span;
  const v = (Number(z) - fit.meanZ) / fit.span;
  return {
    left: fit.left[0] * u + fit.left[1] * v + fit.left[2],
    top: fit.top[0] * u + fit.top[1] * v + fit.top[2],
  };
}

function currentFit() {
  if (cachedFit === undefined) cachedFit = fitLibertyAffine(samples);
  return cachedFit;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    writeJsonFile(LIBERTY_CALIBRATION_PATH, { samples }).catch((error) => {
      logger.warn(`Liberty map calibration save failed (${error?.message || error})`);
    });
  }, SAVE_DEBOUNCE_MS);
  saveTimer.unref?.();
}

/** Learn the world → map transform from a live ER:LC player list. */
export function recordLibertyCalibration(players = [], { persist = true } = {}) {
  let added = 0;
  for (const player of Array.isArray(players) ? players : []) {
    const loc = player?.Location && typeof player.Location === 'object' ? player.Location : (player?.location || {});
    const x = Number(loc.LocationX ?? loc.x);
    const z = Number(loc.LocationZ ?? loc.z);
    const p = normalizePostal(loc.PostalCode ?? loc.postal);
    if (!Number.isFinite(x) || !Number.isFinite(z) || !LIBERTY_POSTAL_POINTS[p]) continue;
    const samePostal = samples.filter((entry) => entry.p === p);
    if (samePostal.some((entry) => Math.abs(entry.x - x) < 1 && Math.abs(entry.z - z) < 1)) continue;
    if (samePostal.length >= MAX_PER_POSTAL) {
      const oldest = samples.findIndex((entry) => entry.p === p);
      if (oldest >= 0) samples.splice(oldest, 1);
    }
    samples.push({ x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, p });
    added += 1;
  }
  if (!added) return 0;
  if (samples.length > MAX_SAMPLES) samples = samples.slice(-MAX_SAMPLES);
  cachedFit = undefined;
  if (persist) scheduleSave();
  return added;
}

function clampPin(point) {
  const clamp = (value) => Number(Math.min(1, Math.max(0, value)).toFixed(5));
  return { left: clamp(point.left), top: clamp(point.top) };
}

/**
 * Pin for a player's live location on the official map: the learned fit when it
 * agrees with the reported postal, otherwise the postal label itself.
 */
export function libertyLocationPin({ x, z, postal } = {}, fallback = null) {
  const labelPoint = postalMapPoint(postal);
  const fit = currentFit();
  const hasCoords = Number.isFinite(Number(x)) && Number.isFinite(Number(z)) && x !== null && z !== null;
  const fitted = fit && hasCoords ? applyLibertyFit(fit, x, z) : null;
  if (labelPoint) {
    if (fitted && Math.hypot(fitted.left - labelPoint.left, fitted.top - labelPoint.top) <= MAX_POSTAL_DRIFT) {
      return clampPin(fitted);
    }
    return clampPin(labelPoint);
  }
  if (fitted) return clampPin(fitted);
  return typeof fallback === 'function' ? fallback(x, z) : fallback;
}

export function libertyCalibrationStatus() {
  const fit = currentFit();
  return {
    samples: samples.length,
    postals: new Set(samples.map((entry) => entry.p)).size,
    fitted: Boolean(fit),
    rms: fit ? Number(fit.rms.toFixed(4)) : null,
  };
}

export function resetLibertyCalibrationForTests(next = []) {
  samples = [...next];
  cachedFit = undefined;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
}

/** Closest postal label to a map point picked as image fractions. */
export function nearestLibertyPostal({ left, top } = {}) {
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  let best = null;
  for (const [postal, point] of Object.entries(LIBERTY_POSTAL_POINTS)) {
    const distance = Math.hypot(point.left - left, point.top - top);
    if (!best || distance < best.distance) best = { postal, distance };
  }
  return best;
}
