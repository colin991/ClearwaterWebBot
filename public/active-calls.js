const statusEl = document.querySelector('[data-pcso-calls-status]');
const listEl = document.querySelector('[data-pcso-calls-list]');

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const renderCalls = (payload) => {
  const calls = Array.isArray(payload?.calls) ? payload.calls : [];
  if (!calls.length) {
    statusEl.hidden = false;
    listEl.hidden = true;
    statusEl.textContent = payload?.message
      || 'No active Melonly calls currently have a PCSO unit assigned.';
    return;
  }

  statusEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = calls.map((call) => {
    const title = escapeHtml(call.title || call.code || call.id || 'Active call');
    const location = escapeHtml(call.location || 'Location unavailable');
    const status = escapeHtml(call.status || 'Active');
    const units = escapeHtml((call.units || []).join(', ') || 'PCSO unit assigned');
    const meta = [status, location].filter(Boolean).join(' · ');
    return `<article class="pcso-call-item"><strong>${title}</strong><div class="pcso-call-meta">${meta}</div><div class="pcso-call-units">${units}</div></article>`;
  }).join('');
};

const loadCalls = async () => {
  try {
    const response = await fetch('/api/pcso/active-calls', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      statusEl.textContent = payload?.message || payload?.error || 'Active calls could not be loaded right now.';
      return;
    }
    if (payload?.configured === false) {
      statusEl.textContent = payload?.message || 'Melonly is not configured.';
      return;
    }
    renderCalls(payload);
  } catch {
    statusEl.textContent = 'Active calls could not be loaded right now.';
  }
};

loadCalls();
setInterval(loadCalls, 30_000);
