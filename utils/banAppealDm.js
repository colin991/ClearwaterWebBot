import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  TextDisplayBuilder,
} from 'discord.js';
import { resolve } from 'node:path';
import { CLEARWATER_GUILD_ID } from './staffRanks.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';

export const BAN_APPEAL_URL = 'https://melon.ly/form/7508742039031255040';
export const BAN_APPEAL_LOG_CHANNEL_ID = '1549178818814812211';
export const BAN_APPEAL_STORE_PATH = resolve('data/ban-appeal-dms.json');
export const BAN_APPEAL_DM_DELAY_MS = 1_200;

const emptyStore = () => ({ notified: {} });

let storePath = BAN_APPEAL_STORE_PATH;
let dmDelayMs = BAN_APPEAL_DM_DELAY_MS;
let dmQueue = Promise.resolve();

function enqueueDm(work) {
  const run = dmQueue.then(work, work);
  dmQueue = run.catch(() => {});
  return run;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function setBanAppealStorePath(path) {
  storePath = path || BAN_APPEAL_STORE_PATH;
}

export function setBanAppealDmDelayMs(ms) {
  dmDelayMs = Math.max(0, Number(ms) || 0);
}

async function loadStore() {
  const stored = await readJsonFile(storePath, emptyStore());
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return emptyStore();
  if (!stored.notified || typeof stored.notified !== 'object') stored.notified = {};
  return stored;
}

async function saveStore(store) {
  await writeJsonFile(storePath, store);
}

function userIdOf(user) {
  return String(user?.id || '').trim();
}

export function wasBanAppealNotified(store, userId) {
  return Boolean(store?.notified?.[String(userId)]);
}

export function buildBanAppealDmPayload({ reason = '' } = {}) {
  const reasonLine = String(reason || '').trim();
  const container = new ContainerBuilder().clearAccentColor()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent([
      '# You were banned from Clearwater Roleplay',
      reasonLine
        ? `**Reason:** ${reasonLine.slice(0, 900)}`
        : 'A staff member banned you from the main Clearwater Discord.',
      '',
      `If you believe this was a mistake, submit a ban appeal: ${BAN_APPEAL_URL}`,
    ].join('\n')))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Ban Appeal')
        .setStyle(ButtonStyle.Link)
        .setURL(BAN_APPEAL_URL),
    ));
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function banAppealLogBody({
  ok = false,
  user = {},
  source = 'ban',
  reason = '',
  error = '',
} = {}) {
  const who = `${user.tag || user.username || 'unknown'} (\`${user.id || 'unknown'}\`)`;
  const why = String(reason || '').trim();
  const status = ok ? 'SENT' : 'FAIL';
  const extra = [why && `reason ${why.slice(0, 180)}`, error && String(error).slice(0, 180)]
    .filter(Boolean)
    .join(' · ');
  return `${status} — ${who} · ${source}${extra ? ` · ${extra}` : ''}`;
}

async function logBanAppealDm(client, details) {
  const body = banAppealLogBody(details);
  logger.info(`[BanAppealDM] ${body}`);
  if (!client?.channels) return false;
  try {
    const channel = client.channels.cache?.get(BAN_APPEAL_LOG_CHANNEL_ID)
      || await client.channels.fetch?.(BAN_APPEAL_LOG_CHANNEL_ID).catch(() => null);
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return false;
    await channel.send({
      content: `[BanAppealDM] ${body}`.slice(0, 1900),
      allowedMentions: { parse: [] },
    });
    return true;
  } catch (error) {
    logger.warn(`Ban appeal DM log failed: ${error?.message || error}`);
    return false;
  }
}

export async function forgetBanAppealDm(userId) {
  const id = String(userId || '');
  if (!/^\d{16,22}$/.test(id)) return false;
  const store = await loadStore();
  if (!store.notified[id]) return false;
  delete store.notified[id];
  await saveStore(store);
  return true;
}

export async function notifyBannedUser(client, user, {
  reason = '',
  source = 'ban',
  force = false,
} = {}) {
  const id = userIdOf(user);
  if (!/^\d{16,22}$/.test(id)) return { sent: false, reason: 'no_user' };
  if (user.bot) return { sent: false, reason: 'bot' };

  return enqueueDm(async () => {
    const store = await loadStore();
    if (!force && wasBanAppealNotified(store, id)) {
      return { sent: false, reason: 'already_notified' };
    }

    let ok = false;
    let error = '';
    try {
      if (typeof user.send !== 'function') throw new Error('user cannot receive DMs');
      await user.send(buildBanAppealDmPayload({ reason }));
      ok = true;
    } catch (sendError) {
      error = sendError?.message || String(sendError);
    }

    store.notified[id] = {
      at: new Date().toISOString(),
      ok,
      source,
      error: error || undefined,
    };
    await saveStore(store);
    await logBanAppealDm(client, { ok, user: { id, tag: user.tag, username: user.username }, source, reason, error });
    if (dmDelayMs) await delay(dmDelayMs);
    return { sent: ok, reason: ok ? 'sent' : 'dm_failed', error };
  });
}

export async function handleMainServerBan(ban, client) {
  if (String(ban?.guild?.id || '') !== CLEARWATER_GUILD_ID) {
    return { skipped: true, reason: 'not-main' };
  }
  return notifyBannedUser(client || ban?.client, ban.user, {
    reason: ban.reason || '',
    source: 'ban',
  });
}
