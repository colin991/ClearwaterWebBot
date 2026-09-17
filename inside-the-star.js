const statusEl = document.querySelector('[data-star-status]');
const gridEl = document.querySelector('[data-star-grid]');
const lightbox = document.querySelector('[data-star-lightbox]');
const lightboxInner = document.querySelector('[data-star-lightbox-inner]');
const closeBtn = document.querySelector('[data-star-close]');

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

let items = [];

function mediaMarkup(item, { controls = false } = {}) {
  const url = escapeHtml(item.mediaUrl || '');
  if (!url) return '';
  if (item.mediaType === 'video') {
    return `<video src="${url}" ${controls ? 'controls' : ''} playsinline muted></video>`;
  }
  return `<img src="${url}" alt="" />`;
}

function openItem(item) {
  lightboxInner.innerHTML = `
    ${mediaMarkup(item, { controls: true })}
    <h2>${escapeHtml(item.title || '')}</h2>
    <p>${escapeHtml(item.body || '')}</p>
  `;
  lightbox.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxInner.innerHTML = '';
  document.body.style.overflow = '';
}

gridEl?.addEventListener('click', (event) => {
  const card = event.target.closest('[data-star-id]');
  if (!card) return;
  const item = items.find((entry) => entry.id === card.getAttribute('data-star-id'));
  if (item) openItem(item);
});

closeBtn?.addEventListener('click', closeLightbox);
lightbox?.addEventListener('click', (event) => {
  if (event.target === lightbox) closeLightbox();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !lightbox.hidden) closeLightbox();
});

(async () => {
  try {
    const response = await fetch('/api/pcso/content', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Could not load Inside the Star.');
    items = Array.isArray(payload.star) ? payload.star : [];
    if (!items.length) {
      statusEl.textContent = 'Nothing posted yet.';
      return;
    }
    statusEl.hidden = true;
    gridEl.innerHTML = items.map((item) => `
      <button type="button" class="pcso-star-card" data-star-id="${escapeHtml(item.id)}">
        <div class="pcso-star-media">${mediaMarkup(item) || '<span>Text</span>'}</div>
        <strong>${escapeHtml(item.title || 'Untitled')}</strong>
      </button>
    `).join('');
  } catch {
    statusEl.textContent = 'Inside the Star could not be loaded right now.';
  }
})();
