import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

export const FLORIDA_GUILD_ID = '1513609541483499790';
export const FLORIDA_NICKNAME = 'Florida Operations';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLORIDA_LOGO_PATH = path.join(ROOT, 'assets', 'florida-ops-logo.gif');
const FLORIDA_BANNER_PATH = path.join(ROOT, 'assets', 'florida-ops-banner.png');
const PROFILE_STATE_PATH = path.join(ROOT, 'data', 'florida-profile.json');

let cachedLogo = null;
let cachedBanner = null;

function dataUri(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function loadAsset(filePath, cacheRef) {
  if (cacheRef.value) return cacheRef.value;
  const buffer = await readFile(filePath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  cacheRef.value = { buffer, sha256 };
  return cacheRef.value;
}

async function loadFloridaLogo() {
  cachedLogo ||= { value: null };
  return loadAsset(FLORIDA_LOGO_PATH, cachedLogo);
}

async function loadFloridaBanner() {
  cachedBanner ||= { value: null };
  return loadAsset(FLORIDA_BANNER_PATH, cachedBanner);
}

async function readProfileState() {
  try {
    return JSON.parse(await readFile(PROFILE_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

async function writeProfileState(state) {
  await mkdir(path.dirname(PROFILE_STATE_PATH), { recursive: true });
  await writeFile(PROFILE_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Apply the Florida Operations per-server nickname, avatar, and banner.
 * Re-uploads images only when asset hashes change so restarts stay quiet.
 */
export async function ensureFloridaServerProfile(client) {
  const guild = client.guilds.cache.get(FLORIDA_GUILD_ID)
    || await client.guilds.fetch(FLORIDA_GUILD_ID).catch((error) => {
      logger.warn(`Florida: could not fetch guild ${FLORIDA_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Florida: bot is not in guild ${FLORIDA_GUILD_ID}; skipping profile.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('Florida: could not resolve bot member for profile edit.');
    return false;
  }

  const logo = await loadFloridaLogo();
  const banner = await loadFloridaBanner();
  const state = await readProfileState();
  const needsNick = me.nickname !== FLORIDA_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  const needsBanner = state.bannerSha256 !== banner.sha256 || !me.banner;
  if (!needsNick && !needsAvatar && !needsBanner) {
    logger.info(`Florida: server profile already set (${FLORIDA_NICKNAME}).`);
    return true;
  }

  try {
    const options = { reason: 'Florida Operations server profile' };
    if (needsNick) options.nick = FLORIDA_NICKNAME;
    if (needsAvatar) options.avatar = dataUri(logo.buffer, 'image/gif');
    if (needsBanner) options.banner = dataUri(banner.buffer, 'image/png');

    await guild.members.editMe(options);
    await writeProfileState({
      logoSha256: logo.sha256,
      bannerSha256: banner.sha256,
      nick: FLORIDA_NICKNAME,
      updatedAt: new Date().toISOString(),
    });
    logger.info(
      `Florida: updated server profile`
      + `${needsNick ? ` nick="${FLORIDA_NICKNAME}"` : ''}`
      + `${needsAvatar ? ' avatar' : ''}`
      + `${needsBanner ? ' banner' : ''}.`,
    );
    return true;
  } catch (error) {
    const fallback = { reason: 'Florida Operations server profile (partial)' };
    if (needsNick) fallback.nick = FLORIDA_NICKNAME;
    if (fallback.nick) {
      try {
        await guild.members.editMe(fallback);
        await writeProfileState({
          ...state,
          nick: FLORIDA_NICKNAME,
          updatedAt: new Date().toISOString(),
        });
        logger.info('Florida: applied nick after a partial profile failure.');
      } catch (fallbackError) {
        logger.error('Florida: fallback nick update failed', fallbackError);
      }
    }
    logger.error('Florida: failed to update server profile', error);
    return false;
  }
}
