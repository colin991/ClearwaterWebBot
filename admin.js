const statusEl = document.querySelector('[data-admin-status]');
const contentEl = document.querySelector('[data-admin-content]');
const newsListEl = document.querySelector('[data-news-list]');
const eventListEl = document.querySelector('[data-event-list]');
const newsForm = document.querySelector('[data-news-form]');
const eventForm = document.querySelector('[data-event-form]');

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderList(mount, items, kind) {
  if (!mount) return;
  if (!items.length) {
    mount.innerHTML = '<p class="admin-status">None</p>';
    return;
  }
  mount.innerHTML = items.map((item) => `
    <div class="admin-item">
      <div>
        <strong>${escapeHtml(item.title || 'Untitled')}</strong>
        <span>${escapeHtml(item.summary || item.whenLabel || item.location || item.description || '')}</span>
      </div>
      <button type="button" class="admin-item-delete" data-delete-kind="${kind}" data-delete-id="${escapeHtml(item.id)}">Delete</button>
    </div>
  `).join('');
}

async function loadContent() {
  const response = await fetch('/api/pcso/content', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Content could not be loaded.');
  renderList(newsListEl, Array.isArray(payload.news) ? payload.news : [], 'news');
  renderList(eventListEl, Array.isArray(payload.events) ? payload.events : [], 'event');
}

async function mutate(method, body) {
  const response = await fetch('/api/pcso/content', {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Update failed.');
  renderList(newsListEl, Array.isArray(payload.news) ? payload.news : [], 'news');
  renderList(eventListEl, Array.isArray(payload.events) ? payload.events : [], 'event');
  return payload;
}

async function boot() {
  try {
    const sessionResponse = await fetch('/api/auth/me', { cache: 'no-store' });
    const session = await sessionResponse.json().catch(() => ({}));
    if (!session.authenticated) {
      window.location.href = '/signin?next=/admin';
      return;
    }
    if (!session.user?.admin && !session.user?.owner) {
      statusEl.textContent = 'You need Discord admin / PCSO command permission to manage news and events.';
      return;
    }

    contentEl.hidden = false;
    statusEl.textContent = 'Signed in. News and events currently show None on the homepage until you add items.';
    await loadContent();
  } catch {
    statusEl.textContent = 'Admin panel could not be loaded right now.';
  }
}

newsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(newsForm);
  try {
    statusEl.textContent = 'Saving news…';
    await mutate('POST', {
      kind: 'news',
      title: data.get('title'),
      summary: data.get('summary'),
      imageUrl: data.get('imageUrl'),
      linkUrl: data.get('linkUrl'),
    });
    newsForm.reset();
    statusEl.textContent = 'News item added.';
  } catch (error) {
    statusEl.textContent = error.message || 'Could not add news.';
  }
});

eventForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(eventForm);
  try {
    statusEl.textContent = 'Saving event…';
    await mutate('POST', {
      kind: 'event',
      title: data.get('title'),
      whenLabel: data.get('whenLabel'),
      location: data.get('location'),
      description: data.get('description'),
    });
    eventForm.reset();
    statusEl.textContent = 'Event added.';
  } catch (error) {
    statusEl.textContent = error.message || 'Could not add event.';
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-id]');
  if (!button) return;
  try {
    statusEl.textContent = 'Deleting…';
    await mutate('DELETE', {
      kind: button.getAttribute('data-delete-kind') === 'event' ? 'event' : 'news',
      id: button.getAttribute('data-delete-id'),
    });
    statusEl.textContent = 'Item removed.';
  } catch (error) {
    statusEl.textContent = error.message || 'Could not delete item.';
  }
});

boot();
