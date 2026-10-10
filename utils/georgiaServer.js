import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { logger } from './logger.js';

export const GEORGIA_GUILD_ID = '1557972171522052226';
export const GEORGIA_NICKNAME = 'Georgia Operations';
export const GEORGIA_WELCOME_CHANNEL_ID = '1558250379450523708';
export const GEORGIA_DASHBOARD_URL = 'https://discord.com/channels/1557972171522052226/1558246580065140806';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GEORGIA_LOGO_PATH = path.join(ROOT, 'assets', 'georgia-ops-logo.png');
export const GEORGIA_BANNER_PATH = path.join(ROOT, 'assets', 'georgia-ops-banner.png');
const DEFAULT_STATE_PATH = path.join(ROOT, 'data', 'georgia-ops-profile.json');

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

/** Apply the requested name, logo, and banner to the bot in the Georgia server. */
export async function ensureGeorgiaServerProfile(client, { statePath = DEFAULT_STATE_PATH } = {}) {
  const guild = client.guilds.cache.get(GEORGIA_GUILD_ID)
    || await client.guilds.fetch(GEORGIA_GUILD_ID).catch((error) => {
      logger.warn(`Georgia Operations: could not fetch guild ${GEORGIA_GUILD_ID}: ${error?.message || error}`);
      return null;
    });
  if (!guild) {
    logger.warn(`Georgia Operations: bot is not in guild ${GEORGIA_GUILD_ID}; skipping profile.`);
    return false;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    logger.warn('Georgia Operations: could not resolve bot member for profile edit.');
    return false;
  }

  const [logo, banner, state] = await Promise.all([
    loadAsset(GEORGIA_LOGO_PATH),
    loadAsset(GEORGIA_BANNER_PATH),
    readProfileState(statePath),
  ]);
  const needsNick = me.nickname !== GEORGIA_NICKNAME;
  const needsAvatar = state.logoSha256 !== logo.sha256 || !me.avatar;
  const needsBanner = state.bannerSha256 !== banner.sha256 || !me.banner;
  if (!needsNick && !needsAvatar && !needsBanner) {
    logger.info(`Georgia Operations: server profile already set (${GEORGIA_NICKNAME}).`);
    return true;
  }

  const options = { reason: 'Georgia Operations server profile' };
  if (needsNick) options.nick = GEORGIA_NICKNAME;
  if (needsAvatar) options.avatar = logo.buffer;
  if (needsBanner) options.banner = `data:image/png;base64,${banner.buffer.toString('base64')}`;

  try {
    await guild.members.editMe(options);
    await writeProfileState(statePath, {
      logoSha256: logo.sha256,
      bannerSha256: banner.sha256,
      nick: GEORGIA_NICKNAME,
      updatedAt: new Date().toISOString(),
    });
    logger.info(
      'Georgia Operations: updated server profile'
      + `${needsNick ? ` nick="${GEORGIA_NICKNAME}"` : ''}`
      + `${needsAvatar ? ' avatar' : ''}`
      + `${needsBanner ? ' banner' : ''}.`,
    );
    return true;
  } catch (error) {
    logger.error('Georgia Operations: failed to update full server profile; retrying nickname', error);
    try {
      await guild.members.editMe({
        reason: 'Georgia Operations server profile (partial)',
        nick: GEORGIA_NICKNAME,
      });
      await writeProfileState(statePath, {
        ...state,
        nick: GEORGIA_NICKNAME,
        updatedAt: new Date().toISOString(),
      });
      logger.info('Georgia Operations: applied nickname after a partial profile failure.');
    } catch (fallbackError) {
      logger.error('Georgia Operations: fallback nickname update failed', fallbackError);
    }
    return false;
  }
}

export function georgiaWelcomePayload(member) {
  const memberCount = Number(member.guild?.memberCount) || member.guild?.members?.cache?.size || 0;
  return {
    content: [
      `<:wave1:1558521422421430412> Welcome <@${member.id}> to **<:logo:1558521199028469800> Georgia State Roleplay**, Georgia Roleplay like never before, where realistic roleplay meets endless possibilities.. We're very excited to have you!`,
      '-# Vist one of our sessions in https://discord.com/channels/1557972171522052226/1558248110877057206. For CAD and Roleplay info, visit https://discord.com/channels/1557972171522052226/1558248547193720842.',
    ].join('\n'),
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('georgia:welcome:members')
          .setLabel(String(memberCount))
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setLabel('#dashboard')
          .setStyle(ButtonStyle.Link)
          .setURL(GEORGIA_DASHBOARD_URL),
      ),
    ],
    allowedMentions: { parse: [], users: [member.id] },
  };
}

export async function sendGeorgiaWelcome(member) {
  if (String(member.guild?.id) !== GEORGIA_GUILD_ID) return false;
  if (member.user?.bot) return false;

  const channel = member.guild.channels.cache.get(GEORGIA_WELCOME_CHANNEL_ID)
    || await member.guild.channels.fetch(GEORGIA_WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) {
    logger.warn(`Georgia Operations: welcome channel ${GEORGIA_WELCOME_CHANNEL_ID} unavailable.`);
    return false;
  }

  await channel.send(georgiaWelcomePayload(member));
  logger.info(`Georgia Operations: welcomed ${member.user?.tag || member.id}.`);
  return true;
}
