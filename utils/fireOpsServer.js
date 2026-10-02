import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/** Clearwater Fire & Rescue Discord server. */
export const FIRE_OPS_GUILD_ID = '1514804886292795544';
export const FIRE_OPS_NICKNAME = 'Fire Operations';
export const FIRE_OPS_BIO = '**Clearwater Fire & Rescue** internal utilities and operations manager.';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIRE_OPS_LOGO_PATH = path.join(ROOT, 'assets', 'fire-ops-logo.png');
export const FIRE_OPS_BANNER_PATH = path.join(ROOT, 'assets', 'fire-ops-banner.png');
const DEFAULT_STATE_PATH = path.join(ROOT, 'data', 'fire-ops-profile.json');

async function loadAsset(filePath) {
  const buffer = await readFile(filePath);
  return { buffer, sha256: createHash('sha256').update(buffer).digest('hex') };
}

async function readProfileState(statePath) {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'));
  } catch {
    return {};
  }
}

async function writeProfileState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

/**
 * Apply the Fire Operations per-server nickname, avatar, banner, and bio.
 * Images and bio are only re-sent when they change so restarts stay quiet.
 */
export async function ensureFireOpsServerProfile(client, { statePath = DEFAULT_STATE_PATH } = {}) {
  const guild = client.guilds.cache.get(FIRE_OPS_GUILD_ID)
    || await client.guilds.fetch(FIRE_OPS_GUILD_ID).catch((error) => {
      logger.warn(`Fire Operations: could not fetch guild ${FIRE_OPS_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Fire Operations: bot is not in guild ${FIRE_OPS_GUILD_ID}; skipping profile.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('Fire Operations: could not resolve bot member for profile edit.');
    return false;
  }

  const [logo, banner, state] = await Promise.all([
    loadAsset(FIRE_OPS_LOGO_PATH),
    loadAsset(FIRE_OPS_BANNER_PATH),
    readProfileState(statePath),
  ]);
  const needsNick = me.nickname !== FIRE_OPS_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  const needsBanner = state.bannerSha256 !== banner.sha256 || !me.banner;
  const needsBio = state.bio !== FIRE_OPS_BIO;
  if (!needsNick && !needsAvatar && !needsBanner && !needsBio) {
    logger.info(`Fire Operations: server profile already set (${FIRE_OPS_NICKNAME}).`);
    return true;
  }

  const options = { reason: 'Fire Operations server profile' };
  if (needsNick) options.nick = FIRE_OPS_NICKNAME;
  if (needsAvatar) options.avatar = logo.buffer;
  if (needsBanner) options.banner = `data:image/png;base64,${banner.buffer.toString('base64')}`;
  if (needsBio) options.bio = FIRE_OPS_BIO;

  try {
    await guild.members.editMe(options);
    await writeProfileState(statePath, {
      logoSha256: logo.sha256,
      bannerSha256: banner.sha256,
      nick: FIRE_OPS_NICKNAME,
      bio: FIRE_OPS_BIO,
      updatedAt: new Date().toISOString(),
    });
    logger.info(
      'Fire Operations: updated server profile'
      + `${needsNick ? ` nick="${FIRE_OPS_NICKNAME}"` : ''}`
      + `${needsAvatar ? ' avatar' : ''}`
      + `${needsBanner ? ' banner' : ''}`
      + `${needsBio ? ' bio' : ''}.`,
    );
    return true;
  } catch (error) {
    logger.error('Fire Operations: failed to update full server profile; retrying nickname and bio', error);
    try {
      await guild.members.editMe({
        reason: 'Fire Operations server profile (partial)',
        nick: FIRE_OPS_NICKNAME,
        bio: FIRE_OPS_BIO,
      });
      await writeProfileState(statePath, {
        ...state,
        nick: FIRE_OPS_NICKNAME,
        bio: FIRE_OPS_BIO,
        updatedAt: new Date().toISOString(),
      });
      logger.info('Fire Operations: applied nickname and bio after a partial profile failure.');
    } catch (fallbackError) {
      logger.error('Fire Operations: fallback nickname/bio update failed', fallbackError);
    }
    return false;
  }
}
