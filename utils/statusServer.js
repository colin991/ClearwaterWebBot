import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { buildDiscordCatalog, getOwnerConfig, saveOwnerConfig } from './ownerConfig.js';
import { memberHasSiteAccess } from '../lib/site-access.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank, getInternetBadges, getStaffPanelAccess, isDeveloperAccount, LIMITED_STAFF_FORBIDDEN_ACTIONS } from './staffRanks.js';
import { dropLocationNameCandidates, fetchErlcPlayersOnMap, fetchErlcServer, findPlayerDropLocation, parseErlcPlayer, playersOnLibertyMap, runErlcModeration, runErlcRawCommand } from './erlc.js';
import { getIdentityCache, rememberIdentity } from './identityStore.js';
import { findRobloxIdentity, safeMelonlyError } from './melonly.js';
import { AUTOMOD_HOLD_MESSAGE } from './internetAutomod.js';
import { AutomodHoldError, adjustInternetCredits, addBusinessMember, applyStaffSiteAction, applyStaffUserAction, assertBusinessAccess, assertLimitedStaffBanQuota, banKnownInternetIps, businessActorFromAccount, claimInternetDailyCredits, claimRobloxCreditPacks, clearExpiredInternetBans, clearExpiredInternetIpBans, clearKnownInternetIpBans, createCreditTransfer, createInternetAdReport, createInternetPost, createInternetReport, deleteInternetAccount, deleteInternetPost, editInternetPost, ensureBankInternetAccount, ensureOfficialInternetAccount, findMyDirectory, getActiveBan, getActiveInternetIpBan, interactInternetPost, internetFeedDiscordRef, internetPreferences, internetProfile, listGovernmentFines, listInternetAdsForUser, listMyBusinessAccounts, manageInternetAd, membersSharingWith, moderationSnapshot, myVerificationApplication, BANK_INTERNET_ACCOUNT_ID, OFFICIAL_INTERNET_ACCOUNT_ID, publicInternetSettings, publicPosts, publicUsers, purchaseInternetAd, purchasePostBoost, readInternetStore, recordInternetAdClick, recordInternetIpHash, recordLimitedStaffBan, removeBusinessMember, respondCreditTransfer, reviewBusinessApplication, reviewGovernmentFine, reviewInternetAd, reviewInternetReport, reviewVerificationApplication, revertInternetHistory, saveInternetStore, queueInternetStoreSave, searchStaffUsers, sendInternetMessage, serveInternetAds, setBusinessMemberRole, setDiscordInternetNotify, setFindMyShare, setInternetAccountActive, setInternetBan, setInternetPostDiscordFeedMessage, socialSnapshot, staffUserConversation, staffUserDetail, staffUserMessages, submitBusinessApplication, submitGovernmentFine, submitVerificationApplication, takeInternetConversation, takeInternetMessages, takeInternetNotifications, countUnreadInternetWarnings, takeUnreadInternetWarnings, touchInternetUser, updateBusinessProfile, updateInternetPreference, updateInternetProfile, updateInternetSocial, updateOfficialInternetProfile, upsertInternetUser, voteInternetPoll, walletSnapshot, internetAdPricing } from './internetStore.js';
import { createDiscordInternetNotifier } from './discordInternetNotify.js';
import { createInternetFeedController, shouldAnnounceInteractResult } from './discordInternetFeed.js';
import { markInternetPresence } from './internetPresence.js';
import { RateLimitError } from './rateLimit.js';
import { appendUpdateEntry, flushPendingUpdateLogs, postUpdateLog } from './updateLog.js';
import {
  GOVERNMENT_GUILD_ID,
  rolesAllowGovernmentAccess,
  rolesAllowGovernmentReview,
} from './governmentAccess.js';
import { logGovernmentFine } from './governmentLog.js';

const json = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

function guessReelContentType(source, kind, upstreamType = '') {
  const typed = String(upstreamType || '').split(';')[0].trim().toLowerCase();
  if (typed && typed !== 'application/octet-stream') return typed;
  const lower = String(source || '').toLowerCase();
  if (kind === 'audio' || /\.(?:mp3|m4a|aac|wav|ogg)(?:$|\?)/i.test(lower)) {
    if (/\.wav(?:$|\?)/i.test(lower)) return 'audio/wav';
    if (/\.ogg(?:$|\?)/i.test(lower)) return 'audio/ogg';
    if (/\.(?:m4a|aac)(?:$|\?)/i.test(lower)) return 'audio/mp4';
    return 'audio/mpeg';
  }
  if (kind === 'video' || /\.(?:mp4|webm|mov)(?:$|\?)/i.test(lower)) {
    if (/\.webm(?:$|\?)/i.test(lower)) return 'video/webm';
    if (/\.mov(?:$|\?)/i.test(lower)) return 'video/quicktime';
    return 'video/mp4';
  }
  if (/\.png(?:$|\?)/i.test(lower)) return 'image/png';
  if (/\.webp(?:$|\?)/i.test(lower)) return 'image/webp';
  if (/\.gif(?:$|\?)/i.test(lower)) return 'image/gif';
  if (/\.(?:jpe?g)(?:$|\?)/i.test(lower)) return 'image/jpeg';
  return typed || 'application/octet-stream';
}

function sendMediaBuffer(response, buffer, contentType, rangeHeader = '') {
  const total = buffer.length;
  const headers = {
    'Content-Type': contentType || 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  };
  const match = String(rangeHeader || '').match(/^bytes=(\d*)-(\d*)$/i);
  if (match) {
    let start = match[1] === '' ? null : Number(match[1]);
    let end = match[2] === '' ? null : Number(match[2]);
    if (start == null && end != null) {
      start = Math.max(0, total - end);
      end = total - 1;
    } else {
      start = Number.isFinite(start) ? start : 0;
      end = end == null || !Number.isFinite(end) ? total - 1 : Math.min(end, total - 1);
    }
    if (start < 0 || end < 0 || start >= total || start > end) {
      response.writeHead(416, { ...headers, 'Content-Range': `bytes */${total}` });
      return response.end();
    }
    const slice = buffer.subarray(start, end + 1);
    response.writeHead(206, {
      ...headers,
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Content-Length': slice.length,
    });
    return response.end(slice);
  }
  response.writeHead(200, { ...headers, 'Content-Length': total });
  return response.end(buffer);
}

async function serveStoredReel(request, response, store, reelId, kind, index = null) {
  const post = store.posts.find((item) => item.id === reelId);
  let source = '';
  if (kind === 'video') {
    source = post?.videoUrl || '';
  } else if (kind === 'audio') {
    source = post?.audioUrl || '';
  } else if (kind === 'image') {
    const slides = Array.isArray(post?.slideshowUrls) ? post.slideshowUrls.filter(Boolean) : [];
    if (slides.length) {
      const slideIndex = Math.max(0, Math.min(slides.length - 1, Number.parseInt(String(index ?? '0'), 10) || 0));
      source = slides[slideIndex] || '';
    } else {
      source = post?.imageUrl || '';
    }
  } else {
    source = post?.videoUrl || post?.imageUrl || '';
  }

  // Older/corrupt rows sometimes stored the public proxy path instead of the
  // real blob/data URL. That used to 404 and show "photo could not be loaded".
  if (String(source).startsWith('/api/media')) {
    source = '';
  }

  if (!post || !source) {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    return response.end();
  }

  if (/^https:\/\//i.test(source)) {
    // Video/audio need HTTP Range from the origin host. Buffering them through
    // this proxy breaks the vertical player (black frame / "cannot play here").
    if (kind === 'video' || kind === 'audio') {
      response.writeHead(302, {
        Location: source,
        'Cache-Control': 'private, max-age=60',
      });
      return response.end();
    }
    try {
      const upstream = await fetch(source, {
        redirect: 'follow',
        signal: AbortSignal.timeout(20_000),
        headers: { Accept: 'image/*,video/*,audio/*,*/*;q=0.8' },
      });
      if (!upstream.ok) {
        response.writeHead(404, { 'Cache-Control': 'no-store' });
        return response.end();
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      // Keep responses under Vercel's ~4.5MB serverless payload limit when this
      // host is reached through /api/media. Larger files fall back to a redirect
      // (CSP allows *.public.blob.vercel-storage.com).
      if (buffer.length > 3_500_000) {
        response.writeHead(302, { Location: source, 'Cache-Control': 'no-store' });
        return response.end();
      }
      return sendMediaBuffer(
        response,
        buffer,
        guessReelContentType(source, kind, upstream.headers.get('content-type')),
        request?.headers?.range,
      );
    } catch {
      response.writeHead(502, { 'Cache-Control': 'no-store' });
      return response.end();
    }
  }

  const match = String(source).replace(/\s+/g, '').match(/^data:([^;]+);base64,([a-z0-9+/]+=*)$/i);
  if (!match) {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    return response.end();
  }
  const buffer = Buffer.from(match[2], 'base64');
  return sendMediaBuffer(
    response,
    buffer,
    guessReelContentType(source, kind, match[1]),
    request?.headers?.range,
  );
}

const safeEqual = (left = '', right = '') => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

async function resolveGovernmentAccess(client, config, actor = {}) {
  const discordId = String(actor?.id || '');
  const ownerDiscordIds = (config.ownerDiscordIds || []).map(String);
  const ownership = ownerDiscordIds.includes(discordId)
    || isDeveloperAccount({ id: discordId, username: actor?.username });

  // Ownership on the main Clearwater guild also unlocks every government tool.
  if (!ownership) {
    const mainGuild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
      || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
    const mainMember = mainGuild ? await mainGuild.members.fetch(discordId).catch(() => null) : null;
    if (getStaffPanelAccess(mainMember, {
      ownerDiscordIds,
      ownerRoleIds: config.ownerRoleIds || [],
    }) === 'full') {
      return { governmentAccess: true, governmentReview: true, ownership: true, governmentRoles: [] };
    }
  } else {
    return { governmentAccess: true, governmentReview: true, ownership: true, governmentRoles: [] };
  }

  let governmentRoles = [];
  const govGuild = client.guilds.cache.get(GOVERNMENT_GUILD_ID)
    || await client.guilds.fetch(GOVERNMENT_GUILD_ID).catch(() => null);
  if (govGuild && /^\d{16,22}$/.test(discordId)) {
    const govMember = await govGuild.members.fetch(discordId).catch(() => null);
    if (govMember) governmentRoles = [...govMember.roles.cache.keys()].map(String);
  }

  return {
    governmentAccess: rolesAllowGovernmentAccess(governmentRoles),
    governmentReview: rolesAllowGovernmentReview(governmentRoles),
    ownership: false,
    governmentRoles,
  };
}

const readJson = async (request) => {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 4_400_000) throw new Error('Request body too large');
  }
  return raw ? JSON.parse(raw) : {};
};

async function discordDropUsernames(client, actor) {
  const discordId = String(actor?.id || '');
  const fallback = dropLocationNameCandidates(actor?.username, actor?.displayName);
  if (!/^\d{16,22}$/.test(discordId)) return fallback;
  const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
    || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
  if (!guild) return fallback;
  const member = await guild.members.fetch(discordId).catch(() => null);
  if (!member) return fallback;
  return dropLocationNameCandidates(
    member.nickname,
    member.displayName,
    member.user?.username,
    member.user?.globalName,
    actor?.username,
    actor?.displayName,
  );
}

function pinFromParsedPlayer(player) {
  if (!player) return null;
  const mapped = playersOnLibertyMap([player])[0];
  if (!mapped) return null;
  return {
    username: mapped.username,
    team: mapped.team,
    postal: mapped.postal,
    street: mapped.street,
    building: mapped.building,
    label: mapped.label,
    left: mapped.left,
    top: mapped.top,
  };
}

function matchParsedPlayer(players, { robloxId, usernames = [] } = {}) {
  const id = String(robloxId || '').replace(/[^\d]/g, '');
  const handles = new Set(dropLocationNameCandidates(...usernames).map((name) => name.toLowerCase()));
  return players.find((entry) => handles.has(String(entry.username || '').toLowerCase()))
    || players.find((entry) => id && String(entry.robloxId) === id)
    || null;
}

function phonePlacesFromPlayers(players) {
  const buckets = new Map();
  for (const player of players) {
    const pin = pinFromParsedPlayer(player);
    if (!pin) continue;
    const key = String(pin.postal || pin.street || pin.label || '').trim().toLowerCase();
    if (!key) continue;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, { label: pin.label, postal: pin.postal, street: pin.street, left: pin.left, top: pin.top, n: 1 });
    } else {
      current.left = (current.left * current.n + pin.left) / (current.n + 1);
      current.top = (current.top * current.n + pin.top) / (current.n + 1);
      current.n += 1;
    }
  }
  return [...buckets.values()]
    .map(({ n, ...place }) => ({
      ...place,
      left: Number(place.left.toFixed(5)),
      top: Number(place.top.toFixed(5)),
    }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label)))
    .slice(0, 80);
}

export function startStatusServer(client, config) {
  let lastInternetRoleSync = 0;
  setDiscordInternetNotify(createDiscordInternetNotifier(client, { websiteUrl: config.websiteUrl }));
  const internetFeed = createInternetFeedController(client, config);

  const persistInternetFeedMessageId = (postId, messageId) => {
    if (!postId || !messageId) return;
    void (async () => {
      try {
        const store = await readInternetStore();
        if (setInternetPostDiscordFeedMessage(store, postId, messageId)) {
          await saveInternetStore(store);
        }
      } catch (error) {
        logger.error('Could not persist Discord internet feed message id', error);
      }
    })();
  };

  const syncAnnounceInternetFeed = (post) => {
    void (async () => {
      try {
        const messageId = await internetFeed.announce(post);
        persistInternetFeedMessageId(post?.id, messageId);
      } catch (error) {
        logger.error('Internet feed announce failed', error);
      }
    })();
  };

  const syncUpdateInternetFeed = (post) => {
    if (!post) return;
    void internetFeed.update(post).catch((error) => {
      logger.error('Internet feed update failed', error);
    });
  };

  const syncDeletedInternetFeed = (refs) => {
    const list = (Array.isArray(refs) ? refs : [refs]).filter(Boolean);
    for (const ref of list) {
      void internetFeed.markDeleted(ref).catch((error) => {
        logger.error('Internet feed delete sync failed', error);
      });
    }
  };

  const resolveLiveStaffPanel = async (actor, proxyPanel = null) => {
    const discordId = String(actor?.id || '');
    if (!/^\d{16,22}$/.test(discordId)) return null;
    if (isDeveloperAccount(actor)) return 'full';
    const ownerDiscordIds = config.ownerDiscordIds || [];
    const ownerRoleIds = config.ownerRoleIds || [];
    if (ownerDiscordIds.map(String).includes(discordId)) return 'full';

    const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
      || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
    if (!guild) {
      // Bot cannot see the guild — trust the website proxy's already-checked panel.
      return proxyPanel === 'full' || proxyPanel === 'limited' ? proxyPanel : null;
    }

    try {
      const member = await guild.members.fetch(discordId);
      return getStaffPanelAccess(member, { ownerDiscordIds, ownerRoleIds });
    } catch (error) {
      // Confirmed not in guild: no panel. Temporary Discord failures: keep proxy panel.
      if (Number(error?.code) === 10007) return null;
      return proxyPanel === 'full' || proxyPanel === 'limited' ? proxyPanel : null;
    }
  };

  const enforceInternetMembership = async (store, actor) => {
    const discordId = String(actor?.id || '');
    if (!/^\d{16,22}$/.test(discordId)) return true;
    const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
      || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
    if (!guild) return null;
    let member;
    try {
      member = await guild.members.fetch(discordId);
    } catch (error) {
      // Discord uses 10007 only when the user is confirmed not to be in this guild.
      // Network, permissions, and temporary API failures must never create a ban.
      if (Number(error?.code) !== 10007) {
        logger.warn('Could not verify Clearwater Internet membership; leaving access unchanged.');
        return null;
      }
    }

    if (member) {
      const user = store.users[discordId];
      // Rejoining Discord only clears a membership-enforced ban. Owner bans
      // are deliberate moderation actions and must remain in place.
      const isMembershipBan = user?.banSource === 'membership'
        // Bans saved before the source field existed were all automatic
        // membership bans, so keep the promised rejoin-unban behavior.
        || user?.banReason === 'This account is no longer a member of Clearwater Roleplay on Discord.';
      if (user && getActiveBan(user) && isMembershipBan) {
        setInternetBan(user, { enabled: false });
        await saveInternetStore(store);
        logger.info('Unbanned a Clearwater Internet account after confirming Discord membership.');
      }
      return true;
    }
    const user = upsertInternetUser(store, actor);
    if (!getActiveBan(user)) {
      setInternetBan(user, {
        enabled: true,
        reason: 'This account is no longer a member of Clearwater Roleplay on Discord.',
        durationDays: 'forever',
        source: 'membership',
      });
      await saveInternetStore(store);
    }
    return false;
  };

  const syncInternetRoles = async (store) => {
    // Keep older posts accurate even when a Discord role change happened
    // before the bot was restarted. Limit this to once a minute.
    if (Date.now() - lastInternetRoleSync < 60 * 1000) return false;
    lastInternetRoleSync = Date.now();
    const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
      || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
    if (!guild) return false;

    let changed = false;
    const activeAuthorIds = new Set(store.posts.slice(0, 100).map((post) => post.authorId));
    for (const user of Object.values(store.users)) {
      if (!activeAuthorIds.has(user.id) && !user.staffRank && !(user.badges || []).includes('staff')) continue;
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) continue;
      const staffRank = getHighestStaffRank(member)?.name || null;
      const badges = getInternetBadges(member);
      const sameBadges = JSON.stringify([...(user.badges || [])].sort()) === JSON.stringify([...badges].sort());
      if (user.staffRank !== staffRank || !sameBadges) {
        upsertInternetUser(store, { id: user.id, staffRank, badges });
        changed = true;
      }
    }
    return changed;
  };

  const cleanUpInternetData = async () => {
    try {
      const store = await readInternetStore();
      const clearedBans = clearExpiredInternetBans(store);
      const clearedIpBans = clearExpiredInternetIpBans(store);
      if (clearedBans || clearedIpBans) {
        await saveInternetStore(store);
        if (clearedBans) logger.info(`Automatically unbanned ${clearedBans} Clearwater Internet account(s).`);
        if (clearedIpBans) logger.info(`Removed ${clearedIpBans} expired Clearwater Internet network ban(s).`);
      }
    } catch (error) {
      logger.error('Could not clean up expired Clearwater Internet data', error);
    }
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url || '/', 'http://localhost');

    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { ok: true, botOnline: client.isReady() });
    }

    if (!['/api/status', '/api/actions', '/api/config', '/api/access', '/api/internet', '/api/erlc-map', '/api/erlc-command', '/api/update-log'].includes(url.pathname)) {
      return json(response, 404, { error: 'Not found' });
    }

    if (!config.apiKey) {
      return json(response, 503, { error: 'Status connection is not configured' });
    }

    const authorization = request.headers.authorization || '';
    if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), config.apiKey)) {
      return json(response, 401, { error: 'Unauthorized' });
    }

    if (url.pathname === '/api/update-log') {
      try {
        if (request.method === 'POST') {
          const body = await readJson();
          const id = String(body.id || `update-${Date.now()}`).trim();
          const title = String(body.title || '').trim();
          const summary = String(body.summary || body.body || '').trim();
          const commit = String(body.commit || '').trim();
          const updatedBy = String(body.updatedBy || body.author || body.committedBy || '').trim();
          if (!title || !summary) {
            return json(response, 400, { error: 'title and summary are required' });
          }
          const queued = await appendUpdateEntry({
            id,
            title,
            summary,
            commit,
            updatedBy,
            createdAt: body.createdAt || new Date().toISOString(),
          });
          const result = await postUpdateLog(client, config, queued.entry);
          return json(response, result.ok ? 200 : 503, {
            ok: Boolean(result.ok),
            added: queued.added,
            id: queued.entry.id,
            reason: result.reason || null,
          });
        }
        if (request.method === 'GET') {
          const result = await flushPendingUpdateLogs(client, config);
          return json(response, 200, { ok: true, ...result });
        }
        return json(response, 405, { error: 'Method not allowed' });
      } catch (error) {
        logger.error('Update log API failed', error);
        return json(response, 500, { error: error.message || 'Update log failed' });
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/erlc-map') {
      try {
        if (config.erlcServerKey) {
          const snapshot = await fetchErlcPlayersOnMap(config.erlcServerKey);
          return json(response, 200, snapshot);
        }
        const cached = client.erlcStatus;
        if (!cached?.online) {
          return json(response, 503, { error: 'ER:LC is not configured on the bot host yet.', online: false, players: [] });
        }
        return json(response, 200, {
          online: true,
          name: cached.name || 'Clearwater',
          currentPlayers: Number(cached.currentPlayers) || 0,
          maxPlayers: Number(cached.maxPlayers) || 40,
          queue: Number(cached.queue) || 0,
          players: playersOnLibertyMap(cached.players || []),
          updatedAt: cached.updatedAt || new Date().toISOString(),
        });
      } catch (error) {
        logger.warn(`ER:LC map snapshot failed: ${error?.message || error}`);
        return json(response, 502, { error: 'Could not load in-game players right now.', online: false, players: [] });
      }
    }

    if (request.method === 'POST' && url.pathname === '/api/erlc-command') {
      try {
        const body = await readJson(request);
        if (!config.erlcServerKey) {
          return json(response, 503, { error: 'ER:LC is not configured on the bot host yet.' });
        }
        const actor = [body.actorTag, body.actorDiscordId].filter(Boolean).join(' / ') || 'owner';
        if (body.action === 'command' || body.command) {
          const result = await runErlcRawCommand({
            serverKey: config.erlcServerKey,
            command: body.command,
          });
          logger.info(`ER:LC raw command by ${actor}: ${result.command}`);
          return json(response, 200, result);
        }
        const result = await runErlcModeration({
          serverKey: config.erlcServerKey,
          action: body.action,
          players: body.players,
          reason: body.reason,
        });
        logger.info(`ER:LC ${body.action} by ${actor}: ${result.succeeded}/${result.total} ok`);
        return json(response, result.ok ? 200 : 207, result);
      } catch (error) {
        logger.warn(`ER:LC command failed: ${error?.message || error}`);
        return json(response, 400, { error: error?.message || 'Could not run the in-game command' });
      }
    }

    if (request.method === 'GET' && url.pathname === '/api/access') {
      const discordId = url.searchParams.get('discordId') || '';
      if (!/^\d{16,22}$/.test(discordId)) return json(response, 400, { error: 'Invalid Discord user' });
      const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
        || await client.guilds.fetch(CLEARWATER_GUILD_ID).catch(() => null);
      const member = guild ? await guild.members.fetch(discordId).catch(() => null) : null;
      const staffRank = getHighestStaffRank(member);
      const ownerDiscordIds = config.ownerDiscordIds || [];
      const ownerRoleIds = config.ownerRoleIds || [];
      const panelAccess = getStaffPanelAccess(member, { ownerDiscordIds, ownerRoleIds });
      const allowed = panelAccess === 'full';
      const siteAccess = memberHasSiteAccess(member, { ownerDiscordIds });
      const mainRoles = member ? [...member.roles.cache.keys()].map(String) : [];

      // Government roles live on a separate Discord server the bot also joins.
      let governmentRoles = [];
      const govGuild = client.guilds.cache.get(GOVERNMENT_GUILD_ID)
        || await client.guilds.fetch(GOVERNMENT_GUILD_ID).catch(() => null);
      if (govGuild) {
        const govMember = await govGuild.members.fetch(discordId).catch(() => null);
        if (govMember) governmentRoles = [...govMember.roles.cache.keys()].map(String);
      }

      const ownership = allowed
        || ownerDiscordIds.map(String).includes(discordId)
        || isDeveloperAccount({ id: discordId });
      const governmentAccess = ownership || rolesAllowGovernmentAccess(governmentRoles);
      const governmentReview = ownership || rolesAllowGovernmentReview(governmentRoles);

      return json(response, 200, {
        allowed,
        panelAccess,
        siteAccess,
        member: Boolean(member),
        staffRank: staffRank?.name || null,
        badges: getInternetBadges(member),
        roles: mainRoles,
        governmentRoles,
        governmentAccess,
        governmentReview,
      });
    }

    if (request.method === 'POST' && url.pathname === '/api/actions') {
      try {
        const body = await readJson(request);
        if (body.action !== 'ping') return json(response, 400, { error: 'Unsupported action' });

        logger.info('Website action received: ping');
        return json(response, 200, {
          ok: true,
          action: 'ping',
          botOnline: client.isReady(),
          acknowledgedAt: new Date().toISOString(),
        });
      } catch {
        return json(response, 400, { error: 'Invalid request' });
      }
    }

    if (url.pathname === '/api/internet') {
      let store = null;
      try {
        store = await readInternetStore();
        if (request.method === 'GET') {
          const reelId = url.searchParams.get('reel');
          if (reelId) return await serveStoredReel(request, response, store, reelId, url.searchParams.get('kind'), url.searchParams.get('index'));
          const ipBan = getActiveInternetIpBan(store, [
            url.searchParams.get('ipHash'),
            url.searchParams.get('ipHashLegacy'),
          ]);
          if (ipBan) {
            return json(response, 403, { error: 'This network is banned from Clearwater Internet.', ban: ipBan });
          }
          const viewerId = url.searchParams.get('viewer') || '';
          if (viewerId && store.users[viewerId]) {
            const ban = getActiveBan(store.users[viewerId]);
            if (ban) {
              return json(response, 403, { error: 'This account is banned from Clearwater Internet.', ban });
            }
          }
          const createdOfficialAccount = !store.users[OFFICIAL_INTERNET_ACCOUNT_ID];
          const createdBankAccount = !store.users[BANK_INTERNET_ACCOUNT_ID];
          ensureOfficialInternetAccount(store);
          ensureBankInternetAccount(store);
          const rolesChanged = await syncInternetRoles(store);
          const sidebarServed = serveInternetAds(store, { count: 2, viewerId, placement: 'sidebar' });
          const feedServed = serveInternetAds(store, { count: 6, viewerId, placement: 'feed' });
          const reelServed = serveInternetAds(store, { count: 4, viewerId, placement: 'reel' });
          if (createdOfficialAccount || createdBankAccount || rolesChanged || sidebarServed.dirty || feedServed.dirty || reelServed.dirty) await saveInternetStore(store);
          return json(response, 200, {
            posts: publicPosts(store, viewerId),
            users: publicUsers(store, viewerId),
            settings: publicInternetSettings(store),
            ads: sidebarServed.ads,
            feedAds: feedServed.ads,
            reelAds: reelServed.ads,
            adPricing: internetAdPricing(),
          });
        }
        if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed' });

        const body = await readJson(request);
        const ipBan = getActiveInternetIpBan(store, [body.ipHash, body.ipHashLegacy]);
        if (ipBan) {
          return json(response, 403, { error: 'This network is banned from Clearwater Internet.', ban: ipBan });
        }
        const membership = await enforceInternetMembership(store, body.actor);
        if (membership === false) return json(response, 403, { error: 'You must be a member of the Clearwater Roleplay Discord server to use Clearwater Internet.' });
        if (membership === null) return json(response, 503, { error: 'Clearwater Internet could not verify Discord membership right now. Please try again shortly.' });

        // Re-resolve staff/owner access from live Discord membership. The website
        // proxy panel is only used when Discord membership cannot be confirmed.
        const proxyPanel = body.staffPanel === 'full' || body.staffPanel === 'limited'
          ? body.staffPanel
          : null;
        const wantsOfficial = body.asOfficial === true;
        const asBusinessId = String(body.asBusinessId || '').trim();
        const wantsBusiness = Boolean(asBusinessId);
        const requestedOwner = body.owner === true;
        const staffAction = ['moderation', 'staff-user', 'staff-user-detail', 'staff-user-search', 'staff-user-messages', 'staff-user-conversation', 'staff-wallet', 'staff-site', 'report-review', 'history-revert', 'ad-review', 'ad-manage', 'verify', 'ban', 'verify-review', 'business-review'].includes(body.action);
        const needsLivePanel = wantsOfficial
          || requestedOwner
          || staffAction
          || body.action === 'official-profile-save';
        let livePanel = null;
        if (needsLivePanel) {
          livePanel = await resolveLiveStaffPanel(body.actor, proxyPanel);
        }
        body.asOfficial = false;
        body.asBusinessId = '';
        body.owner = false;
        body.staffPanel = null;
        if (wantsOfficial && wantsBusiness) {
          return json(response, 400, { error: 'Choose personal, official, or one business account' });
        }
        if (wantsOfficial) {
          if (livePanel !== 'full') return json(response, 403, { error: 'Ownership access required' });
          body.actor = ensureOfficialInternetAccount(store);
          body.asOfficial = true;
          body.owner = true;
        } else if (wantsBusiness) {
          const businessActions = new Set([
            'post', 'post-interaction', 'poll-vote', 'social', 'social-status',
            'messages', 'conversation', 'notifications', 'message-send', 'edit', 'delete',
          ]);
          if (!businessActions.has(body.action)) {
            return json(response, 400, { error: 'Switch back to your personal account for wallet and ads actions' });
          }
          const realActor = body.actor;
          const { biz } = assertBusinessAccess(store, {
            actor: realActor,
            businessId: asBusinessId,
            need: 'post',
          });
          upsertInternetUser(store, {
            id: biz.id,
            username: biz.username,
            displayName: biz.displayName,
            avatarUrl: biz.avatarUrl,
            businessOwnerId: biz.ownerId,
            badges: ['business'],
          });
          body.actor = businessActorFromAccount(biz);
          body.asBusinessId = biz.id;
        } else if (livePanel === 'full' && (
          body.action === 'official-profile-save'
          || ((body.action === 'edit' || body.action === 'delete') && requestedOwner)
          || ['verify', 'ban', 'staff-wallet', 'staff-site'].includes(body.action)
        )) {
          body.owner = true;
        }
        if (staffAction) {
          // Ownership break-glass: website already verified full panel / OWNER_DISCORD_IDS.
          // Trust that when live Discord lookup did not return a panel (role cache lag, etc.).
          if (!livePanel && requestedOwner && proxyPanel === 'full') livePanel = 'full';
          if (!livePanel && proxyPanel && ['ad-manage', 'ad-review'].includes(body.action)) {
            livePanel = proxyPanel;
          }
          if (!livePanel) return json(response, 403, { error: 'Staff access required' });
          body.staffPanel = livePanel;
          if (livePanel === 'full') body.owner = true;
        }
        if (body.action === 'official-profile-save' && livePanel !== 'full') {
          return json(response, 403, { error: 'Ownership access required' });
        }
        if (body.action === 'erlc-location') {
          if (!config.erlcServerKey) return json(response, 503, { error: 'ER:LC is not configured on the bot host yet.' });
          const usernames = await discordDropUsernames(client, body.actor);
          const cache = await getIdentityCache();
          let identity = cache.byDiscord?.[String(body.actor?.id || '')] || null;
          if (!identity?.robloxId && config.melonlyApiKey) {
            try {
              identity = await findRobloxIdentity(body.actor.id, config.melonlyApiKey);
              if (identity?.robloxId) await rememberIdentity(identity);
            } catch (error) {
              logger.warn(`Melonly lookup failed for drop location: ${safeMelonlyError(error)}`);
            }
          }
          try {
            const location = await findPlayerDropLocation({
              serverKey: config.erlcServerKey,
              robloxId: identity?.robloxId,
              usernames: [...usernames, identity?.robloxUsername].filter(Boolean),
            });
            if (!location) return json(response, 404, { error: 'Join the Clearwater ER:LC server first, then drop your location.' });
            return json(response, 200, { location });
          } catch (error) {
            return json(response, 502, { error: error.message || 'Could not read your in-game location.' });
          }
        }

        if (body.action === 'findmy') {
          return json(response, 200, findMyDirectory(store, body.actor));
        }

        if (body.action === 'findmy-share') {
          const result = setFindMyShare(store, {
            actor: body.actor,
            targetId: body.targetId,
            username: body.username,
            enabled: body.enabled === true,
          });
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'erlc-phone-map') {
          if (!config.erlcServerKey) return json(response, 503, { error: 'ER:LC is not configured on the bot host yet.' });
          const directory = findMyDirectory(store, body.actor);
          const cache = await getIdentityCache();
          let myIdentity = cache.byDiscord?.[String(body.actor?.id || '')] || null;
          if (!myIdentity?.robloxId && config.melonlyApiKey) {
            try {
              myIdentity = await findRobloxIdentity(body.actor.id, config.melonlyApiKey);
              if (myIdentity?.robloxId) await rememberIdentity(myIdentity);
            } catch (error) {
              logger.warn(`Melonly lookup failed for phone map: ${safeMelonlyError(error)}`);
            }
          }
          try {
            const server = await fetchErlcServer(config.erlcServerKey);
            const players = (server.Players || server.players || []).map(parseErlcPlayer);
            const myNames = await discordDropUsernames(client, body.actor);
            const mePlayer = matchParsedPlayer(players, {
              robloxId: myIdentity?.robloxId,
              usernames: [...myNames, myIdentity?.robloxUsername].filter(Boolean),
            });
            const me = pinFromParsedPlayer(mePlayer);
            const sharingMembers = membersSharingWith(store, body.actor?.id);
            const friends = [];
            for (const member of sharingMembers) {
              if (String(member.id) === String(body.actor?.id)) continue;
              const identity = cache.byDiscord?.[String(member.id)] || null;
              const names = dropLocationNameCandidates(member.username, member.displayName, member.discordUsername, identity?.robloxUsername);
              const player = matchParsedPlayer(players, { robloxId: identity?.robloxId, usernames: names });
              const pin = pinFromParsedPlayer(player);
              friends.push({
                id: member.id,
                displayName: member.displayName || member.username || 'Clearwater member',
                username: member.username || 'member',
                avatarUrl: member.avatarUrl || null,
                online: Boolean(pin),
                location: pin,
              });
            }
            return json(response, 200, {
              me,
              online: Boolean(me),
              friends,
              places: phonePlacesFromPlayers(players),
              contacts: directory.contacts,
              currentPlayers: Number.isInteger(server.CurrentPlayers) ? server.CurrentPlayers : players.length,
              updatedAt: new Date().toISOString(),
            });
          } catch (error) {
            logger.warn(`Phone ER:LC map failed: ${error?.message || error}`);
            return json(response, 502, { error: error.message || 'Could not load the in-game map.' });
          }
        }

        if (body.action === 'post') {
          const user = body.asOfficial === true && body.owner === true
            ? ensureOfficialInternetAccount(store)
            : upsertInternetUser(store, body.actor);
          const post = createInternetPost(store, user, body.content, {
            gif: body.gif,
            image: body.image,
            images: Array.isArray(body.images) ? body.images : null,
            audio: body.audio,
            poll: body.poll,
            video: body.video,
            reel: body.reel === true,
            location: body.location,
            quoteId: body.quoteId,
          });
          await saveInternetStore(store);
          syncAnnounceInternetFeed(post);
          return json(response, 201, { post });
        }

        if (body.action === 'official-profile-save') {
          if (body.owner !== true) return json(response, 403, { error: 'Ownership access required' });
          const official = updateOfficialInternetProfile(store, body.profile);
          await saveInternetStore(store);
          return json(response, 200, { official });
        }

        if (body.action === 'status' || body.action === 'presence') {
          const user = upsertInternetUser(store, body.actor);
          touchInternetUser(user);
          markInternetPresence(body.actor, body.view || 'home');
          recordInternetIpHash(store, user.id, body.ipHash);
          const ban = getActiveBan(user);
          // Presence heartbeats are frequent — avoid rewriting the whole store every pulse.
          if (body.action === 'status') {
            const lastWrite = Number(user._statusSavedAt || 0);
            if (Date.now() - lastWrite > 30_000) {
              user._statusSavedAt = Date.now();
              await saveInternetStore(store);
            }
          } else {
            // Persist lastSeenAt occasionally so Active still works after a bot restart.
            const lastWrite = Number(user._presenceSavedAt || 0);
            if (Date.now() - lastWrite > 30_000) {
              user._presenceSavedAt = Date.now();
              await saveInternetStore(store);
            }
          }
          return json(response, 200, {
            banned: Boolean(ban),
            ban,
            online: true,
            view: String(body.view || 'home').slice(0, 40),
            // Peek only — clients fetch full warning text when this is > 0.
            unreadWarnings: countUnreadInternetWarnings(store, body.actor),
          });
        }

        if (body.action === 'wallet') {
          const wallet = walletSnapshot(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { wallet });
        }

        if (body.action === 'wallet-claim') {
          const wallet = claimInternetDailyCredits(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { wallet });
        }

        if (body.action === 'government-fines') {
          const access = await resolveGovernmentAccess(client, config, body.actor);
          if (!access.governmentAccess) return json(response, 403, { error: 'Government access required' });
          const fines = listGovernmentFines(store, {
            reviewer: access.governmentReview,
            actorId: body.actor?.id,
          });
          return json(response, 200, {
            fines,
            pending: fines.filter((fine) => fine.status === 'pending'),
            governmentAccess: true,
            governmentReview: access.governmentReview,
          });
        }

        if (body.action === 'government-fine-request') {
          const access = await resolveGovernmentAccess(client, config, body.actor);
          if (!access.governmentAccess) return json(response, 403, { error: 'Government access required' });
          const fine = submitGovernmentFine(store, {
            actor: body.actor,
            targetId: body.targetId,
            targetUsername: body.targetUsername,
            amount: body.amount,
            reason: body.reason,
          });
          await saveInternetStore(store);
          void logGovernmentFine(client, { action: 'submit', fine, actor: body.actor, config });
          return json(response, 201, {
            fine,
            fines: listGovernmentFines(store, {
              reviewer: access.governmentReview,
              actorId: body.actor?.id,
            }),
          });
        }

        if (body.action === 'government-fine-review') {
          const access = await resolveGovernmentAccess(client, config, body.actor);
          if (!access.governmentReview) return json(response, 403, { error: 'Government review access required' });
          const decision = String(body.decision || '').toLowerCase() === 'approve' ? 'approve' : 'deny';
          const fine = reviewGovernmentFine(store, {
            actor: body.actor,
            fineId: body.fineId,
            decision,
            note: body.note,
          });
          await saveInternetStore(store);
          void logGovernmentFine(client, { action: decision, fine, actor: body.actor, config });
          return json(response, 200, {
            fine,
            fines: listGovernmentFines(store, { reviewer: true, actorId: body.actor?.id }),
          });
        }

        if (body.action === 'wallet-roblox-claim') {
          const result = claimRobloxCreditPacks(store, {
            actor: body.actor,
            robloxId: body.robloxId,
            robloxUsername: body.robloxUsername,
            ownedAssetIds: body.ownedAssetIds,
          });
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'ads') {
          const viewerId = String(body.actor?.id || '');
          const sidebarServed = serveInternetAds(store, { count: 2, viewerId, placement: 'sidebar' });
          const feedServed = serveInternetAds(store, { count: 6, viewerId, placement: 'feed' });
          const reelServed = serveInternetAds(store, { count: 4, viewerId, placement: 'reel' });
          if (sidebarServed.dirty || feedServed.dirty || reelServed.dirty) await saveInternetStore(store);
          const businesses = listMyBusinessAccounts(store, viewerId)
            .filter((biz) => biz.status === 'active' && biz.canAds);
          return json(response, 200, {
            ads: sidebarServed.ads,
            feedAds: feedServed.ads,
            reelAds: reelServed.ads,
            mine: listInternetAdsForUser(store, body.actor),
            pricing: internetAdPricing(),
            businesses,
          });
        }

        if (body.action === 'ad-click') {
          const result = recordInternetAdClick(store, {
            adId: body.adId,
            actor: body.actor,
            kind: body.kind === 'account' ? 'account' : 'learn',
          });
          if (result.ok) await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'ad-purchase') {
          const result = purchaseInternetAd(store, body);
          await saveInternetStore(store);
          return json(response, 201, result);
        }

        if (body.action === 'post-boost') {
          const result = purchasePostBoost(store, body);
          await saveInternetStore(store);
          return json(response, 201, result);
        }

        if (body.action === 'verify-apply') {
          upsertInternetUser(store, body.actor);
          const result = submitVerificationApplication(store, body);
          await saveInternetStore(store);
          return json(response, 201, {
            ...result,
            verification: myVerificationApplication(store, body.actor?.id),
          });
        }

        if (body.action === 'verify-status') {
          upsertInternetUser(store, body.actor);
          return json(response, 200, {
            verification: myVerificationApplication(store, body.actor?.id),
            verified: store.users[String(body.actor?.id || '')]?.verified === true,
          });
        }

        if (body.action === 'verify-review') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          const result = reviewVerificationApplication(store, body);
          await saveInternetStore(store);
          return json(response, 200, { ...result, snapshot: moderationSnapshot(store) });
        }

        if (body.action === 'business-apply') {
          upsertInternetUser(store, body.actor);
          const result = submitBusinessApplication(store, body);
          await saveInternetStore(store);
          return json(response, 201, {
            ...result,
            businesses: listMyBusinessAccounts(store, body.actor?.id),
          });
        }

        if (body.action === 'business-list') {
          upsertInternetUser(store, body.actor);
          return json(response, 200, {
            businesses: listMyBusinessAccounts(store, body.actor?.id),
            verification: myVerificationApplication(store, body.actor?.id),
            verified: store.users[String(body.actor?.id || '')]?.verified === true,
          });
        }

        if (body.action === 'business-update') {
          const result = updateBusinessProfile(store, body);
          await saveInternetStore(store);
          return json(response, 200, {
            ...result,
            businesses: listMyBusinessAccounts(store, body.actor?.id),
          });
        }

        if (body.action === 'business-member-add') {
          const result = addBusinessMember(store, body);
          await saveInternetStore(store);
          return json(response, 200, {
            ...result,
            businesses: listMyBusinessAccounts(store, body.actor?.id),
          });
        }

        if (body.action === 'business-member-remove') {
          const result = removeBusinessMember(store, body);
          await saveInternetStore(store);
          return json(response, 200, {
            ...result,
            businesses: listMyBusinessAccounts(store, body.actor?.id),
          });
        }

        if (body.action === 'business-member-role') {
          const result = setBusinessMemberRole(store, body);
          await saveInternetStore(store);
          return json(response, 200, {
            ...result,
            businesses: listMyBusinessAccounts(store, body.actor?.id),
          });
        }

        if (body.action === 'business-review') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          const result = reviewBusinessApplication(store, body);
          await saveInternetStore(store);
          return json(response, 200, { ...result, snapshot: moderationSnapshot(store) });
        }

        if (body.action === 'ad-review') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          const result = reviewInternetAd(store, body);
          await saveInternetStore(store);
          return json(response, 200, { ...result, snapshot: moderationSnapshot(store) });
        }

        if (body.action === 'ad-manage') {
          // Ownership and limited staff can extend or end live ads.
          const panel = ['full', 'limited'].includes(body.staffPanel)
            ? body.staffPanel
            : (await resolveLiveStaffPanel(body.actor, proxyPanel));
          if (!['full', 'limited'].includes(panel) && !(requestedOwner && proxyPanel === 'full')) {
            return json(response, 403, { error: 'Staff access required' });
          }
          const result = manageInternetAd(store, {
            adId: body.adId,
            action: body.manageAction === 'extend' ? 'extend' : 'remove',
            hours: body.hours,
            actor: body.actor,
          });
          await saveInternetStore(store);
          return json(response, 200, { ...result, snapshot: moderationSnapshot(store) });
        }

        if (body.action === 'wallet-transfer') {
          const result = createCreditTransfer(store, body);
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'wallet-transfer-respond') {
          const result = respondCreditTransfer(store, body);
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'edit' || body.action === 'delete') {
          const feedDeleteRef = body.action === 'delete'
            ? internetFeedDiscordRef(store, store.posts.find((item) => item.id === String(body.postId || '')))
            : null;
          const result = body.action === 'edit'
            ? editInternetPost(store, { postId: body.postId, actorId: body.actor?.id, content: body.content, owner: body.owner === true })
            : deleteInternetPost(store, { postId: body.postId, actorId: body.actor?.id, owner: body.owner === true });
          await saveInternetStore(store);
          if (body.action === 'edit') {
            const feedPost = {
              ...result,
              discordFeedMessageId: result?.discordFeedMessageId
                || store.discordFeedMessages?.[result?.id]
                || '',
            };
            syncUpdateInternetFeed(feedPost);
          } else {
            syncDeletedInternetFeed(feedDeleteRef || internetFeedDiscordRef(store, result) || result);
          }
          return json(response, 200, { post: result });
        }

        if (body.action === 'report') {
          const report = createInternetReport(store, { postId: body.postId, actor: body.actor, reason: body.reason });
          await saveInternetStore(store);
          return json(response, 201, { report });
        }
        if (body.action === 'ad-report') {
          const report = createInternetAdReport(store, { adId: body.adId, actor: body.actor, reason: body.reason });
          await saveInternetStore(store);
          return json(response, 201, { report });
        }

        if (body.action === 'warnings') {
          const warnings = takeUnreadInternetWarnings(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { warnings });
        }

        if (body.action === 'messages') {
          const conversations = takeInternetMessages(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { conversations, messages: conversations });
        }

        if (body.action === 'conversation') {
          const messages = takeInternetConversation(store, { actor: body.actor, withUserId: body.withUserId, username: body.username });
          await saveInternetStore(store);
          return json(response, 200, { messages });
        }

        if (body.action === 'notifications') {
          const result = takeInternetNotifications(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'social') {
          const social = updateInternetSocial(store, body);
          await saveInternetStore(store);
          return json(response, 200, { social });
        }

        if (body.action === 'post-interaction') {
          const result = interactInternetPost(store, body);
          if (body.type === 'like') queueInternetStoreSave(store);
          else await saveInternetStore(store);
          if (shouldAnnounceInteractResult(body, result)) syncAnnounceInternetFeed(result.post);
          return json(response, 200, result);
        }

        if (body.action === 'poll-vote') {
          const post = voteInternetPoll(store, body);
          await saveInternetStore(store);
          return json(response, 200, { post });
        }

        if (body.action === 'social-status') {
          const social = socialSnapshot(store, body.actor);
          return json(response, 200, { social });
        }

        if (body.action === 'preferences') {
          const preferences = internetPreferences(store, body.actor);
          return json(response, 200, { preferences });
        }

        if (body.action === 'preference-save') {
          const preferences = updateInternetPreference(store, body);
          await saveInternetStore(store);
          return json(response, 200, { preferences });
        }

        if (body.action === 'profile-get') {
          const profile = internetProfile(store, body.actor);
          return json(response, 200, { profile });
        }

        if (body.action === 'profile-save') {
          const profile = updateInternetProfile(store, body);
          await saveInternetStore(store);
          return json(response, 200, { profile });
        }

        if (body.action === 'account-active') {
          const result = setInternetAccountActive(store, body);
          await saveInternetStore(store);
          return json(response, 200, result);
        }

        if (body.action === 'account-delete') {
          const actorId = String(body.actor?.id || '');
          const feedDeletes = store.posts
            .filter((post) => post.authorId === actorId)
            .map((post) => internetFeedDiscordRef(store, post))
            .filter(Boolean);
          const result = deleteInternetAccount(store, body);
          await saveInternetStore(store);
          syncDeletedInternetFeed(feedDeletes);
          return json(response, 200, result);
        }

        if (body.action === 'message-send') {
          const result = sendInternetMessage(store, body);
          await saveInternetStore(store);
          return json(response, 201, result);
        }

        if (body.action === 'report-review') {
          const reviewerId = String(body.actor?.id || '');
          const panelAccess = body.staffPanel;
          if (!['full', 'limited'].includes(panelAccess)) return json(response, 403, { error: 'Staff access required' });
          const modAction = String(body.moderationAction || body.action || '');
          if (panelAccess === 'limited' && modAction === 'ban' && body.decision !== 'deny') {
            assertLimitedStaffBanQuota(store, reviewerId);
          }
          const feedDeleteRef = body.decision !== 'deny' && modAction === 'delete'
            ? internetFeedDiscordRef(store, store.posts.find((item) => item.id === String(body.postId || '')))
            : null;
          const report = reviewInternetReport(store, {
            ...body,
            action: body.moderationAction || body.action,
          });
          if (panelAccess === 'limited' && modAction === 'ban' && body.decision !== 'deny') {
            recordLimitedStaffBan(store, reviewerId);
          }
          await saveInternetStore(store);
          if (report?.released && report.postId) {
            const published = store.posts.find((item) => item.id === report.postId);
            if (published) syncAnnounceInternetFeed(published);
          }
          if (feedDeleteRef || (report?.action === 'delete' && report?.deletedSnapshot)) {
            syncDeletedInternetFeed(feedDeleteRef || internetFeedDiscordRef(store, report.deletedSnapshot));
          }
          return json(response, 200, { report });
        }

        if (body.action === 'history-revert') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          const result = revertInternetHistory(store, {
            actor: body.actor,
            source: body.source,
            id: body.id,
          });
          await saveInternetStore(store);
          return json(response, 200, { ...result, snapshot: moderationSnapshot(store) });
        }

        if (body.action === 'moderation') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          const cleared = clearExpiredInternetBans(store);
          if (cleared) await saveInternetStore(store);
          return json(response, 200, moderationSnapshot(store));
        }

        if (body.action === 'staff-user-detail') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          return json(response, 200, staffUserDetail(store, body.targetId));
        }

        if (body.action === 'staff-user-messages') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          return json(response, 200, staffUserMessages(store, body.targetId));
        }

        if (body.action === 'staff-user-conversation') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          return json(response, 200, staffUserConversation(store, {
            targetId: body.targetId,
            withUserId: body.withUserId,
            username: body.username,
          }));
        }

        if (body.action === 'staff-user-search') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          const users = searchStaffUsers(store, body.query, { limit: body.limit });
          if (/^\d{16,22}$/.test(String(body.query || '').trim()) && users.length) await saveInternetStore(store);
          return json(response, 200, { users, query: String(body.query || '') });
        }

        if (body.action === 'staff-user') {
          if (!['full', 'limited'].includes(body.staffPanel)) return json(response, 403, { error: 'Staff access required' });
          const staffAction = String(body.staffAction || '');
          if (body.staffPanel === 'limited' && LIMITED_STAFF_FORBIDDEN_ACTIONS.includes(staffAction)) {
            return json(response, 403, { error: 'Limited staff cannot use verification or network tools.' });
          }
          const staffActorId = String(body.actor?.id || '');
          if (body.staffPanel === 'limited' && staffAction === 'ban') {
            assertLimitedStaffBanQuota(store, staffActorId);
          }
          if (body.staffPanel === 'limited') body.ipBan = false;
          const targetId = String(body.targetId || '');
          let feedDeletes = [];
          if (staffAction === 'delete-post') {
            const existing = store.posts.find((post) => post.id === String(body.postId || ''));
            const ref = internetFeedDiscordRef(store, existing);
            if (ref) feedDeletes = [ref];
          } else if (staffAction === 'wipe-posts') {
            feedDeletes = store.posts
              .filter((post) => post.authorId === targetId && post.kind !== 'reel' && !post.parentId)
              .map((post) => internetFeedDiscordRef(store, post))
              .filter(Boolean);
          } else if (staffAction === 'wipe-reels') {
            feedDeletes = store.posts
              .filter((post) => post.authorId === targetId && post.kind === 'reel' && !post.parentId)
              .map((post) => internetFeedDiscordRef(store, post))
              .filter(Boolean);
          } else if (staffAction === 'delete-business') {
            feedDeletes = store.posts
              .filter((post) => post.authorId === targetId && !post.parentId)
              .map((post) => internetFeedDiscordRef(store, post))
              .filter(Boolean);
          }
          const detail = applyStaffUserAction(store, body);
          if (body.staffPanel === 'limited' && staffAction === 'ban') {
            recordLimitedStaffBan(store, staffActorId);
          }
          await saveInternetStore(store);
          syncDeletedInternetFeed(feedDeletes);
          return json(response, 200, { ...detail, snapshot: moderationSnapshot(store) });
        }

        if (body.action === 'staff-wallet') {
          if (body.staffPanel !== 'full') return json(response, 403, { error: 'Full staff access required' });
          const result = adjustInternetCredits(store, body);
          await saveInternetStore(store);
          return json(response, 200, { ...staffUserDetail(store, body.targetId), wallet: result.wallet, applied: result.applied, snapshot: moderationSnapshot(store) });
        }

        if (body.action === 'staff-site') {
          if (body.staffPanel !== 'full') return json(response, 403, { error: 'Full staff access required' });
          const settings = applyStaffSiteAction(store, body);
          await saveInternetStore(store);
          return json(response, 200, { settings, snapshot: moderationSnapshot(store) });
        }

        if (!['verify', 'ban'].includes(body.action)) {
          return json(response, 400, { error: `Unsupported action: ${String(body.action || 'unknown')}` });
        }
        if (body.staffPanel !== 'full') {
          return json(response, 403, { error: 'Full staff access required' });
        }

        const targetId = String(body.targetId || '').trim();
        if (!/^\d{16,22}$/.test(targetId)) return json(response, 400, { error: 'Enter a valid Discord user ID' });
        const target = upsertInternetUser(store, { id: targetId });
        if (body.action === 'verify') target.verified = body.enabled === true;
        if (body.action === 'ban') {
          setInternetBan(target, body);
          if (body.enabled === true && body.ipBan === true) banKnownInternetIps(store, target, body);
          if (body.enabled !== true) clearKnownInternetIpBans(store, target);
        }
        await saveInternetStore(store);
        return json(response, 200, { user: target });
      } catch (error) {
        const held = error instanceof AutomodHoldError
          || error?.held === true
          || error?.name === 'AutomodHoldError'
          || /held for staff/i.test(String(error?.message || ''));
        if (held && store) {
          try {
            await saveInternetStore(store);
          } catch (saveError) {
            logger.error(`Failed to persist automod hold: ${saveError?.message || saveError}`);
          }
          return json(response, 451, {
            error: AUTOMOD_HOLD_MESSAGE,
            held: true,
            reason: error.reason || '',
          });
        }
        if (error instanceof RateLimitError || error?.status === 429) {
          return json(response, 429, { error: error.message || 'Too many requests. Wait a moment.' });
        }
        return json(response, 400, { error: error.message || 'Could not update Clearwater Internet' });
      }
    }

    if (url.pathname === '/api/config') {
      try {
        if (request.method === 'GET') {
          const [settings, guilds] = await Promise.all([getOwnerConfig(), buildDiscordCatalog(client)]);
          return json(response, 200, { settings, guilds });
        }
        if (request.method === 'PUT') {
          const settings = await saveOwnerConfig(await readJson(request));
          logger.info('Owner panel configuration updated.');
          return json(response, 200, { ok: true, settings });
        }
        return json(response, 405, { error: 'Method not allowed' });
      } catch (error) {
        logger.error('Owner configuration request failed', error);
        return json(response, 400, { error: 'Could not update configuration' });
      }
    }

    if (request.method !== 'GET' || url.pathname !== '/api/status') {
      return json(response, 405, { error: 'Method not allowed' });
    }

    try {
      const guild = client.guilds.cache.get(CLEARWATER_GUILD_ID)
        || await client.guilds.fetch(CLEARWATER_GUILD_ID);
      return json(response, 200, {
        online: client.isReady(),
        bot: {
          id: client.user?.id || null,
          username: client.user?.username || 'Clearwater',
          latencyMs: Math.max(0, Math.round(client.ws.ping || 0)),
          uptimeSeconds: Math.floor((client.uptime || 0) / 1000),
        },
        guild: {
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
        },
        updatedAt: new Date().toISOString(),
        erlc: client.erlcStatus || { online: false },
      });
    } catch (error) {
      logger.error('Could not build status response', error);
      return json(response, 503, { online: false, error: 'Status unavailable' });
    }
  });

  server.listen(config.port, '0.0.0.0', () => {
    logger.info(`Website status connection listening on port ${config.port}.`);
    if (!config.apiKey) logger.warn('BOT_API_KEY is empty; protected website status is disabled.');
  });

  // Timed bans and old posts are cleaned up even when the website is not currently open.
  const dataCleanup = setInterval(() => { void cleanUpInternetData(); }, 60 * 1000);
  dataCleanup.unref();
  server.on('close', () => clearInterval(dataCleanup));
  void cleanUpInternetData();

  return server;
}
