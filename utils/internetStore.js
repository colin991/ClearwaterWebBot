import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const storePath = join(process.cwd(), 'data', 'clearwater-internet.json');
const emptyStore = Object.freeze({ users: {}, posts: [], reports: [], logs: [], ipBans: [], officialProfile: {} });
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
  };
}

export async function saveInternetStore(store) {
  await writeJsonFile(storePath, store);
}

export function publicPosts(store) {
  return store.posts.slice(0, 100);
}

export function publicUsers(store) {
  const users = Object.values(store.users);
  return users.map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    bannerUrl: user.bannerUrl || null,
    bio: user.bio || '',
    staffRank: user.staffRank || null,
    verified: user.verified === true,
    banned: Boolean(getActiveBan(user)),
    following: user.preferences?.hideFollowing === true ? [] : (Array.isArray(user.following) ? user.following : []),
    followingCount: Array.isArray(user.following) ? user.following.length : 0,
    followers: users.filter((member) => Array.isArray(member.following) && member.following.includes(user.id)).map((member) => member.id),
  }));
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
  const hash = text(ipHash, 100);
  if (!hash) return null;
  clearExpiredInternetIpBans(store);
  const ban = store.ipBans.find((item) => item.hash === hash);
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

export function clearExpiredInternetPosts(store, now = Date.now()) {
  const oldestAllowed = now - (48 * 60 * 60 * 1000);
  const openReportPostIds = new Set(
    store.reports
      .filter((report) => report.status === 'open')
      .map((report) => report.postId)
  );
  const previousCount = store.posts.length;

  store.posts = store.posts.filter((post) => {
    const createdAt = Date.parse(post.createdAt || '');
    if (!Number.isFinite(createdAt) || createdAt > oldestAllowed) return true;
    // Evidence must stay available until an owner finishes the report review.
    return openReportPostIds.has(post.id);
  });

  return previousCount - store.posts.length;
}

export function upsertInternetUser(store, user) {
  const id = text(user?.id, 24);
  if (!/^\d{16,22}$/.test(id)) throw new Error('Invalid user');
  const existing = store.users[id] || { verified: false, banned: false };
  const has = (key) => Object.prototype.hasOwnProperty.call(user || {}, key);
  store.users[id] = {
    ...existing,
    id,
    username: has('username') ? text(user?.username, 80) || existing.username || 'Discord user' : existing.username || 'Discord user',
    displayName: has('displayName') ? text(user?.displayName, 80) || existing.displayName || 'Discord user' : existing.displayName || 'Discord user',
    avatarUrl: has('avatarUrl') ? text(user?.avatarUrl, 300) || null : existing.avatarUrl || null,
    staffRank: has('staffRank') ? text(user?.staffRank, 80) || null : existing.staffRank || null,
  };
  return store.users[id];
}

function safeProfileUrl(value, fallback) {
  const candidate = text(value, 500);
  if (!candidate) return fallback;
  if (/^https:\/\//i.test(candidate) || /^assets\/[a-z0-9._-]+$/i.test(candidate)) return candidate;
  throw new Error('Use a secure image URL that starts with https://');
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
  store.officialProfile = {
    displayName: text(profile.displayName, 80) || officialDefaults.displayName,
    username: text(profile.username, 40).replace(/[^a-z0-9_]/gi, '').toLowerCase() || officialDefaults.username,
    bio: text(profile.bio, 300),
    avatarUrl: safeProfileUrl(profile.avatarUrl, officialDefaults.avatarUrl),
    bannerUrl: safeProfileUrl(profile.bannerUrl, officialDefaults.bannerUrl),
  };
  return ensureOfficialInternetAccount(store);
}

export function createInternetPost(store, user, content, media = {}) {
  const body = text(content, 500);
  const gifUrl = text(media?.gif?.url, 500);
  const gifTitle = text(media?.gif?.title, 120);
  const isGif = /^https:\/\/(?:media\d*|i)\.giphy\.com\//.test(gifUrl);
  const imageUrl = text(media?.image?.dataUrl, 2_100_000);
  const isImage = /^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(imageUrl);
  const question = text(media?.poll?.question, 180);
  const options = Array.isArray(media?.poll?.options) ? media.poll.options.map((option) => text(option, 80)).filter(Boolean).slice(0, 4) : [];
  const pollDays = Math.min(30, Math.max(1, Number(media?.poll?.durationDays) || 1));
  if (!body && !isGif && !isImage && !question) throw new Error('Write something, add an image or GIF, or create a poll before posting');
  if (gifUrl && !isGif) throw new Error('Only GIFs selected from Clearwater Internet can be posted');
  if (imageUrl && !isImage) throw new Error('Choose a supported image before posting');
  if ((question && options.length < 2) || (!question && options.length)) throw new Error('A poll needs a question and at least two options');
  if (getActiveBan(user)) throw new Error('This account is banned from Clearwater Internet');
  const cooldownRemaining = 60_000 - (Date.now() - new Date(user.lastPostAt || 0).getTime());
  if (cooldownRemaining > 0) throw new Error(`Please wait ${Math.ceil(cooldownRemaining / 1000)} seconds before posting again`);
  const normalized = body.toLowerCase().replace(/\s+/g, ' ').trim();
  const duplicateCooldown = 5 * 60 * 1000;
  if (body && store.posts.some((post) => post.authorId === user.id
    && post.content.toLowerCase().replace(/\s+/g, ' ').trim() === normalized
    && Date.now() - new Date(post.createdAt).getTime() < duplicateCooldown)) {
    throw new Error('You can post the same message again after 5 minutes');
  }
  if (/(.)\1{11,}/.test(body) || (body.match(/https?:\/\//gi) || []).length > 2) {
    throw new Error('That post looks like spam. Please shorten it and try again');
  }
  const post = {
    id: randomUUID(),
    authorId: user.id,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    staffRank: user.staffRank,
    verified: user.verified === true,
    content: body,
    parentId: text(media?.parentId, 80) || null,
    quoteId: text(media?.quoteId, 80) || null,
    ...(isGif ? { gifUrl, gifTitle } : {}),
    ...(isImage ? { imageUrl } : {}),
    ...(question ? { poll: { question, options, votes: {}, endsAt: new Date(Date.now() + (pollDays * 24 * 60 * 60 * 1000)).toISOString() } } : {}),
    createdAt: new Date().toISOString(),
  };
  store.posts.unshift(post);
  store.posts = store.posts.slice(0, 500);
  const mentionedHandles = [...new Set((body.match(/(?:^|\s)@([a-z0-9_]{1,80})/gi) || []).map((mention) => mention.trim().slice(1).toLowerCase()))];
  mentionedHandles.forEach((handle) => {
    const recipient = Object.values(store.users).find((member) => String(member.username || '').toLowerCase() === handle);
    if (recipient) addInternetNotification(store, { recipientId: recipient.id, actor: user, type: 'mention', post });
  });
  user.lastPostAt = post.createdAt;
  return post;
}

export function voteInternetPoll(store, { actor, postId, optionIndex, remove = false }) {
  const user = upsertInternetUser(store, actor);
  if (getActiveBan(user)) throw new Error('This account is banned from Clearwater Internet');
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

export function interactInternetPost(store, { actor, postId, type, content = '', quote = false }) {
  const user = upsertInternetUser(store, actor);
  const post = store.posts.find((item) => item.id === String(postId || ''));
  if (!post) throw new Error('Post not found');
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
    if (store.posts.some((item) => item.authorId === user.id && item.repostOf === post.id)) throw new Error('You already reposted this post');
    if (!String(content || '').trim() && !quote) {
      const repost = { id: randomUUID(), authorId: user.id, displayName: user.displayName, username: user.username, avatarUrl: user.avatarUrl, staffRank: user.staffRank, verified: user.verified === true, content: '', repostOf: post.id, parentId: null, createdAt: new Date().toISOString() };
      store.posts.unshift(repost); store.posts = store.posts.slice(0, 500); user.lastPostAt = repost.createdAt;
      addInternetNotification(store, { recipientId: post.authorId, actor: user, type: 'repost', post: repost });
      return { post: repost };
    }
    const repost = createInternetPost(store, user, content, quote ? { quoteId: post.id } : {});
    repost.repostOf = quote ? null : post.id;
    addInternetNotification(store, { recipientId: post.authorId, actor: user, type: quote ? 'quote' : 'repost', post: repost });
    return { post: repost };
  }
  throw new Error('Unsupported post action');
}

export function editInternetPost(store, { postId, actorId, content, owner = false }) {
  const post = store.posts.find((item) => item.id === String(postId || ''));
  if (!post) throw new Error('Post not found');
  if (!owner && post.authorId !== String(actorId)) throw new Error('You can only edit your own posts');
  const body = text(content, 500);
  if (!body) throw new Error('Write something before saving');
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
    postId: post.id,
    reporterId: String(actor.id),
    reporterName: text(actor.displayName, 80) || 'Discord user',
    authorId: post.authorId,
    authorName: post.displayName,
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
  if (decision === 'deny') {
    addInternetLog(store, `Denied report against ${report.authorName}.`);
    addInternetMessage(store, report.reporterId, `Your report about ${report.authorName}'s post was reviewed. No action was taken.`);
    return report;
  }

  if (!['delete', 'ban', 'warning'].includes(action)) throw new Error('Choose a moderation action');
  const note = text(reason, 300) || report.reason;
  report.action = action;
  report.actionReason = note;
  if (action === 'delete') {
    const index = store.posts.findIndex((post) => post.id === report.postId);
    if (index >= 0) store.posts.splice(index, 1);
    addInternetLog(store, `Deleted ${report.authorName}'s reported post. Reason: ${note}`);
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
  addInternetMessage(store, report.reporterId, `Your report about ${report.authorName}'s post was reviewed. Action taken: ${action === 'delete' ? 'message deleted' : action === 'ban' ? 'account banned' : 'warning given'}.`);
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
  const messages = Array.isArray(user.messages) ? user.messages : [];
  messages.forEach((message) => { if (!message.readAt) message.readAt = new Date().toISOString(); });
  return messages.slice(0, 50);
}

export function takeInternetConversation(store, { actor, withUserId }) {
  const user = upsertInternetUser(store, actor);
  const otherId = String(withUserId || '');
  if (!store.users[otherId]) throw new Error('That member has not joined Clearwater Internet yet');
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
    blocked: Array.isArray(user.blocked) ? user.blocked : [],
    muted: Array.isArray(user.muted) ? user.muted : [],
    bookmarks: Array.isArray(user.bookmarks) ? user.bookmarks : [],
  };
}

const preferenceKeys = new Set(['followersOnly', 'hideFollowing', 'hideProfile', 'friendsMessages']);

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

export function sendInternetMessage(store, { actor, to, content, gif }) {
  const sender = upsertInternetUser(store, actor);
  const recipient = store.users[String(to || '')];
  if (!recipient) throw new Error('That member has not joined Clearwater Internet yet');
  const body = text(content, 1000);
  const gifUrl = text(gif?.url, 500);
  const gifTitle = text(gif?.title, 120);
  const isGif = /^https:\/\/(?:media\d*|i)\.giphy\.com\//.test(gifUrl);
  if (!body && !isGif) throw new Error('Write a message or add a GIF first');
  if (gifUrl && !isGif) throw new Error('Choose a GIF from Clearwater Internet');
  if ((recipient.blocked || []).includes(sender.id) || (sender.blocked || []).includes(recipient.id)) throw new Error('This conversation is unavailable');
  const sentAt = new Date().toISOString();
  const message = { id: randomUUID(), kind: 'direct', fromId: sender.id, toId: recipient.id, content: body, ...(isGif ? { gifUrl, gifTitle } : {}), createdAt: sentAt };
  sender.messages = Array.isArray(sender.messages) ? sender.messages : [];
  recipient.messages = Array.isArray(recipient.messages) ? recipient.messages : [];
  sender.messages.unshift({ ...message, readAt: sentAt });
  recipient.messages.unshift({ ...message, readAt: null });
  sender.messages = sender.messages.slice(0, 100);
  recipient.messages = recipient.messages.slice(0, 100);
  return { sent: true };
}

export function moderationSnapshot(store) {
  return {
    reports: store.reports.filter((report) => report.status === 'open').slice(0, 100),
    bans: Object.values(store.users).flatMap((user) => {
      const ban = getActiveBan(user);
      return ban ? [{ id: user.id, displayName: user.displayName || user.username || 'Discord user', ...ban }] : [];
    }),
    logs: store.logs.slice(0, 100),
  };
}
