import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { DOD_GUILD_ID } from './dodReports.js';
import { logger } from './logger.js';
import { PINELLAS_BIO } from './pinellasServer.js';

export const DOD_NICKNAME = 'PCSO | Divisional Hub';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOGO_PATH = path.join(ROOT, 'assets', 'pinellas-ops-logo.png');
const BANNER_PATH = path.join(ROOT, 'assets', 'pinellas-ops-banner.webp');
const PROFILE_STATE_PATH = path.join(ROOT, 'data', 'dod-profile.json');

async function asset(filePath) {
  const buffer = await readFile(filePath);
  return { buffer, sha256: createHash('sha256').update(buffer).digest('hex') };
}

/** Apply PCSO branding to the Divisional Hub while keeping its requested name. */
export async function ensureDodServerProfile(client, { statePath = PROFILE_STATE_PATH } = {}) {
  const guild = client.guilds.cache.get(DOD_GUILD_ID)
    || await client.guilds.fetch(DOD_GUILD_ID).catch((error) => {
      logger.warn(`Divisional Hub: could not fetch guild ${DOD_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Divisional Hub: bot is not in guild ${DOD_GUILD_ID}; skipping profile.`);
    return false;
  }
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) return false;

  const [logo, banner, state] = await Promise.all([
    asset(LOGO_PATH), asset(BANNER_PATH), readJsonFile(statePath, {}),
  ]);
  const needsNick = me.nickname !== DOD_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  const needsBanner = state.bannerSha256 !== banner.sha256 || !me.banner;
  const needsBio = state.bio !== PINELLAS_BIO;
  if (!needsNick && !needsAvatar && !needsBanner && !needsBio) {
    logger.info(`Divisional Hub: server profile already set (${DOD_NICKNAME}).`);
    return true;
  }

  const options = { reason: 'PCSO Divisional Hub server profile' };
  if (needsNick) options.nick = DOD_NICKNAME;
  if (needsAvatar) options.avatar = logo.buffer;
  if (needsBanner) options.banner = `data:image/webp;base64,${banner.buffer.toString('base64')}`;
  if (needsBio) options.bio = PINELLAS_BIO;
  try {
    await guild.members.editMe(options);
    await writeJsonFile(statePath, {
      logoSha256: logo.sha256,
      bannerSha256: banner.sha256,
      bio: PINELLAS_BIO,
      nick: DOD_NICKNAME,
      updatedAt: new Date().toISOString(),
    });
    logger.info(`Divisional Hub: updated server profile (${DOD_NICKNAME}).`);
    return true;
  } catch (error) {
    logger.error('Divisional Hub: failed to update full profile; retrying nickname and bio', error);
    try {
      await guild.members.editMe({
        nick: DOD_NICKNAME,
        bio: PINELLAS_BIO,
        reason: 'PCSO Divisional Hub server profile (partial)',
      });
      return true;
    } catch (fallbackError) {
      logger.error('Divisional Hub: fallback profile update failed', fallbackError);
      return false;
    }
  }
}
