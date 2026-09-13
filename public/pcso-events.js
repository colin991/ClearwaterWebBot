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

function truncate(text, max = 96) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function renderUpcomingEventsHtml(events, { limit = 3 } = {}) {
  const list = (Array.isArray(events) ? events : []).slice(0, limit);
  if (!list.length) {
    return `<p class="pcso-events-empty">None</p>`;
  }
  return list.map((event) => `
    <article class="pcso-upcoming-item">
      <h3>${escapeHtml(event.title || 'Untitled event')}</h3>
      <p class="pcso-upcoming-when">${escapeHtml(formatEventWhen(event))}</p>
      <p class="pcso-upcoming-where">${escapeHtml(event.location || 'Location TBA')}</p>
    </article>
  `).join('');
}

export function renderNewsCarouselHtml(news, { limit = 12 } = {}) {
  const list = (Array.isArray(news) ? news : []).slice(0, limit);
  if (!list.length) {
    return `<p class="pcso-news-empty">None</p>`;
  }

  const cards = list.map((item) => {
    const href = item.linkUrl || '/news';
    const image = item.imageUrl
      ? `<div class="pcso-news-card-image" style="background-image:url('${escapeHtml(item.imageUrl)}')"></div>`
      : '<div class="pcso-news-card-image pcso-news-card-image-fallback" aria-hidden="true"></div>';
    return `
      <article class="pcso-news-card">
        ${image}
        <div class="pcso-news-card-body">
          <h3>${escapeHtml(truncate(item.title || 'Untitled news', 72))}</h3>
          <p>${escapeHtml(truncate(item.summary || item.body || 'No summary available.', 140))}</p>
          <a class="pcso-news-card-more" href="${escapeHtml(href)}" aria-label="Read ${escapeHtml(item.title || 'news item')}">»</a>
        </div>
      </article>
    `;
  }).join('');

  return `
    <div class="pcso-news-carousel" data-news-carousel>
      <button type="button" class="pcso-news-nav pcso-news-nav-prev" data-news-prev aria-label="Previous news">‹</button>
      <div class="pcso-news-track" data-news-track tabindex="0">${cards}</div>
      <button type="button" class="pcso-news-nav pcso-news-nav-next" data-news-next aria-label="Next news">›</button>
    </div>
  `;
}

export function renderNewsDirectoryHtml(news, { query = '' } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  const list = (Array.isArray(news) ? news : []).filter((item) => {
    if (!needle) return true;
    const haystack = [item.title, item.summary, item.body].join(' ').toLowerCase();
    return haystack.includes(needle);
  });

  if (!list.length) {
    return `<p class="pcso-events-empty">${needle ? 'No news matched your search.' : 'None'}</p>`;
  }

  return `<div class="pcso-news-directory">${list.map((item) => {
    const href = item.linkUrl || '#';
    return `
      <article class="pcso-news-row">
        <h2>${escapeHtml(item.title || 'Untitled news')}</h2>
        ${item.publishedAt ? `<p class="pcso-news-row-date">${escapeHtml(new Date(item.publishedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))}</p>` : ''}
        <p class="pcso-news-row-summary">${escapeHtml(item.summary || item.body || '')}</p>
        ${item.linkUrl ? `<p><a class="pcso-text-link" href="${escapeHtml(href)}">Read more →</a></p>` : ''}
      </article>
    `;
  }).join('')}</div>`;
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
    return `<p class="pcso-events-empty">${needle ? 'No events matched your search.' : 'None'}</p>`;
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

function bindNewsCarousel(root) {
  const track = root.querySelector('[data-news-track]');
  if (!track) return;
  const step = () => Math.max(220, Math.floor(track.clientWidth * 0.72));
  root.querySelector('[data-news-prev]')?.addEventListener('click', () => {
    track.scrollBy({ left: -step(), behavior: 'smooth' });
  });
  root.querySelector('[data-news-next]')?.addEventListener('click', () => {
    track.scrollBy({ left: step(), behavior: 'smooth' });
  });
}

/** Homepage news carousel + upcoming-events panel hydration. */
export async function hydrateNewsAndEventsSection() {
  const newsMount = document.querySelector('[data-news-carousel-mount]');
  const eventsMount = document.querySelector('[data-upcoming-events]');
  const { news, events } = await fetchPcsoContent();

  if (newsMount) {
    newsMount.innerHTML = renderNewsCarouselHtml(news);
    const carousel = newsMount.querySelector('[data-news-carousel]');
    if (carousel) bindNewsCarousel(carousel);
  }
  if (eventsMount) {
    eventsMount.innerHTML = renderUpcomingEventsHtml(events, { limit: 3 });
  }
}

/** @deprecated Prefer hydrateNewsAndEventsSection */
export async function hydrateUpcomingEventsPanel() {
  return hydrateNewsAndEventsSection();
}

if (typeof window !== 'undefined') {
  window.PcsoEvents = {
    fetchPcsoContent,
    formatEventWhen,
    renderUpcomingEventsHtml,
    renderNewsCarouselHtml,
    renderNewsDirectoryHtml,
    renderEventsDirectoryHtml,
    hydrateNewsAndEventsSection,
    hydrateUpcomingEventsPanel,
  };
}
