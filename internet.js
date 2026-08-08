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
const INTERNET_VERSION = '20260807-time-1';
let allPosts = [];
let currentUserId = null;
let internetUsers = new Map();
let loadingPosts = false;
let accountBanned = false;
let activeBan = null;
let sessionIsOwner = false;
let pendingReportReview = null;

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
const isVerified = (post) => post.verified === true || internetUsers.get(post.authorId)?.verified === true;

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

function postMarkup(post, profile = false) {
  return `<article class="post"><div class="post-top"><img class="post-avatar" src="${escapeHtml(post.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><div><span class="post-name">${escapeHtml(post.displayName)}</span>${isVerified(post) ? verifiedBadge() : ''}<div class="post-meta">@${escapeHtml(post.username)} &middot; ${timeAgo(post.createdAt)}${post.editedAt ? ' &middot; edited' : ''}${post.staffRank && !profile ? ` &middot; <span class="post-rank">${escapeHtml(post.staffRank)}</span>` : ''}</div></div>${postMenu(post)}</div><p class="post-content">${escapeHtml(post.content)}</p></article>`;
}

function showPosts(posts) {
  note.hidden = Boolean(posts.length);
  note.textContent = posts.length ? '' : 'No posts yet. Be the first to share an update.';
  list.innerHTML = posts.map((post) => postMarkup(post)).join('');
}

function renderPosts() {
  const query = String(search?.value || '').trim().toLowerCase();
  const posts = query ? allPosts.filter((post) => `${post.displayName} ${post.username} ${post.content}`.toLowerCase().includes(query)) : allPosts;
  showPosts(posts);
  renderProfilePosts();
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

function showView(view) {
  document.querySelector('.internet-shell')?.classList.toggle('staff-mode', view === 'staff');
  document.querySelectorAll('[data-view]').forEach((section) => { section.hidden = section.dataset.view !== view; });
  document.querySelectorAll('[data-view-link]').forEach((link) => link.classList.toggle('selected', link.dataset.viewLink === view));
  if (view === 'home') renderPosts();
  if (view === 'staff') void loadModeration();
  if (view === 'messages') void loadMessages();
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
  sessionIsOwner = session.user.owner === true;
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
  if (sessionIsOwner) { admin.hidden = false; staffLink.hidden = false; }
  renderProfilePosts();
  renderPosts();
  await loadBanStatus();
  await loadWarnings();
  await loadMessages();
}

content?.addEventListener('input', () => { count.textContent = `${content.value.length} / 500`; });
search?.addEventListener('input', () => { showView('home'); renderPosts(); });
document.querySelectorAll('[data-view-link]').forEach((link) => link.addEventListener('click', () => showView(link.dataset.viewLink)));
document.querySelectorAll('[data-topic]').forEach((link) => link.addEventListener('click', () => { showView('home'); search.value = link.dataset.topic; renderPosts(); }));
document.querySelector('[data-compose-link]')?.addEventListener('click', () => { showView('home'); content?.focus(); });
document.querySelectorAll('[data-profile-tab]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-profile-tab]').forEach((tab) => tab.classList.toggle('selected', tab === button));
  if (button.dataset.profileTab === 'posts') return renderProfilePosts();
  if (profileList) profileList.innerHTML = `<p>${button.textContent} will appear here when community interactions are enabled.</p>`;
}));
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-refresh-staff]')) { void loadModeration(); return; }
  const reviewButton = event.target.closest('[data-report-review]');
  if (reviewButton) { void reviewReport(reviewButton); return; }
  const button = event.target.closest('[data-post-action]');
  if (!button) return;
  const postId = button.parentElement?.dataset.postId;
  if (postId) void runPostAction(button.dataset.postAction, postId);
});
document.querySelector('[data-close-warning]')?.addEventListener('click', () => { warningNotice.hidden = true; });
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
  postButton.disabled = true;
  postMessage.textContent = 'Posting...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post', content: content.value }) });
    const result = await readApiJson(response, 'Posting is unavailable because the website service is not connected.');
    if (!response.ok) throw new Error(result.error);
    content.value = ''; count.textContent = '0 / 500'; postMessage.textContent = 'Posted.'; await loadPosts();
  } catch (error) {
    const message = error.message || 'Could not post.';
    postMessage.textContent = message;
    if (/banned/i.test(message)) showBan({ reason: 'This account is banned from Clearwater Internet.', until: null });
  } finally { postButton.disabled = false; }
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

showView(location.hash.slice(1) || 'home');
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
