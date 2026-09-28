import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';
import { libertyMapPoint } from './erlc.js';
import { ensureOfficialErlcMapFile, LIBERTY_MAP_PIXELS } from './erlcMaps.js';
import { logger } from './logger.js';

const execFileAsync = promisify(execFile);

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LIBERTY_MAP_PATH = path.join(ROOT, 'assets', 'liberty-county-map.png');
export const LIBERTY_MAP_PIN_PATH = path.join(ROOT, 'assets', 'liberty-map-pin.png');

/** Zoom window as a fraction of the map, matching the old 427px crop on 2048px art. */
const CROP_FRACTION = 427 / 2048;
const OUTPUT_SIZE = 768;
const PIN_DISPLAY = 56;
/** Tip of the pin graphic (bottom point), relative to the scaled pin image. */
const PIN_TIP_X = Math.round(PIN_DISPLAY * 0.5);
const PIN_TIP_Y = Math.round(PIN_DISPLAY * 0.84);

async function resolveMapFile() {
  return ensureOfficialErlcMapFile({
    postals: true,
    fallbackPath: LIBERTY_MAP_PATH,
  });
}

/**
 * Render a zoomed Liberty County map with a pin at the player's in-game location.
 * @param {{ x?: number, z?: number, left?: number, top?: number }} location
 * @returns {Promise<Buffer|null>}
 */
export async function renderLibertyLocationMap(location = {}) {
  if (!ffmpegPath) {
    logger.warn('Liberty map: ffmpeg-static binary missing');
    return null;
  }

  const pin = Number.isFinite(location.left) && Number.isFinite(location.top)
    ? { left: location.left, top: location.top }
    : libertyMapPoint(location.x, location.z);
  if (!pin) return null;

  const mapPath = await resolveMapFile();
  let mapSize = LIBERTY_MAP_PIXELS;
  try {
    const meta = await sharp(mapPath).metadata();
    if (meta.width && meta.height) mapSize = Math.min(meta.width, meta.height);
  } catch (error) {
    logger.warn(`Liberty map: could not read map size (${error?.message || error})`);
  }

  const cropSize = Math.max(240, Math.round(mapSize * CROP_FRACTION));
  const px = Math.round(pin.left * mapSize);
  const py = Math.round(pin.top * mapSize);
  const x0 = Math.max(0, Math.min(mapSize - cropSize, px - Math.floor(cropSize / 2)));
  const y0 = Math.max(0, Math.min(mapSize - cropSize, py - Math.floor(cropSize / 2)));

  const scale = OUTPUT_SIZE / cropSize;
  const overlayX = Math.max(0, Math.min(
    OUTPUT_SIZE - PIN_DISPLAY,
    Math.round((px - x0) * scale) - PIN_TIP_X,
  ));
  const overlayY = Math.max(0, Math.min(
    OUTPUT_SIZE - PIN_DISPLAY,
    Math.round((py - y0) * scale) - PIN_TIP_Y,
  ));

  const tmp = await mkdtemp(path.join(os.tmpdir(), 'pcso-map-'));
  const outPath = path.join(tmp, 'location-map.png');

  try {
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i', mapPath,
      '-i', LIBERTY_MAP_PIN_PATH,
      '-filter_complex',
      `[0:v]crop=${cropSize}:${cropSize}:${x0}:${y0},scale=${OUTPUT_SIZE}:${OUTPUT_SIZE}[bg];`
      + `[1:v]scale=${PIN_DISPLAY}:${PIN_DISPLAY}[pin];`
      + `[bg][pin]overlay=${overlayX}:${overlayY}`,
      '-frames:v', '1',
      '-update', '1',
      outPath,
    ], {
      timeout: 30_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return await readFile(outPath);
  } catch (error) {
    logger.warn(`Liberty map render failed: ${error?.message || error}`);
    return null;
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
