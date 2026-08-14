import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';
import { buildDiscordCatalog, getOwnerConfig, saveOwnerConfig } from './ownerConfig.js';
import { memberHasSiteAccess } from '../lib/site-access.js';
import { CLEARWATER_GUILD_ID, getHighestStaffRank, getInternetBadges, getStaffPanelAccess, isDeveloperAccount, LIMITED_STAFF_FORBIDDEN_ACTIONS } from './staffRanks.js';
import { dropLocationNameCandidates, fetchErlcPlayersOnMap, findPlayerDropLocation, playersOnLibertyMap, runErlcModeration, runErlcRawCommand } from './erlc.js';
import { getIdentityCache, rememberIdentity } from './identityStore.js';
import { findRobloxIdentity, safeMelonlyError } from './melonly.js';
import { AUTOMOD_HOLD_MESSAGE } from './internetAutomod.js';
import { AutomodHoldError, adjustInternetCredits, applyStaffSiteAction, applyStaffUserAction, assertLimitedStaffBanQuota, banKnownInternetIps, claimInternetDailyCredits, claimRobloxCreditPacks, clearExpiredInternetBans, clearExpiredInternetIpBans, clearKnownInternetIpBans, createCreditTransfer, createInternetAdReport, createInternetPost, createInternetReport, deleteInternetAccount, deleteInternetPost, editInternetPost, ensureBankInternetAccount, ensureOfficialInternetAccount, getActiveBan, getActiveInternetIpBan, interactInternetPost, internetFeedDiscordRef, internetPreferences, internetProfile, listInternetAdsForUser, manageInternetAd, moderationSnapshot, BANK_INTERNET_ACCOUNT_ID, OFFICIAL_INTERNET_ACCOUNT_ID, publicInternetSettings, publicPosts, publicUsers, purchaseInternetAd, readInternetStore, recordInternetAdClick, recordInternetIpHash, recordLimitedStaffBan, respondCreditTransfer, reviewInternetAd, reviewInternetReport, revertInternetHistory, saveInternetStore, searchStaffUsers, sendInternetMessage, serveInternetAds, setDiscordInternetNotify, setInternetAccountActive, setInternetBan, setInternetPostDiscordFeedMessage, socialSnapshot, staffUserDetail, takeInternetConversation, takeInternetMessages, takeInternetNotifications, takeUnreadInternetWarnings, touchInternetUser, updateInternetPreference, updateInternetProfile, updateInternetSocial, updateOfficialInternetProfile, upsertInternetUser, voteInternetPoll, walletSnapshot, internetAdPricing } from './internetStore.js';
import { createDiscordInternetNotifier } from './discordInternetNotify.js';
import { createInternetFeedController, shouldAnnounceInteractResult } from './discordInternetFeed.js';

const json = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
};

function serveStoredReel(response, store, reelId, kind, index = null) {
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
  if (!post || !source) {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    return response.end();
  }
  if (/^https:\/\//i.test(source)) {
    response.writeHead(302, { Location: source, 'Cache-Control': 'no-store' });
    return response.end();
  }
  const match = String(source).replace(/\s+/g, '').match(/^data:([^;]+);base64,([a-z0-9+/]+=*)$/i);
  if (!match) {
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    return response.end();
  }
  const buffer = Buffer.from(match[2], 'base64');
  response.writeHead(200, {
    'Content-Type': match[1],
    'Content-Length': buffer.length,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  });
  return response.end(buffer);
}

const safeEqual = (left = '', right = '') => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

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

    if (!['/api/status', '/api/actions', '/api/config', '/api/access', '/api/internet', '/api/erlc-map', '/api/erlc-command'].includes(url.pathname)) {
      return json(response, 404, { error: 'Not found' });
    }

    if (!config.apiKey) {
      return json(response, 503, { error: 'Status connection is not configured' });
    }

    const authorization = request.headers.authorization || '';
    if (!authorization.startsWith('Bearer ') || !safeEqual(authorization.slice(7), config.apiKey)) {
      return json(response, 401, { error: 'Unauthorized' });
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
      return json(response, 200, {
        allowed,
        panelAccess,
        siteAccess,
        member: Boolean(member),
        staffRank: staffRank?.name || null,
        badges: getInternetBadges(member),
        roles: member ? [...member.roles.cache.keys()].map(String) : [],
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
          if (reelId) return serveStoredReel(response, store, reelId, url.searchParams.get('kind'), url.searchParams.get('index'));
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
        const requestedOwner = body.owner === true;
        const staffAction = ['moderation', 'staff-user', 'staff-user-detail', 'staff-user-search', 'staff-wallet', 'staff-site', 'report-review', 'history-revert', 'ad-review', 'ad-manage', 'verify', 'ban'].includes(body.action);
        const needsLivePanel = wantsOfficial
          || requestedOwner
          || staffAction
          || body.action === 'official-profile-save';
        let livePanel = null;
        if (needsLivePanel) {
          livePanel = await resolveLiveStaffPanel(body.actor, proxyPanel);
        }
        body.asOfficial = false;
        body.owner = false;
        body.staffPanel = null;
        if (wantsOfficial) {
          if (livePanel !== 'full') return json(response, 403, { error: 'Ownership access required' });
          body.actor = ensureOfficialInternetAccount(store);
          body.asOfficial = true;
          body.owner = true;
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

        if (body.action === 'status') {
          const user = upsertInternetUser(store, body.actor);
          touchInternetUser(user);
          recordInternetIpHash(store, user.id, body.ipHash);
          const ban = getActiveBan(user);
          await saveInternetStore(store);
          return json(response, 200, { banned: Boolean(ban), ban });
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
          const viewerId = body.actor?.id;
          const sidebarServed = serveInternetAds(store, { count: 2, viewerId, placement: 'sidebar' });
          const feedServed = serveInternetAds(store, { count: 6, viewerId, placement: 'feed' });
          const reelServed = serveInternetAds(store, { count: 4, viewerId, placement: 'reel' });
          if (sidebarServed.dirty || feedServed.dirty || reelServed.dirty) await saveInternetStore(store);
          return json(response, 200, {
            ads: sidebarServed.ads,
            feedAds: feedServed.ads,
            reelAds: reelServed.ads,
            mine: listInternetAdsForUser(store, body.actor),
            pricing: internetAdPricing(),
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
          await saveInternetStore(store);
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
          await saveInternetStore(store);
          return json(response, 200, { social });
        }

        if (body.action === 'preferences') {
          const preferences = internetPreferences(store, body.actor);
          await saveInternetStore(store);
          return json(response, 200, { preferences });
        }

        if (body.action === 'preference-save') {
          const preferences = updateInternetPreference(store, body);
          await saveInternetStore(store);
          return json(response, 200, { preferences });
        }

        if (body.action === 'profile-get') {
          const profile = internetProfile(store, body.actor);
          await saveInternetStore(store);
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
