const statusEl = document.querySelector('[data-admin-status]');
const wrapEl = document.querySelector('[data-admin-table-wrap]');
const bodyEl = document.querySelector('[data-admin-body]');
const searchEl = document.querySelector('[data-admin-search]');

let people = [];

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

function renderRows(list) {
  if (!list.length) {
    statusEl.hidden = false;
    wrapEl.hidden = true;
    statusEl.textContent = 'No personnel matched this search.';
    return;
  }
  statusEl.hidden = true;
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

async function loadPanel() {
  try {
    const sessionResponse = await fetch('/api/auth/me', { cache: 'no-store' });
    const session = await sessionResponse.json().catch(() => ({}));
    if (!session.authenticated) {
      window.location.href = '/signin?next=/admin';
      return;
    }
    if (!session.user?.admin) {
      statusEl.textContent = 'You need Discord Administrator (or PCSO command/admin) permission to use this panel.';
      return;
    }

    statusEl.textContent = 'Loading personnel…';
    const response = await fetch('/api/pcso/admin', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      statusEl.textContent = payload?.error || 'Admin roster could not be loaded.';
      return;
    }

    people = Array.isArray(payload.people) ? payload.people : [];
    if (!people.length) {
      statusEl.textContent = payload?.message
        || 'No roster, shift, or report rows were available for the last 7 days.';
      return;
    }
    applySearch();
  } catch {
    statusEl.textContent = 'Admin panel could not be loaded right now.';
  }
}

searchEl?.addEventListener('input', applySearch);
loadPanel();
