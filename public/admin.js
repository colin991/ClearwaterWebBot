const statusEl = document.querySelector('[data-admin-status]');
const personnelEl = document.querySelector('[data-admin-personnel]');
const rosterStatusEl = document.querySelector('[data-admin-roster-status]');
const wrapEl = document.querySelector('[data-admin-table-wrap]');
const bodyEl = document.querySelector('[data-admin-body]');
const searchEl = document.querySelector('[data-admin-search]');
const contentEl = document.querySelector('[data-admin-content]');
const radioEl = document.querySelector('[data-admin-radio]');
const newsListEl = document.querySelector('[data-news-list]');
const eventListEl = document.querySelector('[data-event-list]');
const newsForm = document.querySelector('[data-news-form]');
const eventForm = document.querySelector('[data-event-form]');
const radioBodyEl = document.querySelector('[data-radio-body]');
const radioMetaEl = document.querySelector('[data-radio-meta]');
const refreshBtn = document.querySelector('[data-radio-refresh]');

let people = [];

const MAX_CONTENT_IMAGE_BYTES = 5 * 1024 * 1024;

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function safeContentImageName(file, fallback = 'image.jpg') {
  return String(file?.name || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

async function resolveContentImageUrl(form, folder) {
  const fileInput = form?.querySelector('input[name="image"]');
  const file = fileInput?.files?.[0];
  const typedUrl = String(new FormData(form).get('imageUrl') || '').trim();
  if (!file) return typedUrl;

  if (file.size > MAX_CONTENT_IMAGE_BYTES) {
    throw new Error('Image must be 5 MB or smaller.');
  }
  if (!/^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type || '')) {
    throw new Error('Use a PNG, JPEG, WebP, or GIF image.');
  }

  const upload = globalThis.VercelBlob?.upload;
  if (typeof upload !== 'function') {
    throw new Error('Image upload is unavailable. Paste an Image URL instead, or configure Vercel Blob.');
  }

  const blob = await upload(`pcso-content/${folder}/${safeContentImageName(file)}`, file, {
    access: 'public',
    handleUploadUrl: '/api/pcso/content-upload',
    contentType: file.type || 'image/jpeg',
  });
  if (!blob?.url) throw new Error('Image upload failed.');
  return blob.url;
}

function formatWhen(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

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

function renderRadioLogs(entries) {
  if (!radioBodyEl) return;
  if (!entries.length) {
    radioBodyEl.innerHTML = '<tr><td colspan="4">None</td></tr>';
    return;
  }
  radioBodyEl.innerHTML = entries.map((entry) => {
    const unit = entry.callsign || '—';
    const name = entry.displayName || entry.username || entry.userId || 'Unknown';
    return `<tr>
      <td><strong>${escapeHtml(unit)}</strong></td>
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(formatWhen(entry.startedAt))}</td>
      <td>${escapeHtml(entry.durationLabel || `${Math.round((entry.durationMs || 0) / 1000)}s`)}</td>
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
  mount.innerHTML = items.map((item) => {
    const thumb = item.imageUrl
      ? `<div class="admin-item-thumb" style="background-image:url('${escapeHtml(item.imageUrl)}')" aria-hidden="true"></div>`
      : '';
    return `
    <div class="admin-item">
      ${thumb}
      <div>
        <strong>${escapeHtml(item.title || 'Untitled')}</strong>
        <span>${escapeHtml(item.summary || item.whenLabel || item.location || item.description || '')}</span>
      </div>
      <button type="button" class="admin-item-delete" data-delete-kind="${kind}" data-delete-id="${escapeHtml(item.id)}">Delete</button>
    </div>
  `;
  }).join('');
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

const RADIO_LOG_LIMIT = 10;
const RADIO_LOG_REFRESH_MS = 3_000;
let radioRefreshTimer = null;

async function loadRadioLogs() {
  const response = await fetch(`/api/pcso/radio-logs?limit=${RADIO_LOG_LIMIT}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    renderRadioLogs([]);
    throw new Error(payload.error || 'Radio logs could not be loaded.');
  }
  const entries = Array.isArray(payload.entries) ? payload.entries.slice(0, RADIO_LOG_LIMIT) : [];
  renderRadioLogs(entries);
  if (radioMetaEl) {
    const sourceLabel = payload.source === 'bot'
      ? 'bot'
      : (payload.source === 'local' ? 'local' : payload.source || 'unknown');
    const monitor = payload.radioMonitor;
    const monitorParts = [];
    if (monitor?.connectionStatus) {
      monitorParts.push(`monitor ${monitor.connectionStatus}${monitor.paused ? ' (paused)' : ''}`);
    }
    if (Number.isFinite(monitor?.membersInChannel)) {
      monitorParts.push(`${monitor.membersInChannel} in VC`);
    }
    if (monitor?.lastTalkStartAt) {
      monitorParts.push(`last key-up ${formatWhen(monitor.lastTalkStartAt)}`);
    } else if (Number.isFinite(monitor?.talkStartCount)) {
      monitorParts.push(`${monitor.talkStartCount} key-ups heard`);
    }
    const monitorLabel = monitorParts.length ? ` · ${monitorParts.join(' · ')}` : '';
    radioMetaEl.textContent = entries.length
      ? `Latest ${entries.length} PCSO radio transmit${entries.length === 1 ? '' : 's'}${payload.updatedAt ? ` · updated ${formatWhen(payload.updatedAt)}` : ''} · ${sourceLabel}${monitorLabel}`
      : `No PCSO radio transmits logged yet · ${sourceLabel}${monitorLabel}`;
  }
}

function startRadioLogAutoRefresh() {
  if (radioRefreshTimer || !radioEl || radioEl.hidden) return;
  radioRefreshTimer = setInterval(() => {
    loadRadioLogs().catch((error) => {
      if (radioMetaEl) {
        radioMetaEl.textContent = error.message || 'Radio logs could not be loaded.';
      }
    });
  }, RADIO_LOG_REFRESH_MS);
  radioRefreshTimer.unref?.();
}

async function boot() {
  try {
    const sessionResponse = await fetch('/api/auth/me', { cache: 'no-store' });
    const session = await sessionResponse.json().catch(() => ({}));
    if (!session.authenticated) {
      window.location.replace('/signin?next=/admin');
      return;
    }
    // Do not leave non-admins on /admin with sections merely hidden — send them away.
    if (!session.user?.admin && !session.user?.owner) {
      window.location.replace('/');
      return;
    }

    if (personnelEl) personnelEl.hidden = false;
    if (contentEl) contentEl.hidden = false;
    if (radioEl) radioEl.hidden = false;
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
      loadRadioLogs().catch((error) => {
        if (radioMetaEl) {
          radioMetaEl.textContent = error.message || 'Radio logs could not be loaded.';
        }
      }),
    ]);

    if (statusEl.textContent === 'Loading admin tools…') {
      statusEl.textContent = 'Signed in. Manage weekly PDFs, news/events, and dispatch radio talk logs below.';
    }
    startRadioLogAutoRefresh();
  } catch {
    statusEl.textContent = 'Admin panel could not be loaded right now.';
  }
}

searchEl?.addEventListener('input', applySearch);

newsForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(newsForm);
  try {
    const hasFile = Boolean(newsForm.querySelector('input[name="image"]')?.files?.[0]);
    statusEl.textContent = hasFile ? 'Uploading image…' : 'Saving news…';
    const imageUrl = await resolveContentImageUrl(newsForm, 'news');
    statusEl.textContent = 'Saving news…';
    await mutate('POST', {
      kind: 'news',
      title: data.get('title'),
      summary: data.get('summary'),
      imageUrl,
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
    const hasFile = Boolean(eventForm.querySelector('input[name="image"]')?.files?.[0]);
    statusEl.textContent = hasFile ? 'Uploading image…' : 'Saving event…';
    const imageUrl = await resolveContentImageUrl(eventForm, 'events');
    statusEl.textContent = 'Saving event…';
    await mutate('POST', {
      kind: 'event',
      title: data.get('title'),
      whenLabel: data.get('whenLabel'),
      location: data.get('location'),
      description: data.get('description'),
      imageUrl,
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

refreshBtn?.addEventListener('click', async () => {
  try {
    statusEl.textContent = 'Refreshing radio logs…';
    await loadRadioLogs();
    statusEl.textContent = 'Radio logs refreshed.';
  } catch (error) {
    statusEl.textContent = error.message || 'Could not refresh radio logs.';
  }
});

boot();
