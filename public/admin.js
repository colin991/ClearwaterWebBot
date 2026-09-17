const statusEl = document.querySelector('[data-admin-status]');
const personnelEl = document.querySelector('[data-admin-personnel]');
const rosterStatusEl = document.querySelector('[data-admin-roster-status]');
const wrapEl = document.querySelector('[data-admin-table-wrap]');
const bodyEl = document.querySelector('[data-admin-body]');
const searchEl = document.querySelector('[data-admin-search]');
const contentEl = document.querySelector('[data-admin-content]');
const starEl = document.querySelector('[data-admin-star]');
const radioEl = document.querySelector('[data-admin-radio]');
const newsListEl = document.querySelector('[data-news-list]');
const eventListEl = document.querySelector('[data-event-list]');
const starListEl = document.querySelector('[data-star-list]');
const newsForm = document.querySelector('[data-news-form]');
const eventForm = document.querySelector('[data-event-form]');
const starForm = document.querySelector('[data-star-form]');
const radioBodyEl = document.querySelector('[data-radio-body]');
const radioMetaEl = document.querySelector('[data-radio-meta]');
const refreshBtn = document.querySelector('[data-radio-refresh]');

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

const listenButton = document.querySelector('[data-radio-listen]');
const listenStatus = document.querySelector('[data-radio-listen-status]');
let liveRadio = null;

function stopLiveRadio(message = 'Listening stopped.') {
  const session = liveRadio;
  liveRadio = null;
  if (session) {
    clearTimeout(session.timer);
    session.controller?.abort();
    void session.context.close().catch(() => {});
  }
  if (listenButton) {
    listenButton.textContent = 'Listen Live';
    listenButton.setAttribute('aria-pressed', 'false');
  }
  if (listenStatus) listenStatus.textContent = message;
}

async function pollLiveRadio(session) {
  if (liveRadio !== session) return;
  try {
    session.controller = new AbortController();
    const timeout = setTimeout(() => session.controller.abort(), 8000);
    let payload;
    try {
      const query = new URLSearchParams();
      if (session.cursor != null) query.set('cursor', session.cursor);
      if (session.epoch) query.set('epoch', session.epoch);
      const response = await fetch(`/api/pcso/radio-audio?${query}`, {
        cache: 'no-store', signal: session.controller.signal,
      });
      payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Live radio could not be loaded.');
    } finally {
      clearTimeout(timeout);
    }
    if (liveRadio !== session) return;
    if (!payload.ready) throw new Error('Dispatch audio is offline or temporarily paused. Try Listen Live again shortly.');
    if (payload.decodeFailed) throw new Error('The bot cannot decode Discord audio right now.');
    if (session.context.state !== 'running') throw new Error('Audio was paused by your browser. Click Listen Live to resume.');
    session.cursor = payload.cursor;
    session.epoch = payload.epoch;
    const frames = payload.frames || [];
    const now = session.context.currentTime;
    // Preserve each speaker’s timing; simultaneous speakers mix in Web Audio.
    for (const [speaker, end] of session.ends) {
      if (end < now) session.ends.delete(speaker);
    }
    if (frames.length) {
      session.lastAudio = Date.now();
      const firstAt = Math.min(...frames.map((frame) => frame.at));
      for (const frame of frames) {
        const raw = Uint8Array.from(atob(frame.pcm), (character) => character.charCodeAt(0));
        const samples = new DataView(raw.buffer);
        const buffer = session.context.createBuffer(1, raw.length / 2, 48000);
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < channel.length; i += 1) channel[i] = samples.getInt16(i * 2, true) / 32768;
        const previousEnd = session.ends.get(frame.speaker) || 0;
        // Keep the player close to live. If a slow request left a speaker's
        // queue in the future, reset that queue instead of replaying stale audio.
        const queuedEnd = previousEnd > now + 0.35 ? now : previousEnd;
        const start = Math.max(now + 0.02 + (frame.at - firstAt) / 1000, queuedEnd);
        if (start > now + 0.75) continue;
        const source = session.context.createBufferSource();
        source.buffer = buffer;
        source.connect(session.context.destination);
        source.onended = () => source.disconnect();
        source.start(start);
        session.ends.set(frame.speaker, start + buffer.duration);
      }
    }
    listenStatus.textContent = session.lastAudio && Date.now() - session.lastAudio < 3000
      ? 'Listening live to Dispatch RTO.'
      : 'Connected — waiting for incoming radio audio.';
    session.timer = setTimeout(() => void pollLiveRadio(session), 180);
  } catch (error) {
    if (liveRadio === session) stopLiveRadio(error.message || 'Live radio disconnected.');
  }
}

listenButton?.addEventListener('click', async () => {
  if (liveRadio) return stopLiveRadio();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return stopLiveRadio('This browser does not support live audio playback.');
  let session;
  try {
    session = { context: new AudioContextClass(), ends: new Map() };
    liveRadio = session;
    listenButton.textContent = 'Stop Listening';
    listenButton.setAttribute('aria-pressed', 'true');
    listenStatus.textContent = 'Connecting to Dispatch RTO…';
    await session.context.resume();
    if (liveRadio === session) void pollLiveRadio(session);
  } catch {
    if (!session || liveRadio === session) stopLiveRadio('Audio playback could not start. Try again.');
  }
});
window.addEventListener('pagehide', () => stopLiveRadio());

const talkButton = document.querySelector('[data-radio-talk]');
const talkStatus = document.querySelector('[data-radio-talk-status]');
let talkSession = null;

function stopTalk(message = 'Hold to Talk') {
  const session = talkSession;
  talkSession = null;
  if (!session) return;
  session.active = false;
  try { session.processor.disconnect(); } catch { /* ignore */ }
  try { session.source.disconnect(); } catch { /* ignore */ }
  session.stream?.getTracks().forEach((track) => track.stop());
  void session.context.close().catch(() => {});
  void fetch('/api/pcso/radio-talk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream', 'X-Talk-Action': 'stop' },
    body: new Uint8Array(),
    credentials: 'same-origin',
  }).catch(() => {});
  talkButton?.setAttribute('aria-pressed', 'false');
  if (talkStatus) talkStatus.textContent = message;
}

async function startTalk() {
  if (talkSession) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    if (talkStatus) talkStatus.textContent = 'This browser does not support microphone access.';
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silent = context.createGain();
    silent.gain.value = 0;
    const session = { active: true, context, stream, source, processor, pending: [], samples: 0, sending: Promise.resolve() };
    talkSession = session;
    processor.onaudioprocess = (event) => {
      if (!session.active) return;
      const input = event.inputBuffer.getChannelData(0);
      // Discord raw PCM expects 48 kHz, signed 16-bit, interleaved stereo.
      const pcm = new Int16Array(input.length * 2);
      for (let i = 0; i < input.length; i += 1) {
        const sample = Math.max(-1, Math.min(1, input[i])) * 32767;
        pcm[i * 2] = sample;
        pcm[i * 2 + 1] = sample;
      }
      session.pending.push(pcm);
      session.samples += pcm.length;
      if (session.samples < 8192) return;
      const chunk = new Int16Array(session.samples);
      let offset = 0;
      for (const part of session.pending) { chunk.set(part, offset); offset += part.length; }
      session.pending = [];
      session.samples = 0;
      session.sending = session.sending.then(() => fetch('/api/pcso/radio-talk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Talk-Action': 'audio' },
        body: chunk,
        credentials: 'same-origin',
      })).catch(() => {
        if (talkSession === session) stopTalk('Microphone transmission lost.');
      });
    };
    source.connect(processor);
    processor.connect(silent);
    silent.connect(context.destination);
    talkButton?.setAttribute('aria-pressed', 'true');
    if (talkStatus) talkStatus.textContent = 'Transmitting to Dispatch RTO…';
  } catch (error) {
    if (talkSession) stopTalk('Microphone access was not granted.');
    else if (talkStatus) talkStatus.textContent = error?.message || 'Microphone access was not granted.';
  }
}

talkButton?.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  void startTalk();
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((eventName) => {
  talkButton?.addEventListener(eventName, () => stopTalk());
});
talkButton?.addEventListener('keydown', (event) => {
  if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) {
    event.preventDefault();
    void startTalk();
  }
});
talkButton?.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.code === 'Enter') stopTalk();
});
window.addEventListener('pagehide', () => stopTalk('Hold to Talk'));

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
    if (starEl) starEl.hidden = false;
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
      statusEl.textContent = 'Signed in. Manage weekly PDFs, news/events, Inside the Star, and dispatch radio talk logs below.';
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
