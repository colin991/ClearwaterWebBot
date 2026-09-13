const statusEl = document.querySelector('[data-admin-status]');
const personnelEl = document.querySelector('[data-admin-personnel]');
const rosterStatusEl = document.querySelector('[data-admin-roster-status]');
const wrapEl = document.querySelector('[data-admin-table-wrap]');
const bodyEl = document.querySelector('[data-admin-body]');
const searchEl = document.querySelector('[data-admin-search]');
const contentEl = document.querySelector('[data-admin-content]');
const newsListEl = document.querySelector('[data-news-list]');
const eventListEl = document.querySelector('[data-event-list]');
const newsForm = document.querySelector('[data-news-form]');
const eventForm = document.querySelector('[data-event-form]');

let people = [];

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderRows(list) {
  if (!list.length) {
    if (rosterStatusEl) {
      rosterStatusEl.hidden = false;
      rosterStatusEl.textContent = 'No personnel matched this search.';
    }
    wrapEl.hidden = true;
    return;
  }
  if (rosterStatusEl) rosterStatusEl.hidden = true;
  wrapEl.hidden = false;
  bodyEl.innerHTML = list.map((person) => {
    const callsign = escapeHtml(person.callsign || '—');
    const name = escapeHtml(person.roleplayName || 'Unknown');
    const rank = escapeHtml(person.rank || '—');
    const hours = escapeHtml(person.shiftHoursLabel || '0m');
    const reports = Array.isArray(person.reports) ? person.reports : [];
    const reportCount = Number(person.reportCount || reports.length || 0);
    const reportPreview = reports.slice(0, 3).map((report) => escapeHtml(report.type || 'Report')).join(', ');
    const reportExtra = reportCount > 3 ? ` +${reportCount - 3} more` : '';
    const id = encodeURIComponent(person.discordId || '');
    return `<tr>
      <td><strong>${callsign}</strong></td>
      <td>${name}<div class="pcso-call-meta">${escapeHtml(person.discordId || '')}</div></td>
      <td>${rank}</td>
      <td>${hours}</td>
      <td>${reportCount}${reportPreview ? `<div class="pcso-call-meta">${reportPreview}${reportExtra}</div>` : ''}</td>
      <td class="admin-actions">
        <a href="/api/pcso/weekly-report?discordId=${id}">Download PDF</a>
      </td>
    </tr>`;
  }).join('');
}

function applySearch() {
  const needle = String(searchEl?.value || '').trim().toLowerCase();
  if (!needle) {
    renderRows(people);
    return;
  }
  renderRows(people.filter((person) => {
    const haystack = [
      person.callsign,
      person.roleplayName,
      person.rank,
      person.discordId,
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  }));
}

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

async function loadPersonnel() {
  const response = await fetch('/api/pcso/admin', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (rosterStatusEl) {
      rosterStatusEl.hidden = false;
      rosterStatusEl.textContent = payload?.error || 'Admin roster could not be loaded.';
    }
    return;
  }

  people = Array.isArray(payload.people) ? payload.people : [];
  if (!people.length) {
    if (rosterStatusEl) {
      rosterStatusEl.hidden = false;
      rosterStatusEl.textContent = payload?.message
        || 'No roster, shift, or report rows were available for the last 7 days.';
    }
    wrapEl.hidden = true;
    return;
  }
  applySearch();
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
      statusEl.textContent = 'You need Discord Administrator (or PCSO command/admin) permission to use this panel.';
      return;
    }

    if (personnelEl) personnelEl.hidden = false;
    if (contentEl) contentEl.hidden = false;
    statusEl.textContent = 'Loading admin tools…';

    await Promise.all([
      loadPersonnel().catch(() => {
        if (rosterStatusEl) {
          rosterStatusEl.hidden = false;
          rosterStatusEl.textContent = 'Admin roster could not be loaded.';
        }
      }),
      loadContent().catch((error) => {
        statusEl.textContent = error.message || 'News and events could not be loaded.';
      }),
    ]);

    if (statusEl.textContent === 'Loading admin tools…') {
      statusEl.textContent = 'Signed in. Manage weekly PDFs below, and news/events for the homepage.';
    }
  } catch {
    statusEl.textContent = 'Admin panel could not be loaded right now.';
  }
}

searchEl?.addEventListener('input', applySearch);

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
