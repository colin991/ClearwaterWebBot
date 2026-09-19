import { unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

export const FLORIDA_GUILD_ID = '1513609541483499790';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE_STATE_PATH = path.join(ROOT, 'data', 'florida-profile.json');

/**
 * Remove the Florida Operations per-server nickname, avatar, and banner.
 */
export async function clearFloridaServerProfile(client) {
  const guild = client.guilds.cache.get(FLORIDA_GUILD_ID)
    || await client.guilds.fetch(FLORIDA_GUILD_ID).catch((error) => {
      logger.warn(`Florida: could not fetch guild ${FLORIDA_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Florida: bot is not in guild ${FLORIDA_GUILD_ID}; skipping profile clear.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('Florida: could not resolve bot member for profile clear.');
    return false;
  }

  const needsClear = Boolean(me.nickname || me.avatar || me.banner);
  if (!needsClear) {
    await unlink(PROFILE_STATE_PATH).catch(() => {});
    logger.info('Florida: server profile already cleared.');
    return true;
  }

  try {
    await guild.members.editMe({
      nick: null,
      avatar: null,
      banner: null,
      reason: 'Remove Florida Operations server profile',
    });
    await unlink(PROFILE_STATE_PATH).catch(() => {});
    logger.info('Florida: cleared per-server nickname, avatar, and banner.');
    return true;
  } catch (error) {
    logger.error('Florida: failed to clear server profile', error);
    return false;
  }
}
