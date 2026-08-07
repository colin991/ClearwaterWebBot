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
const adminMessage = document.querySelector('[data-admin-message]');
const search = document.querySelector('[data-search]');
const profileTitle = document.querySelector('[data-profile-title]');
const profileCopy = document.querySelector('[data-profile-copy]');
let allPosts = [];

const escapeHtml = (value) => String(value || '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
const timeAgo = (value) => new Intl.RelativeTimeFormat('en', { numeric: 'auto' }).format(Math.round((new Date(value) - Date.now()) / 60000), 'minute');

function showPosts(posts) {
  note.hidden = Boolean(posts.length);
  note.textContent = posts.length ? '' : 'No posts yet. Be the first to share an update.';
  list.innerHTML = posts.map((post) => `<article class="post"><div class="post-top"><img class="post-avatar" src="${escapeHtml(post.avatarUrl || 'assets/clearwater-logo.png')}" alt="" /><div><span class="post-name">${escapeHtml(post.displayName)}</span>${post.verified ? '<span class="verified" title="Verified account">&#10003;</span>' : ''}<div class="post-meta">@${escapeHtml(post.username)} &middot; ${timeAgo(post.createdAt)}${post.staffRank ? ` &middot; <span class="post-rank">${escapeHtml(post.staffRank)}</span>` : ''}</div></div></div><p class="post-content">${escapeHtml(post.content)}</p></article>`).join('');
}

function renderPosts() {
  const query = String(search?.value || '').trim().toLowerCase();
  const posts = query ? allPosts.filter((post) => `${post.displayName} ${post.username} ${post.content}`.toLowerCase().includes(query)) : allPosts;
  showPosts(posts);
}

function showView(view) {
  document.querySelectorAll('[data-view]').forEach((section) => { section.hidden = section.dataset.view !== view; });
  document.querySelectorAll('[data-view-link]').forEach((link) => link.classList.toggle('selected', link.dataset.viewLink === view));
  if (view === 'home') renderPosts();
}

async function loadPosts() {
  try {
    const response = await fetch('/api/internet');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Service unavailable');
    allPosts = result.posts || [];
    renderPosts();
  } catch {
    note.hidden = false;
    note.textContent = 'Clearwater Internet is offline right now. Restart the Clearwater Discord bot host to restore posting.';
  }
}

async function loadSession() {
  const response = await fetch('/api/auth/me');
  const session = await response.json();
  if (!session.authenticated || !session.user) return;
  login.hidden = true;
  userBox.hidden = false;
  composer.hidden = false;
  signedOut.hidden = true;
  name.textContent = session.user.displayName || session.user.username;
  if (session.user.avatarUrl) { avatar.src = session.user.avatarUrl; composerAvatar.src = session.user.avatarUrl; }
  rank.textContent = session.user.staffRank || '';
  if (profileTitle) profileTitle.textContent = session.user.displayName || session.user.username;
  if (profileCopy) profileCopy.textContent = session.user.staffRank ? `${session.user.staffRank} in Clearwater Roleplay.` : 'Clearwater Roleplay community member.';
  if (session.user.owner) admin.hidden = false;
}

content?.addEventListener('input', () => { count.textContent = `${content.value.length} / 500`; });
search?.addEventListener('input', () => { showView('home'); renderPosts(); });
document.querySelectorAll('[data-view-link]').forEach((link) => link.addEventListener('click', () => showView(link.dataset.viewLink)));
document.querySelectorAll('[data-topic]').forEach((link) => link.addEventListener('click', () => { showView('home'); search.value = link.dataset.topic; renderPosts(); }));
document.querySelector('[data-compose-link]')?.addEventListener('click', () => { showView('home'); content?.focus(); });

postButton?.addEventListener('click', async () => {
  postButton.disabled = true;
  postMessage.textContent = 'Posting...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'post', content: content.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    content.value = ''; count.textContent = '0 / 500'; postMessage.textContent = 'Posted.'; await loadPosts();
  } catch (error) { postMessage.textContent = error.message || 'Could not post.'; } finally { postButton.disabled = false; }
});

admin?.querySelectorAll('button').forEach((button) => button.addEventListener('click', async () => {
  const action = button.dataset.verifyButton !== undefined || button.dataset.unverifyButton !== undefined ? 'verify' : 'ban';
  const enabled = button.dataset.unverifyButton === undefined && button.dataset.unbanButton === undefined;
  adminMessage.textContent = 'Saving...';
  try {
    const response = await fetch('/api/internet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, enabled, targetId: targetId.value }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error); adminMessage.textContent = 'Saved.';
  } catch (error) { adminMessage.textContent = error.message || 'Could not save.'; }
}));

showView(location.hash.slice(1) || 'home');
loadSession().catch(() => {});
loadPosts();
