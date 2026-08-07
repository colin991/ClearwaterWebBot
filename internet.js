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
const INTERNET_VERSION = '20260807-ban-3';
let allPosts = [];
let currentUserId = null;
let internetUsers = new Map();
let loadingPosts = false;
let accountBanned = false;
let activeBan = null;

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const timeAgo = (value) => new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round((new Date(value) - Date.now()) / 60000), 'minute');
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

function showPosts(posts) {
  note.hidden = Boolean(posts.length);
  note.textContent = posts.length ? '' : 'No posts yet. Be the first to share an update.';
  list.innerHTML = posts.map((post) => `<article class="post"><div class="post-top"><img class="post-avatar" src="${escapeHtml(post.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><div><span class="post-name">${escapeHtml(post.displayName)}</span>${isVerified(post) ? verifiedBadge() : ''}<div class="post-meta">@${escapeHtml(post.username)} &middot; ${timeAgo(post.createdAt)}${post.staffRank ? ` &middot; <span class="post-rank">${escapeHtml(post.staffRank)}</span>` : ''}</div></div></div><p class="post-content">${escapeHtml(post.content)}</p></article>`).join('');
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
    ? posts.map((post) => `<article class="post"><div class="post-top"><img class="post-avatar" src="${escapeHtml(post.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><div><span class="post-name">${escapeHtml(post.displayName)}</span>${isVerified(post) ? verifiedBadge() : ''}<div class="post-meta">@${escapeHtml(post.username)} &middot; ${timeAgo(post.createdAt)}</div></div></div><p class="post-content">${escapeHtml(post.content)}</p></article>`).join('')
    : '<p>You have not posted yet.</p>';
}

function showView(view) {
  document.querySelectorAll('[data-view]').forEach((section) => { section.hidden = section.dataset.view !== view; });
  document.querySelectorAll('[data-view-link]').forEach((link) => link.classList.toggle('selected', link.dataset.viewLink === view));
  if (view === 'home') renderPosts();
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
  if (session.user.owner) admin.hidden = false;
  renderProfilePosts();
  await loadBanStatus();
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
