const login = document.querySelector('[data-login]');
const userBox = document.querySelector('[data-user]');
const avatar = document.querySelector('[data-avatar]');
const composerAvatar = document.querySelector('[data-composer-avatar]');
const name = document.querySelector('[data-name]');
const rank = document.querySelector('[data-rank]');
const composer = document.querySelector('[data-composer]');
const signedOut = document.querySelector('[data-signed-out]');
const content = document.querySelector('[data-post-content]');
const count = document.querySelector('[data-character-count]');
const postButton = document.querySelector('[data-post-button]');
const postMessage = document.querySelector('[data-post-message]');
const composerHighlight = document.querySelector('[data-composer-highlight]');
const list = document.querySelector('[data-post-list]');
const note = document.querySelector('[data-feed-note]');
const admin = document.querySelector('[data-admin]');
const targetId = document.querySelector('[data-target-id]');
const banReason = document.querySelector('[data-ban-reason]');
const banDuration = document.querySelector('[data-ban-duration]');
const adminMessage = document.querySelector('[data-admin-message]');
const banScreen = document.querySelector('[data-ban-screen]');
const banReasonDisplay = document.querySelector('[data-ban-reason-display]');
const banDurationDisplay = document.querySelector('[data-ban-duration-display]');
const search = document.querySelector('[data-search]');
const profileTitle = document.querySelector('[data-profile-title]');
const profileCopy = document.querySelector('[data-profile-copy]');
const profileBanner = document.querySelector('[data-profile-banner]');
const profileDiscord = document.querySelector('[data-profile-discord]');
const profileAvatar = document.querySelector('[data-profile-avatar]');
const profileHandle = document.querySelector('[data-profile-handle]');
const profileRank = document.querySelector('[data-profile-rank]');
const profileVerified = document.querySelector('[data-profile-verified]');
const profilePostCount = document.querySelector('[data-profile-post-count]');
const profileList = document.querySelector('[data-profile-list]');
const staffLink = document.querySelector('[data-staff-link]');
const staffContent = document.querySelector('[data-staff-content]');
const warningNotice = document.querySelector('[data-warning-notice]');
const warningReasons = document.querySelector('[data-warning-reasons]');
const messagesList = document.querySelector('[data-messages-list]');
const moderationModal = document.querySelector('[data-moderation-modal]');
const moderationForm = document.querySelector('[data-moderation-form]');
const moderationReason = document.querySelector('[data-moderation-reason]');
const moderationDurationWrap = document.querySelector('[data-moderation-duration-wrap]');
const moderationDuration = document.querySelector('[data-moderation-duration]');
const moderationError = document.querySelector('[data-moderation-error]');
const gifButton = document.querySelector('[data-gif-button]');
const emojiButton = document.querySelector('[data-emoji-button]');
const mentionButton = document.querySelector('[data-mention-button]');
const pollButton = document.querySelector('[data-poll-button]');
const pollBuilder = document.querySelector('[data-poll-builder]');
const gifPreview = document.querySelector('[data-gif-preview]');
const gifModal = document.querySelector('[data-gif-modal]');
const gifSearch = document.querySelector('[data-gif-search]');
const gifQuery = document.querySelector('[data-gif-query]');
const gifResults = document.querySelector('[data-gif-results]');
const gifMessage = document.querySelector('[data-gif-message]');
const mentionModal = document.querySelector('[data-mention-modal]');
const mentionQuery = document.querySelector('[data-mention-query]');
const mentionResults = document.querySelector('[data-mention-results]');
const emojiModal = document.querySelector('[data-emoji-modal]');
const emojiQuery = document.querySelector('[data-emoji-query]');
const emojiGrid = document.querySelector('[data-emoji-grid]');
const trendingList = document.querySelector('[data-trending-list]');
const bookmarkList = document.querySelector('[data-bookmark-list]');
const profileModal = document.querySelector('[data-profile-modal]');
const messageModal = document.querySelector('[data-message-modal]');
const messageForm = document.querySelector('[data-message-form]');
const messageUserSearch = document.querySelector('[data-message-user-search]');
const messageUserResults = document.querySelector('[data-message-user-results]');
const postDetail = document.querySelector('[data-post-detail]');
const postModal = document.querySelector('[data-post-modal]');
const postModalForm = document.querySelector('[data-post-modal-form]');
const shareModal = document.querySelector('[data-share-modal]');
const repostPopup = document.querySelector('[data-repost-popup]');
const conversationForm = document.querySelector('[data-conversation-form]');
const conversationInput = document.querySelector('[data-conversation-input]');
const conversationMessages = document.querySelector('[data-conversation-messages]');
const INTERNET_VERSION = '20260808-message-picker-1';
let allPosts = [];
let currentUserId = null;
let internetUsers = new Map();
let loadingPosts = false;
let accountBanned = false;
let activeBan = null;
let sessionIsOwner = false;
let pendingReportReview = null;
let selectedGif = null;
let socialState = { following: [], blocked: [], muted: [], bookmarks: [] };
let viewedMember = null;
let pendingPostAction = null;
let openPostId = null;
const emojiChoices = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😍','😘','🥰','😎','🤩','🥳','🤔','😢','😭','😡','🤯','😴','👀','💀','❤️','💙','💚','🔥','✨','🎉','🚓','🚒','🚑','👍','👎','✅','❌','⚠️','📌','📷','🎮'];

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const timeAgo = (value) => {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 60) return 'just now';
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const remainingMinutes = minutes % 60;
    return `${hours} hour${hours === 1 ? '' : 's'}${remainingMinutes ? ` and ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}` : ''} ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
};
const verifiedBadge = () => '<span class="verified" role="img" aria-label="Verified" data-tooltip="Verified"><img src="assets/verified-badge.png" alt="" /></span>';
const currentAuthor = (post) => internetUsers.get(post.authorId) || null;
const isVerified = (post) => currentAuthor(post)?.verified === true;

function refreshProfileVerified() {
  if (profileVerified) profileVerified.hidden = !internetUsers.get(currentUserId)?.verified;
}

async function readApiJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(fallbackMessage);
  try {
    return await response.json();
  } catch {
    throw new Error(fallbackMessage);
  }
}

function postMenu(post) {
  if (!currentUserId) return '';
  const ownPost = post.authorId === currentUserId;
  const buttons = ownPost
    ? '<button type="button" data-post-action="edit">Edit post</button><button type="button" data-post-action="delete">Delete post</button>'
    : `<button type="button" data-post-action="report">Report post</button>${sessionIsOwner ? '<button type="button" class="danger" data-post-action="delete">Delete post</button>' : ''}`;
  return `<details class="post-menu"><summary aria-label="Post actions">•••</summary><div data-post-id="${escapeHtml(post.id)}">${buttons}</div></details>`;
}

function postActionIcon(type, filled = false) {
  const icons = {
    reply: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8.2 7.5 8.8 8.8 0 0 1-3.4-.7L4 20l1.2-3.4A7.2 7.2 0 0 1 4 12a8 8 0 0 1 16 0Z" /></svg>',
    repost: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h10m0 0-3-3m3 3-3 3M17 17H7m0 0 3 3m-3-3 3-3" /></svg>',
    like: `<svg viewBox="0 0 24 24" aria-hidden="true"${filled ? ' class="filled"' : ''}><path d="M20.8 8.6c0 5-8.8 10.4-8.8 10.4S3.2 13.6 3.2 8.6A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.8 1.8Z" /></svg>`,
    bookmark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5A1.5 1.5 0 0 1 7.5 3h9A1.5 1.5 0 0 1 18 4.5V21l-6-3.6L6 21V4.5Z" /></svg>',
    share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m0 0L7.5 7.5M12 3l4.5 4.5M5 13.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6.5" /></svg>',
  };
  return icons[type] || '';
}

function postMarkup(post, profile = false) {
  const author = currentAuthor(post);
  const displayName = author?.displayName || post.displayName;
  const username = author?.username || post.username;
  const avatarUrl = author?.avatarUrl || post.avatarUrl || 'assets/clearwater-logo.png';
  const staffRank = author?.staffRank || null;
  const body = escapeHtml(post.content)
    .replace(/(^|\s)(#[a-z0-9_]{1,60})/gi, '$1<a href="#home" class="post-hashtag" data-topic="$2">$2</a>')
    .replace(/(^|\s)(@[a-z0-9_]{1,80})/gi, (full, leading, handle) => {
      const mentioned = [...internetUsers.values()].find((user) => String(user.username || '').toLowerCase() === handle.slice(1).toLowerCase());
      return mentioned ? `${leading}<button type="button" class="post-mention" data-open-member="${escapeHtml(mentioned.id)}">${handle}</button>` : `${leading}<span class="post-mention">${handle}</span>`;
    });
  const gif = safeGifUrl(post.gifUrl) ? `<img class="post-gif" src="${escapeHtml(post.gifUrl)}" alt="${escapeHtml(post.gifTitle || 'GIF')}" />` : '';
  const poll = post.poll?.question && Array.isArray(post.poll.options) ? `<section class="post-poll"><b>${escapeHtml(post.poll.question)}</b>${post.poll.options.map((option) => `<button type="button">${escapeHtml(option)} <span>0%</span></button>`).join('')}</section>` : '';
  const replies = allPosts.filter((item) => item.parentId === post.id).length;
  const likes = Array.isArray(post.likes) ? post.likes : [];
  const quote = post.quoteId ? allPosts.find((item) => item.id === post.quoteId) : null;
  const repost = post.repostOf ? allPosts.find((item) => item.id === post.repostOf) : null;
  const shared = quote || repost;
  const sharedMarkup = shared ? `<div class="post-embed"><b>${escapeHtml(shared.displayName || 'Member')}</b> <span>@${escapeHtml(shared.username || '')}</span><p>${escapeHtml(shared.content || '')}</p></div>` : '';
  return `<article class="post" data-post-card="${escapeHtml(post.id)}">${repost ? '<small class="reposted-label">↻ Reposted</small>' : ''}<div class="post-top"><img class="post-avatar" src="${escapeHtml(avatarUrl)}" alt="" /><div><button class="post-author" type="button" data-open-member="${escapeHtml(post.authorId)}"><span class="post-name">${escapeHtml(displayName)}</span>${isVerified(post) ? verifiedBadge() : ''}<span class="post-meta">@${escapeHtml(username)} &middot; ${timeAgo(post.createdAt)}${post.editedAt ? ' &middot; edited' : ''}${staffRank && !profile ? ` &middot; <span class="post-rank">${escapeHtml(staffRank)}</span>` : ''}</span></button></div>${postMenu(post)}</div>${post.content ? `<p class="post-content">${body}</p>` : ''}${sharedMarkup}${gif}${poll}<div class="post-action-row"><button type="button" data-engage="reply" data-post-id="${escapeHtml(post.id)}">${postActionIcon('reply')}<span>${replies || ''}</span></button><details class="repost-inline"><summary aria-label="Repost options">${postActionIcon('repost')}</summary><div><button type="button" data-engage="repost-now" data-post-id="${escapeHtml(post.id)}">Repost</button><button type="button" data-engage="quote" data-post-id="${escapeHtml(post.id)}">Quote</button></div></details><button type="button" data-engage="like" data-post-id="${escapeHtml(post.id)}" class="${likes.includes(currentUserId) ? 'liked' : ''}">${postActionIcon('like', likes.includes(currentUserId))}<span>${likes.length || ''}</span></button><button type="button" data-bookmark-post="${escapeHtml(post.id)}">${postActionIcon('bookmark')}</button><button type="button" data-engage="share" data-post-id="${escapeHtml(post.id)}">${postActionIcon('share')}</button></div></article>`;
}

function safeGifUrl(value) {
  try { return /^https:\/\/(?:media|i)\.giphy\.com\//.test(new URL(String(value)).href); } catch { return false; }
}

function renderTrending() {
  if (!trendingList) return;
  const counts = new Map();
  allPosts.forEach((post) => String(post.content || '').match(/#[a-z0-9_]{1,60}/gi)?.forEach((tag) => {
    const key = tag.toLowerCase(); counts.set(key, (counts.get(key) || 0) + 1);
  }));
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (!tags.length) return;
  trendingList.innerHTML = tags.map(([tag, amount]) => `<a href="#home" data-topic="${escapeHtml(tag)}">${escapeHtml(tag)} <span>${amount} post${amount === 1 ? '' : 's'}</span></a>`).join('');
}

function showPosts(posts) {
  note.hidden = Boolean(posts.length);
  note.textContent = posts.length ? '' : 'No posts yet. Be the first to share an update.';
  list.innerHTML = posts.map((post) => postMarkup(post)).join('');
}

function renderPosts() {
  const query = String(search?.value || '').trim().toLowerCase();
  const visible = allPosts.filter((post) => !post.parentId && !socialState.blocked.includes(post.authorId));
  const posts = query ? visible.filter((post) => `${post.displayName} ${post.username} ${post.content}`.toLowerCase().includes(query)) : visible;
  showPosts(posts);
  renderProfilePosts();
  renderTrending();
  renderBookmarks();
}

function renderProfilePosts() {
  if (!profileList) return;
  if (!currentUserId) {
    profileList.innerHTML = '<p>Sign in to see your posts.</p>';
    return;
  }

  const posts = allPosts.filter((post) => post.authorId === currentUserId);
  if (profilePostCount) profilePostCount.textContent = posts.length.toLocaleString();
  profileList.innerHTML = posts.length
    ? posts.map((post) => postMarkup(post, true)).join('')
    : '<p>You have not posted yet.</p>';
}

function renderBookmarks() {
  if (!bookmarkList) return;
  const posts = allPosts.filter((post) => socialState.bookmarks.includes(post.id));
  bookmarkList.innerHTML = posts.length ? posts.map((post) => postMarkup(post)).join('') : '<p class="feed-note">Your saved posts will appear here.</p>';
}

function showView(view) {
  const availableViews = new Set(['home', 'notifications', 'messages', 'bookmarks', 'profile', 'member', 'conversation', 'settings', 'staff', 'post']);
  let activeView = availableViews.has(view) ? view : 'home';
  if (activeView === 'staff' && !sessionIsOwner) activeView = 'home';
  document.querySelector('.internet-shell')?.classList.toggle('staff-mode', activeView === 'staff');
  document.querySelectorAll('[data-view]').forEach((section) => { section.hidden = section.dataset.view !== activeView; });
  document.querySelectorAll('[data-view-link]').forEach((link) => link.classList.toggle('selected', link.dataset.viewLink === activeView));
  if (activeView === 'home') renderPosts();
  if (activeView === 'staff') void loadModeration();
  if (activeView === 'messages') void loadMessages();
  if (activeView === 'bookmarks') renderBookmarks();
}

function showViewFromAddress() {
  const linkedPostId = location.hash.startsWith('#post-') ? location.hash.slice(6) : null;
  if (linkedPostId) {
    showPostDetail(linkedPostId, false);
    return;
  }
  const linkedMemberId = location.hash.startsWith('#member-') ? location.hash.slice(8) : null;
  if (linkedMemberId) {
    openMemberProfile(linkedMemberId, false);
    return;
  }
  showView(location.hash.slice(1) || 'home');
}

function showPostDetail(postId, updateHash = true) {
  const post = allPosts.find((item) => item.id === postId);
  if (!post || !postDetail) return showView('home');
  openPostId = postId;
  if (updateHash) history.pushState({}, '', `#post-${postId}`);
  showView('post');
  const replies = allPosts.filter((item) => item.parentId === postId);
  postDetail.innerHTML = `${postMarkup(post)}<section class="detail-replies"><button type="button" class="detail-reply-button" data-engage="reply" data-post-id="${escapeHtml(post.id)}">Reply to this post</button>${replies.length ? replies.map((reply) => postMarkup(reply)).join('') : '<p>There are no replies yet.</p>'}</section>`;
}

function showBan(ban) {
  activeBan = ban || null;
  accountBanned = Boolean(ban);
  document.body.classList.toggle('account-banned', accountBanned);
  if (!banScreen) return;
  banScreen.hidden = !accountBanned;
  if (!accountBanned) return;
  if (banReasonDisplay) banReasonDisplay.textContent = ban.reason || 'No reason was provided.';
  updateBanCountdown();
}

function updateBanCountdown() {
  if (!accountBanned || !banDurationDisplay || !activeBan) return;
  if (!activeBan.until) { banDurationDisplay.textContent = 'Forever'; return; }
  const remaining = new Date(activeBan.until).getTime() - Date.now();
  if (remaining <= 0) {
    banDurationDisplay.textContent = 'Unbanning now…';
    void loadBanStatus();
    return;
  }
  const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
  const endDate = new Intl.DateTimeFormat('en', { dateStyle: 'long' }).format(new Date(activeBan.until));
  banDurationDisplay.textContent = `${days} day${days === 1 ? '' : 's'} remaining · Ends ${endDate}`;
}

async function loadBanStatus() {
  if (!currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status' }) });
    const result = await readApiJson(response, 'Could not check account access.');
    if (!response.ok) return;
    showBan(result.banned ? result.ban : null);
  } catch {
    // Do not hide the normal site if the bot connection is briefly unavailable.
  }
}

async function loadModeration() {
  if (!sessionIsOwner || !staffContent) return;
  staffContent.innerHTML = '<p>Loading moderation information...</p>';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'moderation' }) });
    const result = await readApiJson(response, 'Could not load the staff panel.');
    if (!response.ok) throw new Error(result.error || 'Could not load the staff panel.');
    const reports = result.reports || [];
    const bans = result.bans || [];
    const logs = result.logs || [];
    const selected = reports[0] || null;
    const reportCards = reports.length
      ? reports.map((report) => `<article class="staff-report-card"><div><b>${escapeHtml(report.authorName)}’s post</b><small>Reported by ${escapeHtml(report.reporterName)} · ${escapeHtml(report.reason)}</small></div><p>${escapeHtml(report.content)}</p><div class="report-actions"><select data-report-action><option value="warning">Give warning</option><option value="delete">Delete message</option><option value="ban">Ban account</option></select><button type="button" data-report-review="accept" data-report-id="${escapeHtml(report.id)}">Accept</button><button type="button" class="danger" data-report-review="deny" data-report-id="${escapeHtml(report.id)}">Deny</button></div></article>`).join('')
      : '<div class="staff-empty">Nothing pending. The queue is clear.</div>';
    const banCards = bans.length
      ? bans.map((ban) => `<article class="staff-compact"><b>${escapeHtml(ban.displayName)}</b><span>${escapeHtml(ban.reason)}</span><small>${ban.until ? `Ends ${new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(ban.until))}` : 'Permanent ban'}</small></article>`).join('')
      : '<div class="staff-empty">No active bans.</div>';
    const logCards = logs.length
      ? logs.slice(0, 5).map((log) => `<article class="staff-compact"><span>${escapeHtml(log.message)}</span><small>${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(log.createdAt))}</small></article>`).join('')
      : '<div class="staff-empty">No staff actions yet.</div>';
    staffContent.innerHTML = `<aside class="staff-sidebar"><div class="staff-logo"><span>✦</span><b>Clearwater</b><small>Staff workspace</small></div><div class="staff-side-heading">Panels <span>4</span></div><nav><a class="active" href="#staff">Overview <small>open</small></a><a href="#staff">Live reports <small>${reports.length}</small></a><a href="#staff">Report workspace</a><a href="#staff">Moderation history</a></nav><section><h2>Live reports <span>${reports.length}</span></h2>${reports.length ? reports.map((report) => `<button type="button" class="staff-live-report"><b>${escapeHtml(report.authorName)}</b><small>${escapeHtml(report.reason)}</small></button>`).join('') : '<p>Nothing in this queue.</p>'}</section></aside><section class="staff-overview"><header class="staff-topbar"><div><span>Overview</span><b>Clearwater Staff</b></div><button type="button" data-refresh-staff>Refresh</button></header><div class="staff-tabs"><span class="active">Overview</span><span>Live Reports</span><span>Moderation History</span></div><section class="staff-summary"><h1>Overview</h1><div class="staff-stat-grid"><article><b>${reports.length}</b><span>Pending reports</span></article><article><b>${bans.length}</b><span>Active bans</span></article><article><b>${logs.length}</b><span>Actions logged</span></article><article><b>${reports.length + bans.length}</b><span>Open moderation</span></article></div></section><section class="staff-queue"><header><h2>Oldest pending reports</h2><span>${reports.length} loaded</span></header>${reportCards}</section></section><aside class="staff-dossier"><header><span>User dossier</span><b>${selected ? `@${escapeHtml(selected.authorName)}` : 'No report selected'}</b></header>${selected ? `<section class="dossier-profile"><div class="dossier-avatar">${escapeHtml(selected.authorName).slice(0, 1)}</div><div><b>${escapeHtml(selected.authorName)}</b><small>Discord user</small></div></section><section class="dossier-section"><h2>Reported post</h2><p>${escapeHtml(selected.content)}</p><small>Reason: ${escapeHtml(selected.reason)}</small></section>` : '<div class="staff-empty">Select a report to review account details.</div>'}<section class="dossier-section"><h2>Active bans</h2>${banCards}</section><section class="dossier-section"><h2>Recent staff history</h2>${logCards}</section></aside>`;
  } catch (error) {
    staffContent.innerHTML = `<p>${escapeHtml(error.message || 'Could not load the staff panel.')}</p>`;
  }
}

async function loadWarnings() {
  if (!currentUserId || !warningNotice || !warningReasons) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'warnings' }) });
    const result = await readApiJson(response, 'Could not check warnings.');
    if (!response.ok || !result.warnings?.length) return;
    warningReasons.innerHTML = result.warnings.map((warning) => `<p>${escapeHtml(warning.reason)}</p>`).join('');
    warningNotice.hidden = false;
  } catch {
    // The normal site remains available if warning status cannot be read.
  }
}

async function loadMessages() {
  if (!messagesList || !currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'messages' }) });
    const result = await readApiJson(response, 'Could not load messages.');
    if (!response.ok) throw new Error(result.error || 'Could not load messages.');
    const messages = result.messages || [];
    messagesList.innerHTML = messages.length
      ? messages.map((message) => `<article class="internet-message"><p>${escapeHtml(message.content)}</p><small>${new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}</small></article>`).join('')
      : '<p>No messages yet.</p>';
  } catch (error) {
    messagesList.innerHTML = `<p>${escapeHtml(error.message || 'Could not load messages.')}</p>`;
  }
}

async function loadSocial() {
  if (!currentUserId) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'social-status' }) });
    const result = await readApiJson(response, 'Could not load your social settings.');
    if (response.ok && result.social) { socialState = { ...socialState, ...result.social }; renderPosts(); }
  } catch { /* Feed stays usable during a temporary connection issue. */ }
}

async function loadPreferences() {
  if (!currentUserId) return;
  const storageKey = `clearwater-preferences-${currentUserId}`;
  const localPreferences = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })();
  document.querySelectorAll('[data-preference]').forEach((input) => { input.checked = localPreferences[input.dataset.preference] === true; });
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preferences' }) });
    const result = await readApiJson(response, 'Could not load settings.');
    if (!response.ok) throw new Error(result.error || 'Could not load settings.');
    document.querySelectorAll('[data-preference]').forEach((input) => { input.checked = result.preferences?.[input.dataset.preference] === true; });
    localStorage.setItem(storageKey, JSON.stringify(result.preferences || {}));
  } catch { /* Settings remain usable if the bot host is briefly unavailable. */ }
}

async function socialAction(type, { targetId = '', postId = '', enabled = true } = {}) {
  const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'social', type, targetId, postId, enabled }) });
  const result = await readApiJson(response, 'Could not save this change.');
  if (!response.ok) throw new Error(result.error || 'Could not save this change.');
  socialState = { ...socialState, ...result.social }; renderPosts();
}

function openMemberProfile(memberId, updateHash = true) {
  const user = internetUsers.get(memberId); if (!user) return;
  viewedMember = user;
  const posts = allPosts.filter((post) => post.authorId === user.id && !post.parentId);
  const banner = document.querySelector('[data-member-page-banner]');
  if (banner) banner.style.backgroundImage = `linear-gradient(110deg, rgba(3, 10, 22, .48), rgba(18, 87, 163, .25)), url("${user.avatarUrl || 'assets/clearwater-police-night.png'}")`;
  document.querySelector('[data-member-page-avatar]').src = user.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-member-page-name]').textContent = user.displayName;
  document.querySelector('[data-member-page-handle]').textContent = `@${user.username}`;
  document.querySelector('[data-member-page-rank]').textContent = user.staffRank || 'Clearwater community member';
  document.querySelector('[data-member-page-copy]').textContent = user.staffRank ? `${user.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.';
  document.querySelector('[data-member-page-verified]').hidden = user.verified !== true;
  document.querySelector('[data-member-page-post-count]').textContent = posts.length.toLocaleString();
  document.querySelector('[data-member-page-posts]').innerHTML = posts.length ? posts.map((post) => postMarkup(post, true)).join('') : '<p>No posts yet.</p>';
  const following = socialState.following.includes(user.id);
  document.querySelector('[data-member-page-follow]').textContent = following ? 'Following' : 'Follow';
  document.querySelector('[data-member-page-menu-list]').hidden = true;
  if (updateHash) history.pushState({}, '', `#member-${user.id}`);
  showView('member');
}

function openConversation(member) {
  if (!member) return;
  viewedMember = member;
  document.querySelector('[data-conversation-avatar]').src = member.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-conversation-name]').textContent = member.displayName;
  document.querySelector('[data-conversation-handle]').textContent = `@${member.username}`;
  document.querySelector('[data-conversation-card-avatar]').src = member.avatarUrl || 'assets/clearwater-logo.png';
  document.querySelector('[data-conversation-card-name]').textContent = member.displayName;
  document.querySelector('[data-conversation-card-handle]').textContent = `@${member.username}`;
  document.querySelector('[data-conversation-card-rank]').textContent = member.staffRank || 'Clearwater community member';
  conversationMessages.innerHTML = '<p>Start a conversation.</p>';
  showView('conversation');
  conversationInput?.focus();
}

function renderMessageUserResults() {
  if (!messageUserResults) return;
  const query = String(messageUserSearch?.value || '').trim().toLowerCase();
  const users = [...internetUsers.values()].filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(query)).slice(0, 8);
  messageUserResults.innerHTML = users.length
    ? users.map((user) => `<button type="button" data-message-user="${escapeHtml(user.id)}"><img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(user.displayName)}</b><small>@${escapeHtml(user.username)}</small></span></button>`).join('')
    : '<p>No members found.</p>';
}

async function submitReportReview({ reportId, decision, moderationAction, reason = '', durationDays = 'forever' }) {
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'report-review', reportId, decision, moderationAction, reason, durationDays }) });
    const result = await readApiJson(response, 'Could not review this report.');
    if (!response.ok) throw new Error(result.error || 'Could not review this report.');
    await loadModeration();
    return true;
  } catch (error) {
    if (moderationError) moderationError.textContent = error.message || 'Could not review this report.';
    return false;
  }
}

function reviewReport(button) {
  const decision = button.dataset.reportReview;
  const reportId = button.dataset.reportId;
  const card = button.closest('.staff-item');
  const moderationAction = card?.querySelector('[data-report-action]')?.value || 'warning';
  if (decision === 'deny') {
    void submitReportReview({ reportId, decision, moderationAction });
    return;
  }
  pendingReportReview = { reportId, decision, moderationAction };
  moderationReason.value = '';
  moderationError.textContent = '';
  moderationDurationWrap.hidden = moderationAction !== 'ban';
  moderationModal.hidden = false;
  moderationReason.focus();
}

async function runPostAction(action, postId) {
  const post = allPosts.find((item) => item.id === postId);
  if (!post) return;
  let content = '';
  let reason = '';
  if (action === 'edit') {
    content = window.prompt('Edit your post:', post.content) || '';
    if (!content.trim()) return;
  }
  if (action === 'report') {
    reason = window.prompt('Why are you reporting this post?') || '';
    if (!reason.trim()) return;
  }
  if (action === 'delete' && !window.confirm('Delete this post? This cannot be undone.')) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, postId, content, reason }) });
    const result = await readApiJson(response, 'Could not update this post.');
    if (!response.ok) throw new Error(result.error || 'Could not update this post.');
    await loadPosts();
    if (action === 'report') window.alert('Report sent to the staff panel.');
  } catch (error) {
    window.alert(error.message || 'Could not update this post.');
  }
}

async function loadPosts() {
  if (loadingPosts) return;
  loadingPosts = true;
  try {
    const response = await fetch('/api/internet');
    const result = await readApiJson(response, 'Clearwater Internet could not reach the website service.');
    if (!response.ok) throw new Error(result.error || 'Service unavailable');
    allPosts = result.posts || [];
    internetUsers = new Map((result.users || []).map((user) => [user.id, user]));
    refreshProfileVerified();
    renderPosts();
    const linkedPostId = location.hash.startsWith('#post-') ? location.hash.slice(6) : null;
    if (linkedPostId) showPostDetail(linkedPostId, false);
    const linkedMemberId = location.hash.startsWith('#member-') ? location.hash.slice(8) : null;
    if (linkedMemberId) openMemberProfile(linkedMemberId, false);
  } catch {
    note.hidden = false;
    note.textContent = 'Clearwater Internet is offline right now. Restart the Clearwater Discord bot host to restore posting.';
  } finally {
    loadingPosts = false;
  }
}

async function loadSession() {
  const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
  const session = await readApiJson(response, 'Discord sign-in is temporarily unavailable.');
  if (!session.authenticated || !session.user) return;
  login.hidden = true;
  userBox.hidden = false;
  composer.hidden = false;
  signedOut.hidden = true;
  name.textContent = session.user.displayName || session.user.username;
  if (session.user.avatarUrl) { avatar.src = session.user.avatarUrl; composerAvatar.src = session.user.avatarUrl; }
  rank.textContent = session.user.staffRank || '';
  currentUserId = session.user.id;
  sessionIsOwner = session.user.owner === true && session.user.staffRank === 'Ownership';
  if (profileTitle) profileTitle.textContent = session.user.displayName || session.user.username;
  if (profileCopy) profileCopy.textContent = session.user.bio || (session.user.staffRank ? `${session.user.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.');
  if (profileAvatar && session.user.avatarUrl) profileAvatar.src = session.user.avatarUrl;
  if (profileBanner && session.user.bannerUrl) {
    profileBanner.style.backgroundImage = `linear-gradient(110deg, rgba(3, 10, 22, .36), rgba(3, 10, 22, .16)), url("${session.user.bannerUrl}")`;
  } else if (profileBanner && session.user.bannerColor) {
    profileBanner.style.backgroundImage = `linear-gradient(110deg, ${session.user.bannerColor}, #061221)`;
  }
  if (profileDiscord) profileDiscord.href = `https://discord.com/users/${encodeURIComponent(session.user.id)}`;
  if (profileHandle) profileHandle.textContent = `@${session.user.username}`;
  if (profileRank) profileRank.textContent = session.user.staffRank || 'Clearwater community member';
  refreshProfileVerified();
  if (sessionIsOwner) { admin.hidden = false; staffLink.hidden = false; } else { admin.hidden = true; staffLink.hidden = true; }
  renderProfilePosts();
  renderPosts();
  await loadBanStatus();
  await loadWarnings();
  await loadMessages();
  await loadSocial();
  await loadPreferences();
}

content?.addEventListener('input', () => { count.textContent = `${content.value.length} / 500`; postButton.disabled = !content.value.trim(); updateComposerHighlight(); });
search?.addEventListener('input', () => { showView('home'); renderPosts(); });
document.querySelectorAll('[data-preference]').forEach((input) => input.addEventListener('change', async () => {
  const original = !input.checked;
  const saveOnDevice = () => {
    if (!currentUserId) return;
    const storageKey = `clearwater-preferences-${currentUserId}`;
    const preferences = (() => { try { return JSON.parse(localStorage.getItem(storageKey) || '{}'); } catch { return {}; } })();
    preferences[input.dataset.preference] = input.checked;
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  };
  saveOnDevice();
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'preference-save', key: input.dataset.preference, enabled: input.checked }) });
    const result = await readApiJson(response, 'Could not save this setting.');
    if (!response.ok) throw new Error(result.error || 'Could not save this setting.');
    input.checked = result.preferences?.[input.dataset.preference] === true;
  } catch (error) {
    if (!/owner access required/i.test(error.message || '')) { input.checked = original; window.alert(error.message || 'Could not save this setting.'); }
  }
}));
document.querySelectorAll('[data-view-link]').forEach((link) => link.addEventListener('click', (event) => {
  event.preventDefault();
  const view = link.dataset.viewLink || 'home';
  if (location.hash === `#${view}`) showView(view);
  else location.hash = view;
}));
document.querySelector('[data-compose-link]')?.addEventListener('click', () => { showView('home'); content?.focus(); });
document.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-profile-tab]').forEach((tab) => tab.classList.toggle('selected', tab === button));
  if (button.dataset.profileTab === 'posts') return renderProfilePosts();
  if (profileList) profileList.innerHTML = `<p>${button.textContent} will appear here when community interactions are enabled.</p>`;
}));
document.addEventListener('click', (event) => {
  const card = event.target.closest('[data-post-card]');
  if (card && !event.target.closest('button,a,details,input,textarea')) { showPostDetail(card.dataset.postCard); return; }
  const emojiChoice = event.target.closest('[data-emoji-choice]');
  if (emojiChoice) { insertAtCursor(emojiChoice.dataset.emojiChoice); emojiModal.hidden = true; return; }
  const engage = event.target.closest('[data-engage]');
  if (engage) { void handlePostEngagement(engage.dataset.engage, engage.dataset.postId, engage); return; }
  const authorButton = event.target.closest('[data-open-member]');
  if (authorButton) { openMemberProfile(authorButton.dataset.openMember); return; }
  const messageUser = event.target.closest('[data-message-user]');
  if (messageUser) { messageModal.hidden = true; openConversation(internetUsers.get(messageUser.dataset.messageUser)); return; }
  const bookmark = event.target.closest('[data-bookmark-post]');
  if (bookmark) { void socialAction('bookmark', { postId: bookmark.dataset.bookmarkPost, enabled: !socialState.bookmarks.includes(bookmark.dataset.bookmarkPost) }).catch((error) => window.alert(error.message)); return; }
  const topic = event.target.closest('[data-topic]');
  if (topic) { event.preventDefault(); showView('home'); search.value = topic.dataset.topic; renderPosts(); return; }
  const gifChoice = event.target.closest('[data-gif-url]');
  if (gifChoice) { selectedGif = { url: gifChoice.dataset.gifUrl, title: gifChoice.dataset.gifTitle || 'GIF' }; gifPreview.hidden = false; gifPreview.innerHTML = `<img src="${escapeHtml(selectedGif.url)}" alt="${escapeHtml(selectedGif.title)}" /><button type="button" data-remove-gif aria-label="Remove GIF">×</button>`; gifModal.hidden = true; return; }
  if (event.target.closest('[data-remove-gif]')) { selectedGif = null; gifPreview.hidden = true; gifPreview.innerHTML = ''; return; }
  const mention = event.target.closest('[data-mention-user]');
  if (mention) { insertAtCursor(`@${mention.dataset.mentionUser} `); mentionModal.hidden = true; return; }
  if (event.target.closest('[data-refresh-staff]')) { void loadModeration(); return; }
  const reviewButton = event.target.closest('[data-report-review]');
  if (reviewButton) { void reviewReport(reviewButton); return; }
  const repostChoice = event.target.closest('[data-repost-choice]');
  if (repostChoice && pendingPostAction?.type === 'repost') {
    repostPopup.hidden = true;
    if (repostChoice.dataset.repostChoice === 'repost') { void postInteraction({ postId: pendingPostAction.postId, type: 'repost' }).catch((error) => window.alert(error.message || 'Could not repost.')); pendingPostAction = null; return; }
    document.querySelector('[data-post-modal-title]').textContent = 'Quote post';
    document.querySelector('[data-post-modal-content]').placeholder = 'What is happening?';
    document.querySelector('[data-quoted-post]').hidden = false;
    document.querySelector('[data-quote-post]').hidden = true;
    pendingPostAction.quote = true;
    postModal.hidden = false;
    return;
  }
  if (repostPopup && !event.target.closest('[data-repost-popup]')) repostPopup.hidden = true;
  const button = event.target.closest('[data-post-action]');
  if (!button) return;
  const postId = button.parentElement?.dataset.postId;
  if (postId) void runPostAction(button.dataset.postAction, postId);
});
document.querySelector('[data-back-home]')?.addEventListener('click', () => { history.pushState({}, '', '#home'); openPostId = null; showView('home'); });
window.addEventListener('popstate', showViewFromAddress);
window.addEventListener('hashchange', showViewFromAddress);

async function handlePostEngagement(type, postId, control = null) {
  const post = allPosts.find((item) => item.id === postId); if (!post) return;
  if (type === 'share') { pendingPostAction = { postId, type }; shareModal.hidden = false; return; }
  if (type === 'repost-now') { try { await postInteraction({ postId, type: 'repost' }); } catch (error) { window.alert(error.message || 'Could not repost.'); } return; }
  if (type === 'quote') {
    pendingPostAction = { postId, type: 'repost', quote: true };
    document.querySelector('[data-post-modal-title]').textContent = 'Quote post';
    document.querySelector('[data-post-modal-content]').placeholder = 'What is happening?';
    document.querySelector('[data-quoted-post]').hidden = false;
    document.querySelector('[data-quote-post]').hidden = true;
    postModal.hidden = false;
    return;
  }
  if (type === 'repost') {
    pendingPostAction = { postId, type, quote: false };
    const box = control?.getBoundingClientRect();
    if (box && repostPopup) {
      repostPopup.style.left = `${Math.max(12, box.left - 2)}px`;
      repostPopup.style.top = `${box.bottom + 8}px`;
      repostPopup.hidden = false;
    }
    return;
  }
  if (type === 'reply') {
    pendingPostAction = { postId, type, quote: false };
    document.querySelector('[data-post-modal-title]').textContent = type === 'reply' ? 'Reply' : 'Repost';
    document.querySelector('[data-post-modal-content]').placeholder = type === 'reply' ? 'Post your reply' : 'Add a comment, or repost now';
    document.querySelector('[data-quoted-post]').hidden = true;
    document.querySelector('[data-quote-post]').hidden = type !== 'repost';
    postModal.hidden = false; return;
  }
  try { await postInteraction({ postId, type }); } catch (error) { window.alert(error.message); }
}

async function postInteraction({ postId, type, content = '', quote = false }) {
  const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post-interaction', postId, type, content, quote }) });
  const result = await readApiJson(response, 'Could not update this post.');
  if (!response.ok) {
    if (result.error === 'Owner access required') throw new Error('Your bot host needs the newest GitHub files and a restart before post actions can work.');
    throw new Error(result.error || 'Could not update this post.');
  }
  await loadPosts();
}
function insertAtCursor(value) {
  if (!content) return;
  const start = content.selectionStart || content.value.length;
  const end = content.selectionEnd || start;
  content.value = `${content.value.slice(0, start)}${value}${content.value.slice(end)}`.slice(0, 500);
  content.focus(); content.selectionStart = content.selectionEnd = Math.min(start + value.length, 500);
  count.textContent = `${content.value.length} / 500`;
  postButton.disabled = !content.value.trim();
  updateComposerHighlight();
}

function updateComposerHighlight() {
  if (!composerHighlight || !content) return;
  composerHighlight.innerHTML = escapeHtml(content.value)
    .replace(/(^|\s)(#[a-z0-9_]{1,60})/gi, '$1<span class="composer-tag">$2</span>')
    .replace(/(^|\s)(@[a-z0-9_]{1,80})/gi, '$1<span class="composer-tag">$2</span>');
}

function renderMentionResults() {
  if (!mentionResults) return;
  const query = String(mentionQuery?.value || '').trim().toLowerCase();
  const users = [...internetUsers.values()].filter((user) => `${user.displayName} ${user.username}`.toLowerCase().includes(query)).slice(0, 8);
  mentionResults.innerHTML = users.length ? users.map((user) => `<button type="button" data-mention-user="${escapeHtml(user.username)}"><img src="${escapeHtml(user.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><span><b>${escapeHtml(user.displayName)}</b><small>@${escapeHtml(user.username)}</small></span></button>`).join('') : '<p>No members found.</p>';
}

function renderEmojiGrid() {
  if (!emojiGrid) return;
  const query = String(emojiQuery?.value || '').trim();
  const items = query ? emojiChoices.filter((emoji) => emoji.includes(query)) : emojiChoices;
  emojiGrid.innerHTML = items.map((emoji) => `<button type="button" data-emoji-choice="${emoji}" aria-label="${emoji}">${emoji}</button>`).join('');
}

async function loadGifs(query = '') {
  if (!gifMessage || !gifResults) return;
  gifMessage.textContent = query ? 'Searching GIFs...' : 'Loading trending GIFs...';
  gifResults.innerHTML = '';
  try {
    const response = await fetch(`/api/giphy${query ? `?q=${encodeURIComponent(query)}` : ''}`);
    const result = await readApiJson(response, 'GIF search is unavailable.');
    if (!response.ok) throw new Error(result.error || 'GIF search is unavailable.');
    gifMessage.textContent = result.gifs?.length ? (query ? 'Choose a GIF.' : 'Trending GIFs') : 'No GIFs found.';
    gifResults.innerHTML = (result.gifs || []).map((gif) => `<button type="button" data-gif-url="${escapeHtml(gif.url)}" data-gif-title="${escapeHtml(gif.title)}"><img src="${escapeHtml(gif.previewUrl)}" alt="${escapeHtml(gif.title)}" /></button>`).join('');
  } catch (error) { gifMessage.textContent = error.message || 'GIF search is unavailable.'; }
}

gifButton?.addEventListener('click', () => { gifModal.hidden = false; gifQuery?.focus(); void loadGifs(); });
document.querySelector('[data-close-gif]')?.addEventListener('click', () => { gifModal.hidden = true; });
gifSearch?.addEventListener('submit', async (event) => {
  event.preventDefault();
  void loadGifs(gifQuery?.value.trim() || '');
});
mentionButton?.addEventListener('click', () => { mentionModal.hidden = false; renderMentionResults(); mentionQuery?.focus(); });
document.querySelector('[data-close-mention]')?.addEventListener('click', () => { mentionModal.hidden = true; });
mentionQuery?.addEventListener('input', renderMentionResults);
emojiButton?.addEventListener('click', () => { emojiModal.hidden = false; renderEmojiGrid(); emojiQuery?.focus(); });
document.querySelector('[data-close-emoji]')?.addEventListener('click', () => { emojiModal.hidden = true; });
emojiQuery?.addEventListener('input', renderEmojiGrid);
[gifModal, emojiModal, mentionModal].forEach((modal) => modal?.addEventListener('click', (event) => {
  if (event.target === modal) modal.hidden = true;
}));
pollButton?.addEventListener('click', () => { pollBuilder.hidden = !pollBuilder.hidden; composer?.classList.toggle('composer-expanded', !pollBuilder.hidden); });
document.querySelector('[data-close-poll]')?.addEventListener('click', () => { if (!pollBuilder) return; pollBuilder.hidden = true; composer?.classList.remove('composer-expanded'); });
document.querySelector('[data-add-poll-option]')?.addEventListener('click', () => {
  const options = pollBuilder?.querySelectorAll('[data-poll-option]') || [];
  if (options.length >= 4) return;
  const input = document.createElement('input'); input.dataset.pollOption = ''; input.maxLength = 80; input.placeholder = `Option ${options.length + 1}`;
  document.querySelector('[data-add-poll-option]')?.before(input);
});
document.querySelector('[data-close-warning]')?.addEventListener('click', () => { warningNotice.hidden = true; });
document.querySelector('[data-close-profile]')?.addEventListener('click', () => { profileModal.hidden = true; });
document.querySelector('[data-member-page-follow]')?.addEventListener('click', async () => {
  if (!viewedMember) return;
  try { await socialAction('follow', { targetId: viewedMember.id, enabled: !socialState.following.includes(viewedMember.id) }); openMemberProfile(viewedMember.id); } catch (error) { window.alert(error.message); }
});
document.querySelector('[data-member-page-menu]')?.addEventListener('click', () => { const menu = document.querySelector('[data-member-page-menu-list]'); menu.hidden = !menu.hidden; });
document.querySelector('[data-mute-member]')?.addEventListener('click', async () => { if (!viewedMember) return; try { await socialAction('mute', { targetId: viewedMember.id, enabled: !socialState.muted.includes(viewedMember.id) }); showView('home'); } catch (error) { window.alert(error.message); } });
document.querySelector('[data-block-member]')?.addEventListener('click', async () => { if (!viewedMember) return; try { await socialAction('block', { targetId: viewedMember.id, enabled: !socialState.blocked.includes(viewedMember.id) }); showView('home'); } catch (error) { window.alert(error.message); } });
document.querySelector('[data-report-member]')?.addEventListener('click', () => { window.alert('To report a member, open one of their posts and choose Report post.'); });
document.querySelector('[data-new-message]')?.addEventListener('click', () => { messageModal.hidden = false; renderMessageUserResults(); messageUserSearch?.focus(); });
document.querySelector('[data-member-page-message]')?.addEventListener('click', () => { openConversation(viewedMember); });
document.querySelector('[data-close-message]')?.addEventListener('click', () => { messageModal.hidden = true; });
messageUserSearch?.addEventListener('input', renderMessageUserResults);
document.querySelector('[data-close-conversation]')?.addEventListener('click', () => { if (viewedMember) openMemberProfile(viewedMember.id, false); else showView('messages'); });
conversationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = conversationInput?.value.trim();
  if (!viewedMember || !text) return;
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message-send', to: viewedMember.id, content: text }) });
    const result = await readApiJson(response, 'Could not send your message.');
    if (!response.ok) throw new Error(result.error || 'Could not send your message.');
    const empty = conversationMessages.querySelector('p'); if (empty) empty.remove();
    conversationMessages.insertAdjacentHTML('beforeend', `<p class="conversation-bubble own">${escapeHtml(text)}</p>`);
    conversationInput.value = '';
  } catch (error) { window.alert(error.message || 'Could not send your message.'); }
});
document.querySelector('[data-close-post-modal]')?.addEventListener('click', () => { postModal.hidden = true; pendingPostAction = null; });
document.querySelector('[data-quote-post]')?.addEventListener('click', () => {
  if (!pendingPostAction) return;
  pendingPostAction.quote = true;
  document.querySelector('[data-post-modal-title]').textContent = 'Quote post';
  document.querySelector('[data-quote-post]').hidden = true;
  document.querySelector('[data-post-modal-content]').placeholder = 'What is happening?';
});
postModalForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); if (!pendingPostAction) return;
  const error = document.querySelector('[data-post-modal-error]'); error.textContent = '';
  const text = document.querySelector('[data-post-modal-content]').value;
  try { await postInteraction({ ...pendingPostAction, content: text }); postModal.hidden = true; postModalForm.reset(); pendingPostAction = null; } catch (exception) { error.textContent = exception.message || 'Could not post.'; }
});
document.querySelector('[data-close-share]')?.addEventListener('click', () => { shareModal.hidden = true; pendingPostAction = null; });
document.querySelector('[data-copy-post-link]')?.addEventListener('click', async () => {
  if (!pendingPostAction) return;
  try { await navigator.clipboard.writeText(`${location.origin}/internet.html#post-${pendingPostAction.postId}`); shareModal.hidden = true; window.alert('Post link copied.'); } catch { window.alert('Could not copy the link.'); }
});
document.querySelector('[data-share-to-friend]')?.addEventListener('click', () => { shareModal.hidden = true; showView('messages'); window.alert('Choose a friend and paste the post link into your message.'); });
messageForm?.addEventListener('submit', async (event) => {
  event.preventDefault(); const destination = [...internetUsers.values()].find((user) => user.username.toLowerCase() === document.querySelector('[data-message-to]').value.trim().replace(/^@/, '').toLowerCase());
  const error = document.querySelector('[data-message-error]'); error.textContent = '';
  if (!destination) { error.textContent = 'Choose a Clearwater Internet member.'; return; }
  try { const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'message-send', to: destination.id, content: document.querySelector('[data-message-content]').value }) }); const result = await readApiJson(response, 'Could not send your message.'); if (!response.ok) throw new Error(result.error); messageModal.hidden = true; messageForm.reset(); window.alert('Message sent.'); } catch (exception) { error.textContent = exception.message || 'Could not send your message.'; }
});
document.querySelector('[data-close-moderation]')?.addEventListener('click', () => { moderationModal.hidden = true; pendingReportReview = null; });
moderationForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!pendingReportReview) return;
  moderationError.textContent = '';
  const complete = await submitReportReview({
    ...pendingReportReview,
    reason: moderationReason.value,
    durationDays: pendingReportReview.moderationAction === 'ban' ? moderationDuration.value : 'forever',
  });
  if (complete) { moderationModal.hidden = true; pendingReportReview = null; }
});

postButton?.addEventListener('click', async () => {
  const pollOptions = [...document.querySelectorAll('[data-poll-option]')].map((input) => input.value.trim()).filter(Boolean);
  const pollQuestion = document.querySelector('[data-poll-question]')?.value.trim() || '';
  const poll = pollQuestion || pollOptions.length ? { question: pollQuestion, options: pollOptions } : null;
  postButton.disabled = true;
  postMessage.textContent = 'Posting...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post', content: content.value, gif: selectedGif, poll }) });
    const result = await readApiJson(response, 'Posting is unavailable because the website service is not connected.');
    if (!response.ok) throw new Error(result.error);
    content.value = ''; count.textContent = '0 / 500'; postButton.disabled = true; updateComposerHighlight(); selectedGif = null; gifPreview.hidden = true; gifPreview.innerHTML = ''; if (pollBuilder) { pollBuilder.hidden = true; composer?.classList.remove('composer-expanded'); pollBuilder.querySelectorAll('input').forEach((input) => { input.value = ''; }); } postMessage.textContent = 'Posted.'; await loadPosts();
  } catch (error) {
    const message = error.message || 'Could not post.';
    postMessage.textContent = message;
    if (/banned/i.test(message)) showBan({ reason: 'This account is banned from Clearwater Internet.', until: null });
  } finally { postButton.disabled = !content.value.trim(); }
});

admin?.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => {
  const action = button.dataset.verifyButton !== undefined || button.dataset.unverifyButton !== undefined ? 'verify' : 'ban';
  const enabled = button.dataset.unverifyButton === undefined && button.dataset.unbanButton === undefined;
  adminMessage.textContent = 'Saving...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, enabled, targetId: targetId.value, reason: action === 'ban' && enabled ? banReason?.value : '', durationDays: action === 'ban' && enabled ? banDuration?.value : 'forever' }) });
    const result = await readApiJson(response, 'Owner controls are unavailable because the website service is not connected.'); if (!response.ok) throw new Error(result.error); adminMessage.textContent = 'Saved.';
  } catch (error) { adminMessage.textContent = error.message || 'Could not save.'; }
}));

showViewFromAddress();
loadSession().catch(() => {});
loadPosts();
window.setInterval(() => {
  if (!document.hidden) { loadPosts(); loadBanStatus(); }
}, 15_000);
window.setInterval(updateBanCountdown, 60 * 1000);

const checkForInternetUpdate = async () => {
  try {
    const response = await fetch('/api/internet-version', { cache: 'no-store' });
    const update = await response.json();
    if (update.version && update.version !== INTERNET_VERSION) window.location.reload();
  } catch {
    // Keep the current page usable if the update check is briefly unavailable.
  }
};

window.setInterval(checkForInternetUpdate, 30_000);
