const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

export async function fetchPcsoContent() {
  try {
    const response = await fetch('/api/pcso/content', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return { events: [], news: [] };
    return {
      events: Array.isArray(payload.events) ? payload.events : [],
      news: Array.isArray(payload.news) ? payload.news : [],
      updatedAt: payload.updatedAt || null,
    };
  } catch {
    return { events: [], news: [] };
  }
}

export function formatEventWhen(event) {
  if (event?.whenLabel) return String(event.whenLabel);
  const start = event?.startsAt ? new Date(event.startsAt) : null;
  const end = event?.endsAt ? new Date(event.endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return 'Date TBA';
  const datePart = start.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const startTime = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  if (!end || Number.isNaN(end.getTime())) return `${datePart} ${startTime}`;
  const endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return `${datePart} ${startTime} - ${endTime}`;
}

export function renderUpcomingEventsHtml(events, { limit = 3 } = {}) {
  const list = (Array.isArray(events) ? events : []).slice(0, limit);
  if (!list.length) {
    return `<p class="pcso-events-empty">No upcoming events right now.</p>`;
  }
  return list.map((event) => `
    <article class="pcso-upcoming-item">
      <h3>${escapeHtml(event.title || 'Untitled event')}</h3>
      <p class="pcso-upcoming-when">${escapeHtml(formatEventWhen(event))}</p>
      <p class="pcso-upcoming-where">${escapeHtml(event.location || 'Location TBA')}</p>
    </article>
  `).join('');
}

export function renderEventsDirectoryHtml(events, { query = '' } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  const list = (Array.isArray(events) ? events : []).filter((event) => {
    if (!needle) return true;
    const haystack = [
      event.title,
      event.location,
      event.whenLabel,
      formatEventWhen(event),
      event.description,
    ].join(' ').toLowerCase();
    return haystack.includes(needle);
  });

  if (!list.length) {
    return `<p class="pcso-events-empty">${needle ? 'No events matched your search.' : 'No events are scheduled right now.'}</p>`;
  }

  return `<div class="pcso-events-directory">${list.map((event) => `
    <article class="pcso-events-row">
      <h2>${escapeHtml(event.title || 'Untitled event')}</h2>
      <p class="pcso-events-when">${escapeHtml(formatEventWhen(event))}</p>
      <p class="pcso-events-where">${escapeHtml(event.location || 'Location TBA')}</p>
      ${event.description ? `<p class="pcso-events-desc">${escapeHtml(event.description)}</p>` : ''}
    </article>
  `).join('')}</div>`;
}

/** Homepage upcoming-events panel hydration. */
export async function hydrateUpcomingEventsPanel() {
  const mount = document.querySelector('[data-upcoming-events]');
  if (!mount) return;
  const { events } = await fetchPcsoContent();
  mount.innerHTML = renderUpcomingEventsHtml(events, { limit: 3 });
}

if (typeof window !== 'undefined') {
  window.PcsoEvents = {
    fetchPcsoContent,
    formatEventWhen,
    renderUpcomingEventsHtml,
    renderEventsDirectoryHtml,
    hydrateUpcomingEventsPanel,
  };
}
