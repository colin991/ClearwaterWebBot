import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { AUTOMOD_HOLD_MESSAGE, AutomodHoldError, scanInternetContent } from './internetAutomod.js';
import { JsonStoreCorruptError, readJsonFile, writeJsonFile } from './jsonStore.js';
import { logger } from './logger.js';
import { mergeInternetBadges, sanitizeInternetBadges, withSiteBadges, dailyCreditTierForRoles } from './staffRanks.js';

export { AutomodHoldError };

const storePath = join(process.cwd(), 'data', 'clearwater-internet.json');
const emptyStore = Object.freeze({
  users: {},
  posts: [],
  reports: [],
  logs: [],
  ipBans: [],
  staffBanLog: [],
  creditTransfers: [],
  ads: [],
  discordFeedMessages: {},
  siteBanner: null,
  officialProfile: {},
  settings: { pausePosts: false, pauseReels: false, pauseMessages: false },
});

/** Sidebar ads: 24h run after staff approval, paid with Clearwater Credits. */
export const AD_BASE_COST = 1200;
export const AD_BOOST_COST = 300;
export const AD_MAX_BOOST = 5;
export const AD_DURATION_MS = 24 * 60 * 60 * 1000;
export const AD_CATEGORIES = Object.freeze(['department', 'business']);

const LIMITED_STAFF_BAN_LIMIT = 3;
const LIMITED_STAFF_BAN_WINDOW_MS = 60 * 60 * 1000;

let liveStore = null;
let storeQueue = Promise.resolve();
let lastPersistedStats = null;

function enqueueStoreOp(fn) {
  const run = storeQueue.then(fn, fn);
  storeQueue = run.then(() => undefined, () => undefined);
  return run;
}

const text = (value, length) => String(value || '').trim().slice(0, length);

function sanitizeHttpsUrl(value, length = 300) {
  const candidate = String(value || '').trim().slice(0, length);
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || /["'()\\\s]/.test(candidate)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function sanitizeSiteBanner(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const message = text(raw.message, 160);
  if (!message) return null;
  const details = text(raw.details, 800);
  const linkUrl = sanitizeHttpsUrl(raw.linkUrl, 300);
  const linkLabel = text(raw.linkLabel, 40) || (linkUrl ? 'Learn more' : '');
  return {
    id: text(raw.id, 80) || randomUUID(),
    message,
    details,
    linkUrl,
    linkLabel,
    createdAt: text(raw.createdAt, 40) || new Date().toISOString(),
    updatedAt: text(raw.updatedAt, 40) || new Date().toISOString(),
  };
}

function storeStats(store) {
  return {
    users: store?.users && typeof store.users === 'object' ? Object.keys(store.users).length : 0,
    posts: Array.isArray(store?.posts) ? store.posts.length : 0,
    reports: Array.isArray(store?.reports) ? store.reports.length : 0,
    transfers: Array.isArray(store?.creditTransfers) ? store.creditTransfers.length : 0,
  };
}

function normalizeInternetStore(data) {
  const source = data && typeof data === 'object' ? data : {};
  const reports = Array.isArray(source.reports) ? source.reports.map((report) => {
    if (!report || typeof report !== 'object') return report;
    if (!report.heldPayload) return report;
    return { ...report, heldPayload: sanitizeHeldPayload(report.heldPayload) };
  }) : [];
  return {
    ...source,
    users: source.users && typeof source.users === 'object' ? source.users : {},
    posts: Array.isArray(source.posts) ? source.posts : [],
    reports,
    logs: Array.isArray(source.logs) ? source.logs : [],
    ipBans: Array.isArray(source.ipBans) ? source.ipBans : [],
    staffBanLog: Array.isArray(source.staffBanLog) ? source.staffBanLog : [],
    creditTransfers: Array.isArray(source.creditTransfers) ? source.creditTransfers : [],
    ads: Array.isArray(source.ads) ? source.ads : [],
    discordFeedMessages: source.discordFeedMessages && typeof source.discordFeedMessages === 'object'
      ? source.discordFeedMessages
      : {},
    siteBanner: sanitizeSiteBanner(source.siteBanner),
    officialProfile: source.officialProfile && typeof source.officialProfile === 'object' ? source.officialProfile : {},
    settings: {
      pausePosts: source.settings?.pausePosts === true,
      pauseReels: source.settings?.pauseReels === true,
      pauseMessages: source.settings?.pauseMessages === true,
    },
  };
}

async function readBackupStore(candidate) {
  return normalizeInternetStore(await readJsonFile(candidate, emptyStore, {
    missingFallback: false,
    corruptFallback: false,
  }));
}

async function recoverFromBackups(reason) {
  for (const candidate of [`${storePath}.bak`, `${storePath}.bak.1`]) {
    try {
      const recovered = await readBackupStore(candidate);
      const stats = storeStats(recovered);
      if (stats.users < 1 && stats.posts < 1) continue;
      logger.error(`Clearwater Internet store ${reason}; recovered from ${candidate} (users=${stats.users}, posts=${stats.posts})`);
      await writeJsonFile(storePath, recovered, { backup: false });
      return recovered;
    } catch {
      // Try the next backup.
    }
  }
  return null;
}

async function readStoreFromDisk() {
  try {
    const raw = await readJsonFile(storePath, emptyStore, {
      missingFallback: true,
      corruptFallback: false,
    });
    const hadHeavyHold = Array.isArray(raw?.reports)
      && raw.reports.some((report) => typeof report?.heldPayload?.imageUrl === 'string'
        && report.heldPayload.imageUrl.startsWith('data:'));
    const live = normalizeInternetStore(raw);
    if (hadHeavyHold) {
      try {
        await writeJsonFile(storePath, live, { backup: true });
        logger.info('Scrubbed inline image data from automod held payloads in the Internet store.');
      } catch (error) {
        logger.error(`Could not scrub automod held payloads: ${error?.message || error}`);
      }
    }
    const liveStats = storeStats(live);
    // If the live file looks wiped but a backup still has the community, restore it.
    if (liveStats.users <= 3) {
      for (const candidate of [`${storePath}.bak`, `${storePath}.bak.1`]) {
        try {
          const backup = await readBackupStore(candidate);
          const backupStats = storeStats(backup);
          if (backupStats.users >= 8 && backupStats.users > liveStats.users * 2) {
            logger.error(
              `Clearwater Internet live store looks wiped (users=${liveStats.users}); `
              + `restoring ${candidate} (users=${backupStats.users}, posts=${backupStats.posts})`,
            );
            await writeJsonFile(storePath, backup, { backup: false });
            return backup;
          }
        } catch {
          // Try the next backup.
        }
      }
    }
    return live;
  } catch (error) {
    if (!(error instanceof JsonStoreCorruptError)) throw error;
    const recovered = await recoverFromBackups('was corrupt');
    if (recovered) return recovered;
    logger.error('Clearwater Internet store is corrupt and no backup could be recovered. Refusing to invent an empty database.');
    throw error;
  }
}

function assertSafeStoreWrite(store) {
  const next = storeStats(store);
  const previous = lastPersistedStats;
  if (!previous) return next;
  const collapsingUsers = previous.users >= 8 && next.users <= 3 && next.users < Math.ceil(previous.users * 0.35);
  const collapsingPosts = previous.posts >= 10 && next.posts === 0 && next.users <= 3;
  if (collapsingUsers || collapsingPosts) {
    throw new Error(
      `Refusing to overwrite Clearwater Internet data with a collapsed store `
      + `(users ${previous.users}→${next.users}, posts ${previous.posts}→${next.posts}). `
      + 'Check data/clearwater-internet.json.bak on the bot host.',
    );
  }
  return next;
}

export const OFFICIAL_INTERNET_ACCOUNT_ID = '1514026810348671026';
export const BANK_INTERNET_ACCOUNT_ID = '1514026810348671099';
const officialDefaults = Object.freeze({
  displayName: 'Clearwater Roleplay',
  username: 'clearwaterroleplay',
  bio: 'Official Clearwater Roleplay updates and announcements.',
  avatarUrl: 'assets/clearwater-logo.png',
  bannerUrl: 'assets/clearwater-police-night.png',
});
const bankDefaults = Object.freeze({
  displayName: 'Bank',
  username: 'bank',
  bio: 'Clearwater Credits transfers and statements.',
  avatarUrl: 'assets/clearwater-logo.png',
  bannerUrl: 'assets/clearwater-police-night.png',
});

let discordInternetNotify = null;

/** Bot host registers a Discord DM sender for opted-in members. */
export function setDiscordInternetNotify(handler) {
  discordInternetNotify = typeof handler === 'function' ? handler : null;
}

function addInternetNotification(store, { recipientId, actor, type, post = null }) {
  const recipient = store.users[String(recipientId || '')];
  if (!recipient || recipient.id === actor?.id) return;
  const actorName = text(actor?.displayName, 80) || 'A Clearwater member';
  const postContent = text(post?.content, 180);
  recipient.notifications = Array.isArray(recipient.notifications) ? recipient.notifications : [];
  recipient.notifications.unshift({
    id: randomUUID(),
    type,
    actorId: String(actor?.id || ''),
    actorName,
    actorAvatarUrl: text(actor?.avatarUrl, 300) || null,
    postId: post?.id || null,
    postContent,
    createdAt: new Date().toISOString(),
    readAt: null,
  });
  recipient.notifications = recipient.notifications.slice(0, 100);

  if (recipient.preferences?.discordDmNotifications === true && discordInternetNotify) {
    void discordInternetNotify({
      recipientId: recipient.id,
      actorName,
      type: String(type || ''),
      postContent,
      postId: post?.id || null,
    });
  }
}

export async function readInternetStore() {
  return enqueueStoreOp(async () => {
    if (!liveStore) {
      liveStore = await readStoreFromDisk();
      lastPersistedStats = storeStats(liveStore);
    }
    return liveStore;
  });
}

export async function saveInternetStore(store) {
  return enqueueStoreOp(async () => {
    const nextStats = assertSafeStoreWrite(store);
    await writeJsonFile(storePath, store, { backup: true });
    liveStore = store;
    lastPersistedStats = nextStats;
  });
}

function hostedMediaUrl(value) {
  const raw = String(value || '').trim();
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (!/(^|\.)blob\.vercel-storage\.com$/i.test(url.hostname)) return '';
    if (/["'()\\\s]/.test(raw)) return '';
    return url.href.slice(0, 500);
  } catch {
    return '';
  }
}

function publicPost(post, maskedAuthors) {
  const next = { ...post };
  delete next.discordFeedMessageId;
  // Reels always use the same-origin media proxy. Direct blob URLs flake in the
  // vertical player (CORS/range/codec), which made newly uploaded Reels look broken.
  if (next.kind === 'reel') {
    if (next.imageUrl) next.imageUrl = `/api/media?reel=${encodeURIComponent(post.id)}&kind=image`;
    if (next.videoUrl) next.videoUrl = `/api/media?reel=${encodeURIComponent(post.id)}&kind=video`;
  } else {
    if (String(next.imageUrl || '').startsWith('data:')) next.imageUrl = `/api/media?reel=${encodeURIComponent(post.id)}&kind=image`;
    if (String(next.videoUrl || '').startsWith('data:')) next.videoUrl = `/api/media?reel=${encodeURIComponent(post.id)}&kind=video`;
  }
  if (maskedAuthors?.has(next.authorId)) next.avatarUrl = null;
  return next;
}

/** Persist Discord #internet-feed message id for later edit/delete sync. */
export function setInternetPostDiscordFeedMessage(store, postId, messageId) {
  const id = String(postId || '');
  const mid = String(messageId || '').trim();
  if (!id || !/^\d{16,22}$/.test(mid)) return false;
  store.discordFeedMessages = store.discordFeedMessages && typeof store.discordFeedMessages === 'object'
    ? store.discordFeedMessages
    : {};
  store.discordFeedMessages[id] = mid;
  const post = store.posts.find((item) => item.id === id);
  if (post) post.discordFeedMessageId = mid;
  return true;
}

export function resolveInternetPostDiscordFeedMessage(store, post) {
  if (!post) return '';
  const fromPost = String(post.discordFeedMessageId || '').trim();
  if (/^\d{16,22}$/.test(fromPost)) return fromPost;
  const fromMap = String(store?.discordFeedMessages?.[post.id] || '').trim();
  return /^\d{16,22}$/.test(fromMap) ? fromMap : '';
}

/** Build a small ref for Discord feed sync before a post is removed from the store. */
export function internetFeedDiscordRef(store, post) {
  if (!post?.id || post.parentId) return null;
  const discordFeedMessageId = resolveInternetPostDiscordFeedMessage(store, post);
  if (!discordFeedMessageId) return null;
  return {
    id: post.id,
    discordFeedMessageId,
    username: post.username,
    displayName: post.displayName,
  };
}

export function publicInternetSettings(store) {
  return {
    pausePosts: store.settings?.pausePosts === true,
    pauseReels: store.settings?.pauseReels === true,
    pauseMessages: store.settings?.pauseMessages === true,
    siteBanner: sanitizeSiteBanner(store.siteBanner),
  };
}

// Privacy settings are enforced per viewer, so the public feed is rendered
// against whoever is asking for it. A signed-out reader is treated as a
// stranger, which is the most restrictive case.
function viewerPrivacy(store, viewerId) {
  const viewer = text(viewerId, 24);
  const follows = (targetId) => {
    if (!viewer) return false;
    const following = store.users[viewer]?.following;
    return Array.isArray(following) && following.includes(targetId);
  };
  const hiddenAuthors = new Set();
  const maskedAuthors = new Set();
  for (const user of Object.values(store.users)) {
    const self = user.id === viewer;
    if (user.shadowbanned === true && !self) hiddenAuthors.add(user.id);
    if (user.deactivated === true && !self) hiddenAuthors.add(user.id);
    if (user.preferences?.followersOnly === true && !self && !follows(user.id)) hiddenAuthors.add(user.id);
    if (user.preferences?.hideProfile === true && !self) maskedAuthors.add(user.id);
  }
  return { viewer, hiddenAuthors, maskedAuthors };
}

export function publicPosts(store, viewerId) {
  const { hiddenAuthors, maskedAuthors } = viewerPrivacy(store, viewerId);
  const visible = store.posts.filter((post) => !hiddenAuthors.has(post.authorId));
  const reels = visible.filter((post) => post.kind === 'reel' && !post.parentId);
  const reelIds = new Set(reels.map((reel) => reel.id));
  // Reel comments used to land in both the normal feed (kind !== 'reel') and this
  // dedicated comments list, so every Reel reply rendered twice in the UI.
  const reelComments = visible.filter((post) => post.parentId && reelIds.has(post.parentId));
  const feed = visible.filter((post) => post.kind !== 'reel' && !reelIds.has(post.parentId));
  return [...reels, ...feed, ...reelComments].map((post) => publicPost(post, maskedAuthors));
}

export function publicUsers(store, viewerId) {
  const { viewer, maskedAuthors } = viewerPrivacy(store, viewerId);
  const users = Object.values(store.users);
  return users.map((user) => {
    const masked = maskedAuthors.has(user.id);
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: masked ? null : user.avatarUrl,
      // Preserve empty string after a clear so the client does not fall back to Discord.
      bannerUrl: masked ? null : (typeof user.bannerUrl === 'string' ? user.bannerUrl : null),
      bio: user.bio || '',
      pronouns: user.pronouns || '',
      location: user.location || '',
      website: user.website || '',
      accentColor: user.accentColor || '',
      pinnedPostId: user.pinnedPostId || '',
      createdAt: user.createdAt || null,
      deactivated: user.deactivated === true,
      hideStats: user.preferences?.hideStats === true,
      staffRank: user.staffRank || null,
      verified: user.verified === true,
      badges: withSiteBadges(user.badges, user),
      warningBadgeText: text(user.warningBadgeText, 120) || '',
      banned: Boolean(getActiveBan(user)),
      official: user.official === true,
      bank: user.bank === true,
      following: user.preferences?.hideFollowing === true && user.id !== viewer ? [] : (Array.isArray(user.following) ? user.following : []),
      followingCount: Array.isArray(user.following) ? user.following.length : 0,
      followers: users.filter((member) => Array.isArray(member.following) && member.following.includes(user.id)).map((member) => member.id),
      followerCount: users.filter((member) => Array.isArray(member.following) && member.following.includes(user.id)).length,
    };
  });
}

export function getActiveBan(user) {
  if (!user?.banned) return null;
  if (user.bannedUntil && new Date(user.bannedUntil).getTime() <= Date.now()) {
    user.banned = false;
    user.banReason = null;
    user.bannedUntil = null;
    return null;
  }
  return {
    reason: text(user.banReason, 300) || 'No reason was provided.',
    until: user.bannedUntil || null,
  };
}

export function setInternetBan(user, { enabled, reason, durationDays, source = 'owner' }) {
  if (!enabled) {
    user.banned = false;
    user.banReason = null;
    user.bannedUntil = null;
    user.banSource = null;
    return user;
  }

  const days = Number(durationDays);
  if (durationDays !== 'forever' && (!Number.isInteger(days) || days < 1 || days > 30)) {
    throw new Error('Choose a ban duration from 1 to 30 days, or Forever');
  }

  user.banned = true;
  user.banReason = text(reason, 300) || 'No reason was provided.';
  user.bannedUntil = durationDays === 'forever'
    ? null
    : new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
  user.banSource = source === 'membership' ? 'membership' : 'owner';
  return user;
}

function durationUntil(durationDays) {
  if (durationDays === 'forever' || durationDays == null || durationDays === '') return null;
  const days = Number(durationDays);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error('Choose a duration from 1 to 30 days, or Forever');
  }
  return new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
}

function stillActive(until) {
  if (!until) return true;
  return new Date(until).getTime() > Date.now();
}

export function getActiveMute(user) {
  if (!user?.muted) return null;
  if (user.mutedUntil && !stillActive(user.mutedUntil)) {
    user.muted = false;
    user.mutedUntil = null;
    user.muteReason = null;
    return null;
  }
  return {
    reason: text(user.muteReason, 300) || 'No reason was provided.',
    until: user.mutedUntil || null,
  };
}

function flagActive(user, boolKey, untilKey) {
  if (user?.[boolKey] !== true) return false;
  if (user[untilKey] && !stillActive(user[untilKey])) {
    user[boolKey] = false;
    user[untilKey] = null;
    return false;
  }
  return true;
}

export function touchInternetUser(user) {
  if (!user) return user;
  user.lastSeenAt = new Date().toISOString();
  if (!user.createdAt) user.createdAt = user.lastSeenAt;
  return user;
}

function assertNotOfficial(user, action) {
  if (user?.id === OFFICIAL_INTERNET_ACCOUNT_ID || user?.official === true) {
    throw new Error(`The official Clearwater account cannot be ${action}`);
  }
}

export function assertNotBanned(user) {
  if (user?.id === OFFICIAL_INTERNET_ACCOUNT_ID || user?.official === true) return;
  if (getActiveBan(user)) throw new Error('This account is banned from Clearwater Internet');
}

export function assertCanPost(store, user, { reel = false } = {}) {
  if (user?.id === OFFICIAL_INTERNET_ACCOUNT_ID || user?.official === true) return;
  assertNotBanned(user);
  const mute = getActiveMute(user);
  if (mute) throw new Error(`This account is muted. ${mute.reason}`);
  if (store.settings?.pausePosts === true) throw new Error('Posting is temporarily paused by staff');
  if (reel && store.settings?.pauseReels === true) throw new Error('Reels are temporarily paused by staff');
  if (reel && flagActive(user, 'lockReels', 'lockReelsUntil')) throw new Error('This account is locked from posting Reels');
  if (flagActive(user, 'lockPosts', 'lockPostsUntil')) throw new Error('This account is locked from posting');
}

export function assertCanMessage(store, user) {
  if (user?.id === OFFICIAL_INTERNET_ACCOUNT_ID || user?.official === true) return;
  assertNotBanned(user);
  const mute = getActiveMute(user);
  if (mute) throw new Error(`This account is muted. ${mute.reason}`);
  if (store.settings?.pauseMessages === true) throw new Error('Direct messages are temporarily paused by staff');
  if (flagActive(user, 'lockMessages', 'lockMessagesUntil')) throw new Error('This account is locked from sending messages');
}

export function clearExpiredInternetBans(store) {
  let cleared = 0;
  for (const user of Object.values(store.users)) {
    const wasBanned = user.banned === true;
    getActiveBan(user);
    if (wasBanned && user.banned !== true) cleared += 1;
  }
  return cleared;
}

export function recordInternetIpHash(store, userId, ipHash) {
  const hash = text(ipHash, 100);
  const user = store.users[String(userId || '')];
  if (!user || !/^[A-Za-z0-9_-]{32,100}$/.test(hash)) return false;
  const previous = Array.isArray(user.ipHashes) ? user.ipHashes : [];
  const next = [hash, ...previous.filter((value) => value !== hash)].slice(0, 4);
  if (next.join(',') === previous.join(',')) return false;
  user.ipHashes = next;
  return true;
}

export function clearExpiredInternetIpBans(store) {
  const previous = Array.isArray(store.ipBans) ? store.ipBans : [];
  store.ipBans = previous.filter((ban) => !ban.until || new Date(ban.until).getTime() > Date.now());
  return previous.length - store.ipBans.length;
}

export function getActiveInternetIpBan(store, ipHash) {
  const hashes = (Array.isArray(ipHash) ? ipHash : [ipHash])
    .map((value) => text(value, 100))
    .filter((hash) => /^[A-Za-z0-9_-]{32,100}$/.test(hash));
  if (!hashes.length) return null;
  clearExpiredInternetIpBans(store);
  const ban = store.ipBans.find((item) => hashes.includes(item.hash));
  return ban ? { reason: text(ban.reason, 300) || 'No reason was provided.', until: ban.until || null } : null;
}

export function banKnownInternetIps(store, user, { enabled, reason, durationDays }) {
  const hashes = [...new Set(Array.isArray(user?.ipHashes) ? user.ipHashes : [])]
    .filter((hash) => /^[A-Za-z0-9_-]{32,100}$/.test(hash));
  if (!enabled || !hashes.length) return 0;
  const days = Number(durationDays);
  if (durationDays !== 'forever' && (!Number.isInteger(days) || days < 1 || days > 30)) {
    throw new Error('Choose a ban duration from 1 to 30 days, or Forever');
  }
  const until = durationDays === 'forever' ? null : new Date(Date.now() + (days * 24 * 60 * 60 * 1000)).toISOString();
  const note = text(reason, 300) || 'No reason was provided.';
  store.ipBans = (Array.isArray(store.ipBans) ? store.ipBans : []).filter((ban) => !hashes.includes(ban.hash));
  store.ipBans.push(...hashes.map((hash) => ({ id: randomUUID(), hash, reason: note, until, createdAt: new Date().toISOString() })));
  return hashes.length;
}

export function clearKnownInternetIpBans(store, user) {
  const hashes = new Set(
    (Array.isArray(user?.ipHashes) ? user.ipHashes : [])
      .filter((hash) => /^[A-Za-z0-9_-]{32,100}$/.test(hash))
  );
  if (!hashes.size) return 0;
  const previous = Array.isArray(store.ipBans) ? store.ipBans : [];
  store.ipBans = previous.filter((ban) => !hashes.has(ban.hash));
  return previous.length - store.ipBans.length;
}

export function clearExpiredInternetPosts() {
  return 0;
}

export function upsertInternetUser(store, user) {
  const id = text(user?.id, 24);
  if (!/^\d{16,22}$/.test(id)) throw new Error('Invalid user');
  const existing = store.users[id] || { verified: false, banned: false };
  const has = (key) => Object.prototype.hasOwnProperty.call(user || {}, key);
  if (!existing.createdAt) existing.createdAt = new Date().toISOString();
  store.users[id] = {
    ...existing,
    id,
    username: has('username') ? text(user?.username, 80) || existing.username || 'Discord user' : existing.username || 'Discord user',
    displayName: has('displayName') ? text(user?.displayName, 80) || existing.displayName || 'Discord user' : existing.displayName || 'Discord user',
    avatarUrl: has('avatarUrl') ? text(user?.avatarUrl, 300) || null : existing.avatarUrl || null,
    staffRank: has('staffRank') ? text(user?.staffRank, 80) || null : existing.staffRank || null,
    badges: withSiteBadges(
      has('badges') && Array.isArray(user?.badges)
        ? mergeInternetBadges(existing.badges, user.badges, {
          id,
          username: has('username') ? user?.username : existing.username,
        })
        : existing.badges,
      {
        id,
        username: has('username') ? text(user?.username, 80) || existing.username : existing.username,
      },
    ),
  };
  return store.users[id];
}

const BASE_DAILY_CREDITS = 75;
const WELCOME_CREDITS = 100;
const DAILY_CREDIT_DELAY = 24 * 60 * 60 * 1000;

/** Chat more on Clearwater Internet to raise your daily credit drop. */
export const CHAT_BOOST_LEVELS = Object.freeze([
  { level: 0, messages: 0, daily: 75, label: 'Starter' },
  { level: 1, messages: 25, daily: 100, label: 'Talker' },
  { level: 2, messages: 75, daily: 125, label: 'Regular' },
  { level: 3, messages: 150, daily: 150, label: 'Active' },
  { level: 4, messages: 300, daily: 200, label: 'Chatter' },
  { level: 5, messages: 500, daily: 250, label: 'City Voice' },
]);

function creditBalance(user) {
  return Math.max(0, Math.floor(Number(user?.credits) || 0));
}

function isSystemInternetAccount(user) {
  return user?.id === OFFICIAL_INTERNET_ACCOUNT_ID
    || user?.id === BANK_INTERNET_ACCOUNT_ID
    || user?.official === true
    || user?.bank === true;
}

function addCreditTransaction(user, { amount, type, note = '', actorName = 'Clearwater' }) {
  user.creditTransactions = Array.isArray(user.creditTransactions) ? user.creditTransactions : [];
  user.creditTransactions.unshift({
    id: randomUUID(),
    amount: Math.trunc(Number(amount) || 0),
    type: text(type, 40) || 'adjustment',
    note: text(note, 220),
    actorName: text(actorName, 80) || 'Clearwater',
    createdAt: new Date().toISOString(),
    balanceAfter: creditBalance(user),
  });
  user.creditTransactions = user.creditTransactions.slice(0, 100);
}

function actorRoleIds(actor, user) {
  const fromActor = Array.isArray(actor?.guildRoles) ? actor.guildRoles : [];
  const fromUser = Array.isArray(user?.guildRoles) ? user.guildRoles : [];
  return [...new Set([...fromActor, ...fromUser].map(String).filter((id) => /^\d{16,22}$/.test(id)))];
}

export function chatBoostState(user) {
  const messages = Math.max(0, Math.floor(Number(user?.chatSentCount) || 0));
  let current = CHAT_BOOST_LEVELS[0];
  let next = CHAT_BOOST_LEVELS[1] || null;
  for (let index = 0; index < CHAT_BOOST_LEVELS.length; index += 1) {
    if (messages >= CHAT_BOOST_LEVELS[index].messages) {
      current = CHAT_BOOST_LEVELS[index];
      next = CHAT_BOOST_LEVELS[index + 1] || null;
    }
  }
  const span = next ? Math.max(1, next.messages - current.messages) : 1;
  const progress = next ? Math.min(1, Math.max(0, (messages - current.messages) / span)) : 1;
  return {
    messages,
    level: current.level,
    label: current.label,
    daily: current.daily,
    progress,
    nextLevel: next?.level ?? null,
    nextLabel: next?.label || null,
    nextDaily: next?.daily ?? null,
    nextMessages: next?.messages ?? null,
    messagesToNext: next ? Math.max(0, next.messages - messages) : 0,
    maxLevel: !next,
    levels: CHAT_BOOST_LEVELS.map((level) => ({ ...level })),
  };
}

function resolvedDailyTier(actor, user) {
  const role = dailyCreditTierForRoles(actorRoleIds(actor, user), user?.badges || actor?.badges || []);
  const boost = chatBoostState(user);
  if (role.amount > boost.daily) {
    return {
      amount: role.amount,
      label: role.label,
      source: 'role',
      chatBoost: boost,
    };
  }
  return {
    amount: boost.daily,
    label: boost.label,
    source: boost.level > 0 ? 'chat' : (role.id ? 'role' : 'base'),
    chatBoost: boost,
  };
}

function recordChatActivity(user) {
  if (!user || isSystemInternetAccount(user)) return;
  user.chatSentCount = Math.max(0, Math.floor(Number(user.chatSentCount) || 0)) + 1;
}

function ensureInternetWallet(store, actor) {
  const user = upsertInternetUser(store, actor);
  if (Array.isArray(actor?.guildRoles) && actor.guildRoles.length) {
    user.guildRoles = [...new Set(actor.guildRoles.map(String).filter((id) => /^\d{16,22}$/.test(id)))].slice(0, 100);
  }
  if (!user.walletStartedAt) {
    user.walletStartedAt = new Date().toISOString();
    user.dailyCreditClaimedAt = user.walletStartedAt;
    user.chatSentCount = Math.max(0, Math.floor(Number(user.chatSentCount) || 0));
    user.credits = creditBalance(user) + WELCOME_CREDITS;
    addCreditTransaction(user, { amount: WELCOME_CREDITS, type: 'welcome', note: 'Welcome to Clearwater Internet', actorName: 'Clearwater' });
    addInternetLog(store, `Clearwater gave ${text(user.displayName, 80) || 'a member'} their C$${WELCOME_CREDITS} welcome credit.`);
  } else {
    user.credits = creditBalance(user);
    user.chatSentCount = Math.max(0, Math.floor(Number(user.chatSentCount) || 0));
  }
  return user;
}

function walletView(user, { claimedNow = false, actor = null } = {}) {
  const lastClaim = user.dailyCreditClaimedAt ? new Date(user.dailyCreditClaimedAt).getTime() : 0;
  const nextClaimAt = lastClaim ? lastClaim + DAILY_CREDIT_DELAY : 0;
  const canClaim = !lastClaim || Date.now() >= nextClaimAt;
  const daily = resolvedDailyTier(actor, user);
  return {
    balance: creditBalance(user),
    dailyAmount: daily.amount,
    dailyLabel: daily.label,
    dailySource: daily.source,
    baseDailyAmount: BASE_DAILY_CREDITS,
    canClaim,
    claimedNow: claimedNow === true,
    nextClaimAt: canClaim ? null : new Date(nextClaimAt).toISOString(),
    nextDailyAt: canClaim ? null : new Date(nextClaimAt).toISOString(),
    chatBoost: daily.chatBoost,
    transactions: (Array.isArray(user.creditTransactions) ? user.creditTransactions : []).slice(0, 50).map((entry) => ({
      ...entry,
      balance: entry.balanceAfter ?? entry.balance ?? creditBalance(user),
    })),
  };
}

export function walletSnapshot(store, actor) {
  expireStaleCreditTransfers(store);
  const user = ensureInternetWallet(store, actor);
  assertNotBanned(user);
  const daily = resolvedDailyTier(actor, user);
  const lastClaim = user.dailyCreditClaimedAt ? new Date(user.dailyCreditClaimedAt).getTime() : 0;
  let claimedNow = false;
  if (lastClaim && Date.now() - lastClaim >= DAILY_CREDIT_DELAY) {
    user.credits = creditBalance(user) + daily.amount;
    user.dailyCreditClaimedAt = new Date().toISOString();
    addCreditTransaction(user, {
      amount: daily.amount,
      type: 'daily',
      note: daily.source === 'role'
        ? `24-hour daily credit · ${daily.label}`
        : daily.source === 'chat'
          ? `24-hour daily credit · Chat ${daily.label}`
          : '24-hour daily credit',
      actorName: 'Clearwater',
    });
    addInternetLog(store, `${text(user.displayName, 80) || 'A member'} received C$${daily.amount} daily credits.`);
    claimedNow = true;
  }
  return {
    ...walletView(user, { claimedNow, actor }),
    pendingTransfers: pendingTransfersFor(store, user.id),
  };
}

export function claimInternetDailyCredits(store, actor) {
  const user = ensureInternetWallet(store, actor);
  assertNotBanned(user);
  const daily = resolvedDailyTier(actor, user);
  const snapshot = walletView(user, { actor });
  if (!snapshot.canClaim) throw new Error(`Your next C$${daily.amount} daily credit is not ready yet.`);
  user.credits = creditBalance(user) + daily.amount;
  user.dailyCreditClaimedAt = new Date().toISOString();
  addCreditTransaction(user, {
    amount: daily.amount,
    type: 'daily',
    note: daily.source === 'role'
      ? `24-hour daily credit · ${daily.label}`
      : daily.source === 'chat'
        ? `24-hour daily credit · Chat ${daily.label}`
        : '24-hour daily credit',
    actorName: 'Clearwater',
  });
  addInternetLog(store, `${text(user.displayName, 80) || 'A member'} claimed C$${daily.amount} daily credits.`);
  return walletView(user, { claimedNow: true, actor });
}

export function adjustInternetCredits(store, { actor, targetId, amount, note = '' }) {
  const id = String(targetId || '').trim();
  const change = Math.trunc(Number(amount));
  if (!/^\d{16,22}$/.test(id)) throw new Error('Enter a valid Discord user ID');
  if (!Number.isSafeInteger(change) || change === 0 || Math.abs(change) > 1_000_000) throw new Error('Enter a credit amount between 1 and 1,000,000');
  const user = store.users[id] || upsertInternetUser(store, { id });
  const before = creditBalance(user);
  const applied = change < 0 ? -Math.min(before, Math.abs(change)) : change;
  user.credits = before + applied;
  addCreditTransaction(user, {
    amount: applied,
    type: applied >= 0 ? 'staff-credit' : 'staff-debit',
    note: text(note, 220) || (applied >= 0 ? 'Added by staff' : 'Removed by staff'),
    actorName: text(actor?.displayName, 80) || 'Staff',
  });
  addInternetLog(store, `${text(actor?.displayName, 80) || 'Staff'} ${applied >= 0 ? 'added' : 'removed'} C$${Math.abs(applied)} ${applied >= 0 ? 'to' : 'from'} ${text(user.displayName, 80) || 'a member'}.`);
  return { user, wallet: walletView(user), applied };
}

const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;

function creditTransfers(store) {
  if (!Array.isArray(store.creditTransfers)) store.creditTransfers = [];
  return store.creditTransfers;
}

function moneyLabel(amount) {
  return `C$${Math.trunc(Number(amount) || 0).toLocaleString()}`;
}

function transferExpiresAt(transfer) {
  if (transfer?.expiresAt) return transfer.expiresAt;
  const created = new Date(transfer?.createdAt || Date.now()).getTime();
  return new Date((Number.isFinite(created) ? created : Date.now()) + TRANSFER_TTL_MS).toISOString();
}

function transferIsExpired(transfer) {
  return Date.now() >= new Date(transferExpiresAt(transfer)).getTime();
}

function normalizeIpHashes(hashes = []) {
  return (Array.isArray(hashes) ? hashes : [hashes])
    .map((hash) => String(hash || '').trim())
    .filter((hash) => /^[A-Za-z0-9_-]{32,100}$/.test(hash));
}

// Only compare the actor's current request IP against the other account's saved
// hashes. Mixing both histories (or adding the actor IP to both sides) caused
// false "same network" blocks on Accept.
function otherAccountHasCurrentNetwork(otherUser, currentHashes = []) {
  const currents = normalizeIpHashes(currentHashes);
  if (!currents.length) return false;
  const other = new Set(normalizeIpHashes(otherUser?.ipHashes));
  return currents.some((hash) => other.has(hash));
}

function syncTransferMessages(store, transfer) {
  for (const user of Object.values(store.users)) {
    if (!Array.isArray(user.messages)) continue;
    for (const message of user.messages) {
      if (message.transferId === transfer.id) {
        message.transferStatus = transfer.status;
        message.transferExpiresAt = transfer.expiresAt || transferExpiresAt(transfer);
        message.transferActionable = transfer.status === 'pending' && message.transferActionable === true;
      }
    }
  }
}

function expireCreditTransfer(store, transfer) {
  if (!transfer || transfer.status !== 'pending') return transfer;
  const from = ensureInternetWallet(store, { id: transfer.fromId });
  const to = ensureInternetWallet(store, { id: transfer.toId });
  const money = moneyLabel(transfer.amount);
  if (transfer.type === 'send') {
    from.credits = creditBalance(from) + transfer.amount;
    addCreditTransaction(from, {
      amount: transfer.amount,
      type: 'transfer-refund',
      note: 'Transfer expired after 24 hours',
      actorName: 'Bank',
    });
  }
  transfer.status = 'expired';
  transfer.resolvedAt = new Date().toISOString();
  transfer.expiresAt = transfer.expiresAt || transferExpiresAt(transfer);
  syncTransferMessages(store, transfer);
  deliverBankDirectMessage(store, {
    toId: from.id,
    content: transfer.type === 'send'
      ? `Your transfer of ${money} expired after 24 hours and was returned to your wallet.`
      : `Your request for ${money} expired after 24 hours.`,
  });
  deliverBankDirectMessage(store, {
    toId: to.id,
    content: transfer.type === 'send'
      ? `A pending credit transfer of ${money} expired after 24 hours.`
      : `A credit request for ${money} expired after 24 hours.`,
  });
  return transfer;
}

function expireStaleCreditTransfers(store) {
  let changed = false;
  for (const transfer of creditTransfers(store)) {
    if (transfer.status === 'pending' && transferIsExpired(transfer)) {
      expireCreditTransfer(store, transfer);
      changed = true;
    }
  }
  return changed;
}

function deliverBankDirectMessage(store, { toId, content, transfer = null, actionable = false }) {
  const bank = ensureBankInternetAccount(store);
  const recipient = upsertInternetUser(store, { id: toId });
  if (recipient.id === BANK_INTERNET_ACCOUNT_ID) return null;
  const sentAt = new Date().toISOString();
  const message = {
    id: randomUUID(),
    kind: 'direct',
    fromId: BANK_INTERNET_ACCOUNT_ID,
    toId: recipient.id,
    content: text(content, 1000),
    createdAt: sentAt,
    readAt: null,
    ...(transfer ? {
      transferId: transfer.id,
      transferType: transfer.type,
      transferAmount: transfer.amount,
      transferStatus: transfer.status,
      transferFromId: transfer.fromId,
      transferToId: transfer.toId,
      transferExpiresAt: transfer.expiresAt || transferExpiresAt(transfer),
      transferActionable: actionable === true && transfer.status === 'pending',
    } : {}),
  };
  bank.messages = Array.isArray(bank.messages) ? bank.messages : [];
  recipient.messages = Array.isArray(recipient.messages) ? recipient.messages : [];
  bank.messages.unshift({ ...message, readAt: sentAt });
  recipient.messages.unshift({ ...message, readAt: null });
  bank.messages = bank.messages.slice(0, 200);
  recipient.messages = recipient.messages.slice(0, 120);
  addInternetNotification(store, { recipientId: recipient.id, actor: bank, type: 'message' });
  return message;
}

function pendingTransfersFor(store, userId) {
  expireStaleCreditTransfers(store);
  return creditTransfers(store)
    .filter((transfer) => transfer.status === 'pending' && (transfer.fromId === userId || transfer.toId === userId))
    .slice(0, 20)
    .map((transfer) => ({
      id: transfer.id,
      type: transfer.type,
      amount: transfer.amount,
      fromId: transfer.fromId,
      toId: transfer.toId,
      note: transfer.note || '',
      status: transfer.status,
      createdAt: transfer.createdAt,
      expiresAt: transferExpiresAt(transfer),
      actionable: transfer.toId === userId,
    }));
}

export function createCreditTransfer(store, { actor, type, targetId, username, amount, note = '', ipHash = '', ipHashLegacy = '' }) {
  expireStaleCreditTransfers(store);
  const kind = type === 'request' ? 'request' : 'send';
  const value = Math.trunc(Number(amount));
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000) {
    throw new Error('Enter an amount from C$1 to C$100,000');
  }
  const initiator = ensureInternetWallet(store, actor);
  if (
    initiator.id === OFFICIAL_INTERNET_ACCOUNT_ID
    || initiator.id === BANK_INTERNET_ACCOUNT_ID
    || initiator.official === true
    || initiator.bank === true
  ) {
    throw new Error('This account cannot start member transfers');
  }
  if (getActiveBan(initiator)) throw new Error('This account is banned from Clearwater Internet');
  recordInternetIpHash(store, initiator.id, ipHash);
  recordInternetIpHash(store, initiator.id, ipHashLegacy);
  const target = findInternetMember(store, { id: targetId, username });
  if (!target) throw new Error('That member has not joined Clearwater Internet yet');
  if (target.id === initiator.id) throw new Error('Choose another member');
  if (
    target.id === OFFICIAL_INTERNET_ACCOUNT_ID
    || target.id === BANK_INTERNET_ACCOUNT_ID
    || target.official === true
    || target.bank === true
  ) {
    throw new Error('You cannot transfer credits with that account');
  }
  ensureInternetWallet(store, target);
  if (otherAccountHasCurrentNetwork(target, [ipHash, ipHashLegacy])) {
    throw new Error('You cannot transfer credits between accounts on the same network');
  }
  if ((target.blocked || []).includes(initiator.id) || (initiator.blocked || []).includes(target.id)) {
    throw new Error('This transfer is unavailable');
  }
  const noteText = text(note, 120);
  if (kind === 'send') {
    if (creditBalance(initiator) < value) throw new Error('You do not have enough Clearwater credits');
    initiator.credits = creditBalance(initiator) - value;
    addCreditTransaction(initiator, {
      amount: -value,
      type: 'transfer-hold',
      note: noteText || `Pending send to @${target.username}`,
      actorName: initiator.displayName || 'Clearwater member',
    });
  }

  const createdAt = new Date().toISOString();
  const transfer = {
    id: randomUUID(),
    type: kind,
    amount: value,
    fromId: initiator.id,
    toId: target.id,
    note: noteText,
    status: 'pending',
    createdAt,
    expiresAt: new Date(Date.now() + TRANSFER_TTL_MS).toISOString(),
    resolvedAt: null,
  };
  creditTransfers(store).unshift(transfer);
  store.creditTransfers = creditTransfers(store).slice(0, 500);

  const actorLabel = `${text(initiator.displayName, 80) || 'A member'} (@${initiator.username})`;
  const targetLabel = `${text(target.displayName, 80) || 'a member'} (@${target.username})`;
  const money = moneyLabel(value);
  const noteLine = noteText ? `\nNote: ${noteText}` : '';

  if (kind === 'send') {
    deliverBankDirectMessage(store, {
      toId: target.id,
      content: `${actorLabel} wants to send you ${money}.${noteLine}\n\nAccept within 24 hours to add it to your wallet.`,
      transfer,
      actionable: true,
    });
    deliverBankDirectMessage(store, {
      toId: initiator.id,
      content: `Your transfer of ${money} to ${targetLabel} is waiting for them to accept. It expires in 24 hours.`,
      transfer,
      actionable: false,
    });
  } else {
    deliverBankDirectMessage(store, {
      toId: target.id,
      content: `${actorLabel} requested ${money} from you.${noteLine}\n\nAccept within 24 hours to pay from your Clearwater credits.`,
      transfer,
      actionable: true,
    });
    deliverBankDirectMessage(store, {
      toId: initiator.id,
      content: `Your request for ${money} from ${targetLabel} was sent. It expires in 24 hours.`,
      transfer,
      actionable: false,
    });
  }

  addInternetLog(store, `${text(initiator.displayName, 80) || 'A member'} ${kind === 'send' ? 'sent' : 'requested'} ${money} ${kind === 'send' ? 'to' : 'from'} ${text(target.displayName, 80) || 'a member'}.`);
  return { transfer, wallet: { ...walletView(initiator), pendingTransfers: pendingTransfersFor(store, initiator.id) } };
}

export function respondCreditTransfer(store, { actor, transferId, decision, ipHash = '', ipHashLegacy = '' }) {
  expireStaleCreditTransfers(store);
  const user = ensureInternetWallet(store, actor);
  assertNotBanned(user);
  recordInternetIpHash(store, user.id, ipHash);
  recordInternetIpHash(store, user.id, ipHashLegacy);
  const transfer = creditTransfers(store).find((item) => item.id === String(transferId || ''));
  if (!transfer) throw new Error('That transfer is no longer available');
  if (transfer.status === 'pending' && transferIsExpired(transfer)) {
    expireCreditTransfer(store, transfer);
    throw new Error('This transfer expired after 24 hours');
  }
  if (transfer.status === 'expired') throw new Error('This transfer expired after 24 hours');
  if (transfer.status !== 'pending') throw new Error('That transfer is no longer available');
  if (transfer.toId !== user.id) throw new Error('Only the recipient can respond to this transfer');
  const accept = decision === 'accept';
  if (!accept && decision !== 'decline') throw new Error('Choose Accept or Decline');

  const from = ensureInternetWallet(store, { id: transfer.fromId });
  const to = ensureInternetWallet(store, { id: transfer.toId });
  const money = moneyLabel(transfer.amount);
  // Recipient is acting: only block if their current IP is already known on the sender.
  if (accept && otherAccountHasCurrentNetwork(from, [ipHash, ipHashLegacy])) {
    throw new Error('You cannot transfer credits between accounts on the same network');
  }

  if (accept) {
    if (transfer.type === 'send') {
      to.credits = creditBalance(to) + transfer.amount;
      addCreditTransaction(to, {
        amount: transfer.amount,
        type: 'transfer-in',
        note: transfer.note || `Received from @${from.username}`,
        actorName: from.displayName || 'Clearwater member',
      });
    } else {
      if (creditBalance(to) < transfer.amount) throw new Error('You do not have enough Clearwater credits');
      to.credits = creditBalance(to) - transfer.amount;
      from.credits = creditBalance(from) + transfer.amount;
      addCreditTransaction(to, {
        amount: -transfer.amount,
        type: 'transfer-out',
        note: transfer.note || `Paid @${from.username}`,
        actorName: to.displayName || 'Clearwater member',
      });
      addCreditTransaction(from, {
        amount: transfer.amount,
        type: 'transfer-in',
        note: transfer.note || `Received from @${to.username}`,
        actorName: to.displayName || 'Clearwater member',
      });
    }
    transfer.status = 'accepted';
  } else {
    if (transfer.type === 'send') {
      from.credits = creditBalance(from) + transfer.amount;
      addCreditTransaction(from, {
        amount: transfer.amount,
        type: 'transfer-refund',
        note: `Declined by @${to.username}`,
        actorName: 'Bank',
      });
    }
    transfer.status = 'declined';
  }
  transfer.resolvedAt = new Date().toISOString();
  syncTransferMessages(store, transfer);

  if (accept) {
    deliverBankDirectMessage(store, {
      toId: from.id,
      content: transfer.type === 'send'
        ? `${text(to.displayName, 80) || 'A member'} accepted your ${money} transfer.`
        : `${text(to.displayName, 80) || 'A member'} paid your ${money} request.`,
    });
    deliverBankDirectMessage(store, {
      toId: to.id,
      content: transfer.type === 'send'
        ? `You accepted ${money} from ${text(from.displayName, 80) || 'a member'}.`
        : `You paid ${money} to ${text(from.displayName, 80) || 'a member'}.`,
    });
  } else {
    deliverBankDirectMessage(store, {
      toId: from.id,
      content: transfer.type === 'send'
        ? `${text(to.displayName, 80) || 'A member'} declined your ${money} transfer. The credits were returned.`
        : `${text(to.displayName, 80) || 'A member'} declined your ${money} request.`,
    });
    deliverBankDirectMessage(store, {
      toId: to.id,
      content: `You declined the ${money} ${transfer.type === 'send' ? 'transfer' : 'request'} from ${text(from.displayName, 80) || 'a member'}.`,
    });
  }

  addInternetLog(store, `${text(to.displayName, 80) || 'A member'} ${accept ? 'accepted' : 'declined'} a ${money} credit ${transfer.type}.`);
  return { transfer, wallet: { ...walletView(user), pendingTransfers: pendingTransfersFor(store, user.id) } };
}

function safeProfileUrl(value, fallback) {
  const candidate = text(value, 500);
  if (!candidate) return fallback;
  if (/^assets\/[a-z0-9._-]+$/i.test(candidate)) return candidate;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || url.username || url.password || /["'()\\\s]/.test(candidate)) {
      throw new Error('Use a secure image URL that starts with https://');
    }
    return url.href;
  } catch (error) {
    if (error.message.startsWith('Use a secure')) throw error;
    throw new Error('Use a secure image URL that starts with https://');
  }
}

export function ensureOfficialInternetAccount(store) {
  const profile = { ...officialDefaults, ...(store.officialProfile || {}) };
  const account = upsertInternetUser(store, {
    id: OFFICIAL_INTERNET_ACCOUNT_ID,
    displayName: profile.displayName,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    staffRank: 'Official account',
  });
  account.verified = true;
  account.official = true;
  account.bio = profile.bio;
  account.bannerUrl = profile.bannerUrl;
  return account;
}

export function ensureBankInternetAccount(store) {
  const account = upsertInternetUser(store, {
    id: BANK_INTERNET_ACCOUNT_ID,
    displayName: bankDefaults.displayName,
    username: bankDefaults.username,
    avatarUrl: bankDefaults.avatarUrl,
    staffRank: 'Bank',
  });
  account.verified = true;
  account.bank = true;
  account.official = false;
  account.bio = bankDefaults.bio;
  account.bannerUrl = bankDefaults.bannerUrl;
  account.credits = Number.isFinite(Number(account.credits)) ? account.credits : 0;
  return account;
}

export function updateOfficialInternetProfile(store, profile = {}) {
  const previous = store.officialProfile || {};
  store.officialProfile = {
    displayName: text(profile.displayName, 80) || officialDefaults.displayName,
    username: text(profile.username, 40).replace(/[^a-z0-9_]/gi, '').toLowerCase() || officialDefaults.username,
    bio: text(profile.bio, 300),
    avatarUrl: text(profile.avatarUrl, 500)
      ? safeProfileUrl(profile.avatarUrl, previous.avatarUrl || officialDefaults.avatarUrl)
      : (previous.avatarUrl || officialDefaults.avatarUrl),
    bannerUrl: text(profile.bannerUrl, 500)
      ? safeProfileUrl(profile.bannerUrl, previous.bannerUrl || officialDefaults.bannerUrl)
      : (previous.bannerUrl || officialDefaults.bannerUrl),
  };
  return ensureOfficialInternetAccount(store);
}

// Banners have to satisfy the site Content-Security-Policy, so only bundled
// assets, Clearwater blob uploads, and Discord CDN images can be stored.
const BANNER_HOSTS = /(^|\.)(?:blob\.vercel-storage\.com|cdn\.discordapp\.com|media\.discordapp\.net)$/i;

export const PROFILE_BANNER_PRESETS = Object.freeze([
  'assets/clearwater-police-night.png',
  'assets/clearwater-sunset-beach.png',
  'assets/clearwater-campfire.png',
  'assets/clearwater-home.png',
  'assets/state-trooper-night.png',
  'assets/sheriff-station.png',
  'assets/fire-rescue-scene.png',
  'assets/liberty-county-map.jpg',
  'assets/liberty-county-map.png',
]);

function safeBannerUrl(value) {
  const candidate = text(value, 500);
  if (!candidate) return '';
  if (PROFILE_BANNER_PRESETS.includes(candidate)) return candidate;
  const invalid = new Error('Upload a banner or pick one of the Clearwater presets.');
  if (/["'()\\\s]/.test(candidate)) throw invalid;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    throw invalid;
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw invalid;
  if (!BANNER_HOSTS.test(url.hostname)) throw invalid;
  return url.href;
}

function safeWebsiteUrl(value) {
  const candidate = text(value, 200);
  if (!candidate) return '';
  const invalid = new Error('Website links need to be a valid https:// address.');
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    throw invalid;
  }
  if (url.protocol !== 'https:' || url.username || url.password) throw invalid;
  return url.href.slice(0, 200);
}

function safeAccentColor(value) {
  const candidate = text(value, 9);
  if (!candidate) return '';
  if (!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(candidate)) throw new Error('Pick an accent colour in #rrggbb format.');
  return candidate.toLowerCase();
}

// Profile text is rejected outright instead of being held for review, because
// there is no queued copy of a profile the way there is for a post.
function cleanProfileText(value, length, label) {
  const candidate = text(value, length);
  if (candidate && scanInternetContent(candidate)) {
    throw new Error(`Your ${label} breaks the Clearwater community rules. Remove the flagged wording and try again.`);
  }
  return candidate;
}

function profilePayload(user) {
  return {
    bio: user.bio || '',
    pronouns: user.pronouns || '',
    location: user.location || '',
    website: user.website || '',
    bannerUrl: user.bannerUrl || '',
    accentColor: user.accentColor || '',
    pinnedPostId: user.pinnedPostId || '',
    deactivated: user.deactivated === true,
    presets: PROFILE_BANNER_PRESETS,
  };
}

export function internetProfile(store, actor) {
  return profilePayload(upsertInternetUser(store, actor));
}

export function updateInternetProfile(store, { actor, profile = {} }) {
  const user = upsertInternetUser(store, actor);
  if (user.official === true) throw new Error('Edit the official account from the staff controls.');
  if (getActiveBan(user)) throw new Error('This account is banned from Clearwater Internet');
  if (flagActive(user, 'lockProfile', 'lockProfileUntil')) throw new Error('Staff locked profile edits on this account.');
  const has = (key) => Object.prototype.hasOwnProperty.call(profile, key);
  if (has('bio')) user.bio = cleanProfileText(profile.bio, 300, 'bio');
  if (has('pronouns')) user.pronouns = cleanProfileText(profile.pronouns, 40, 'pronouns');
  if (has('location')) user.location = cleanProfileText(profile.location, 60, 'location');
  if (has('website')) user.website = safeWebsiteUrl(profile.website);
  if (has('bannerUrl')) user.bannerUrl = safeBannerUrl(profile.bannerUrl);
  if (has('accentColor')) user.accentColor = safeAccentColor(profile.accentColor);
  if (has('pinnedPostId')) {
    const pinned = text(profile.pinnedPostId, 64);
    const owned = pinned && store.posts.some((post) => post.id === pinned && post.authorId === user.id && !post.parentId);
    user.pinnedPostId = owned ? pinned : '';
  }
  user.profileUpdatedAt = new Date().toISOString();
  return profilePayload(user);
}

export function setInternetAccountActive(store, { actor, deactivated }) {
  const user = upsertInternetUser(store, actor);
  assertNotOfficial(user, 'deactivated');
  user.deactivated = deactivated === true;
  user.deactivatedAt = user.deactivated ? new Date().toISOString() : null;
  return { deactivated: user.deactivated };
}

export function deleteInternetAccount(store, { actor }) {
  const user = upsertInternetUser(store, actor);
  assertNotOfficial(user, 'deleted');
  const id = user.id;
  const removedPosts = store.posts.filter((post) => post.authorId === id).map((post) => post.id);
  const removed = new Set(removedPosts);
  store.posts = store.posts.filter((post) => !removed.has(post.id) && !removed.has(post.parentId));
  for (const post of store.posts) {
    if (Array.isArray(post.likes)) post.likes = post.likes.filter((like) => like !== id);
    if (Array.isArray(post.reposts)) post.reposts = post.reposts.filter((repost) => repost !== id);
  }
  store.reports = store.reports.filter((report) => report.authorId !== id && report.reporterId !== id);
  for (const member of Object.values(store.users)) {
    if (Array.isArray(member.following)) member.following = member.following.filter((followed) => followed !== id);
    if (Array.isArray(member.blocked)) member.blocked = member.blocked.filter((blocked) => blocked !== id);
    if (Array.isArray(member.muted)) member.muted = member.muted.filter((muted) => muted !== id);
    if (Array.isArray(member.bookmarks)) member.bookmarks = member.bookmarks.filter((bookmark) => !removed.has(bookmark));
    if (Array.isArray(member.notifications)) member.notifications = member.notifications.filter((note) => note.actorId !== id);
    if (Array.isArray(member.messages)) member.messages = member.messages.filter((message) => message.fromId !== id && message.toId !== id);
  }
  delete store.users[id];
  addInternetLog(store, `${user.displayName || 'A member'} deleted their Clearwater Internet account.`);
  return { deleted: true, posts: removedPosts.length };
}

function sanitizeDropLocation(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const x = Number(raw.x);
  const z = Number(raw.z);
  // Always recompute pin placement from world coords. Live ER:LC payloads use
  // northwest-origin studs; centre-origin only when a negative axis appears.
  let left = Number(raw.left);
  let top = Number(raw.top);
  if (Number.isFinite(x) && Number.isFinite(z)) {
    const centreOrigin = x < 0 || z < 0;
    left = centreOrigin ? 0.5 + (x / 3120) : x / 3120;
    top = centreOrigin ? 0.5 + (z / 3120) : z / 3120;
  }
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return {
    ...(Number.isFinite(x) ? { x: Math.round(x * 10) / 10 } : {}),
    ...(Number.isFinite(z) ? { z: Math.round(z * 10) / 10 } : {}),
    postal: text(raw.postal, 12),
    street: text(raw.street, 80),
    building: text(raw.building, 20),
    label: text(raw.label, 120) || 'Liberty County',
    left: Math.min(0.995, Math.max(0.005, left)),
    top: Math.min(0.995, Math.max(0.005, top)),
  };
}

export function createInternetPost(store, user, content, media = {}) {
  const body = text(content, 500);
  const isReel = media?.reel === true;
  const gifUrl = text(media?.gif?.url, 500);
  const gifTitle = text(media?.gif?.title, 120);
  const isGif = /^https:\/\/(?:media\d*|i)\.giphy\.com\//.test(gifUrl);
  const hostedImage = hostedMediaUrl(media?.image?.url);
  const hostedVideo = hostedMediaUrl(media?.video?.url);
  const imageUrl = hostedImage || text(media?.image?.dataUrl, 4_200_000);
  const isImage = Boolean(hostedImage) || /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(imageUrl);
  const videoUrl = hostedVideo || text(media?.video?.dataUrl, 4_200_000);
  const isVideo = Boolean(hostedVideo) || /^data:video\/(?:mp4|webm|quicktime);base64,[a-z0-9+/=]+$/i.test(videoUrl);
  const question = text(media?.poll?.question, 180);
  const options = Array.isArray(media?.poll?.options) ? media.poll.options.map((option) => text(option, 80)).filter(Boolean).slice(0, 4) : [];
  const pollDays = Math.min(30, Math.max(1, Number(media?.poll?.durationDays) || 1));
  const parentId = text(media?.parentId, 80) || null;
  const dropLocation = sanitizeDropLocation(media?.location);
  if (isReel) {
    if (!isImage && !isVideo) throw new Error('Add a photo or a short video to post a Reel');
    if (isGif || question) throw new Error('Reels can only include a photo or video');
  } else if (!body && !isGif && !isImage && !question && !text(media?.quoteId, 80) && !dropLocation) {
    throw new Error('Write something, add an image or GIF, or create a poll before posting');
  }
  if (gifUrl && !isGif) throw new Error('Only GIFs selected from Clearwater Internet can be posted');
  if (imageUrl && !isImage) throw new Error('Choose a supported image before posting');
  if (videoUrl && !isVideo) throw new Error('Choose a supported MP4 or WebM video before posting');
  if ((question && options.length < 2) || (!question && options.length)) throw new Error('A poll needs a question and at least two options');
  assertCanPost(store, user, { reel: isReel });
  enforceAutomod(store, {
    actor: user,
    kind: 'post',
    content: [body, question, gifTitle, ...options].filter(Boolean).join('\n'),
    extra: {
      heldPayload: sanitizeHeldPayload({
        content: body,
        location: dropLocation,
        gifUrl: isGif ? gifUrl : '',
        gifTitle: isGif ? gifTitle : '',
        imageUrl: isImage ? imageUrl : '',
        quoteId: text(media?.quoteId, 80) || '',
      }),
    },
  });
  if (!parentId) {
    // Keep the Internet feed responsive while still preventing rapid spam.
    const postCooldownMs = 20_000;
    const cooldownRemaining = postCooldownMs - (Date.now() - new Date(user.lastPostAt || 0).getTime());
    if (cooldownRemaining > 0) throw new Error(`Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before posting again`);
    const normalized = body.toLowerCase().replace(/\s+/g, ' ').trim();
    const duplicateCooldown = 5 * 60 * 1000;
    if (body && store.posts.some((post) => post.authorId === user.id
      && post.content.toLowerCase().replace(/\s+/g, ' ').trim() === normalized
      && Date.now() - new Date(post.createdAt).getTime() < duplicateCooldown)) {
      throw new Error('You can post the same message again after 5 minutes');
    }
  }
  if (/(.)\1{11,}/.test(body) || (body.match(/https?:\/\//gi) || []).length > 2) {
    throw new Error('That post looks like spam. Please shorten it and try again');
  }
  const post = {
    id: randomUUID(),
    kind: isReel ? 'reel' : 'post',
    authorId: user.id,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    staffRank: user.staffRank,
    verified: user.verified === true,
    badges: withSiteBadges(user.badges, user),
    content: body,
    parentId,
    quoteId: text(media?.quoteId, 80) || null,
    likes: [],
    ...(isGif ? { gifUrl, gifTitle } : {}),
    ...(isImage ? { imageUrl } : {}),
    ...(isVideo ? { videoUrl } : {}),
    ...(dropLocation ? { location: dropLocation } : {}),
    ...(question ? { poll: { question, options, votes: {}, endsAt: new Date(Date.now() + (pollDays * 24 * 60 * 60 * 1000)).toISOString() } } : {}),
    createdAt: new Date().toISOString(),
  };
  store.posts.unshift(post);
  store.posts = store.posts.slice(0, 10_000);
  const mentionedHandles = [...new Set((body.match(/(?:^|\s)@([a-z0-9_]{1,80})/gi) || []).map((mention) => mention.trim().slice(1).toLowerCase()))];
  mentionedHandles.forEach((handle) => {
    const recipient = Object.values(store.users).find((member) => String(member.username || '').toLowerCase() === handle);
    if (recipient) addInternetNotification(store, { recipientId: recipient.id, actor: user, type: 'mention', post });
  });
  if (post.quoteId) {
    const quoted = store.posts.find((item) => item.id === post.quoteId);
    if (quoted?.authorId && quoted.authorId !== user.id) {
      addInternetNotification(store, { recipientId: quoted.authorId, actor: user, type: 'quote', post });
    }
  }
  if (!parentId) user.lastPostAt = post.createdAt;
  recordChatActivity(user);
  return post;
}

export function voteInternetPoll(store, { actor, postId, optionIndex, remove = false }) {
  const user = upsertInternetUser(store, actor);
  assertCanPost(store, user);
  const post = store.posts.find((item) => item.id === String(postId || ''));
  if (!post?.poll?.question || !Array.isArray(post.poll.options)) throw new Error('Poll not found');
  if (post.poll.endsAt && new Date(post.poll.endsAt).getTime() <= Date.now()) throw new Error('This poll has ended');
  const votes = post.poll.votes && typeof post.poll.votes === 'object' ? post.poll.votes : {};
  if (remove) {
    delete votes[user.id];
  } else {
    const choice = Number(optionIndex);
    if (!Number.isInteger(choice) || choice < 0 || choice >= post.poll.options.length) throw new Error('Choose a valid poll option');
    votes[user.id] = choice;
  }
  post.poll.votes = votes;
  return post;
}

function isNativeRepost(post) {
  return Boolean(post?.repostOf) && !post.quoteId && !String(post.content || '').trim();
}

function sourceInternetPost(store, post) {
  if (!isNativeRepost(post)) return post;
  return store.posts.find((item) => item.id === post.repostOf) || post;
}

function nativeRepostByUser(store, userId, postId) {
  return store.posts.find((item) => item.authorId === String(userId) && isNativeRepost(item) && item.repostOf === String(postId));
}

export function interactInternetPost(store, { actor, postId, type, content = '', quote = false }) {
  const user = upsertInternetUser(store, actor);
  if (type === 'reply' || type === 'repost') assertCanPost(store, user);
  else if (getActiveBan(user) || getActiveMute(user)) throw new Error(getActiveBan(user) ? 'This account is banned from Clearwater Internet' : 'This account is muted');
  const requested = store.posts.find((item) => item.id === String(postId || ''));
  if (!requested) throw new Error('Post not found');
  const post = sourceInternetPost(store, requested);
  if (type === 'like') {
    post.likes = Array.isArray(post.likes) ? post.likes : [];
    const liked = post.likes.includes(user.id);
    post.likes = liked ? post.likes.filter((id) => id !== user.id) : [...post.likes, user.id];
    if (!liked) addInternetNotification(store, { recipientId: post.authorId, actor: user, type: 'like', post });
    return { post, liked: !liked };
  }
  if (type === 'reply') {
    const body = text(content, 500);
    const normalized = body.toLowerCase().replace(/\s+/g, ' ').trim();
    const recentDuplicate = normalized
      ? store.posts.find((item) => item.parentId === post.id
        && item.authorId === user.id
        && String(item.content || '').toLowerCase().replace(/\s+/g, ' ').trim() === normalized
        && Date.now() - new Date(item.createdAt).getTime() < 15_000)
      : null;
    if (recentDuplicate) return { post: recentDuplicate, duplicate: true };
    const reply = createInternetPost(store, user, content, { parentId: post.id });
    addInternetNotification(store, { recipientId: post.authorId, actor: user, type: 'reply', post: reply });
    return { post: reply };
  }
  if (type === 'repost') {
    const existing = nativeRepostByUser(store, user.id, post.id);
    if (!String(content || '').trim() && !quote) {
      if (existing) {
        store.posts = store.posts.filter((item) => item.id !== existing.id);
        return { post, reposted: false };
      }
      const repost = {
        id: randomUUID(),
        authorId: user.id,
        displayName: user.displayName,
        username: user.username,
        avatarUrl: user.avatarUrl,
        staffRank: user.staffRank,
        verified: user.verified === true,
        badges: withSiteBadges(user.badges, user),
        content: '',
        repostOf: post.id,
        parentId: null,
        quoteId: null,
        createdAt: new Date().toISOString(),
      };
      store.posts.unshift(repost);
      store.posts = store.posts.slice(0, 10_000);
      addInternetNotification(store, { recipientId: post.authorId, actor: user, type: 'repost', post: repost });
      return { post: repost, reposted: true };
    }
    const quoted = createInternetPost(store, user, content, { quoteId: post.id });
    addInternetNotification(store, { recipientId: post.authorId, actor: user, type: 'quote', post: quoted });
    return { post: quoted };
  }
  throw new Error('Unsupported post action');
}

export function editInternetPost(store, { postId, actorId, content, owner = false }) {
  const post = store.posts.find((item) => item.id === String(postId || ''));
  if (!post) throw new Error('Post not found');
  if (!owner && post.authorId !== String(actorId)) throw new Error('You can only edit your own posts');
  const body = text(content, 500);
  if (!body) throw new Error('Write something before saving');
  enforceAutomod(store, { actor: store.users[String(actorId)] || { id: actorId }, kind: 'post', content: body, extra: { postId: post.id } });
  post.content = body;
  post.editedAt = new Date().toISOString();
  return post;
}

export function deleteInternetPost(store, { postId, actorId, owner = false }) {
  const index = store.posts.findIndex((item) => item.id === String(postId || ''));
  if (index < 0) throw new Error('Post not found');
  const [post] = store.posts.splice(index, 1);
  if (!owner && post.authorId !== String(actorId)) {
    store.posts.splice(index, 0, post);
    throw new Error('You can only delete your own posts');
  }
  store.reports = store.reports.filter((report) => report.postId !== post.id);
  return post;
}

export function createInternetReport(store, { postId, actor, reason }) {
  const post = store.posts.find((item) => item.id === String(postId || ''));
  if (!post) throw new Error('Post not found');
  const kind = post.parentId ? 'comment' : (post.kind === 'reel' ? 'reel' : 'post');
  if (post.authorId === String(actor?.id)) throw new Error(`You cannot report your own ${kind}`);
  const reportReason = text(reason, 300);
  if (!reportReason) throw new Error('Enter a reason for the report');
  if (store.reports.some((report) => report.postId === post.id && report.reporterId === String(actor.id))) {
    throw new Error(`You have already reported this ${kind}`);
  }
  const report = {
    id: randomUUID(),
    kind,
    source: 'member',
    postId: post.id,
    reporterId: String(actor.id),
    reporterName: text(actor.displayName, 80) || 'Discord user',
    authorId: post.authorId,
    authorName: post.displayName,
    authorUsername: text(post.username, 80),
    authorAvatarUrl: text(post.avatarUrl, 300) || null,
    content: post.content,
    hasVideo: Boolean(post.videoUrl) || kind === 'reel',
    reason: reportReason,
    createdAt: new Date().toISOString(),
    status: 'open',
  };
  store.reports.unshift(report);
  store.reports = store.reports.slice(0, 200);
  return report;
}

export function createInternetAdReport(store, { adId, actor, reason }) {
  expireInternetAds(store);
  const ad = store.ads.find((item) => item.id === String(adId || ''));
  if (!ad || !['active', 'pending'].includes(ad.status)) throw new Error('Sponsored ad not found');
  if (ad.advertiserId === String(actor?.id || '')) throw new Error('You cannot report your own sponsored ad');
  const reportReason = text(reason, 300);
  if (!reportReason) throw new Error('Enter a reason for the report');
  if (store.reports.some((report) => report.kind === 'ad' && report.adId === ad.id && report.reporterId === String(actor.id) && report.status === 'open')) {
    throw new Error('You have already reported this sponsored ad');
  }
  const report = {
    id: randomUUID(),
    kind: 'ad',
    source: 'member',
    adId: ad.id,
    postId: null,
    reporterId: String(actor.id),
    reporterName: text(actor.displayName, 80) || 'Discord user',
    authorId: ad.advertiserId,
    authorName: ad.advertiserName,
    authorUsername: text(ad.advertiserUsername, 80),
    authorAvatarUrl: store.users[ad.advertiserId]?.avatarUrl || null,
    content: `${ad.businessName}\n${ad.title}\n${ad.body}`,
    hasVideo: Boolean(ad.videoUrl),
    adImageUrl: ad.imageUrl || '',
    adVideoUrl: ad.videoUrl || '',
    adBusinessName: ad.businessName,
    adTitle: ad.title,
    reason: reportReason,
    createdAt: new Date().toISOString(),
    status: 'open',
  };
  store.reports.unshift(report);
  store.reports = store.reports.slice(0, 200);
  return report;
}

function addInternetLog(store, message, revert = null) {
  const entry = {
    id: randomUUID(),
    message: text(message, 400),
    createdAt: new Date().toISOString(),
  };
  if (revert && typeof revert === 'object' && revert.type) {
    entry.revert = revert;
  }
  store.logs.unshift(entry);
  store.logs = store.logs.slice(0, 300);
  return entry;
}

const STAFF_USER_INVERSE = Object.freeze({
  verify: 'unverify',
  unverify: 'verify',
  'badge-business': 'unbadge-business',
  'unbadge-business': 'badge-business',
  'badge-warning': 'unbadge-warning',
  'unbadge-warning': 'badge-warning',
  ban: 'unban',
  unban: 'ban',
  'ip-ban': 'clear-ip-ban',
  mute: 'unmute',
  unmute: 'mute',
  'lock-posts': 'unlock-posts',
  'unlock-posts': 'lock-posts',
  'lock-messages': 'unlock-messages',
  'unlock-messages': 'lock-messages',
  'lock-reels': 'unlock-reels',
  'unlock-reels': 'lock-reels',
  'lock-profile': 'unlock-profile',
  'unlock-profile': 'lock-profile',
  shadowban: 'unshadowban',
  unshadowban: 'shadowban',
  watch: 'unwatch',
  unwatch: 'watch',
});

function staffUserRevertMeta(targetId, staffAction, extra = {}) {
  const inverse = STAFF_USER_INVERSE[staffAction];
  if (!inverse || !/^\d{16,22}$/.test(String(targetId || ''))) return null;
  return {
    type: 'staff-user',
    targetId: String(targetId),
    staffAction: String(staffAction),
    inverse,
    reason: text(extra.reason, 300),
    note: text(extra.note, 500),
    durationDays: extra.durationDays === 'forever' || extra.durationDays == null
      ? 'forever'
      : (Number(extra.durationDays) || 'forever'),
    warningBadgeText: text(extra.warningBadgeText, 120),
  };
}

function publicHistoryLog(log) {
  const revert = log?.revert && typeof log.revert === 'object' ? log.revert : null;
  const canRevert = Boolean(revert?.type && !log.revertedAt);
  return {
    id: log.id,
    message: text(log.message, 400),
    createdAt: log.createdAt,
    revertedAt: log.revertedAt || null,
    canRevert,
    revertBlockedReason: log.revertedAt
      ? 'Already reverted'
      : (canRevert ? '' : 'This action cannot be restored'),
  };
}

function canRevertReport(report) {
  if (!report || report.revertedAt || report.status === 'open') return false;
  if (report.status === 'denied') return true;
  if (report.status !== 'accepted') return false;
  if (report.action === 'ban' || report.action === 'warning') return true;
  if (report.action === 'delete') {
    if (report.kind === 'ad') return Boolean(report.adId);
    return Boolean(report.deletedSnapshot || report.postId);
  }
  return false;
}

function snapshotDeletedPost(post) {
  if (!post || typeof post !== 'object') return null;
  // Keep enough to restore the post; media may still be data URLs or hosted paths.
  return {
    id: post.id,
    kind: post.kind === 'reel' ? 'reel' : 'post',
    authorId: post.authorId,
    displayName: post.displayName,
    username: post.username,
    avatarUrl: post.avatarUrl,
    staffRank: post.staffRank,
    verified: post.verified === true,
    badges: Array.isArray(post.badges) ? post.badges : [],
    content: text(post.content, 500),
    parentId: post.parentId || null,
    quoteId: post.quoteId || null,
    likes: Array.isArray(post.likes) ? post.likes : [],
    gifUrl: post.gifUrl || undefined,
    gifTitle: post.gifTitle || undefined,
    imageUrl: post.imageUrl || undefined,
    videoUrl: post.videoUrl || undefined,
    location: post.location || undefined,
    poll: post.poll || undefined,
    discordFeedMessageId: post.discordFeedMessageId || undefined,
    createdAt: post.createdAt,
    editedAt: post.editedAt || undefined,
  };
}

function restoreDeletedPost(store, snapshot) {
  if (!snapshot?.id) return false;
  if (store.posts.some((post) => post.id === snapshot.id)) return true;
  store.posts.unshift({
    ...snapshot,
    restoredAt: new Date().toISOString(),
  });
  store.posts = store.posts.slice(0, 10_000);
  return true;
}

function sanitizeHeldPayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const hostedImage = hostedMediaUrl(payload.imageUrl);
  const rawImage = String(payload.imageUrl || '');
  const hadInlineImage = /^data:image\/(?:png|jpeg|webp|gif);base64,/i.test(rawImage);
  const gifUrl = text(payload.gifUrl, 500);
  const gifTitle = text(payload.gifTitle, 120);
  const isGif = /^https:\/\/(?:media\d*|i)\.giphy\.com\//.test(gifUrl);
  const next = {
    content: text(payload.content, 500),
    location: sanitizeDropLocation(payload.location),
    gifUrl: isGif ? gifUrl : '',
    gifTitle: isGif ? gifTitle : '',
    // Never persist multi-megabyte data URLs into reports — they break store
    // writes and make the staff moderation payload too large to load.
    imageUrl: hostedImage || '',
    hasImage: Boolean(hostedImage) || hadInlineImage,
    quoteId: text(payload.quoteId, 80) || '',
  };
  if (!next.content && !next.gifUrl && !next.imageUrl && !next.hasImage && !next.location && !next.quoteId) return null;
  return next;
}

function publicStaffReport(store, report) {
  const enriched = enrichInternetReport(store, report);
  const held = enriched.heldPayload && typeof enriched.heldPayload === 'object' ? enriched.heldPayload : null;
  const { heldPayload, deletedSnapshot, ...rest } = enriched;
  return {
    ...rest,
    hasHeldMedia: Boolean(held && (held.imageUrl || held.gifUrl || held.hasImage)),
    canRevert: canRevertReport(report),
    revertedAt: report.revertedAt || null,
    revertBlockedReason: report.revertedAt
      ? 'Already reverted'
      : (canRevertReport(report) ? '' : 'This action cannot be restored'),
  };
}

function recentMessageSequence(sender, nextContent) {
  const next = text(nextContent, 1000);
  // Only join very short, rapid-fire messages. This catches a person spelling
  // a word one letter at a time without combining ordinary conversations.
  if (!next || next.length > 4) return '';
  const cutoff = Date.now() - 90_000;
  const recentParts = (Array.isArray(sender?.messages) ? sender.messages : [])
    .filter((message) => message?.fromId === sender.id
      && typeof message.content === 'string'
      && message.content.trim().length > 0
      && message.content.trim().length <= 4
      && new Date(message.createdAt || 0).getTime() >= cutoff)
    .slice(0, 10)
    .reverse()
    .map((message) => message.content.trim());
  if (recentParts.length < 2) return '';
  return [...recentParts, next].join(' ');
}

function enforceAutomod(store, { actor, kind, content, extra = {} }) {
  if (!actor?.id || actor.id === OFFICIAL_INTERNET_ACCOUNT_ID) return null;
  const hit = scanInternetContent(content);
  if (!hit) return null;
  const snippet = text(content, 500);
  const duplicate = store.reports.some((report) => report.status === 'open'
    && report.source === 'automod'
    && report.authorId === String(actor.id)
    && report.content === snippet
    && Date.now() - new Date(report.createdAt).getTime() < 60 * 60 * 1000);
  if (!duplicate) {
    store.reports.unshift({
      id: randomUUID(),
      kind: kind === 'message' ? 'message' : 'post',
      source: 'automod',
      postId: extra.postId || null,
      targetId: extra.targetId || null,
      reporterId: 'automod',
      reporterName: 'Clearwater Automod',
      authorId: String(actor.id),
      authorName: text(actor.displayName, 80) || 'Discord user',
      authorUsername: text(actor.username, 80),
      authorAvatarUrl: text(actor.avatarUrl, 300) || null,
      content: snippet,
      reason: hit.reason,
      categories: hit.categories,
      heldPayload: sanitizeHeldPayload(extra.heldPayload),
      createdAt: new Date().toISOString(),
      status: 'open',
    });
    store.reports = store.reports.slice(0, 200);
    addInternetLog(store, `Automod held ${text(actor.displayName, 80) || 'a member'}'s ${kind}. ${hit.reason}`);
  }
  throw new AutomodHoldError(AUTOMOD_HOLD_MESSAGE, hit);
}

function releaseHeldInternetPost(store, report) {
  const payload = sanitizeHeldPayload(report?.heldPayload);
  if (!payload || report.postId) return null;
  const author = upsertInternetUser(store, {
    id: report.authorId,
    displayName: report.authorName,
    username: report.authorUsername,
    avatarUrl: report.authorAvatarUrl,
  });
  const body = text(payload.content, 500);
  const dropLocation = sanitizeDropLocation(payload.location);
  const gifUrl = text(payload.gifUrl, 500);
  const gifTitle = text(payload.gifTitle, 120);
  const isGif = /^https:\/\/(?:media\d*|i)\.giphy\.com\//.test(gifUrl);
  const imageUrl = hostedMediaUrl(payload.imageUrl);
  const isImage = Boolean(imageUrl);
  if (!body && !isGif && !isImage && !dropLocation && !text(payload.quoteId, 80)) return null;
  const post = {
    id: randomUUID(),
    kind: 'post',
    authorId: author.id,
    displayName: author.displayName,
    username: author.username,
    avatarUrl: author.avatarUrl,
    staffRank: author.staffRank,
    verified: author.verified === true,
    badges: withSiteBadges(author.badges, author),
    content: body,
    parentId: null,
    quoteId: text(payload.quoteId, 80) || null,
    ...(isGif ? { gifUrl, gifTitle } : {}),
    ...(isImage ? { imageUrl } : {}),
    ...(dropLocation ? { location: dropLocation } : {}),
    createdAt: new Date().toISOString(),
    releasedFromHold: true,
  };
  store.posts.unshift(post);
  store.posts = store.posts.slice(0, 10_000);
  author.lastPostAt = post.createdAt;
  report.postId = post.id;
  report.released = true;
  return post;
}

function addInternetMessage(store, userId, message) {
  const user = upsertInternetUser(store, { id: userId });
  user.messages = Array.isArray(user.messages) ? user.messages : [];
  user.messages.unshift({ id: randomUUID(), content: text(message, 500), createdAt: new Date().toISOString(), readAt: null });
  user.messages = user.messages.slice(0, 50);
}

export function reviewInternetReport(store, { reportId, decision, action, reason, durationDays }) {
  const report = store.reports.find((item) => item.id === String(reportId || ''));
  if (!report || report.status !== 'open') throw new Error('Open report not found');
  if (!['accept', 'deny'].includes(decision)) throw new Error('Choose Accept or Deny');

  report.status = decision === 'accept' ? 'accepted' : 'denied';
  report.reviewedAt = new Date().toISOString();
  const notifyReporter = report.reporterId && report.reporterId !== 'automod';
  const kindLabel = report.kind === 'message'
    ? 'message'
    : report.kind === 'comment'
      ? 'comment'
      : report.kind === 'reel'
        ? 'reel'
        : report.kind === 'ad'
          ? 'sponsored ad'
          : 'post';
  const reportRevert = { type: 'report', reportId: report.id };
  if (decision === 'deny') {
    let released = null;
    if (report.source === 'automod' && report.kind === 'post' && !report.postId) {
      released = releaseHeldInternetPost(store, report);
    }
    addInternetLog(store, report.source === 'automod'
      ? (released
        ? `Marked automod hold on ${report.authorName}'s ${kindLabel} as false and published it.`
        : `Dismissed automod hold on ${report.authorName}'s ${kindLabel}.`)
      : `Denied report against ${report.authorName}.`, reportRevert);
    if (notifyReporter) addInternetMessage(store, report.reporterId, `Your report about ${report.authorName}'s ${kindLabel} was reviewed. No action was taken.`);
    if (released) addInternetMessage(store, report.authorId, 'Staff reviewed your held post and published it.');
    return report;
  }

  if (!['delete', 'ban', 'warning'].includes(action)) throw new Error('Choose a moderation action');
  const note = text(reason, 300) || report.reason;
  report.action = action;
  report.actionReason = note;
  if (action === 'delete') {
    if (report.kind === 'ad' && report.adId) {
      const ad = store.ads.find((item) => item.id === report.adId);
      if (ad) {
        report.adSnapshot = {
          status: ad.status,
          endsAt: ad.endsAt || null,
          reviewNote: ad.reviewNote || '',
        };
        ad.status = 'denied';
        ad.endsAt = new Date().toISOString();
        ad.reviewNote = note;
      }
      addInternetLog(store, `Removed ${report.authorName}'s sponsored ad after a report. Reason: ${note}`, reportRevert);
    } else {
      const index = store.posts.findIndex((post) => post.id === report.postId);
      if (index >= 0) {
        report.deletedSnapshot = snapshotDeletedPost(store.posts[index]);
        store.posts.splice(index, 1);
      }
      addInternetLog(store, report.source === 'automod'
        ? `Confirmed automod hold on ${report.authorName}'s ${kindLabel}. Reason: ${note}`
        : `Deleted ${report.authorName}'s reported post. Reason: ${note}`, reportRevert);
    }
  }
  if (action === 'ban') {
    const user = upsertInternetUser(store, { id: report.authorId, displayName: report.authorName });
    setInternetBan(user, { enabled: true, reason: note, durationDays });
    addInternetLog(store, `Banned ${report.authorName}. Reason: ${note}`, reportRevert);
  }
  if (action === 'warning') {
    const user = upsertInternetUser(store, { id: report.authorId, displayName: report.authorName });
    user.warnings = Array.isArray(user.warnings) ? user.warnings : [];
    const warning = { id: randomUUID(), reason: note, createdAt: new Date().toISOString(), readAt: null };
    report.warningId = warning.id;
    user.warnings.unshift(warning);
    user.warnings = user.warnings.slice(0, 30);
    addInternetLog(store, `Warned ${report.authorName}. Reason: ${note}`, reportRevert);
    addInternetMessage(store, report.authorId, `You received a warning from Clearwater Internet. Reason: ${note}`);
  }
  if (notifyReporter) {
    addInternetMessage(store, report.reporterId, `Your report about ${report.authorName}'s ${kindLabel} was reviewed. Action taken: ${action === 'delete' ? 'content removed' : action === 'ban' ? 'account banned' : 'warning given'}.`);
  }
  return report;
}

export function takeUnreadInternetWarnings(store, actor) {
  const user = upsertInternetUser(store, actor);
  const warnings = (Array.isArray(user.warnings) ? user.warnings : []).filter((warning) => !warning.readAt);
  if (warnings.length) warnings.forEach((warning) => { warning.readAt = new Date().toISOString(); });
  return warnings;
}

export function takeInternetMessages(store, actor) {
  expireStaleCreditTransfers(store);
  const user = upsertInternetUser(store, actor);
  const messages = (Array.isArray(user.messages) ? user.messages : []).filter((message) => message.kind === 'direct');
  const conversations = new Map();
  messages.forEach((message) => {
    const otherId = message.fromId === user.id ? message.toId : message.fromId;
    if (!otherId) return;
    const previous = conversations.get(otherId);
    const unread = message.toId === user.id && !message.readAt ? 1 : 0;
    if (!previous || new Date(message.createdAt).getTime() > new Date(previous.createdAt).getTime()) {
      conversations.set(otherId, {
        id: message.id,
        kind: 'direct',
        fromId: message.fromId,
        toId: message.toId,
        content: text(message.content, 1000),
        gifUrl: message.gifUrl || '',
        gifTitle: message.gifTitle || '',
        createdAt: message.createdAt,
        readAt: message.readAt || null,
        transferId: message.transferId || null,
        transferStatus: message.transferStatus || null,
        otherId,
        unread: (previous?.unread || 0) + unread,
      });
    } else {
      previous.unread = (previous.unread || 0) + unread;
    }
  });

  return [...conversations.values()]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 80)
    .map((item) => {
      const peer = store.users[item.otherId] || {};
      const isBank = item.otherId === BANK_INTERNET_ACCOUNT_ID || peer.bank === true;
      const isOfficial = item.otherId === OFFICIAL_INTERNET_ACCOUNT_ID || peer.official === true;
      return {
        ...item,
        otherDisplayName: text(peer.displayName, 80)
          || text(peer.username, 80)
          || (isBank ? 'Clearwater Bank' : isOfficial ? 'Clearwater Roleplay' : 'Clearwater member'),
        otherUsername: text(peer.username, 80)
          || (isBank ? 'clearwaterbank' : isOfficial ? 'clearwater' : 'member'),
        otherAvatarUrl: peer.avatarUrl || null,
        otherStaffRank: peer.staffRank || (isBank ? 'Bank' : isOfficial ? 'Official' : null),
      };
    });
}

function findInternetMember(store, { id, username } = {}) {
  const key = String(id || '');
  if (key && store.users[key]) return store.users[key];
  const handle = String(username || '').replace(/^@/, '').toLowerCase();
  if (!handle) return null;
  return Object.values(store.users).find((user) => String(user.username || '').toLowerCase() === handle) || null;
}

export function takeInternetConversation(store, { actor, withUserId, username }) {
  expireStaleCreditTransfers(store);
  const user = upsertInternetUser(store, actor);
  const other = findInternetMember(store, { id: withUserId, username });
  if (!other) throw new Error('That member has not joined Clearwater Internet yet');
  const otherId = other.id;
  const messages = (Array.isArray(user.messages) ? user.messages : []).filter((message) => message.kind === 'direct' && (message.fromId === otherId || message.toId === otherId));
  messages.forEach((message) => { if (message.toId === user.id && !message.readAt) message.readAt = new Date().toISOString(); });
  return messages.sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt)).slice(-100);
}

export function takeInternetNotifications(store, actor) {
  const user = upsertInternetUser(store, actor);
  const notifications = Array.isArray(user.notifications) ? user.notifications : [];
  const unreadCount = notifications.filter((notification) => !notification.readAt).length;
  notifications.forEach((notification) => { if (!notification.readAt) notification.readAt = new Date().toISOString(); });
  return { notifications: notifications.slice(0, 100), unreadCount };
}

export function socialSnapshot(store, actor) {
  const user = upsertInternetUser(store, actor);
  return {
    following: Array.isArray(user.following) ? user.following : [],
    followers: Object.values(store.users).filter((member) => Array.isArray(member.following) && member.following.includes(user.id)).map((member) => member.id),
    unreadNotifications: (Array.isArray(user.notifications) ? user.notifications : []).filter((notification) => !notification.readAt).length,
    unreadMessages: (Array.isArray(user.messages) ? user.messages : []).filter((message) => message.kind === 'direct' && message.toId === user.id && !message.readAt).length,
    blocked: Array.isArray(user.blocked) ? user.blocked : [],
    muted: Array.isArray(user.muted) ? user.muted : [],
    bookmarks: Array.isArray(user.bookmarks) ? user.bookmarks : [],
  };
}

const preferenceKeys = new Set([
  'followersOnly',
  'hideFollowing',
  'hideProfile',
  'friendsMessages',
  'hideStats',
  'reduceMotion',
  'compactPosts',
  'autoplayReels',
  'largeText',
  'discordDmNotifications',
]);

export function internetPreferences(store, actor) {
  const user = upsertInternetUser(store, actor);
  const saved = user.preferences && typeof user.preferences === 'object' ? user.preferences : {};
  return Object.fromEntries([...preferenceKeys].map((key) => {
    // Reels should start playing unless the member explicitly turns autoplay off.
    if (key === 'autoplayReels') return [key, saved[key] !== false];
    return [key, saved[key] === true];
  }));
}

export function updateInternetPreference(store, { actor, key, enabled }) {
  if (!preferenceKeys.has(String(key || ''))) throw new Error('Unknown setting');
  const user = upsertInternetUser(store, actor);
  user.preferences = { ...(user.preferences && typeof user.preferences === 'object' ? user.preferences : {}), [key]: enabled === true };
  return internetPreferences(store, user);
}

export function updateInternetSocial(store, { actor, targetId, type, enabled, postId }) {
  const user = upsertInternetUser(store, actor);
  assertNotBanned(user);
  if (type === 'bookmark') {
    if (!store.posts.some((post) => post.id === String(postId))) throw new Error('Post not found');
    user.bookmarks = Array.isArray(user.bookmarks) ? user.bookmarks : [];
    user.bookmarks = enabled ? [...new Set([...user.bookmarks, String(postId)])].slice(-200) : user.bookmarks.filter((id) => id !== String(postId));
    return socialSnapshot(store, user);
  }
  if (!['follow', 'block', 'mute'].includes(type)) throw new Error('Unsupported social action');
  const target = String(targetId || '');
  if (!/^\d{16,22}$/.test(target) || target === user.id) throw new Error('Choose another member');
  const key = `${type === 'follow' ? 'following' : `${type}ed`}`;
  user[key] = Array.isArray(user[key]) ? user[key] : [];
  user[key] = enabled ? [...new Set([...user[key], target])].slice(-500) : user[key].filter((id) => id !== target);
  if (type === 'block' && enabled) user.following = (user.following || []).filter((id) => id !== target);
  if (type === 'follow' && enabled) addInternetNotification(store, { recipientId: target, actor: user, type: 'follow' });
  return socialSnapshot(store, user);
}

export function sendInternetMessage(store, { actor, to, content, gif, username }) {
  const sender = upsertInternetUser(store, actor);
  const recipient = findInternetMember(store, { id: to, username });
  if (!recipient) throw new Error('That member has not joined Clearwater Internet yet');
  assertCanMessage(store, sender);
  if (sender.id === recipient.id) throw new Error('You cannot message yourself');
  const body = text(content, 1000);
  const gifUrl = text(gif?.url, 500);
  const gifTitle = text(gif?.title, 120);
  const isGif = /^https:\/\/(?:media\d*|i)\.giphy\.com\//.test(gifUrl);
  if (!body && !isGif) throw new Error('Write a message or add a GIF first');
  if (gifUrl && !isGif) throw new Error('Choose a GIF from Clearwater Internet');
  if ((recipient.blocked || []).includes(sender.id) || (sender.blocked || []).includes(recipient.id)) throw new Error('This conversation is unavailable');
  const recipientPrefs = recipient.preferences && typeof recipient.preferences === 'object' ? recipient.preferences : {};
  if (recipientPrefs.friendsMessages === true && !(Array.isArray(recipient.following) && recipient.following.includes(sender.id))) {
    throw new Error('This member only accepts messages from people they follow');
  }
  const messageContent = [body, gifTitle].filter(Boolean).join('\n');
  const sequence = recentMessageSequence(sender, body);
  enforceAutomod(store, {
    actor: sender,
    kind: 'message',
    content: sequence || messageContent,
    extra: { targetId: recipient.id },
  });
  const wait = 1_500 - (Date.now() - new Date(sender.lastMessageAt || 0).getTime());
  if (wait > 0) throw new Error('Please wait a moment before sending another message');
  const sentAt = new Date().toISOString();
  const message = { id: randomUUID(), kind: 'direct', fromId: sender.id, toId: recipient.id, content: body, ...(isGif ? { gifUrl, gifTitle } : {}), createdAt: sentAt, readAt: null };
  sender.messages = Array.isArray(sender.messages) ? sender.messages : [];
  recipient.messages = Array.isArray(recipient.messages) ? recipient.messages : [];
  sender.messages.unshift({ ...message, readAt: sentAt });
  recipient.messages.unshift({ ...message, readAt: null });
  sender.messages = sender.messages.slice(0, 120);
  recipient.messages = recipient.messages.slice(0, 120);
  sender.lastMessageAt = sentAt;
  recordChatActivity(sender);
  addInternetNotification(store, { recipientId: recipient.id, actor: sender, type: 'message' });
  return { sent: true, message };
}

function staffUserFlags(user) {
  const ban = getActiveBan(user);
  const mute = getActiveMute(user);
  const badges = withSiteBadges(user.badges, user);
  return {
    verified: user.verified === true,
    official: user.official === true,
    banned: Boolean(ban),
    muted: Boolean(mute),
    watched: user.watched === true,
    shadowbanned: user.shadowbanned === true,
    lockPosts: flagActive(user, 'lockPosts', 'lockPostsUntil'),
    lockMessages: flagActive(user, 'lockMessages', 'lockMessagesUntil'),
    lockReels: flagActive(user, 'lockReels', 'lockReelsUntil'),
    lockProfile: flagActive(user, 'lockProfile', 'lockProfileUntil'),
    deactivated: user.deactivated === true,
    business: badges.includes('business'),
    warningBadge: badges.includes('warning'),
    developer: badges.includes('developer'),
    warningBadgeText: text(user.warningBadgeText, 120) || '',
    badges,
  };
}

function staffUserSummary(store, user) {
  const flags = staffUserFlags(user);
  const posts = store.posts.filter((post) => post.authorId === user.id);
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName || user.username || 'Discord user',
    avatarUrl: user.avatarUrl || null,
    staffRank: user.staffRank || null,
    createdAt: user.createdAt || null,
    lastSeenAt: user.lastSeenAt || null,
    warningCount: Array.isArray(user.warnings) ? user.warnings.length : 0,
    postCount: posts.filter((post) => post.kind !== 'reel' && !post.parentId).length,
    reelCount: posts.filter((post) => post.kind === 'reel' && !post.parentId).length,
    reportCount: store.reports.filter((report) => report.authorId === user.id).length,
    flagged: flags.banned || flags.muted || flags.watched || flags.shadowbanned || flags.lockPosts || flags.lockMessages || flags.lockReels || (Array.isArray(user.warnings) && user.warnings.length > 0),
    ...flags,
  };
}

export function staffUserDetail(store, targetId) {
  const id = String(targetId || '').trim();
  if (!/^\d{16,22}$/.test(id)) throw new Error('Enter a valid Discord user ID');
  const user = store.users[id] || upsertInternetUser(store, { id });
  const flags = staffUserFlags(user);
  const posts = store.posts.filter((post) => post.authorId === user.id);
  const followers = Object.values(store.users).filter((member) => Array.isArray(member.following) && member.following.includes(user.id)).length;
  return {
    user: {
      ...staffUserSummary(store, user),
      bio: text(user.bio, 300),
      bannerUrl: user.bannerUrl || null,
      note: text(user.staffNote, 500),
      ipHashCount: Array.isArray(user.ipHashes) ? user.ipHashes.length : 0,
      followingCount: Array.isArray(user.following) ? user.following.length : 0,
      followerCount: followers,
      credits: creditBalance(user),
      creditTransactions: (Array.isArray(user.creditTransactions) ? user.creditTransactions : []).slice(0, 15),
      messageCount: Array.isArray(user.messages) ? user.messages.filter((message) => message.kind === 'direct').length : 0,
      ban: flags.banned ? getActiveBan(user) : null,
      mute: flags.muted ? getActiveMute(user) : null,
      muteReason: text(user.muteReason, 300),
      banReason: text(user.banReason, 300),
      banSource: user.banSource || null,
      mutedUntil: flags.muted ? user.mutedUntil || null : null,
      lockPostsUntil: flags.lockPosts ? user.lockPostsUntil || null : null,
      lockMessagesUntil: flags.lockMessages ? user.lockMessagesUntil || null : null,
      lockReelsUntil: flags.lockReels ? user.lockReelsUntil || null : null,
      lockProfileUntil: flags.lockProfile ? user.lockProfileUntil || null : null,
    },
    warnings: (Array.isArray(user.warnings) ? user.warnings : []).slice(0, 30).map((warning) => ({
      id: warning.id,
      reason: text(warning.reason, 300),
      createdAt: warning.createdAt,
      readAt: warning.readAt || null,
    })),
    posts: posts.slice(0, 40).map((post) => ({
      id: post.id,
      kind: post.kind === 'reel' ? 'reel' : (post.parentId ? 'comment' : 'post'),
      content: text(post.content, 220),
      createdAt: post.createdAt,
      likes: Array.isArray(post.likes) ? post.likes.length : 0,
    })),
    reports: store.reports.filter((report) => report.authorId === user.id || report.reporterId === user.id).slice(0, 30).map((report) => ({
      id: report.id,
      status: report.status,
      action: report.action || null,
      reason: text(report.reason, 220),
      content: text(report.content, 180),
      createdAt: report.createdAt,
      role: report.authorId === user.id ? 'subject' : 'reporter',
    })),
  };
}

function setTimedFlag(user, boolKey, untilKey, enabled, durationDays) {
  user[boolKey] = enabled === true;
  user[untilKey] = enabled === true ? durationUntil(durationDays) : null;
}

function wipeAuthorPosts(store, userId, predicate) {
  const before = store.posts.length;
  store.posts = store.posts.filter((post) => post.authorId !== userId || !predicate(post));
  store.reports = store.reports.filter((report) => store.posts.some((post) => post.id === report.postId) || !report.postId);
  return before - store.posts.length;
}

export function applyStaffUserAction(store, {
  actor,
  targetId,
  staffAction,
  reason = '',
  durationDays = 'forever',
  note = '',
  ipBan = false,
  postId = '',
}) {
  const id = String(targetId || '').trim();
  if (!/^\d{16,22}$/.test(id)) throw new Error('Enter a valid Discord user ID');
  const action = String(staffAction || '').trim();
  const user = upsertInternetUser(store, { id });
  const actorName = text(actor?.displayName, 80) || 'Staff';
  const label = text(user.displayName, 80) || user.username || 'a member';
  const noteText = text(reason, 300) || text(note, 300);
  const destructive = new Set(['ban', 'ip-ban', 'mute', 'lock-posts', 'lock-messages', 'lock-reels', 'lock-profile', 'shadowban', 'wipe-posts', 'wipe-reels', 'wipe-comments', 'wipe-messages', 'reset-profile', 'delete-post']);
  if (destructive.has(action)) assertNotOfficial(user, 'moderated that way');

  const logUser = (message, extra = {}) => addInternetLog(
    store,
    message,
    staffUserRevertMeta(user.id, action, { reason: noteText, note: noteText, durationDays, ...extra }),
  );

  if (action === 'verify') {
    user.verified = true;
    logUser(`${actorName} verified ${label}.`);
  } else if (action === 'unverify') {
    user.verified = false;
    logUser(`${actorName} removed verification from ${label}.`);
  } else if (action === 'badge-business') {
    user.badges = sanitizeInternetBadges([...(Array.isArray(user.badges) ? user.badges : []), 'business']);
    logUser(`${actorName} marked ${label} as a business account.`);
  } else if (action === 'unbadge-business') {
    user.badges = sanitizeInternetBadges(user.badges).filter((badge) => badge !== 'business');
    logUser(`${actorName} removed the business badge from ${label}.`);
  } else if (action === 'badge-warning') {
    if (!noteText) throw new Error('Enter the warning tooltip text');
    user.badges = sanitizeInternetBadges([...(Array.isArray(user.badges) ? user.badges : []), 'warning']);
    user.warningBadgeText = noteText.slice(0, 120);
    logUser(`${actorName} added a warning badge to ${label}.`, { warningBadgeText: user.warningBadgeText });
  } else if (action === 'unbadge-warning') {
    const previousBadgeText = text(user.warningBadgeText, 120);
    user.badges = sanitizeInternetBadges(user.badges).filter((badge) => badge !== 'warning');
    user.warningBadgeText = '';
    logUser(`${actorName} removed the warning badge from ${label}.`, { warningBadgeText: previousBadgeText, note: previousBadgeText });
  } else if (action === 'ban') {
    setInternetBan(user, { enabled: true, reason: noteText, durationDays });
    if (ipBan === true) banKnownInternetIps(store, user, { enabled: true, reason: noteText, durationDays });
    logUser(`${actorName} banned ${label}. Reason: ${noteText || 'No reason was provided.'}`);
    addInternetMessage(store, user.id, `Your Clearwater Internet account was banned. Reason: ${noteText || 'No reason was provided.'}`);
  } else if (action === 'unban') {
    const previousReason = text(user.banReason, 300) || noteText;
    setInternetBan(user, { enabled: false });
    clearKnownInternetIpBans(store, user);
    logUser(`${actorName} unbanned ${label}.`, { reason: previousReason });
  } else if (action === 'ip-ban') {
    const count = banKnownInternetIps(store, user, { enabled: true, reason: noteText, durationDays });
    if (!count) throw new Error('This account has no known network hashes to block');
    logUser(`${actorName} blocked ${count} known network hash(es) for ${label}.`);
  } else if (action === 'clear-ip-ban') {
    const count = clearKnownInternetIpBans(store, user);
    addInternetLog(store, `${actorName} cleared network blocks for ${label}${count ? ` (${count})` : ''}`);
  } else if (action === 'warn') {
    if (!noteText) throw new Error('Enter a warning reason');
    user.warnings = Array.isArray(user.warnings) ? user.warnings : [];
    const warning = { id: randomUUID(), reason: noteText, createdAt: new Date().toISOString(), readAt: null };
    user.warnings.unshift(warning);
    user.warnings = user.warnings.slice(0, 30);
    addInternetLog(store, `${actorName} warned ${label}. Reason: ${noteText}`, {
      type: 'remove-warning',
      targetId: user.id,
      warningId: warning.id,
    });
    addInternetMessage(store, user.id, `You received a warning from Clearwater Internet. Reason: ${noteText}`);
  } else if (action === 'clear-warnings') {
    const previous = Array.isArray(user.warnings) ? user.warnings.slice(0, 30) : [];
    const count = previous.length;
    user.warnings = [];
    addInternetLog(store, `${actorName} cleared ${count} warning(s) for ${label}.`, previous.length ? {
      type: 'restore-warnings',
      targetId: user.id,
      warnings: previous,
    } : null);
  } else if (action === 'mute') {
    user.muted = true;
    user.muteReason = noteText || 'No reason was provided.';
    user.mutedUntil = durationUntil(durationDays);
    logUser(`${actorName} muted ${label}. Reason: ${user.muteReason}`);
    addInternetMessage(store, user.id, `You were muted on Clearwater Internet. Reason: ${user.muteReason}`);
  } else if (action === 'unmute') {
    const previousReason = text(user.muteReason, 300) || noteText;
    user.muted = false;
    user.muteReason = null;
    user.mutedUntil = null;
    logUser(`${actorName} unmuted ${label}.`, { reason: previousReason });
  } else if (action === 'lock-posts') {
    setTimedFlag(user, 'lockPosts', 'lockPostsUntil', true, durationDays);
    logUser(`${actorName} locked posting for ${label}.`);
  } else if (action === 'unlock-posts') {
    setTimedFlag(user, 'lockPosts', 'lockPostsUntil', false);
    logUser(`${actorName} unlocked posting for ${label}.`);
  } else if (action === 'lock-messages') {
    setTimedFlag(user, 'lockMessages', 'lockMessagesUntil', true, durationDays);
    logUser(`${actorName} locked messages for ${label}.`);
  } else if (action === 'unlock-messages') {
    setTimedFlag(user, 'lockMessages', 'lockMessagesUntil', false);
    logUser(`${actorName} unlocked messages for ${label}.`);
  } else if (action === 'lock-reels') {
    setTimedFlag(user, 'lockReels', 'lockReelsUntil', true, durationDays);
    logUser(`${actorName} locked Reels for ${label}.`);
  } else if (action === 'unlock-reels') {
    setTimedFlag(user, 'lockReels', 'lockReelsUntil', false);
    logUser(`${actorName} unlocked Reels for ${label}.`);
  } else if (action === 'lock-profile') {
    setTimedFlag(user, 'lockProfile', 'lockProfileUntil', true, durationDays);
    logUser(`${actorName} locked profile editing for ${label}.`);
  } else if (action === 'unlock-profile') {
    setTimedFlag(user, 'lockProfile', 'lockProfileUntil', false);
    logUser(`${actorName} unlocked profile editing for ${label}.`);
  } else if (action === 'shadowban') {
    user.shadowbanned = true;
    logUser(`${actorName} shadowbanned ${label}.`);
  } else if (action === 'unshadowban') {
    user.shadowbanned = false;
    logUser(`${actorName} removed the shadowban on ${label}.`);
  } else if (action === 'watch') {
    user.watched = true;
    logUser(`${actorName} added ${label} to the watchlist.`);
  } else if (action === 'unwatch') {
    user.watched = false;
    logUser(`${actorName} removed ${label} from the watchlist.`);
  } else if (action === 'note') {
    const previousNote = text(user.staffNote, 500);
    user.staffNote = text(note, 500);
    addInternetLog(store, `${actorName} updated the staff note for ${label}.`, {
      type: 'restore-note',
      targetId: user.id,
      note: previousNote,
    });
  } else if (action === 'wipe-posts') {
    const count = wipeAuthorPosts(store, user.id, (post) => post.kind !== 'reel' && !post.parentId);
    addInternetLog(store, `${actorName} deleted ${count} post(s) from ${label}.`);
  } else if (action === 'wipe-reels') {
    const reelIds = new Set(store.posts.filter((post) => post.authorId === user.id && post.kind === 'reel' && !post.parentId).map((post) => post.id));
    const before = store.posts.length;
    store.posts = store.posts.filter((post) => !reelIds.has(post.id) && !reelIds.has(post.parentId));
    store.reports = store.reports.filter((report) => store.posts.some((post) => post.id === report.postId) || !report.postId);
    addInternetLog(store, `${actorName} deleted ${before - store.posts.length} Reel(s) from ${label}.`);
  } else if (action === 'wipe-comments') {
    const count = wipeAuthorPosts(store, user.id, (post) => Boolean(post.parentId));
    addInternetLog(store, `${actorName} deleted ${count} comment(s) from ${label}.`);
  } else if (action === 'wipe-messages') {
    const count = Array.isArray(user.messages) ? user.messages.length : 0;
    user.messages = [];
    addInternetLog(store, `${actorName} wiped ${count} stored message(s) for ${label}.`);
  } else if (action === 'reset-profile') {
    user.bio = '';
    user.bannerUrl = null;
    user.pronouns = '';
    user.location = '';
    user.website = '';
    user.accentColor = '';
    user.pinnedPostId = '';
    addInternetLog(store, `${actorName} reset ${label}'s public profile.`);
  } else if (action === 'delete-post') {
    const existing = store.posts.find((post) => post.id === String(postId || ''));
    const snapshot = snapshotDeletedPost(existing);
    deleteInternetPost(store, { postId, actorId: actor?.id, owner: true });
    addInternetLog(store, `${actorName} deleted a post from ${label}.`, snapshot ? {
      type: 'restore-post',
      snapshot,
    } : null);
  } else if (action === 'send-notice') {
    if (!noteText) throw new Error('Write a staff notice first');
    addInternetMessage(store, user.id, `Staff notice: ${noteText}`);
    addInternetLog(store, `${actorName} sent a staff notice to ${label}.`);
  } else {
    throw new Error('Unsupported staff action');
  }

  return staffUserDetail(store, user.id);
}

export function applyStaffSiteAction(store, { actor, staffAction, enabled, banner }) {
  const action = String(staffAction || '').trim();
  const actorName = text(actor?.displayName, 80) || 'Staff';
  store.settings = store.settings && typeof store.settings === 'object'
    ? store.settings
    : { pausePosts: false, pauseReels: false, pauseMessages: false };
  if (action === 'pause-posts') {
    store.settings.pausePosts = enabled === true;
    addInternetLog(store, `${actorName} ${enabled ? 'paused' : 'resumed'} community posts.`, {
      type: 'site-toggle',
      staffAction: 'pause-posts',
      enabled: enabled !== true,
    });
  } else if (action === 'pause-reels') {
    store.settings.pauseReels = enabled === true;
    addInternetLog(store, `${actorName} ${enabled ? 'paused' : 'resumed'} Reels.`, {
      type: 'site-toggle',
      staffAction: 'pause-reels',
      enabled: enabled !== true,
    });
  } else if (action === 'pause-messages') {
    store.settings.pauseMessages = enabled === true;
    addInternetLog(store, `${actorName} ${enabled ? 'paused' : 'resumed'} direct messages.`, {
      type: 'site-toggle',
      staffAction: 'pause-messages',
      enabled: enabled !== true,
    });
  } else if (action === 'clear-dismissed-reports') {
    const before = store.reports.length;
    store.reports = store.reports.filter((report) => report.status === 'open' || report.status === 'accepted');
    addInternetLog(store, `${actorName} cleared ${before - store.reports.length} dismissed report(s).`);
  } else if (action === 'clear-ip-bans') {
    const count = Array.isArray(store.ipBans) ? store.ipBans.length : 0;
    store.ipBans = [];
    addInternetLog(store, `${actorName} cleared ${count} network ban(s).`);
  } else if (action === 'set-site-banner') {
    const previous = store.siteBanner || null;
    const next = sanitizeSiteBanner({
      ...(banner && typeof banner === 'object' ? banner : {}),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    if (!next) throw new Error('Enter a banner message');
    store.siteBanner = next;
    addInternetLog(store, `${actorName} published a site banner: ${next.message}`, {
      type: 'site-banner',
      previous,
      clear: true,
    });
  } else if (action === 'clear-site-banner') {
    const previous = store.siteBanner || null;
    store.siteBanner = null;
    addInternetLog(store, `${actorName} took down the site banner.`, previous ? {
      type: 'site-banner',
      previous,
      clear: false,
    } : null);
  } else {
    throw new Error('Unsupported site action');
  }
  return publicInternetSettings(store);
}

function enrichInternetReport(store, report) {
  const author = store.users[String(report.authorId || '')] || {};
  const reporter = report.reporterId && report.reporterId !== 'automod' ? store.users[String(report.reporterId)] : null;
  const target = report.targetId ? store.users[String(report.targetId)] : null;
  const post = report.postId ? store.posts.find((item) => item.id === report.postId) : null;
  const hasVideo = report.hasVideo === true
    || report.kind === 'reel'
    || Boolean(post?.videoUrl);
  return {
    ...report,
    hasVideo,
    authorName: report.authorName || author.displayName || 'Discord user',
    authorUsername: report.authorUsername || author.username || '',
    authorAvatarUrl: author.avatarUrl || report.authorAvatarUrl || null,
    reporterAvatarUrl: reporter?.avatarUrl || report.reporterAvatarUrl || null,
    targetName: target?.displayName || report.targetName || null,
    targetUsername: target?.username || null,
    targetAvatarUrl: target?.avatarUrl || null,
  };
}

/** Limited Management role: at most 3 bans in a rolling hour. */
export function assertLimitedStaffBanQuota(store, staffId) {
  const id = String(staffId || '');
  if (!/^\d{16,22}$/.test(id)) throw new Error('Staff identity required');
  const cutoff = Date.now() - LIMITED_STAFF_BAN_WINDOW_MS;
  store.staffBanLog = (Array.isArray(store.staffBanLog) ? store.staffBanLog : [])
    .filter((entry) => entry?.staffId && new Date(entry.at).getTime() >= cutoff);
  const used = store.staffBanLog.filter((entry) => entry.staffId === id).length;
  if (used >= LIMITED_STAFF_BAN_LIMIT) {
    throw new Error('Limited staff can ban at most 3 people per hour.');
  }
}

export function recordLimitedStaffBan(store, staffId) {
  const id = String(staffId || '');
  if (!/^\d{16,22}$/.test(id)) return;
  store.staffBanLog = Array.isArray(store.staffBanLog) ? store.staffBanLog : [];
  store.staffBanLog.unshift({ staffId: id, at: new Date().toISOString() });
  store.staffBanLog = store.staffBanLog.slice(0, 200);
}

function expireInternetAds(store) {
  const now = Date.now();
  let changed = false;
  store.ads = Array.isArray(store.ads) ? store.ads : [];
  for (const ad of store.ads) {
    if (ad.status === 'active' && ad.endsAt && new Date(ad.endsAt).getTime() <= now) {
      ad.status = 'expired';
      changed = true;
    }
  }
  return changed;
}

function sanitizeAdMedia(image, video) {
  const hostedImage = hostedMediaUrl(image?.url);
  const hostedVideo = hostedMediaUrl(video?.url);
  const imageData = text(image?.dataUrl, 900_000);
  const isImageData = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(imageData);
  if (hostedVideo && (hostedImage || isImageData)) throw new Error('Choose either an image or a short video, not both');
  if (video?.dataUrl && !hostedVideo) throw new Error('Short ad videos need to finish uploading first. Try again in a moment.');
  if (video?.url && !hostedVideo) throw new Error('That video host is not allowed for ads');
  if (image?.dataUrl && !hostedImage && !isImageData) throw new Error('Choose a supported image (PNG, JPEG, WebP, or GIF)');
  if (image?.url && !hostedImage && !isImageData) throw new Error('That image host is not allowed for ads');
  return {
    imageUrl: hostedImage || (isImageData ? imageData : ''),
    videoUrl: hostedVideo || '',
  };
}

function publicAd(ad) {
  return {
    id: ad.id,
    category: ad.category,
    businessName: ad.businessName,
    title: ad.title,
    body: ad.body,
    imageUrl: ad.imageUrl || '',
    videoUrl: ad.videoUrl || '',
    weight: ad.weight,
    status: ad.status,
    startsAt: ad.startsAt || null,
    endsAt: ad.endsAt || null,
    createdAt: ad.createdAt,
    advertiserId: ad.advertiserId,
    advertiserName: ad.advertiserName,
    advertiserUsername: ad.advertiserUsername,
  };
}

function assertAdCopy({ category, businessName, title, body }) {
  if (!AD_CATEGORIES.includes(category)) {
    throw new Error('Choose whether this ad is for an in-game department or business');
  }
  const name = text(businessName, 60);
  const headline = text(title, 80);
  const copy = text(body, 220);
  if (!name) throw new Error('Enter the in-game department or business name');
  if (!headline) throw new Error('Write a short ad headline');
  if (copy.length < 12) throw new Error('Describe the in-game department or business in a bit more detail');
  const haystack = `${name}\n${headline}\n${copy}`;
  const hit = scanInternetContent(haystack);
  if (hit) throw new Error('That ad copy was blocked by automod. Soften the language and try again.');
  // Keep ads on-theme for Clearwater RP departments / businesses.
  if (/\b(?:discord\.gg|roblox\.com\/groups|onlyfans|crypto|nitro)\b/i.test(haystack)) {
    throw new Error('Ads must promote in-game Clearwater departments or businesses only');
  }
  return { category, businessName: name, title: headline, body: copy };
}

export function purchaseInternetAd(store, { actor, category, businessName, title, body, boost = 0, image = null, video = null }) {
  const user = ensureInternetWallet(store, actor);
  assertNotBanned(user);
  const copy = assertAdCopy({ category, businessName, title, body });
  const media = sanitizeAdMedia(image, video);
  const boostLevels = Math.min(AD_MAX_BOOST, Math.max(0, Math.trunc(Number(boost) || 0)));
  const cost = AD_BASE_COST + (boostLevels * AD_BOOST_COST);
  if (creditBalance(user) < cost) throw new Error(`You need C$${cost} to place this ad`);
  user.credits = creditBalance(user) - cost;
  addCreditTransaction(user, {
    amount: -cost,
    type: 'ad',
    note: `Sidebar ad${boostLevels ? ` +${boostLevels} boost` : ''} (pending review)`,
    actorName: 'Clearwater Ads',
  });
  expireInternetAds(store);
  const ad = {
    id: randomUUID(),
    advertiserId: user.id,
    advertiserName: text(user.displayName, 80) || 'Discord user',
    advertiserUsername: text(user.username, 80),
    ...copy,
    ...media,
    weight: 1 + boostLevels,
    boost: boostLevels,
    cost,
    status: 'pending',
    createdAt: new Date().toISOString(),
    startsAt: null,
    endsAt: null,
    reviewedAt: null,
    reviewerId: null,
  };
  store.ads.unshift(ad);
  store.ads = store.ads.slice(0, 300);
  addInternetLog(store, `${ad.advertiserName} submitted a ${ad.category} ad for review (C$${cost}).`);
  return { ad: publicAd(ad), wallet: walletView(user), pricing: { base: AD_BASE_COST, boost: AD_BOOST_COST, maxBoost: AD_MAX_BOOST } };
}

export function reviewInternetAd(store, { adId, decision, actor, reason = '' }) {
  expireInternetAds(store);
  const ad = store.ads.find((item) => item.id === String(adId || ''));
  if (!ad || ad.status !== 'pending') throw new Error('Pending ad not found');
  if (!['accept', 'deny'].includes(decision)) throw new Error('Choose Approve or Deny');
  ad.reviewedAt = new Date().toISOString();
  ad.reviewerId = String(actor?.id || '');
  ad.reviewNote = text(reason, 300);
  if (decision === 'deny') {
    ad.status = 'denied';
    const owner = store.users[ad.advertiserId];
    if (owner) {
      owner.credits = creditBalance(owner) + ad.cost;
      addCreditTransaction(owner, {
        amount: ad.cost,
        type: 'ad-refund',
        note: 'Sidebar ad denied — credits refunded',
        actorName: 'Clearwater Ads',
      });
      addInternetMessage(store, owner.id, `Your sidebar ad “${ad.title}” was not approved${ad.reviewNote ? `: ${ad.reviewNote}` : '.'} C$${ad.cost} was returned to your wallet.`);
    }
    addInternetLog(store, `Denied sidebar ad from ${ad.advertiserName}.`);
    return { ad: publicAd(ad) };
  }
  const now = Date.now();
  ad.status = 'active';
  ad.startsAt = new Date(now).toISOString();
  ad.endsAt = new Date(now + AD_DURATION_MS).toISOString();
  addInternetMessage(store, ad.advertiserId, `Your sidebar ad “${ad.title}” was approved and will run for 24 hours.`);
  addInternetLog(store, `Approved sidebar ad from ${ad.advertiserName} (${ad.weight}x weight).`);
  return { ad: publicAd(ad) };
}

export function listInternetAdsForUser(store, actor) {
  expireInternetAds(store);
  const id = String(actor?.id || '');
  return store.ads.filter((ad) => ad.advertiserId === id).slice(0, 40).map(publicAd);
}

export function serveInternetAds(store, { count = 1 } = {}) {
  expireInternetAds(store);
  const active = store.ads.filter((ad) => ad.status === 'active' && ad.endsAt && new Date(ad.endsAt).getTime() > Date.now());
  if (!active.length) return [];
  const picks = [];
  const pool = [...active];
  const limit = Math.min(2, Math.max(1, Math.trunc(Number(count) || 1)), pool.length);
  for (let i = 0; i < limit; i += 1) {
    const total = pool.reduce((sum, ad) => sum + Math.max(1, Number(ad.weight) || 1), 0);
    let roll = Math.random() * total;
    let chosen = pool[0];
    for (const ad of pool) {
      roll -= Math.max(1, Number(ad.weight) || 1);
      if (roll <= 0) { chosen = ad; break; }
    }
    picks.push(publicAd(chosen));
    pool.splice(pool.indexOf(chosen), 1);
  }
  return picks;
}

function markReportLogsReverted(store, reportId, actorId) {
  const id = String(reportId || '');
  const when = new Date().toISOString();
  const who = String(actorId || '');
  (Array.isArray(store.logs) ? store.logs : []).forEach((log) => {
    if (log?.revert?.type === 'report' && log.revert.reportId === id && !log.revertedAt) {
      log.revertedAt = when;
      log.revertedBy = who;
    }
  });
}

function revertReviewedReport(store, { actor, reportId }) {
  const report = store.reports.find((item) => item.id === String(reportId || ''));
  if (!report || report.status === 'open') throw new Error('History entry not found');
  if (report.revertedAt) throw new Error('Already reverted');
  if (!canRevertReport(report)) throw new Error('This action cannot be restored');

  const actorName = text(actor?.displayName, 80) || 'Staff';
  if (report.status === 'accepted') {
    if (report.action === 'ban') {
      const user = upsertInternetUser(store, { id: report.authorId, displayName: report.authorName });
      setInternetBan(user, { enabled: false });
      clearKnownInternetIpBans(store, user);
      addInternetMessage(store, user.id, 'Staff reversed your Clearwater Internet ban.');
    } else if (report.action === 'warning') {
      const user = upsertInternetUser(store, { id: report.authorId, displayName: report.authorName });
      user.warnings = Array.isArray(user.warnings) ? user.warnings : [];
      const before = user.warnings.length;
      user.warnings = report.warningId
        ? user.warnings.filter((warning) => warning.id !== report.warningId)
        : user.warnings.filter((warning) => warning.reason !== (report.actionReason || report.reason));
      if (user.warnings.length === before && user.warnings.length) user.warnings.shift();
    } else if (report.action === 'delete') {
      if (report.kind === 'ad' && report.adId) {
        const ad = store.ads.find((item) => item.id === report.adId);
        if (!ad) throw new Error('That sponsored ad is no longer on file');
        ad.status = report.adSnapshot?.status === 'pending' ? 'pending' : 'active';
        ad.endsAt = report.adSnapshot?.endsAt || ad.endsAt || null;
        ad.reviewNote = report.adSnapshot?.reviewNote || '';
      } else if (!restoreDeletedPost(store, report.deletedSnapshot)
        && !(report.postId && restoreDeletedPost(store, {
          id: report.postId,
          kind: report.kind === 'reel' ? 'reel' : 'post',
          authorId: report.authorId,
          displayName: report.authorName,
          username: report.authorUsername,
          avatarUrl: report.authorAvatarUrl,
          content: report.content || '',
          parentId: null,
          likes: [],
          createdAt: report.createdAt,
        }))) {
        throw new Error('That deleted content cannot be restored');
      }
    }
  } else if (report.status === 'denied') {
    if (report.released && report.postId) {
      store.posts = store.posts.filter((post) => post.id !== report.postId);
      report.released = false;
      report.postId = null;
    }
    report.status = 'open';
    report.reviewedAt = null;
    report.action = null;
    report.actionReason = null;
    markReportLogsReverted(store, report.id, actor?.id);
    addInternetLog(store, `${actorName} reopened a dismissed report against ${report.authorName || 'a member'}.`);
    return publicStaffReport(store, report);
  }

  report.revertedAt = new Date().toISOString();
  report.revertedBy = String(actor?.id || '');
  markReportLogsReverted(store, report.id, actor?.id);
  addInternetLog(store, `${actorName} reverted a moderation history action against ${report.authorName || 'a member'}.`);
  return publicStaffReport(store, report);
}

function revertHistoryLog(store, { actor, logId }) {
  const log = (Array.isArray(store.logs) ? store.logs : []).find((item) => item.id === String(logId || ''));
  if (!log) throw new Error('History entry not found');
  if (log.revertedAt) throw new Error('Already reverted');
  const revert = log.revert && typeof log.revert === 'object' ? log.revert : null;
  if (!revert?.type) throw new Error('This action cannot be restored');

  const actorName = text(actor?.displayName, 80) || 'Staff';
  if (revert.type === 'report') {
    const report = revertReviewedReport(store, { actor, reportId: revert.reportId });
    log.revertedAt = new Date().toISOString();
    log.revertedBy = String(actor?.id || '');
    return report;
  }
  if (revert.type === 'staff-user') {
    applyStaffUserAction(store, {
      actor,
      targetId: revert.targetId,
      staffAction: revert.inverse,
      reason: revert.reason || revert.note || 'Reverted from moderation history',
      note: revert.note || revert.warningBadgeText || revert.reason || '',
      durationDays: revert.durationDays || 'forever',
    });
  } else if (revert.type === 'remove-warning') {
    const user = upsertInternetUser(store, { id: revert.targetId });
    user.warnings = (Array.isArray(user.warnings) ? user.warnings : []).filter((warning) => warning.id !== revert.warningId);
  } else if (revert.type === 'restore-warnings') {
    const user = upsertInternetUser(store, { id: revert.targetId });
    user.warnings = Array.isArray(revert.warnings) ? revert.warnings.slice(0, 30) : [];
  } else if (revert.type === 'restore-note') {
    const user = upsertInternetUser(store, { id: revert.targetId });
    user.staffNote = text(revert.note, 500);
  } else if (revert.type === 'restore-post') {
    if (!restoreDeletedPost(store, revert.snapshot)) throw new Error('That deleted content cannot be restored');
  } else if (revert.type === 'site-toggle') {
    applyStaffSiteAction(store, {
      actor,
      staffAction: revert.staffAction,
      enabled: revert.enabled === true,
    });
  } else if (revert.type === 'site-banner') {
    if (revert.clear) {
      store.siteBanner = revert.previous || null;
    } else {
      store.siteBanner = revert.previous || null;
    }
  } else {
    throw new Error('This action cannot be restored');
  }

  log.revertedAt = new Date().toISOString();
  log.revertedBy = String(actor?.id || '');
  addInternetLog(store, `${actorName} reverted: ${text(log.message, 180)}`);
  return publicHistoryLog(log);
}

export function revertInternetHistory(store, { actor, source, id }) {
  const kind = String(source || '');
  if (kind === 'report') return { source: 'report', entry: revertReviewedReport(store, { actor, reportId: id }) };
  if (kind === 'log') return { source: 'log', entry: revertHistoryLog(store, { actor, logId: id }) };
  throw new Error('Unknown history entry');
}

export function moderationSnapshot(store) {
  expireInternetAds(store);
  const open = store.reports.filter((report) => report.status === 'open').map((report) => publicStaffReport(store, report));
  const reviewed = store.reports.filter((report) => report.status !== 'open').map((report) => publicStaffReport(store, report));
  const pendingAds = store.ads.filter((ad) => ad.status === 'pending').map(publicAd);
  const users = Object.values(store.users).map((user) => staffUserSummary(store, user));
  const bans = users.filter((user) => user.banned).map((user) => {
    const ban = getActiveBan(store.users[user.id]);
    return { id: user.id, displayName: user.displayName, ...ban };
  });
  const ipBans = (Array.isArray(store.ipBans) ? store.ipBans : []).filter((ban) => !ban.until || stillActive(ban.until));
  return {
    reports: open.slice(0, 100),
    history: reviewed.slice(0, 100),
    pendingAds: pendingAds.slice(0, 50),
    adPricing: { base: AD_BASE_COST, boost: AD_BOOST_COST, maxBoost: AD_MAX_BOOST, durationHours: 24 },
    stats: {
      pending: open.length,
      pendingAds: pendingAds.length,
      automod: open.filter((report) => report.source === 'automod').length,
      actioned: reviewed.filter((report) => report.status === 'accepted').length,
      dismissed: reviewed.filter((report) => report.status === 'denied').length,
      users: users.length,
      banned: bans.length,
      muted: users.filter((user) => user.muted).length,
      watched: users.filter((user) => user.watched).length,
      shadowbanned: users.filter((user) => user.shadowbanned).length,
      ipBans: ipBans.length,
    },
    bans,
    mutes: users.filter((user) => user.muted),
    watched: users.filter((user) => user.watched),
    ipBans: ipBans.map((ban) => ({ id: ban.id, until: ban.until || null, reason: text(ban.reason, 300), createdAt: ban.createdAt })),
    users: users.slice(0, 500),
    settings: publicInternetSettings(store),
    logs: store.logs.slice(0, 100).map(publicHistoryLog),
  };
}
