import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/** Belleair Police Department Discord server. */
export const BELLEAIR_GUILD_ID = '1526890993327280240';
export const BELLEAIR_NICKNAME = 'Belleair Operations';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BELLEAIR_LOGO_PATH = path.join(ROOT, 'assets', 'belleair-ops-logo.webp');
const BELLEAIR_BANNER_PATH = path.join(ROOT, 'assets', 'belleair-ops-banner.webp');
const PROFILE_STATE_PATH = path.join(ROOT, 'data', 'belleair-profile.json');

let cachedLogo = null;
let cachedBanner = null;

async function loadAsset(filePath, cacheRef) {
  if (cacheRef.value) return cacheRef.value;
  const buffer = await readFile(filePath);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  cacheRef.value = { buffer, sha256 };
  return cacheRef.value;
}

async function loadBelleairLogo() {
  cachedLogo ||= { value: null };
  return loadAsset(BELLEAIR_LOGO_PATH, cachedLogo);
}

async function loadBelleairBanner() {
  cachedBanner ||= { value: null };
  return loadAsset(BELLEAIR_BANNER_PATH, cachedBanner);
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
 * Apply the Belleair per-server nickname, avatar, and banner.
 * Re-uploads images only when asset hashes change so restarts stay quiet.
 */
export async function ensureBelleairServerProfile(client) {
  const guild = client.guilds.cache.get(BELLEAIR_GUILD_ID)
    || await client.guilds.fetch(BELLEAIR_GUILD_ID).catch((error) => {
      logger.warn(`Belleair: could not fetch guild ${BELLEAIR_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Belleair: bot is not in guild ${BELLEAIR_GUILD_ID}; skipping profile.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('Belleair: could not resolve bot member for profile edit.');
    return false;
  }

  const logo = await loadBelleairLogo();
  const banner = await loadBelleairBanner();
  const state = await readProfileState();
  const needsNick = me.nickname !== BELLEAIR_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  const needsBanner = state.bannerSha256 !== banner.sha256 || !me.banner;
  if (!needsNick && !needsAvatar && !needsBanner) {
    logger.info(`Belleair: server profile already set (${BELLEAIR_NICKNAME}).`);
    return true;
  }

  try {
    const options = { reason: 'Belleair Operations server profile' };
    if (needsNick) options.nick = BELLEAIR_NICKNAME;
    if (needsAvatar) options.avatar = logo.buffer;
    if (needsBanner) options.banner = `data:image/webp;base64,${banner.buffer.toString('base64')}`;

    await guild.members.editMe(options);
    await writeProfileState({
      logoSha256: logo.sha256,
      bannerSha256: banner.sha256,
      nick: BELLEAIR_NICKNAME,
      updatedAt: new Date().toISOString(),
    });
    logger.info(
      `Belleair: updated server profile`
      + `${needsNick ? ` nick="${BELLEAIR_NICKNAME}"` : ''}`
      + `${needsAvatar ? ' avatar' : ''}`
      + `${needsBanner ? ' banner' : ''}.`,
    );
    return true;
  } catch (error) {
    const fallback = { reason: 'Belleair Operations server profile (partial)' };
    if (needsNick) fallback.nick = BELLEAIR_NICKNAME;
    if (fallback.nick) {
      try {
        await guild.members.editMe(fallback);
        await writeProfileState({
          ...state,
          nick: BELLEAIR_NICKNAME,
          updatedAt: new Date().toISOString(),
        });
        logger.info('Belleair: applied nick after a partial profile failure.');
      } catch (fallbackError) {
        logger.error('Belleair: fallback nick update failed', fallbackError);
      }
    }
    logger.error('Belleair: failed to update server profile', error);
    return false;
  }
}
