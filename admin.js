const statusEl = document.querySelector('[data-admin-status]');
const personnelEl = document.querySelector('[data-admin-personnel]');
const rosterStatusEl = document.querySelector('[data-admin-roster-status]');
const wrapEl = document.querySelector('[data-admin-table-wrap]');
const bodyEl = document.querySelector('[data-admin-body]');
const searchEl = document.querySelector('[data-admin-search]');
const contentEl = document.querySelector('[data-admin-content]');
const starEl = document.querySelector('[data-admin-star]');
const newsListEl = document.querySelector('[data-news-list]');
const eventListEl = document.querySelector('[data-event-list]');
const starListEl = document.querySelector('[data-star-list]');
const newsForm = document.querySelector('[data-news-form]');
const eventForm = document.querySelector('[data-event-form]');
const starForm = document.querySelector('[data-star-form]');

let people = [];

const MAX_CONTENT_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_CONTENT_MEDIA_BYTES = 20 * 1024 * 1024;

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

async function resolveContentMediaUrl(form, folder) {
  const fileInput = form?.querySelector('input[name="media"]');
  const file = fileInput?.files?.[0];
  const typedUrl = String(new FormData(form).get('mediaUrl') || '').trim();
  if (!file) return typedUrl;

  const isVideo = /^video\/(mp4|webm|quicktime)$/i.test(file.type || '');
  const isImage = /^image\/(png|jpeg|jpg|webp|gif)$/i.test(file.type || '');
  if (!isVideo && !isImage) {
    throw new Error('Use a PNG, JPEG, WebP, GIF, MP4, or WebM file.');
  }
  if (isImage && file.size > MAX_CONTENT_IMAGE_BYTES) {
    throw new Error('Image must be 5 MB or smaller.');
  }
  if (isVideo && file.size > MAX_CONTENT_MEDIA_BYTES) {
    throw new Error('Video must be 20 MB or smaller.');
  }

  const upload = globalThis.VercelBlob?.upload;
  if (typeof upload !== 'function') {
    throw new Error('Upload is unavailable. Paste a Media URL instead, or configure Vercel Blob.');
  }

  const blob = await upload(`pcso-content/${folder}/${safeContentImageName(file, isVideo ? 'clip.mp4' : 'image.jpg')}`, file, {
    access: 'public',
    handleUploadUrl: '/api/pcso/content-upload',
    contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
  });
  if (!blob?.url) throw new Error('Upload failed.');
  return blob.url;
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
        <a href="/api/pcso/weekly-report?discordId=${id}" data-weekly-pdf>Download PDF</a>
      </td>
    </tr>`;
  }).join('');
}

document.addEventListener('click', async (event) => {
  const link = event.target.closest('[data-weekly-pdf]');
  if (!link) return;
  event.preventDefault();
  if (link.getAttribute('aria-busy') === 'true') return;
  link.setAttribute('aria-busy', 'true');
  link.textContent = 'Preparing PDF…';
  statusEl.textContent = 'Preparing weekly report…';
  try {
    const response = await fetch(link.href, { headers: { Accept: 'application/pdf' } });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const seconds = Math.max(1, Math.ceil(Number(response.headers.get('retry-after')) || 60));
      throw new Error(response.status === 429
        ? `Reports are temporarily busy. Please try again in ${seconds} seconds.`
        : payload.error || 'The report could not be downloaded. Please try again.');
    }
    if (!response.headers.get('content-type')?.includes('application/pdf')) {
      throw new Error('The report could not be downloaded. Please sign in and try again.');
    }
    const url = URL.createObjectURL(await response.blob());
    const download = document.createElement('a');
    download.href = url;
    const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1];
    download.download = filename || 'weekly-report.pdf';
    document.body.append(download);
    download.click();
    download.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    statusEl.textContent = 'Weekly report downloaded.';
  } catch (error) {
    statusEl.textContent = error.message || 'The report could not be downloaded. Please try again.';
  } finally {
    link.removeAttribute('aria-busy');
    link.textContent = 'Download PDF';
  }
});

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
    const thumb = (item.imageUrl || (item.mediaType === 'image' && item.mediaUrl))
      ? `<div class="admin-item-thumb" style="background-image:url('${escapeHtml(item.imageUrl || item.mediaUrl)}')" aria-hidden="true"></div>`
      : '';
    return `
    <div class="admin-item">
      ${thumb}
      <div>
        <strong>${escapeHtml(item.title || 'Untitled')}</strong>
        <span>${escapeHtml(item.summary || item.whenLabel || item.location || item.description || item.body || '')}</span>
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
  renderList(starListEl, Array.isArray(payload.star) ? payload.star : [], 'star');
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
  renderList(starListEl, Array.isArray(payload.star) ? payload.star : [], 'star');
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
    if (starEl) starEl.hidden = false;
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
      statusEl.textContent = 'Signed in. Manage weekly PDFs, news/events, and Inside the Star below.';
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

starForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(starForm);
  try {
    const hasFile = Boolean(starForm.querySelector('input[name="media"]')?.files?.[0]);
    statusEl.textContent = hasFile ? 'Uploading media…' : 'Saving Inside the Star…';
    const mediaUrl = await resolveContentMediaUrl(starForm, 'star');
    statusEl.textContent = 'Saving Inside the Star…';
    await mutate('POST', {
      kind: 'star',
      title: data.get('title'),
      body: data.get('body'),
      mediaUrl,
    });
    starForm.reset();
    statusEl.textContent = 'Inside the Star item added.';
  } catch (error) {
    statusEl.textContent = error.message || 'Could not add Inside the Star item.';
  }
});

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-delete-id]');
  if (!button) return;
  try {
    statusEl.textContent = 'Deleting…';
    const kind = button.getAttribute('data-delete-kind');
    await mutate('DELETE', {
      kind: kind === 'event' ? 'event' : (kind === 'star' ? 'star' : 'news'),
      id: button.getAttribute('data-delete-id'),
    });
    statusEl.textContent = 'Item removed.';
  } catch (error) {
    statusEl.textContent = error.message || 'Could not delete item.';
  }
});

boot();
