import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

export const ERLC_MAPS_INDEX_URL = 'https://api.erlc.gg/maps';
/** Current official map listing (https://api.erlc.gg/maps). Images cover the 3120² stud plane. */
export const LIBERTY_MAP_PIXELS = 5355;
export const ERLC_MAP_SEASONS = Object.freeze(['fall', 'snow', 'spring', 'summer']);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ERLC_MAP_CACHE_DIR = path.join(ROOT, 'data', 'erlc-maps');
const CACHE_MS = 24 * 60 * 60 * 1000;

export function parseErlcMapListing(payload) {
  const urls = Array.isArray(payload?.maps)
    ? payload.maps
    : (Array.isArray(payload) ? payload : []);
  return urls.map((value) => {
    const url = String(value || '').trim();
    const file = url.split('/').pop() || '';
    const match = file.match(/^(fall|snow|winter|spring|summer)_(blank|postals)\.png$/i);
    const season = match ? String(match[1]).toLowerCase().replace(/^winter$/, 'snow') : '';
    const kind = match ? String(match[2]).toLowerCase() : '';
    return { url, file, season, kind };
  }).filter((entry) => entry.url.startsWith('https://'));
}

export function erlcMapSeason(date = new Date()) {
  const month = date.getUTCMonth() + 1;
  if (month === 12 || month <= 2) return 'snow';
  if (month <= 5) return 'spring';
  if (month <= 8) return 'summer';
  return 'fall';
}

export function pickErlcMap(maps, { season = '', postals = true } = {}) {
  const list = Array.isArray(maps) && maps[0]?.url ? maps : parseErlcMapListing(maps);
  const wantKind = postals ? 'postals' : 'blank';
  const wantSeason = String(season || erlcMapSeason()).toLowerCase().replace(/^winter$/, 'snow');
  return list.find((entry) => entry.season === wantSeason && entry.kind === wantKind)
    || list.find((entry) => entry.season === 'fall' && entry.kind === wantKind)
    || list.find((entry) => entry.kind === wantKind)
    || list[0]
    || null;
}

export async function fetchErlcMapListing({ fetchImpl = fetch, timeoutMs = 8_000 } = {}) {
  const response = await fetchImpl(ERLC_MAPS_INDEX_URL, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`ER:LC map list failed (${response.status})`);
  }
  return parseErlcMapListing(await response.json());
}

async function fileIsFresh(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() && info.size > 10_000 && (Date.now() - info.mtimeMs) < CACHE_MS;
  } catch {
    return false;
  }
}

/**
 * Download the current official postal map for Discord location crops.
 * Falls back to the bundled asset when the API is unreachable.
 */
export async function ensureOfficialErlcMapFile({
  postals = true,
  season,
  fallbackPath = '',
  fetchImpl = fetch,
  cacheDir = ERLC_MAP_CACHE_DIR,
} = {}) {
  try {
    const maps = await fetchErlcMapListing({ fetchImpl });
    const picked = pickErlcMap(maps, { season, postals });
    if (!picked?.url) throw new Error('ER:LC map list had no images');
    const dest = path.join(cacheDir, picked.file || 'erlc-map.png');
    if (await fileIsFresh(dest)) return dest;
    await mkdir(cacheDir, { recursive: true });
    const response = await fetchImpl(picked.url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`ER:LC map download failed (${response.status})`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 10_000) throw new Error('ER:LC map download was empty');
    await writeFile(dest, buffer);
    logger.info(`ER:LC map cached ${picked.file} (${buffer.length} bytes).`);
    return dest;
  } catch (error) {
    logger.warn(`ER:LC official map unavailable (${error?.message || error}); using bundled map.`);
    if (fallbackPath) return fallbackPath;
    throw error;
  }
}
