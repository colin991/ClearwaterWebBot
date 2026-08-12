import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { AUTOMOD_HOLD_MESSAGE, AutomodHoldError, scanInternetContent } from './internetAutomod.js';
import { sanitizeInternetBadges } from './staffRanks.js';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

export { AutomodHoldError };

const storePath = join(process.cwd(), 'data', 'clearwater-internet.json');
const emptyStore = Object.freeze({
  users: {},
  posts: [],
  reports: [],
  logs: [],
  ipBans: [],
  officialProfile: {},
  settings: { pausePosts: false, pauseReels: false, pauseMessages: false },
});
export const OFFICIAL_INTERNET_ACCOUNT_ID = '1514026810348671026';
const officialDefaults = Object.freeze({
  displayName: 'Clearwater Roleplay',
  username: 'clearwaterroleplay',
  bio: 'Official Clearwater Roleplay updates and announcements.',
  avatarUrl: 'assets/clearwater-logo.png',
  bannerUrl: 'assets/clearwater-police-night.png',
});

const text = (value, length) => String(value || '').trim().slice(0, length);

function addInternetNotification(store, { recipientId, actor, type, post = null }) {
  const recipient = store.users[String(recipientId || '')];
  if (!recipient || recipient.id === actor?.id) return;
  recipient.notifications = Array.isArray(recipient.notifications) ? recipient.notifications : [];
  recipient.notifications.unshift({
    id: randomUUID(),
    type,
    actorId: String(actor?.id || ''),
    actorName: text(actor?.displayName, 80) || 'A Clearwater member',
    actorAvatarUrl: text(actor?.avatarUrl, 300) || null,
    postId: post?.id || null,
    postContent: text(post?.content, 180),
    createdAt: new Date().toISOString(),
    readAt: null,
  });
  recipient.notifications = recipient.notifications.slice(0, 100);
}

export async function readInternetStore() {
  const data = await readJsonFile(storePath, emptyStore);
  return {
    users: data?.users && typeof data.users === 'object' ? data.users : {},
    posts: Array.isArray(data?.posts) ? data.posts : [],
    reports: Array.isArray(data?.reports) ? data.reports : [],
    logs: Array.isArray(data?.logs) ? data.logs : [],
    ipBans: Array.isArray(data?.ipBans) ? data.ipBans : [],
    officialProfile: data?.officialProfile && typeof data.officialProfile === 'object' ? data.officialProfile : {},
    settings: {
      pausePosts: data?.settings?.pausePosts === true,
      pauseReels: data?.settings?.pauseReels === true,
      pauseMessages: data?.settings?.pauseMessages === true,
    },
  };
}

export async function saveInternetStore(store) {
  await writeJsonFile(storePath, store);
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
  if (String(next.imageUrl || '').startsWith('data:')) next.imageUrl = `/api/media?reel=${encodeURIComponent(post.id)}&kind=image`;
  if (String(next.videoUrl || '').startsWith('data:')) next.videoUrl = `/api/media?reel=${encodeURIComponent(post.id)}&kind=video`;
  if (maskedAuthors?.has(next.authorId)) next.avatarUrl = null;
  return next;
}

export function publicInternetSettings(store) {
  return {
    pausePosts: store.settings?.pausePosts === true,
    pauseReels: store.settings?.pauseReels === true,
    pauseMessages: store.settings?.pauseMessages === true,
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
  const feed = visible.filter((post) => post.kind !== 'reel');
  const reels = visible.filter((post) => post.kind === 'reel' && !post.parentId);
  const reelIds = new Set(reels.map((reel) => reel.id));
  const comments = visible.filter((post) => post.parentId && reelIds.has(post.parentId));
  return [...reels, ...feed, ...comments].map((post) => publicPost(post, maskedAuthors));
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
      bannerUrl: masked ? null : (user.bannerUrl || null),
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
      badges: Array.isArray(user.badges) ? sanitizeInternetBadges(user.badges) : [],
      banned: Boolean(getActiveBan(user)),
      official: user.official === true,
      following: user.preferences?.hideFollowing === true && user.id !== viewer ? [] : (Array.isArray(user.following) ? user.following : []),
      followingCount: Array.isArray(user.following) ? user.following.length : 0,
      followers: users.filter((member) => Array.isArray(member.following) && member.following.includes(user.id)).map((member) => member.id),
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

export function assertCanPost(store, user, { reel = false } = {}) {
  if (user?.id === OFFICIAL_INTERNET_ACCOUNT_ID || user?.official === true) return;
  if (getActiveBan(user)) throw new Error('This account is banned from Clearwater Internet');
  const mute = getActiveMute(user);
  if (mute) throw new Error(`This account is muted. ${mute.reason}`);
  if (store.settings?.pausePosts === true) throw new Error('Posting is temporarily paused by staff');
  if (reel && store.settings?.pauseReels === true) throw new Error('Reels are temporarily paused by staff');
  if (reel && flagActive(user, 'lockReels', 'lockReelsUntil')) throw new Error('This account is locked from posting Reels');
  if (flagActive(user, 'lockPosts', 'lockPostsUntil')) throw new Error('This account is locked from posting');
}

export function assertCanMessage(store, user) {
  if (user?.id === OFFICIAL_INTERNET_ACCOUNT_ID || user?.official === true) return;
  if (getActiveBan(user)) throw new Error('This account is banned from Clearwater Internet');
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
    badges: has('badges') && Array.isArray(user?.badges)
      ? sanitizeInternetBadges(user.badges)
      : sanitizeInternetBadges(existing.badges),
  };
  return store.users[id];
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
  const left = Number(raw.left);
  const top = Number(raw.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  const x = Number(raw.x);
  const z = Number(raw.z);
  return {
    ...(Number.isFinite(x) ? { x: Math.round(x * 10) / 10 } : {}),
    ...(Number.isFinite(z) ? { z: Math.round(z * 10) / 10 } : {}),
    postal: text(raw.postal, 12),
    street: text(raw.street, 80),
    building: text(raw.building, 20),
    label: text(raw.label, 120) || 'Liberty County',
    left: Math.min(0.97, Math.max(0.03, left)),
    top: Math.min(0.97, Math.max(0.03, top)),
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
  });
  if (!parentId) {
    const cooldownRemaining = 20_000 - (Date.now() - new Date(user.lastPostAt || 0).getTime());
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
    badges: Array.isArray(user.badges) ? sanitizeInternetBadges(user.badges) : [],
    content: body,
    parentId,
    quoteId: text(media?.quoteId, 80) || null,
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
  if (type === 'reply') assertCanPost(store, user);
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
        badges: Array.isArray(user.badges) ? sanitizeInternetBadges(user.badges) : [],
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
  if (post.authorId === String(actor?.id)) throw new Error('You cannot report your own post');
  const reportReason = text(reason, 300);
  if (!reportReason) throw new Error('Enter a reason for the report');
  if (store.reports.some((report) => report.postId === post.id && report.reporterId === String(actor.id))) {
    throw new Error('You have already reported this post');
  }
  const report = {
    id: randomUUID(),
    kind: 'post',
    source: 'member',
    postId: post.id,
    reporterId: String(actor.id),
    reporterName: text(actor.displayName, 80) || 'Discord user',
    authorId: post.authorId,
    authorName: post.displayName,
    authorUsername: text(post.username, 80),
    authorAvatarUrl: text(post.avatarUrl, 300) || null,
    content: post.content,
    reason: reportReason,
    createdAt: new Date().toISOString(),
    status: 'open',
  };
  store.reports.unshift(report);
  store.reports = store.reports.slice(0, 200);
  return report;
}

function addInternetLog(store, message) {
  store.logs.unshift({ id: randomUUID(), message: text(message, 400), createdAt: new Date().toISOString() });
  store.logs = store.logs.slice(0, 300);
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
      createdAt: new Date().toISOString(),
      status: 'open',
    });
    store.reports = store.reports.slice(0, 200);
    addInternetLog(store, `Automod held ${text(actor.displayName, 80) || 'a member'}'s ${kind}. ${hit.reason}`);
  }
  throw new AutomodHoldError(AUTOMOD_HOLD_MESSAGE, hit);
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
  const kindLabel = report.kind === 'message' ? 'message' : 'post';
  if (decision === 'deny') {
    addInternetLog(store, report.source === 'automod'
      ? `Released automod hold on ${report.authorName}'s ${kindLabel}.`
      : `Denied report against ${report.authorName}.`);
    if (notifyReporter) addInternetMessage(store, report.reporterId, `Your report about ${report.authorName}'s ${kindLabel} was reviewed. No action was taken.`);
    return report;
  }

  if (!['delete', 'ban', 'warning'].includes(action)) throw new Error('Choose a moderation action');
  const note = text(reason, 300) || report.reason;
  report.action = action;
  report.actionReason = note;
  if (action === 'delete') {
    const index = store.posts.findIndex((post) => post.id === report.postId);
    if (index >= 0) store.posts.splice(index, 1);
    addInternetLog(store, report.source === 'automod'
      ? `Confirmed automod hold on ${report.authorName}'s ${kindLabel}. Reason: ${note}`
      : `Deleted ${report.authorName}'s reported post. Reason: ${note}`);
  }
  if (action === 'ban') {
    const user = upsertInternetUser(store, { id: report.authorId, displayName: report.authorName });
    setInternetBan(user, { enabled: true, reason: note, durationDays });
    addInternetLog(store, `Banned ${report.authorName}. Reason: ${note}`);
  }
  if (action === 'warning') {
    const user = upsertInternetUser(store, { id: report.authorId, displayName: report.authorName });
    user.warnings = Array.isArray(user.warnings) ? user.warnings : [];
    user.warnings.unshift({ id: randomUUID(), reason: note, createdAt: new Date().toISOString(), readAt: null });
    user.warnings = user.warnings.slice(0, 30);
    addInternetLog(store, `Warned ${report.authorName}. Reason: ${note}`);
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
  const user = upsertInternetUser(store, actor);
  const messages = (Array.isArray(user.messages) ? user.messages : []).filter((message) => message.kind === 'direct');
  return messages.slice(0, 120);
}

function findInternetMember(store, { id, username } = {}) {
  const key = String(id || '');
  if (key && store.users[key]) return store.users[key];
  const handle = String(username || '').replace(/^@/, '').toLowerCase();
  if (!handle) return null;
  return Object.values(store.users).find((user) => String(user.username || '').toLowerCase() === handle) || null;
}

export function takeInternetConversation(store, { actor, withUserId, username }) {
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
]);

export function internetPreferences(store, actor) {
  const user = upsertInternetUser(store, actor);
  const saved = user.preferences && typeof user.preferences === 'object' ? user.preferences : {};
  return Object.fromEntries([...preferenceKeys].map((key) => [key, saved[key] === true]));
}

export function updateInternetPreference(store, { actor, key, enabled }) {
  if (!preferenceKeys.has(String(key || ''))) throw new Error('Unknown setting');
  const user = upsertInternetUser(store, actor);
  user.preferences = { ...(user.preferences && typeof user.preferences === 'object' ? user.preferences : {}), [key]: enabled === true };
  return internetPreferences(store, user);
}

export function updateInternetSocial(store, { actor, targetId, type, enabled, postId }) {
  const user = upsertInternetUser(store, actor);
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
  enforceAutomod(store, { actor: sender, kind: 'message', content: [body, gifTitle].filter(Boolean).join('\n'), extra: { targetId: recipient.id } });
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
  addInternetNotification(store, { recipientId: recipient.id, actor: sender, type: 'message' });
  return { sent: true, message };
}

function staffUserFlags(user) {
  const ban = getActiveBan(user);
  const mute = getActiveMute(user);
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

  if (action === 'verify') {
    user.verified = true;
    addInternetLog(store, `${actorName} verified ${label}.`);
  } else if (action === 'unverify') {
    user.verified = false;
    addInternetLog(store, `${actorName} removed verification from ${label}.`);
  } else if (action === 'ban') {
    setInternetBan(user, { enabled: true, reason: noteText, durationDays });
    if (ipBan === true) banKnownInternetIps(store, user, { enabled: true, reason: noteText, durationDays });
    addInternetLog(store, `${actorName} banned ${label}. Reason: ${noteText || 'No reason was provided.'}`);
    addInternetMessage(store, user.id, `Your Clearwater Internet account was banned. Reason: ${noteText || 'No reason was provided.'}`);
  } else if (action === 'unban') {
    setInternetBan(user, { enabled: false });
    clearKnownInternetIpBans(store, user);
    addInternetLog(store, `${actorName} unbanned ${label}.`);
  } else if (action === 'ip-ban') {
    const count = banKnownInternetIps(store, user, { enabled: true, reason: noteText, durationDays });
    if (!count) throw new Error('This account has no known network hashes to block');
    addInternetLog(store, `${actorName} blocked ${count} known network hash(es) for ${label}.`);
  } else if (action === 'clear-ip-ban') {
    const count = clearKnownInternetIpBans(store, user);
    addInternetLog(store, `${actorName} cleared network blocks for ${label}${count ? ` (${count})` : ''}.`);
  } else if (action === 'warn') {
    if (!noteText) throw new Error('Enter a warning reason');
    user.warnings = Array.isArray(user.warnings) ? user.warnings : [];
    user.warnings.unshift({ id: randomUUID(), reason: noteText, createdAt: new Date().toISOString(), readAt: null });
    user.warnings = user.warnings.slice(0, 30);
    addInternetLog(store, `${actorName} warned ${label}. Reason: ${noteText}`);
    addInternetMessage(store, user.id, `You received a warning from Clearwater Internet. Reason: ${noteText}`);
  } else if (action === 'clear-warnings') {
    const count = Array.isArray(user.warnings) ? user.warnings.length : 0;
    user.warnings = [];
    addInternetLog(store, `${actorName} cleared ${count} warning(s) for ${label}.`);
  } else if (action === 'mute') {
    user.muted = true;
    user.muteReason = noteText || 'No reason was provided.';
    user.mutedUntil = durationUntil(durationDays);
    addInternetLog(store, `${actorName} muted ${label}. Reason: ${user.muteReason}`);
    addInternetMessage(store, user.id, `You were muted on Clearwater Internet. Reason: ${user.muteReason}`);
  } else if (action === 'unmute') {
    user.muted = false;
    user.muteReason = null;
    user.mutedUntil = null;
    addInternetLog(store, `${actorName} unmuted ${label}.`);
  } else if (action === 'lock-posts') {
    setTimedFlag(user, 'lockPosts', 'lockPostsUntil', true, durationDays);
    addInternetLog(store, `${actorName} locked posting for ${label}.`);
  } else if (action === 'unlock-posts') {
    setTimedFlag(user, 'lockPosts', 'lockPostsUntil', false);
    addInternetLog(store, `${actorName} unlocked posting for ${label}.`);
  } else if (action === 'lock-messages') {
    setTimedFlag(user, 'lockMessages', 'lockMessagesUntil', true, durationDays);
    addInternetLog(store, `${actorName} locked messages for ${label}.`);
  } else if (action === 'unlock-messages') {
    setTimedFlag(user, 'lockMessages', 'lockMessagesUntil', false);
    addInternetLog(store, `${actorName} unlocked messages for ${label}.`);
  } else if (action === 'lock-reels') {
    setTimedFlag(user, 'lockReels', 'lockReelsUntil', true, durationDays);
    addInternetLog(store, `${actorName} locked Reels for ${label}.`);
  } else if (action === 'unlock-reels') {
    setTimedFlag(user, 'lockReels', 'lockReelsUntil', false);
    addInternetLog(store, `${actorName} unlocked Reels for ${label}.`);
  } else if (action === 'lock-profile') {
    setTimedFlag(user, 'lockProfile', 'lockProfileUntil', true, durationDays);
    addInternetLog(store, `${actorName} locked profile editing for ${label}.`);
  } else if (action === 'unlock-profile') {
    setTimedFlag(user, 'lockProfile', 'lockProfileUntil', false);
    addInternetLog(store, `${actorName} unlocked profile editing for ${label}.`);
  } else if (action === 'shadowban') {
    user.shadowbanned = true;
    addInternetLog(store, `${actorName} shadowbanned ${label}.`);
  } else if (action === 'unshadowban') {
    user.shadowbanned = false;
    addInternetLog(store, `${actorName} removed the shadowban on ${label}.`);
  } else if (action === 'watch') {
    user.watched = true;
    addInternetLog(store, `${actorName} added ${label} to the watchlist.`);
  } else if (action === 'unwatch') {
    user.watched = false;
    addInternetLog(store, `${actorName} removed ${label} from the watchlist.`);
  } else if (action === 'note') {
    user.staffNote = text(note, 500);
    addInternetLog(store, `${actorName} updated the staff note for ${label}.`);
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
    deleteInternetPost(store, { postId, actorId: actor?.id, owner: true });
    addInternetLog(store, `${actorName} deleted a post from ${label}.`);
  } else if (action === 'send-notice') {
    if (!noteText) throw new Error('Write a staff notice first');
    addInternetMessage(store, user.id, `Staff notice: ${noteText}`);
    addInternetLog(store, `${actorName} sent a staff notice to ${label}.`);
  } else {
    throw new Error('Unsupported staff action');
  }

  return staffUserDetail(store, user.id);
}

export function applyStaffSiteAction(store, { actor, staffAction, enabled }) {
  const action = String(staffAction || '').trim();
  const actorName = text(actor?.displayName, 80) || 'Staff';
  store.settings = store.settings && typeof store.settings === 'object'
    ? store.settings
    : { pausePosts: false, pauseReels: false, pauseMessages: false };
  if (action === 'pause-posts') {
    store.settings.pausePosts = enabled === true;
    addInternetLog(store, `${actorName} ${enabled ? 'paused' : 'resumed'} community posts.`);
  } else if (action === 'pause-reels') {
    store.settings.pauseReels = enabled === true;
    addInternetLog(store, `${actorName} ${enabled ? 'paused' : 'resumed'} Reels.`);
  } else if (action === 'pause-messages') {
    store.settings.pauseMessages = enabled === true;
    addInternetLog(store, `${actorName} ${enabled ? 'paused' : 'resumed'} direct messages.`);
  } else if (action === 'clear-dismissed-reports') {
    const before = store.reports.length;
    store.reports = store.reports.filter((report) => report.status === 'open' || report.status === 'accepted');
    addInternetLog(store, `${actorName} cleared ${before - store.reports.length} dismissed report(s).`);
  } else if (action === 'clear-ip-bans') {
    const count = Array.isArray(store.ipBans) ? store.ipBans.length : 0;
    store.ipBans = [];
    addInternetLog(store, `${actorName} cleared ${count} network ban(s).`);
  } else {
    throw new Error('Unsupported site action');
  }
  return publicInternetSettings(store);
}

function enrichInternetReport(store, report) {
  const author = store.users[String(report.authorId || '')] || {};
  const reporter = report.reporterId && report.reporterId !== 'automod' ? store.users[String(report.reporterId)] : null;
  const target = report.targetId ? store.users[String(report.targetId)] : null;
  return {
    ...report,
    authorName: report.authorName || author.displayName || 'Discord user',
    authorUsername: report.authorUsername || author.username || '',
    authorAvatarUrl: author.avatarUrl || report.authorAvatarUrl || null,
    reporterAvatarUrl: reporter?.avatarUrl || report.reporterAvatarUrl || null,
    targetName: target?.displayName || report.targetName || null,
    targetUsername: target?.username || null,
    targetAvatarUrl: target?.avatarUrl || null,
  };
}

export function moderationSnapshot(store) {
  const open = store.reports.filter((report) => report.status === 'open').map((report) => enrichInternetReport(store, report));
  const reviewed = store.reports.filter((report) => report.status !== 'open').map((report) => enrichInternetReport(store, report));
  const users = Object.values(store.users).map((user) => staffUserSummary(store, user));
  const bans = users.filter((user) => user.banned).map((user) => {
    const ban = getActiveBan(store.users[user.id]);
    return { id: user.id, displayName: user.displayName, ...ban };
  });
  const ipBans = (Array.isArray(store.ipBans) ? store.ipBans : []).filter((ban) => !ban.until || stillActive(ban.until));
  return {
    reports: open.slice(0, 100),
    history: reviewed.slice(0, 100),
    stats: {
      pending: open.length,
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
    logs: store.logs.slice(0, 100),
  };
}
