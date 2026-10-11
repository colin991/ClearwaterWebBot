import { readEventBytes, verifyErlcEvent } from '../lib/erlc-webhook.js';
import { createErlcEventRelay } from './erlcEventRelay.js';
import { logIncomingErlcWebhook } from './erlcSceneCommands.js';
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { postPcsoSiteForm } from './pcsoSiteFormDiscord.js';
import { savePcsoSiteForm } from './pcsoSiteForms.js';
import { handlePcsoPortal } from './pcsoSitePortal.js';
import { refreshPcsoNewsImages } from './pcsoDiscordNews.js';
import { handleEmployeeAction, postPcsoErlcApi } from './pcsoEmployee.js';
import {
  addPcsoEventItem,
  addPcsoNewsItem,
  addPcsoStarItem,
  deletePcsoContentItem,
  getPcsoSiteContent,
} from './pcsoSiteContent.js';
import { getPcsoChatbot, matchPcsoChatbotReply, savePcsoChatbot } from './pcsoChatbot.js';
import { memberHasSiteAccess } from '../lib/site-access.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank, getInternetBadges, getStaffPanelAccess } from './staffRanks.js';
import { config } from '../config.js';
import { handleRadioUpgrade, radioWebSession } from './radioBot.js';
import { radioStaffSnapshot, runRadioStaffAction } from './radioStaff.js';
import { PermissionFlagsBits } from 'discord.js';

const UNKNOWN_MEMBER = 10007;
const ACCESS_CACHE_MS = 30_000;
const accessCache = new Map();

/** Live Clearwater membership + roles for the website, so stale login roles are not trusted. */
async function resolveWebsiteAccess(client, discordId) {
  const cached = accessCache.get(discordId);
  if (cached && Date.now() - cached.at < ACCESS_CACHE_MS) return cached.access;
  const access = await fetchWebsiteAccess(client, discordId);
  if (access) {
    accessCache.set(discordId, { at: Date.now(), access });
    if (accessCache.size > 1000) {
      for (const [key, entry] of accessCache) {
        if (Date.now() - entry.at >= ACCESS_CACHE_MS) accessCache.delete(key);
      }
    }
  }
  return access;
}

async function fetchWebsiteAccess(client, discordId) {
  const guild = client?.guilds?.cache?.get(CLEARWATER_GUILD_ID);
  if (!guild) return null;
  let member;
  try {
    member = await guild.members.fetch({ user: discordId, force: true });
  } catch (error) {
    if (error?.code === UNKNOWN_MEMBER) {
      return { member: false, memberChecked: true, siteAccess: false, panelAccess: null, staffRank: null, badges: [] };
    }
    throw error;
  }
  const options = { ownerDiscordIds: config.ownerDiscordIds, ownerRoleIds: config.ownerRoleIds };
  return {
    member: true,
    memberChecked: true,
    siteAccess: memberHasSiteAccess(member, options),
    panelAccess: getStaffPanelAccess(member, options),
    staffRank: getHighestStaffRank(member)?.name || null,
    badges: getInternetBadges(member),
  };
}

/**
 * Website radio staff panel (cwpcso.com/radio-staff): only members with Administrator in the
 * Clearwater server, checked live each time so a removed admin loses it straight away.
 */
export async function radioStaffGuild(client, discordId) {
  if (!/^\d{15,22}$/.test(discordId)) return { status: 400, error: 'Invalid discordId' };
  const guild = client?.guilds?.cache?.get(CLEARWATER_GUILD_ID);
  if (!guild) return { status: 503, error: 'The bot cannot see the Clearwater server right now.' };
  let member;
  try {
    member = await guild.members.fetch({ user: discordId, force: true });
  } catch (error) {
    if (error?.code === UNKNOWN_MEMBER) return { status: 403, error: 'You are not in the Clearwater server.' };
    throw error;
  }
  if (!member.permissions?.has(PermissionFlagsBits.Administrator)) {
    return { status: 403, error: 'Only Clearwater admins can use the radio staff panel.' };
  }
  return { guild, member };
}

function radioStaffView(guild, member) {
  const nameOf = (id) => guild.members.cache.get(id)?.displayName || '';
  return { admin: { id: member.id, name: member.displayName }, ...radioStaffSnapshot(nameOf) };
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function authorized(request, apiKey) {
  const header = String(request.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!apiKey || !token) return false;
  const left = Buffer.from(token);
  const right = Buffer.from(apiKey);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function readBinaryBody(request, maxBytes = 96_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxBytes) throw new Error('Request body too large');
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Tiny bot-host HTTP surface so the website can reach portal/forms via BOT_API_URL.
 * Listens on SERVER_PORT / PORT when configured.
 */
export function startBotApiServer(client, {
  port = Number(process.env.SERVER_PORT || process.env.PORT || 0),
  apiKey = process.env.BOT_API_KEY || '',
} = {}) {
  const listenPort = Number(port);
  if (!Number.isInteger(listenPort) || listenPort <= 0) {
    logger.info('Bot API server skipped (no SERVER_PORT/PORT). Website bridge stays offline.');
    return () => {};
  }
  if (!apiKey) {
    logger.warn('Bot API server skipped (BOT_API_KEY missing).');
    return () => {};
  }

  const eventRelay = createErlcEventRelay({
    onEvent: (event, id) => {
      logger.info(`ER:LC event received ${String(id || '').slice(0, 12)} keys=${Object.keys(event || {}).slice(0, 12).join(',')}`);
      client.emit('erlcEvent', event, id);
      void logIncomingErlcWebhook(client, event, id).catch((error) => {
        logger.warn(`ER:LC command webhook log failed: ${error?.message || error}`);
      });
    },
  });
  const flushEvents = () => { void eventRelay.tick().catch(error => logger.error('ERLC event relay failed', error)); };
  const eventTimer = setInterval(flushEvents, 5000);
  eventTimer.unref();
  flushEvents();

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', `http://127.0.0.1:${listenPort}`);
      if (!authorized(request, apiKey)) {
        return sendJson(response, 401, { error: 'Unauthorized' });
      }

      if (url.pathname === '/api/erlc/events') {
        if (request.method === 'GET') return sendJson(response, 200, await eventRelay.inspect());
        if (request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
        try {
          const event = verifyErlcEvent(await readEventBytes(request), request.headers);
          const receipt = await eventRelay.accept(event);
          sendJson(response, 200, receipt);
          flushEvents();
          return;
        } catch (error) {
          return sendJson(response, error.status || 503, { error: error.status ? error.message : 'Event persistence unavailable' });
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/access') {
        const discordId = String(url.searchParams.get('discordId') || '');
        if (!/^\d{15,22}$/.test(discordId)) return sendJson(response, 400, { error: 'Invalid discordId' });
        const access = await resolveWebsiteAccess(client, discordId);
        if (!access) return sendJson(response, 503, { error: 'Clearwater guild unavailable' });
        return sendJson(response, 200, access);
      }

      if (request.method === 'GET' && url.pathname === '/api/radio/web-session') {
        const discordId = String(url.searchParams.get('discordId') || '');
        if (!/^\d{15,22}$/.test(discordId)) return sendJson(response, 400, { error: 'Invalid discordId' });
        const session = radioWebSession(discordId);
        return sendJson(response, session.error ? 503 : 200, session);
      }

      if (url.pathname === '/api/radio/staff') {
        if (request.method !== 'GET' && request.method !== 'POST') return sendJson(response, 405, { error: 'Method not allowed' });
        let payload = {};
        if (request.method === 'POST') {
          try {
            payload = JSON.parse((await readBinaryBody(request, 4_000)).toString('utf8') || '{}');
          } catch {
            return sendJson(response, 400, { error: 'Invalid JSON.' });
          }
        }
        const discordId = String(request.method === 'POST' ? payload.discordId || '' : url.searchParams.get('discordId') || '');
        const access = await radioStaffGuild(client, discordId);
        if (access.error) return sendJson(response, access.status, { error: access.error });

        if (request.method === 'GET') {
          const query = String(url.searchParams.get('q') || '').trim().slice(0, 32);
          if (!query) return sendJson(response, 200, radioStaffView(access.guild, access.member));
          // Find a member who is not on a radio, to mute them before they sign in.
          const found = /^\d{15,22}$/.test(query)
            ? await access.guild.members.fetch(query).then((member) => [member]).catch(() => [])
            : [...(await access.guild.members.search({ query, limit: 8 }).catch(() => new Map())).values()];
          return sendJson(response, 200, {
            members: found.filter((member) => !member.user?.bot).map((member) => ({
              userId: member.id,
              name: member.displayName,
              username: member.user?.username || '',
            })),
          });
        }

        try {
          const result = await runRadioStaffAction(String(payload.action || ''), String(payload.userId || ''), discordId, { from: 'website' });
          return sendJson(response, 200, { ...result, ...radioStaffView(access.guild, access.member) });
        } catch (error) {
          return sendJson(response, error?.status || 500, { error: error?.status ? error.message : 'That did not work. Try again.' });
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/status') {
        return sendJson(response, 200, {
          online: Boolean(client?.isReady?.()),
          updatedAt: new Date().toISOString(),
          guild: {
            memberCount: client?.guilds?.cache?.first()?.memberCount ?? null,
          },
          bot: {
            latencyMs: Math.round(client?.ws?.ping || 0),
          },
          melonlyConfigured: Boolean(process.env.MELONLY_API_KEY?.trim()),
        });
      }

      if (request.method === 'POST' && url.pathname === '/api/pcso/site-form') {
        const raw = await readBinaryBody(request, 80_000);
        let record;
        try {
          record = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        if (!record?.kind) return sendJson(response, 400, { error: 'Unknown form.' });
        const saved = await savePcsoSiteForm(record);
        const result = await postPcsoSiteForm(client, saved);
        return sendJson(response, 200, { ok: true, id: saved.id, ...result });
      }

      if (request.method === 'POST' && url.pathname === '/api/pcso/employee') {
        const raw = await readBinaryBody(request, 80_000);
        let payload;
        try {
          payload = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        try {
          const result = await handleEmployeeAction(
            payload.action,
            payload.payload || {},
            payload.user,
            { postPcsoErlcApi },
          );
          return sendJson(response, 200, result);
        } catch (error) {
          const status = error?.status || 400;
          return sendJson(response, status, { error: error?.message || 'Employee request failed.' });
        }
      }

      if (request.method === 'POST' && url.pathname === '/api/pcso/portal') {
        const raw = await readBinaryBody(request, 80_000);
        let payload;
        try {
          payload = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        try {
          const result = await handlePcsoPortal(client, payload);
          return sendJson(response, 200, result);
        } catch (error) {
          const status = error?.status || 400;
          return sendJson(response, status, { error: error?.message || 'Portal request failed.' });
        }
      }

      if (url.pathname === '/api/pcso/content') {
        if (request.method === 'GET') {
          const content = await refreshPcsoNewsImages(client, await getPcsoSiteContent());
          return sendJson(response, 200, { ok: true, ...content });
        }
        if (!['POST', 'DELETE'].includes(request.method || '')) {
          return sendJson(response, 405, { error: 'Method not allowed' });
        }
        const raw = await readBinaryBody(request, 80_000);
        let payload;
        try {
          payload = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        if (request.method === 'DELETE') {
          const kind = payload.kind === 'event' ? 'event' : (payload.kind === 'star' ? 'star' : 'news');
          return sendJson(response, 200, { ok: true, ...(await deletePcsoContentItem(kind, payload.id)) });
        }
        const content = payload.kind === 'event'
          ? await addPcsoEventItem(payload)
          : payload.kind === 'star'
            ? await addPcsoStarItem(payload)
            : await addPcsoNewsItem(payload);
        return sendJson(response, 200, { ok: true, ...content });
      }

      if (url.pathname === '/api/pcso/chatbot') {
        if (request.method === 'GET') {
          return sendJson(response, 200, { ok: true, ...(await getPcsoChatbot()) });
        }
        if (!['POST', 'PUT'].includes(request.method || '')) {
          return sendJson(response, 405, { error: 'Method not allowed' });
        }
        const raw = await readBinaryBody(request, 100_000);
        let payload;
        try {
          payload = JSON.parse(raw.toString('utf8') || '{}');
        } catch {
          return sendJson(response, 400, { error: 'Invalid JSON.' });
        }
        if (request.method === 'POST') {
          const message = String(payload.message || '').trim().slice(0, 500);
          if (!message) return sendJson(response, 400, { error: 'Enter a question first.' });
          const config = await getPcsoChatbot();
          return sendJson(response, 200, { ok: true, ...matchPcsoChatbotReply(message, config) });
        }
        return sendJson(response, 200, { ok: true, ...(await savePcsoChatbot(payload)) });
      }

      return sendJson(response, 404, { error: 'Not found' });
    } catch (error) {
      logger.error('Bot API server request failed', error);
      return sendJson(response, 500, { error: error?.message || 'Server error' });
    }
  });

  // Clearwater Radio desktop apps connect over WebSocket at /radio on this same port.
  server.on('upgrade', (request, socket, head) => {
    if (!handleRadioUpgrade(request, socket, head)) socket.destroy();
  });

  server.on('error', (error) => {
    if (error?.code === 'EADDRINUSE') {
      logger.warn(`Bot API server port ${listenPort} is already in use; website bridge HTTP endpoint not bound.`);
      return;
    }
    logger.error('Bot API server error', error);
  });

  server.listen(listenPort, '0.0.0.0', () => {
    logger.info(`Bot API server listening on :${listenPort} (portal + site forms + status).`);
  });

  return () => {
    clearInterval(eventTimer);
    try { server.close(); } catch { /* ignore */ }
  };
}
