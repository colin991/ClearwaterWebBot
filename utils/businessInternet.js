import { randomUUID } from 'node:crypto';

const BUSINESS_ROLES = new Set(['manager', 'poster']);
const BUSINESS_ID_RE = /^biz_[a-z0-9-]{8,80}$/i;

function text(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}

function hostedOrAssetUrl(value) {
  const raw = String(value || '').trim().slice(0, 500);
  if (/^assets\/[a-z0-9._-]+$/i.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    if (/["'()\\\s]/.test(raw)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function ensureBusinessCollections(store) {
  if (!Array.isArray(store.verificationApplications)) store.verificationApplications = [];
  if (!store.businessAccounts || typeof store.businessAccounts !== 'object') store.businessAccounts = {};
  return store;
}

export function isBusinessAccountId(id) {
  return BUSINESS_ID_RE.test(String(id || ''));
}

function publicVerificationApplication(item) {
  return {
    id: item.id,
    applicantId: item.applicantId,
    applicantName: item.applicantName || '',
    applicantUsername: item.applicantUsername || '',
    reason: item.reason || '',
    status: item.status,
    createdAt: item.createdAt,
    reviewedAt: item.reviewedAt || null,
    reviewerId: item.reviewerId || null,
    reviewNote: item.reviewNote || '',
  };
}

const BUSINESS_IDLE_MS = 7 * 24 * 60 * 60 * 1000;
const BUSINESS_TOUCH_THROTTLE_MS = 60 * 60 * 1000;

function publicBusinessAccount(biz, { viewerId = '', includeMembers = false } = {}) {
  const isHandler = viewerId && biz.ownerId === viewerId;
  const membership = biz.members && typeof biz.members === 'object' ? biz.members[viewerId] : null;
  const next = {
    id: biz.id,
    ownerId: biz.ownerId,
    displayName: biz.displayName,
    username: biz.username,
    avatarUrl: biz.avatarUrl || '',
    bio: biz.bio || '',
    category: biz.category === 'department' ? 'department' : 'business',
    status: biz.status,
    createdAt: biz.createdAt,
    lastActiveAt: biz.lastActiveAt || null,
    reviewedAt: biz.reviewedAt || null,
    reviewNote: biz.reviewNote || '',
    isHandler: Boolean(isHandler),
    role: isHandler ? 'handler' : (membership?.role || null),
    canPost: Boolean(isHandler || membership),
    canAds: Boolean(isHandler),
    canManageMembers: Boolean(isHandler || membership?.role === 'manager'),
    canEditProfile: Boolean(isHandler || membership?.role === 'manager'),
  };
  if (includeMembers && (isHandler || membership?.role === 'manager')) {
    next.members = Object.entries(biz.members || {}).map(([id, member]) => ({
      id,
      role: member.role === 'manager' ? 'manager' : 'poster',
      displayName: member.displayName || '',
      username: member.username || '',
      avatarUrl: member.avatarUrl || '',
      addedAt: member.addedAt || null,
    }));
  }
  return next;
}

export function businessAsPublicUser(biz) {
  if (!biz || biz.status !== 'active') return null;
  return {
    id: biz.id,
    username: biz.username,
    displayName: biz.displayName,
    avatarUrl: biz.avatarUrl || null,
    bannerUrl: null,
    bio: biz.bio || '',
    pronouns: '',
    location: '',
    website: '',
    accentColor: '',
    pinnedPostId: '',
    createdAt: biz.createdAt || null,
    deactivated: false,
    hideStats: false,
    hideLikes: false,
    staffRank: null,
    verified: true,
    badges: ['business'],
    warningBadgeText: '',
    banned: false,
    official: false,
    bank: false,
    business: true,
    businessOwnerId: biz.ownerId,
    following: [],
    followingCount: 0,
    followers: [],
    followerCount: 0,
  };
}

export function listBusinessPublicUsers(store) {
  ensureBusinessCollections(store);
  return Object.values(store.businessAccounts)
    .map((biz) => businessAsPublicUser(biz))
    .filter(Boolean);
}

export function getBusinessAccount(store, businessId) {
  ensureBusinessCollections(store);
  return store.businessAccounts[String(businessId || '')] || null;
}

export function assertBusinessAccess(store, { actor, businessId, need = 'post' } = {}) {
  const biz = getBusinessAccount(store, businessId);
  if (!biz || biz.status !== 'active') throw new Error('Business account not found');
  const actorId = String(actor?.id || '');
  if (!actorId) throw new Error('Sign in required');
  if (biz.ownerId === actorId) return { biz, role: 'handler' };
  const member = biz.members?.[actorId];
  if (!member) throw new Error('You do not have access to this business account');
  if (need === 'ads') throw new Error('Only the business account handler can run advertisements');
  if (need === 'manage' && member.role !== 'manager') {
    throw new Error('Manager access required');
  }
  return { biz, role: member.role === 'manager' ? 'manager' : 'poster' };
}

/**
 * Mark a business account as recently used (switched to / posted as).
 * Throttled to avoid rewriting the store on every request.
 */
export function touchBusinessAccountActivity(store, businessId, { force = false } = {}) {
  ensureBusinessCollections(store);
  const biz = getBusinessAccount(store, businessId);
  if (!biz || biz.status !== 'active') return false;
  const now = Date.now();
  const previous = Date.parse(biz.lastActiveAt || '');
  if (!force && Number.isFinite(previous) && now - previous < BUSINESS_TOUCH_THROTTLE_MS) return false;
  biz.lastActiveAt = new Date().toISOString();
  return true;
}

function businessIdleAnchor(biz) {
  if (!biz) return 0;
  if (biz.status === 'active') {
    return Date.parse(biz.lastActiveAt || biz.reviewedAt || biz.createdAt || '') || 0;
  }
  if (biz.status === 'pending') {
    return Date.parse(biz.createdAt || '') || 0;
  }
  return Date.parse(biz.reviewedAt || biz.createdAt || '') || 0;
}

/**
 * Remove business accounts that have not been used (or never approved) for a week.
 * Returns deletion summaries including logo URLs for Blob cleanup.
 */
export function purgeIdleBusinessAccounts(store, { now = Date.now(), maxAgeMs = BUSINESS_IDLE_MS } = {}) {
  ensureBusinessCollections(store);
  const staleIds = Object.values(store.businessAccounts || {})
    .filter((biz) => {
      const anchor = businessIdleAnchor(biz);
      return Boolean(anchor) && now - anchor >= maxAgeMs;
    })
    .map((biz) => biz.id);
  const removed = [];
  for (const businessId of staleIds) {
    const result = deleteBusinessAccount(store, { businessId });
    removed.push(result);
    const owner = result.ownerId ? store.users[result.ownerId] : null;
    if (!owner) continue;
    owner.messages = Array.isArray(owner.messages) ? owner.messages : [];
    owner.messages.unshift({
      id: randomUUID(),
      content: text(`Your Clearwater business account “${result.displayName}” was removed after a week without being used. Its logo was cleared from storage.`, 500),
      createdAt: new Date().toISOString(),
      readAt: null,
    });
    owner.messages = owner.messages.slice(0, 50);
  }
  return removed;
}

export function businessActorFromAccount(biz) {
  return {
    id: biz.id,
    username: biz.username,
    displayName: biz.displayName,
    avatarUrl: biz.avatarUrl || '',
    verified: true,
    badges: ['business'],
    business: true,
    businessOwnerId: biz.ownerId,
  };
}

export function submitVerificationApplication(store, { actor, reason } = {}) {
  ensureBusinessCollections(store);
  const user = store.users[String(actor?.id || '')];
  if (!user) throw new Error('Sign in required');
  if (user.verified === true) throw new Error('Your account is already verified');
  const why = text(reason, 500);
  if (why.length < 20) throw new Error('Tell us a bit more about why you want verification (at least 20 characters)');
  const open = store.verificationApplications.find((item) => item.applicantId === user.id && item.status === 'pending');
  if (open) throw new Error('You already have a verification request awaiting staff review');
  const recent = store.verificationApplications.find((item) => (
    item.applicantId === user.id
    && item.status === 'denied'
    && Date.now() - new Date(item.reviewedAt || item.createdAt).getTime() < 3 * 24 * 60 * 60 * 1000
  ));
  if (recent) throw new Error('Please wait a few days before applying again');
  const application = {
    id: randomUUID(),
    applicantId: user.id,
    applicantName: text(user.displayName, 80) || 'Member',
    applicantUsername: text(user.username, 80),
    reason: why,
    status: 'pending',
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerId: null,
    reviewNote: '',
  };
  store.verificationApplications.unshift(application);
  store.verificationApplications = store.verificationApplications.slice(0, 500);
  return { application: publicVerificationApplication(application) };
}

export function reviewVerificationApplication(store, { applicationId, decision, actor, reason = '' } = {}) {
  ensureBusinessCollections(store);
  const application = store.verificationApplications.find((item) => item.id === String(applicationId || ''));
  if (!application || application.status !== 'pending') throw new Error('Pending verification request not found');
  if (!['accept', 'deny'].includes(decision)) throw new Error('Choose Approve or Deny');
  application.reviewedAt = new Date().toISOString();
  application.reviewerId = String(actor?.id || '');
  application.reviewNote = text(reason, 300);
  const applicant = store.users[application.applicantId];
  if (decision === 'accept') {
    application.status = 'approved';
    if (applicant) applicant.verified = true;
  } else {
    application.status = 'denied';
  }
  return { application: publicVerificationApplication(application) };
}

export function myVerificationApplication(store, actorId) {
  ensureBusinessCollections(store);
  const id = String(actorId || '');
  const open = store.verificationApplications.find((item) => item.applicantId === id && item.status === 'pending');
  if (open) return publicVerificationApplication(open);
  const latest = store.verificationApplications.find((item) => item.applicantId === id);
  return latest ? publicVerificationApplication(latest) : null;
}

function syncBusinessUserRecord(store, biz) {
  if (!biz || biz.status !== 'active') return;
  const existing = store.users[biz.id] || {};
  store.users[biz.id] = {
    ...existing,
    id: biz.id,
    discordId: null,
    username: biz.username,
    discordUsername: biz.username,
    displayName: biz.displayName,
    avatarUrl: biz.avatarUrl || null,
    bio: biz.bio || '',
    staffRank: null,
    business: true,
    businessOwnerId: biz.ownerId,
    verified: true,
    banned: false,
    badges: Array.isArray(existing.badges) && existing.badges.includes('business')
      ? existing.badges
      : [...(Array.isArray(existing.badges) ? existing.badges.filter((b) => b !== 'business') : []), 'business'],
    createdAt: existing.createdAt || biz.createdAt || new Date().toISOString(),
    following: Array.isArray(existing.following) ? existing.following : [],
    followers: Array.isArray(existing.followers) ? existing.followers : [],
  };
}

function assertUniqueBusinessUsername(store, username, exceptId = '') {
  const handle = text(username, 40).toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (handle.length < 3) throw new Error('Choose a username with at least 3 letters or numbers');
  if (Object.values(store.users).some((user) => String(user.username || '').toLowerCase() === handle)) {
    throw new Error('That username is already taken');
  }
  const clash = Object.values(store.businessAccounts).find((biz) => (
    biz.id !== exceptId
    && String(biz.username || '').toLowerCase() === handle
    && ['pending', 'active'].includes(biz.status)
  ));
  if (clash) throw new Error('That business username is already taken');
  return handle;
}

export function submitBusinessApplication(store, {
  actor,
  displayName,
  username,
  avatarUrl = '',
  bio = '',
  category = 'business',
} = {}) {
  ensureBusinessCollections(store);
  const owner = store.users[String(actor?.id || '')];
  if (!owner) throw new Error('Sign in required');
  const open = Object.values(store.businessAccounts).find((biz) => biz.ownerId === owner.id && biz.status === 'pending');
  if (open) throw new Error('You already have a business account awaiting staff review');
  const name = text(displayName, 80);
  if (name.length < 2) throw new Error('Add a business or department name');
  const handle = assertUniqueBusinessUsername(store, username);
  const avatar = hostedOrAssetUrl(avatarUrl) || text(owner.avatarUrl, 500) || '';
  const about = text(bio, 300);
  const biz = {
    id: `biz_${randomUUID()}`,
    ownerId: owner.id,
    displayName: name,
    username: handle,
    avatarUrl: avatar,
    bio: about,
    category: category === 'department' ? 'department' : 'business',
    status: 'pending',
    members: {},
    createdAt: new Date().toISOString(),
    lastActiveAt: null,
    reviewedAt: null,
    reviewerId: null,
    reviewNote: '',
  };
  store.businessAccounts[biz.id] = biz;
  return { business: publicBusinessAccount(biz, { viewerId: owner.id, includeMembers: true }) };
}

export function reviewBusinessApplication(store, { businessId, decision, actor, reason = '' } = {}) {
  ensureBusinessCollections(store);
  const biz = getBusinessAccount(store, businessId);
  if (!biz || biz.status !== 'pending') throw new Error('Pending business account not found');
  if (!['accept', 'deny'].includes(decision)) throw new Error('Choose Approve or Deny');
  biz.reviewedAt = new Date().toISOString();
  biz.reviewerId = String(actor?.id || '');
  biz.reviewNote = text(reason, 300);
  if (decision === 'accept') {
    biz.status = 'active';
    biz.lastActiveAt = new Date().toISOString();
    syncBusinessUserRecord(store, biz);
    const owner = store.users[biz.ownerId];
    if (owner) {
      // Business check stays on the biz_* account only — never the handler.
      owner.business = false;
      owner.badges = (Array.isArray(owner.badges) ? owner.badges : []).filter((badge) => badge !== 'business');
    }
  } else {
    biz.status = 'denied';
  }
  return { business: publicBusinessAccount(biz, { viewerId: biz.ownerId, includeMembers: true }) };
}

export function listMyBusinessAccounts(store, actorId) {
  ensureBusinessCollections(store);
  const id = String(actorId || '');
  return Object.values(store.businessAccounts)
    .filter((biz) => (
      biz.ownerId === id
      || (biz.members && biz.members[id] && biz.status === 'active')
    ))
    .map((biz) => publicBusinessAccount(biz, { viewerId: id, includeMembers: true }))
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')));
}

export function updateBusinessProfile(store, {
  actor,
  businessId,
  displayName,
  avatarUrl,
  bio,
  category,
} = {}) {
  const { biz } = assertBusinessAccess(store, { actor, businessId, need: 'manage' });
  touchBusinessAccountActivity(store, biz.id, { force: true });
  const previousAvatarUrl = biz.avatarUrl || '';
  let avatarChanged = false;
  if (displayName != null) {
    const name = text(displayName, 80);
    if (name.length < 2) throw new Error('Add a business or department name');
    biz.displayName = name;
  }
  if (avatarUrl != null) {
    const avatar = hostedOrAssetUrl(avatarUrl);
    if (avatarUrl && !avatar) throw new Error('Choose a supported logo or profile image URL');
    if (avatar && avatar !== previousAvatarUrl) {
      biz.avatarUrl = avatar;
      avatarChanged = true;
    }
  }
  if (bio != null) biz.bio = text(bio, 300);
  if (category != null) biz.category = category === 'department' ? 'department' : 'business';
  syncBusinessUserRecord(store, biz);
  return {
    business: publicBusinessAccount(biz, { viewerId: actor.id, includeMembers: true }),
    previousAvatarUrl: avatarChanged ? previousAvatarUrl : '',
  };
}

export function addBusinessMember(store, {
  actor,
  businessId,
  targetId,
  username,
  role = 'poster',
} = {}) {
  const { biz } = assertBusinessAccess(store, { actor, businessId, need: 'manage' });
  const memberRole = role === 'manager' ? 'manager' : 'poster';
  if (biz.ownerId === String(targetId || '')) throw new Error('The handler is already on this account');
  let member = null;
  if (targetId && store.users[String(targetId)]) member = store.users[String(targetId)];
  if (!member && username) {
    const handle = text(username, 80).toLowerCase().replace(/^@/, '');
    member = Object.values(store.users).find((user) => String(user.username || '').toLowerCase() === handle) || null;
  }
  if (!member) throw new Error('That member has not joined Clearwater Internet yet');
  if (member.id === biz.ownerId) throw new Error('The handler is already on this account');
  biz.members = biz.members && typeof biz.members === 'object' ? biz.members : {};
  const count = Object.keys(biz.members).length;
  if (!biz.members[member.id] && count >= 20) throw new Error('Business accounts can have up to 20 members');
  biz.members[member.id] = {
    role: memberRole,
    displayName: text(member.displayName, 80),
    username: text(member.username, 80),
    avatarUrl: text(member.avatarUrl, 500),
    addedAt: new Date().toISOString(),
  };
  return { business: publicBusinessAccount(biz, { viewerId: actor.id, includeMembers: true }) };
}

export function removeBusinessMember(store, { actor, businessId, targetId } = {}) {
  const { biz } = assertBusinessAccess(store, { actor, businessId, need: 'manage' });
  const id = String(targetId || '');
  if (id === biz.ownerId) throw new Error('You cannot remove the business account handler');
  if (!biz.members?.[id]) throw new Error('That member is not on this business account');
  delete biz.members[id];
  return { business: publicBusinessAccount(biz, { viewerId: actor.id, includeMembers: true }) };
}

export function setBusinessMemberRole(store, { actor, businessId, targetId, role = 'poster' } = {}) {
  const { biz } = assertBusinessAccess(store, { actor, businessId, need: 'manage' });
  const id = String(targetId || '');
  if (!biz.members?.[id]) throw new Error('That member is not on this business account');
  if (!BUSINESS_ROLES.has(role === 'manager' ? 'manager' : 'poster')) throw new Error('Choose manager or poster');
  biz.members[id].role = role === 'manager' ? 'manager' : 'poster';
  return { business: publicBusinessAccount(biz, { viewerId: actor.id, includeMembers: true }) };
}

export function pendingVerificationApplications(store) {
  ensureBusinessCollections(store);
  return store.verificationApplications
    .filter((item) => item.status === 'pending')
    .slice(0, 50)
    .map(publicVerificationApplication);
}

export function pendingBusinessApplications(store) {
  ensureBusinessCollections(store);
  return Object.values(store.businessAccounts)
    .filter((biz) => biz.status === 'pending')
    .sort((left, right) => String(right.createdAt || '').localeCompare(String(left.createdAt || '')))
    .slice(0, 50)
    .map((biz) => publicBusinessAccount(biz, { includeMembers: false }));
}

/**
 * Permanently remove a business / department account and its feed content.
 * Does not delete the linked personal handler account.
 */
export function deleteBusinessAccount(store, { businessId } = {}) {
  ensureBusinessCollections(store);
  const id = String(businessId || '').trim();
  if (!isBusinessAccountId(id)) throw new Error('Enter a valid business account ID');
  const biz = store.businessAccounts[id];
  if (!biz) throw new Error('Business account not found');
  const avatarUrl = biz.avatarUrl || '';

  const removedPosts = (Array.isArray(store.posts) ? store.posts : [])
    .filter((post) => post.authorId === id)
    .map((post) => post.id);
  const removed = new Set(removedPosts);
  store.posts = (Array.isArray(store.posts) ? store.posts : [])
    .filter((post) => !removed.has(post.id) && !removed.has(post.parentId));
  for (const post of store.posts) {
    if (Array.isArray(post.likes)) post.likes = post.likes.filter((like) => like !== id);
    if (Array.isArray(post.reposts)) post.reposts = post.reposts.filter((repost) => repost !== id);
  }
  store.reports = (Array.isArray(store.reports) ? store.reports : [])
    .filter((report) => report.authorId !== id && report.reporterId !== id && !removed.has(report.postId));
  store.ads = (Array.isArray(store.ads) ? store.ads : [])
    .filter((ad) => ad.businessId !== id && ad.advertiserId !== id);

  for (const member of Object.values(store.users || {})) {
    if (Array.isArray(member.following)) member.following = member.following.filter((followed) => followed !== id);
    if (Array.isArray(member.blocked)) member.blocked = member.blocked.filter((blocked) => blocked !== id);
    if (Array.isArray(member.muted)) member.muted = member.muted.filter((muted) => muted !== id);
    if (Array.isArray(member.bookmarks)) member.bookmarks = member.bookmarks.filter((bookmark) => !removed.has(bookmark));
    if (Array.isArray(member.notifications)) {
      member.notifications = member.notifications.filter((note) => note.actorId !== id && !removed.has(note.postId));
    }
    if (Array.isArray(member.messages)) {
      member.messages = member.messages.filter((message) => message.fromId !== id && message.toId !== id);
    }
  }

  delete store.users[id];
  delete store.businessAccounts[id];

  return {
    deleted: true,
    businessId: id,
    ownerId: biz.ownerId || null,
    displayName: text(biz.displayName, 80) || text(biz.username, 80) || 'Business account',
    postsRemoved: removedPosts.length,
    avatarUrl,
  };
}
