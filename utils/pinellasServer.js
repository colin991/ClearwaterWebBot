import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from './logger.js';

/** Pinellas County Sheriff's Office Discord server. */
export const PINELLAS_GUILD_ID = '1514100977920245760';

/** Welcome / introductions channel. */
export const PINELLAS_WELCOME_CHANNEL_ID = '1514100979711217706';

/** Applications channel linked in the welcome message. */
export const PINELLAS_APPLICATIONS_CHANNEL_URL =
  'https://discord.com/channels/1514100977920245760/1514443793607295058';

export const PINELLAS_NICKNAME = 'Pinellas Operations';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINELLAS_LOGO_PATH = path.join(ROOT, 'assets', 'pinellas-ops-logo.png');
const PROFILE_STATE_PATH = path.join(ROOT, 'data', 'pinellas-profile.json');

const PCSO_LOGO_EMOJI = '<:PCSO_Logo:1514651787984900288>';

let cachedLogo = null;

async function loadPinellasLogo() {
  if (cachedLogo) return cachedLogo;
  const buffer = await readFile(PINELLAS_LOGO_PATH);
  const sha256 = createHash('sha256').update(buffer).digest('hex');
  cachedLogo = { buffer, sha256 };
  return cachedLogo;
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
 * Apply the Pinellas per-server nickname + avatar (guild member profile).
 * Re-uploads the logo only when the asset hash changes so restarts stay quiet.
 */
export async function ensurePinellasServerProfile(client) {
  const guild = client.guilds.cache.get(PINELLAS_GUILD_ID)
    || await client.guilds.fetch(PINELLAS_GUILD_ID).catch((error) => {
      logger.warn(`Pinellas: could not fetch guild ${PINELLAS_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Pinellas: bot is not in guild ${PINELLAS_GUILD_ID}; skipping profile.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('Pinellas: could not resolve bot member for profile edit.');
    return false;
  }

  const logo = await loadPinellasLogo();
  const state = await readProfileState();
  const needsNick = me.nickname !== PINELLAS_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  if (!needsNick && !needsAvatar) {
    logger.info(`Pinellas: server profile already set (${PINELLAS_NICKNAME}).`);
    return true;
  }

  try {
    const options = { reason: 'Pinellas Operations server profile' };
    if (needsNick) options.nick = PINELLAS_NICKNAME;
    if (needsAvatar) options.avatar = logo.buffer;

    await guild.members.editMe(options);
    await writeProfileState({
      logoSha256: logo.sha256,
      nick: PINELLAS_NICKNAME,
      updatedAt: new Date().toISOString(),
    });
    logger.info(
      `Pinellas: updated server profile`
      + `${needsNick ? ` nick="${PINELLAS_NICKNAME}"` : ''}`
      + `${needsAvatar ? ' avatar' : ''}.`,
    );
    return true;
  } catch (error) {
    if (needsNick) {
      try {
        await guild.members.editMe({
          nick: PINELLAS_NICKNAME,
          reason: 'Pinellas Operations nickname',
        });
        logger.info(`Pinellas: set nickname to "${PINELLAS_NICKNAME}" (avatar update failed).`);
      } catch (nickError) {
        logger.error('Pinellas: failed to set nickname', nickError);
      }
    }
    logger.error('Pinellas: failed to update server profile', error);
    return false;
  }
}

/** Post the Pinellas welcome message when a member joins that server. */
export async function sendPinellasWelcome(member) {
  if (String(member.guild?.id) !== PINELLAS_GUILD_ID) return false;
  if (member.user?.bot) return false;

  const channel = member.guild.channels.cache.get(PINELLAS_WELCOME_CHANNEL_ID)
    || await member.guild.channels.fetch(PINELLAS_WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Pinellas: welcome channel ${PINELLAS_WELCOME_CHANNEL_ID} unavailable.`);
    return false;
  }

  const content = [
    `Welcome to **${PCSO_LOGO_EMOJI} Pinellas County Sheriff's Office** <@${member.id}>`,
    `you can find the application to join in ${PINELLAS_APPLICATIONS_CHANNEL_URL}`,
  ].join(' ');

  await channel.send({
    content,
    allowedMentions: { users: [member.id] },
  });
  logger.info(`Pinellas: welcomed ${member.user?.tag || member.id}.`);
  return true;
}
