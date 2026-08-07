import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { readJsonFile, writeJsonFile } from './jsonStore.js';

const storePath = join(process.cwd(), 'data', 'clearwater-internet.json');
const emptyStore = Object.freeze({ users: {}, posts: [] });

const text = (value, length) => String(value || '').trim().slice(0, length);

export async function readInternetStore() {
  const data = await readJsonFile(storePath, emptyStore);
  return {
    users: data?.users && typeof data.users === 'object' ? data.users : {},
    posts: Array.isArray(data?.posts) ? data.posts : [],
  };
}

export async function saveInternetStore(store) {
  await writeJsonFile(storePath, store);
}

export function publicPosts(store) {
  return store.posts.slice(0, 100);
}

export function publicUsers(store) {
  return Object.values(store.users).map((user) => ({
    id: user.id,
    verified: user.verified === true,
    banned: Boolean(getActiveBan(user)),
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

export function setInternetBan(user, { enabled, reason, durationDays }) {
  if (!enabled) {
    user.banned = false;
    user.banReason = null;
    user.bannedUntil = null;
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

export function upsertInternetUser(store, user) {
  const id = text(user?.id, 24);
  if (!/^\d{16,22}$/.test(id)) throw new Error('Invalid user');
  const existing = store.users[id] || { verified: false, banned: false };
  store.users[id] = {
    ...existing,
    id,
    username: text(user?.username, 80) || existing.username || 'Discord user',
    displayName: text(user?.displayName, 80) || existing.displayName || 'Discord user',
    avatarUrl: text(user?.avatarUrl, 300) || existing.avatarUrl || null,
    staffRank: text(user?.staffRank, 80) || existing.staffRank || null,
  };
  return store.users[id];
}

export function createInternetPost(store, user, content) {
  const body = text(content, 500);
  if (!body) throw new Error('Write something before posting');
  if (getActiveBan(user)) throw new Error('This account is banned from Clearwater Internet');
  const post = {
    id: randomUUID(),
    authorId: user.id,
    displayName: user.displayName,
    username: user.username,
    avatarUrl: user.avatarUrl,
    staffRank: user.staffRank,
    verified: user.verified === true,
    content: body,
    createdAt: new Date().toISOString(),
  };
  store.posts.unshift(post);
  store.posts = store.posts.slice(0, 500);
  return post;
}
