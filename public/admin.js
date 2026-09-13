const statusEl = document.querySelector('[data-admin-status]');
const contentEl = document.querySelector('[data-admin-content]');
const radioBodyEl = document.querySelector('[data-radio-body]');
const radioMetaEl = document.querySelector('[data-radio-meta]');
const refreshBtn = document.querySelector('[data-radio-refresh]');

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

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

async function loadRadioLogs() {
  const response = await fetch('/api/pcso/radio-logs?limit=75', { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Radio logs could not be loaded.');
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  renderRadioLogs(entries);
  if (radioMetaEl) {
    radioMetaEl.textContent = entries.length
      ? `${entries.length} recent PCSO radio transmit${entries.length === 1 ? '' : 's'}${payload.updatedAt ? ` · updated ${formatWhen(payload.updatedAt)}` : ''}`
      : 'No PCSO radio transmits logged yet.';
  }
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
      statusEl.textContent = 'You need Discord admin / PCSO command permission to view radio talk logs.';
      return;
    }

    contentEl.hidden = false;
    statusEl.textContent = 'Signed in. Showing PCSO unit talk times from the dispatch radio channel.';
    await loadRadioLogs();
  } catch {
    statusEl.textContent = 'Admin panel could not be loaded right now.';
  }
}

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
