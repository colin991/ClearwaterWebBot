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
  listEl.innerHTML = `<table class="pcso-jail-table">
    <thead><tr><th>Roblox username</th><th>Time in jail</th></tr></thead>
    <tbody>
      ${inmates.map((inmate) => {
        const username = escapeHtml(inmate.robloxUsername || 'Unknown');
        const heldFor = escapeHtml(inmate.heldFor || '—');
        return `<tr><td>${username}</td><td>${heldFor}</td></tr>`;
      }).join('')}
    </tbody>
  </table>`;
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
