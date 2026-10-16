import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/** Georgia State Patrol department Discord server. */
export const GSP_GUILD_ID = '1558194098890874971';
export const GSP_NICKNAME = 'Georgia Operations';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GSP_LOGO_PATH = path.join(ROOT, 'assets', 'gsp-ops-logo.png');
export const GSP_BANNER_PATH = path.join(ROOT, 'assets', 'gsp-ops-banner.webp');
const DEFAULT_STATE_PATH = path.join(ROOT, 'data', 'gsp-ops-profile.json');

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

/** Apply the GSP server name, patch logo, and banner. Images re-upload only when they change. */
export async function ensureGspServerProfile(client, { statePath = DEFAULT_STATE_PATH } = {}) {
  const guild = client.guilds.cache.get(GSP_GUILD_ID)
    || await client.guilds.fetch(GSP_GUILD_ID).catch((error) => {
      logger.warn(`GSP: could not fetch guild ${GSP_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`GSP: bot is not in guild ${GSP_GUILD_ID}; skipping profile.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('GSP: could not resolve bot member for profile edit.');
    return false;
  }

  const [logo, banner, state] = await Promise.all([
    loadAsset(GSP_LOGO_PATH),
    loadAsset(GSP_BANNER_PATH),
    readProfileState(statePath),
  ]);
  const needsNick = me.nickname !== GSP_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  const needsBanner = state.bannerSha256 !== banner.sha256 || !me.banner;
  if (!needsNick && !needsAvatar && !needsBanner) {
    logger.info(`GSP: server profile already set (${GSP_NICKNAME}).`);
    return true;
  }

  const options = { reason: 'Georgia State Patrol server profile' };
  if (needsNick) options.nick = GSP_NICKNAME;
  if (needsAvatar) options.avatar = logo.buffer;
  if (needsBanner) options.banner = `data:image/webp;base64,${banner.buffer.toString('base64')}`;

  try {
    await guild.members.editMe(options);
    await writeProfileState(statePath, {
      logoSha256: logo.sha256,
      bannerSha256: banner.sha256,
      nick: GSP_NICKNAME,
      updatedAt: new Date().toISOString(),
    });
    logger.info(
      'GSP: updated server profile'
      + `${needsNick ? ` nick="${GSP_NICKNAME}"` : ''}`
      + `${needsAvatar ? ' avatar' : ''}`
      + `${needsBanner ? ' banner' : ''}.`,
    );
    return true;
  } catch (error) {
    logger.error('GSP: failed to update full server profile; retrying nickname', error);
    if (needsNick) {
      try {
        await guild.members.editMe({ reason: 'Georgia State Patrol server profile (partial)', nick: GSP_NICKNAME });
        await writeProfileState(statePath, { ...state, nick: GSP_NICKNAME, updatedAt: new Date().toISOString() });
        logger.info('GSP: applied nickname after a partial profile failure.');
      } catch (fallbackError) {
        logger.error('GSP: fallback nickname update failed', fallbackError);
      }
    }
    return false;
  }
}
