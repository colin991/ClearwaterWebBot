const statusEl = document.querySelector('[data-pcso-jail-status]');
const listEl = document.querySelector('[data-pcso-jail-list]');

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');

const renderInmates = (payload) => {
  const inmates = Array.isArray(payload?.inmates) ? payload.inmates : [];
  if (!inmates.length) {
    statusEl.hidden = false;
    listEl.hidden = true;
    statusEl.textContent = payload?.message
      || 'No one is currently in the jail booking zone.';
    return;
  }

  statusEl.hidden = true;
  listEl.hidden = false;
  listEl.innerHTML = inmates.map((inmate) => {
    const roleplayName = escapeHtml(inmate.roleplayName || 'Roleplay name unavailable');
    const robloxUsername = escapeHtml(inmate.robloxUsername || 'Unknown');
    return `<article class="pcso-call-item"><strong>${roleplayName}</strong><div class="pcso-call-meta">Roblox: ${robloxUsername}</div></article>`;
  }).join('');
};

const loadInmates = async () => {
  try {
    const response = await fetch('/api/pcso/jail', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      statusEl.hidden = false;
      listEl.hidden = true;
      statusEl.textContent = payload?.error || 'Jail occupancy could not be loaded right now.';
      return;
    }
    renderInmates(payload);
  } catch {
    statusEl.hidden = false;
    listEl.hidden = true;
    statusEl.textContent = 'Jail occupancy could not be loaded right now.';
  }
};

loadInmates();
setInterval(loadInmates, 15_000);
