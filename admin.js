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
const recordsEl = document.querySelector('[data-admin-records]');
const recordsCountEl = document.querySelector('[data-records-count]');
const rideEl = document.querySelector('[data-admin-ride]');
const rideCountEl = document.querySelector('[data-ride-count]');

let people = [];
let weekStart = null;
let weekEnd = null;

function activateAdminView(view) {
  document.querySelectorAll('[data-admin-view]').forEach((button) => {
    button.setAttribute('aria-selected', String(button.dataset.adminView === view));
  });
  document.querySelectorAll('[data-admin-section]').forEach((section) => {
    section.hidden = section.dataset.adminSection !== view;
  });
}

document.querySelectorAll('[data-admin-view]').forEach((button) => {
  button.addEventListener('click', () => activateAdminView(button.dataset.adminView));
});

async function portal(action, extra = {}) {
  const response = await fetch('/api/pcso/portal', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'admin-records', action, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Public records could not be updated.');
  return payload;
}

function renderRecords(records = []) {
  if (recordsCountEl) recordsCountEl.textContent = String(records.length);
  if (!recordsEl) return;
  if (!records.length) {
    recordsEl.innerHTML = '<div class="admin-empty-state"><strong>All caught up</strong><span>There are no pending public records requests.</span></div>';
    return;
  }
  recordsEl.innerHTML = records.map((record) => `
    <article class="admin-record-card" data-record-id="${escapeHtml(record.id)}">
      <div class="admin-record-meta"><span>${escapeHtml(record.fields?.subjectType === 'case' ? 'Case number' : 'Deputy')}</span><time>${escapeHtml(new Date(record.createdAt).toLocaleString())}</time></div>
      <h3>${escapeHtml(record.fields?.subject || 'Untitled request')}</h3>
      <p>${escapeHtml(record.fields?.details || 'No extra details were provided.')}</p>
      <small>Requested by ${escapeHtml(record.requester?.username || record.requester?.discordId || 'Unknown')}</small>
      <label>Report or access key<textarea data-record-report maxlength="1500" placeholder="Required when approving"></textarea></label>
      <div class="admin-record-actions"><button type="button" data-record-decision="approve">Approve &amp; DM</button><button type="button" class="is-danger" data-record-decision="deny">Deny</button></div>
    </article>
  `).join('');
}

async function loadRecords() {
  const payload = await portal('list');
  renderRecords(payload.records || []);
}

async function ridePortal(action, extra = {}) {
  const response = await fetch('/api/pcso/portal', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'admin-ride-along', action, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Ride alongs could not be updated.');
  return payload;
}

const rideWhen = (ms) => (ms ? new Date(ms).toLocaleString([], {
  weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
}) : '—');

function localInputValue(ms) {
  if (!ms) return '';
  const date = new Date(ms);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const RIDE_STATUS = {
  pending: 'Pending', approved: 'Approved', claimed: 'Claimed', started: 'In progress', completed: 'Completed',
  denied: 'Denied', cancelled: 'Ended', no_show: 'No show', unclaimed: 'Unclaimed',
};

function rideRequested(item) {
  return item.requestedLabel || rideWhen(item.requestedStartAt);
}

function placeSelect(places, selected) {
  return `<select data-ride-place>${places.map((place) => `<option${place === selected ? ' selected' : ''}>${escapeHtml(place)}</option>`).join('')}</select>`;
}

function rideRider(item) {
  const noShows = item.noShowCount ? ` · <strong>${item.noShowCount} no show${item.noShowCount === 1 ? '' : 's'}</strong>` : '';
  const waiver = item.waiverSigned ? ' · Waiver signed' : ' · <strong>No waiver</strong>';
  return `<small>${escapeHtml(item.requesterUsername || item.requesterId)} · DOB ${escapeHtml(item.dob || '—')}${waiver}${noShows}</small>`;
}

function renderRideAlongs(payload = {}) {
  const places = payload.meetingPlaces || [];
  const pending = payload.pending || [];
  const delays = payload.delays || [];
  if (rideCountEl) rideCountEl.textContent = String(pending.length + delays.length);
  if (!rideEl) return;
  const group = (title, body) => `<div class="admin-ride-group"><h3>${title}</h3>${body}</div>`;
  const grid = (items, card, empty) => (items.length
    ? `<div class="admin-records-grid">${items.map(card).join('')}</div>`
    : `<p class="admin-status">${empty}</p>`);

  const pendingHtml = grid(pending, (item) => `
    <article class="admin-record-card" data-ride-id="${escapeHtml(item.id)}">
      <div class="admin-record-meta"><span>Requested</span><time>${escapeHtml(rideWhen(item.createdAt))}</time></div>
      <h3>${escapeHtml(`${item.firstName} ${item.lastName}`)}</h3>
      <p>Requested start: ${escapeHtml(rideRequested(item))}</p>
      ${rideRider(item)}
      <label>Start time<input type="datetime-local" data-ride-time value="${escapeHtml(localInputValue(item.requestedStartAt))}" /></label>
      <label>Meeting place${placeSelect(places)}</label>
      <div class="admin-record-actions"><button type="button" data-ride-action="approve">Approve</button><button type="button" class="is-danger" data-ride-action="deny">Deny</button></div>
    </article>`, 'No ride along requests are waiting.');

  const delayHtml = grid(delays, (item) => `
    <article class="admin-record-card" data-ride-id="${escapeHtml(item.id)}">
      <div class="admin-record-meta"><span>Delay request</span><time>${escapeHtml(rideWhen(item.delayRequest?.requestedAt))}</time></div>
      <h3>${escapeHtml(`${item.firstName} ${item.lastName}`)}</h3>
      <p>Currently ${escapeHtml(rideWhen(item.scheduledAt))} at ${escapeHtml(item.meetingPlace)}.<br />Wants: ${escapeHtml(item.delayRequest?.label || rideWhen(item.delayRequest?.requestedStartAt))}</p>
      ${rideRider(item)}
      <label>New start time<input type="datetime-local" data-ride-time value="${escapeHtml(localInputValue(item.delayRequest?.requestedStartAt))}" /></label>
      <label>Meeting place${placeSelect(places, item.meetingPlace)}</label>
      <div class="admin-record-actions"><button type="button" data-ride-action="delay-approve">Approve delay</button><button type="button" class="is-danger" data-ride-action="delay-deny">Deny delay</button></div>
    </article>`, 'No delay requests.');

  const upcomingHtml = grid(payload.upcoming || [], (item) => `
    <article class="admin-record-card" data-ride-id="${escapeHtml(item.id)}">
      <div class="admin-record-meta"><span>${escapeHtml(RIDE_STATUS[item.status] || item.status)}</span><time>${escapeHtml(item.meetingPlace)}</time></div>
      <h3>${escapeHtml(`${item.firstName} ${item.lastName}`)}</h3>
      <p>${escapeHtml(rideWhen(item.scheduledAt))} – ${escapeHtml(new Date(item.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}</p>
      ${rideRider(item)}
      ${item.claimedBy ? `<small>Claimed by ${escapeHtml(item.claimedBy)}</small>` : ''}
      ${item.status === 'started' ? '' : '<div class="admin-record-actions"><button type="button" class="is-danger" data-ride-action="cancel">Cancel ride along</button></div>'}
    </article>`, 'Nothing is scheduled.');

  const noShows = payload.noShows || [];
  const noShowHtml = noShows.length ? `<div class="admin-table-wrap"><table class="admin-table admin-noshow-table">
    <thead><tr><th>Requester</th><th>Roleplay name</th><th>No shows</th><th>Last no show</th></tr></thead>
    <tbody>${noShows.map((entry) => `<tr><td>${escapeHtml(entry.requesterUsername || '')}<div class="pcso-call-meta">${escapeHtml(entry.requesterId)}</div></td><td>${escapeHtml(entry.roleplayName)}</td><td>${entry.count}</td><td>${escapeHtml(rideWhen(entry.lastAt))}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="admin-status">No no-shows recorded.</p>';

  const history = payload.history || [];
  const historyHtml = history.length ? `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>When</th><th>Roleplay name</th><th>Requester</th><th>Status</th></tr></thead>
    <tbody>${history.map((item) => `<tr><td>${escapeHtml(rideWhen(item.scheduledAt || item.requestedStartAt))}</td><td>${escapeHtml(`${item.firstName} ${item.lastName}`)}</td><td>${escapeHtml(item.requesterUsername || item.requesterId)}</td><td>${escapeHtml(RIDE_STATUS[item.status] || item.status)}${item.endedReason ? `<div class="pcso-call-meta">${escapeHtml(item.endedReason)}</div>` : ''}</td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="admin-status">No past ride alongs yet.</p>';

  const reviews = payload.reviews || [];
  const average = reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0;
  const starText = (rating) => `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}`;
  const reviewsHtml = reviews.length ? `
    <p class="admin-status">Average rating <strong>${average.toFixed(1)} / 5</strong> from ${reviews.length} review${reviews.length === 1 ? '' : 's'}.</p>
    ${grid(reviews, (review) => `
    <article class="admin-record-card admin-ride-review">
      <div class="admin-record-meta"><span aria-label="${review.rating} out of 5 stars">${starText(review.rating)}</span><time>${escapeHtml(rideWhen(review.at))}</time></div>
      <h3>${escapeHtml(review.roleplayName)}</h3>
      <p>Ride along ${escapeHtml(rideWhen(review.scheduledAt))}${review.meetingPlace ? ` at ${escapeHtml(review.meetingPlace)}` : ''}</p>
      ${review.feedback ? `<blockquote>${escapeHtml(review.feedback)}</blockquote>` : '<p class="admin-status">No written feedback.</p>'}
      <small>${escapeHtml(review.requesterUsername || review.requesterId)}${review.claimedBy ? ` · Supervisor ${escapeHtml(review.claimedBy)}` : ''}</small>
    </article>`, '')}` : '<p class="admin-status">No reviews yet. Riders can leave one after their ride along ends.</p>';

  const waivers = payload.waivers || [];
  const waiverHtml = waivers.length ? `<div class="admin-table-wrap"><table class="admin-table">
    <thead><tr><th>Signed</th><th>Signature</th><th>Requester</th><th>Ride along</th><th>Sent at start</th><th></th></tr></thead>
    <tbody>${waivers.map((waiver) => `<tr data-ride-id="${escapeHtml(waiver.id)}"><td>${escapeHtml(rideWhen(waiver.signedAt))}</td><td><em>${escapeHtml(waiver.signature)}</em><div class="pcso-call-meta">${escapeHtml(waiver.roleplayName)}</div></td><td>${escapeHtml(waiver.requesterUsername || '')}<div class="pcso-call-meta">${escapeHtml(waiver.requesterId)}</div></td><td>${escapeHtml(rideWhen(waiver.scheduledAt))}<div class="pcso-call-meta">${escapeHtml(RIDE_STATUS[waiver.status] || waiver.status)}</div></td><td>${waiver.sentAt ? escapeHtml(rideWhen(waiver.sentAt)) : 'Not started'}</td><td><button type="button" data-ride-waiver>Download PDF</button></td></tr>`).join('')}</tbody>
  </table></div>` : '<p class="admin-status">No signed waivers yet.</p>';

  rideEl.innerHTML = [
    group('Pending requests', pendingHtml),
    group('Delay requests', delayHtml),
    group('Upcoming', upcomingHtml),
    group('Reviews &amp; feedback', reviewsHtml),
    group('Liability waivers', waiverHtml),
    group('No show log', noShowHtml),
    group('History', historyHtml),
  ].join('');
}

async function loadRideAlongs() {
  renderRideAlongs(await ridePortal('list'));
}

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
        <a href="/api/pcso/weekly-report?discordId=${id}" data-weekly-pdf data-discord-id="${id}">Download PDF</a>
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
    const discordId = link.getAttribute('data-discord-id')
      || new URL(link.href, window.location.origin).searchParams.get('discordId')
      || '';
    const person = people.find((entry) => entry.discordId === discordId) || null;
    const response = await fetch(person
      ? '/api/pcso/weekly-report'
      : `/api/pcso/weekly-report?discordId=${encodeURIComponent(discordId)}`, {
      method: person ? 'POST' : 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/pdf',
        ...(person ? { 'Content-Type': 'application/json' } : {}),
      },
      body: person ? JSON.stringify({ discordId, person, weekStart, weekEnd }) : undefined,
    });
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
  weekStart = payload.weekStart || null;
  weekEnd = payload.weekEnd || null;
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
      loadRecords().catch((error) => {
        if (recordsEl) recordsEl.innerHTML = `<p class="admin-status">${escapeHtml(error.message)}</p>`;
      }),
      loadRideAlongs().catch((error) => {
        if (rideEl) rideEl.innerHTML = `<p class="admin-status">${escapeHtml(error.message)}</p>`;
      }),
    ]);

    if (statusEl.textContent === 'Loading admin tools…') {
      statusEl.textContent = 'Dashboard ready.';
    }
    activateAdminView('personnel');
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
  const waiverButton = event.target.closest('[data-ride-waiver]');
  if (waiverButton) {
    const id = waiverButton.closest('[data-ride-id]')?.dataset.rideId;
    waiverButton.disabled = true;
    statusEl.textContent = 'Preparing the waiver PDF…';
    try {
      const { filename, pdf } = await ridePortal('waiver-pdf', { id });
      const bytes = Uint8Array.from(atob(pdf), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'ride-along-waiver.pdf';
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      statusEl.textContent = 'Waiver downloaded.';
    } catch (error) {
      statusEl.textContent = error.message;
    } finally {
      waiverButton.disabled = false;
    }
    return;
  }
  const rideButton = event.target.closest('[data-ride-action]');
  if (rideButton) {
    const card = rideButton.closest('[data-ride-id]');
    const action = rideButton.dataset.rideAction;
    const extra = { id: card.dataset.rideId };
    if (action === 'approve' || action === 'delay-approve') {
      const value = card.querySelector('[data-ride-time]')?.value || '';
      if (!value) {
        statusEl.textContent = 'Pick the start time first.';
        return;
      }
      extra.scheduledAt = new Date(value).toISOString();
      extra.meetingPlace = card.querySelector('[data-ride-place]')?.value || '';
    }
    if (action === 'deny') extra.reason = window.prompt('Reason for denying (optional):') || '';
    if (action === 'cancel' && !window.confirm('Cancel this ride along? The requester and any supervisor will be DMed.')) return;
    rideButton.disabled = true;
    statusEl.textContent = 'Updating ride along…';
    try {
      renderRideAlongs(await ridePortal(action, extra));
      statusEl.textContent = {
        approve: 'Ride along approved. The requester was DMed and notified on the website.',
        deny: 'Ride along denied. The requester was DMed and notified on the website.',
        'delay-approve': 'Delay approved. The requester was DMed.',
        'delay-deny': 'Delay denied. The requester was DMed.',
        cancel: 'Ride along cancelled.',
      }[action] || 'Ride along updated.';
    } catch (error) {
      statusEl.textContent = error.message;
      rideButton.disabled = false;
    }
    return;
  }
  const reviewButton = event.target.closest('[data-record-decision]');
  if (reviewButton) {
    const card = reviewButton.closest('[data-record-id]');
    const decision = reviewButton.dataset.recordDecision;
    const report = card?.querySelector('[data-record-report]')?.value || '';
    if (decision === 'approve' && !report.trim()) {
      statusEl.textContent = 'Enter the report or access key before approving.';
      return;
    }
    reviewButton.disabled = true;
    statusEl.textContent = decision === 'approve' ? 'Approving and sending the DM…' : 'Denying and sending the DM…';
    try {
      const payload = await portal('review', { formId: card.dataset.recordId, decision, report });
      renderRecords(payload.records || []);
      statusEl.textContent = decision === 'approve' ? 'Request approved and sent.' : 'Request denied and requester notified.';
    } catch (error) {
      statusEl.textContent = error.message;
      reviewButton.disabled = false;
    }
    return;
  }
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
