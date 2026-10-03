(() => {
  const root = document.querySelector('[data-ride-along]');
  if (!root) return;
  const upcomingEl = root.querySelector('[data-ride-upcoming]');
  const mineEl = root.querySelector('[data-ride-mine]');
  const signinEl = root.querySelector('[data-ride-signin]');
  const signedInEl = root.querySelector('[data-ride-signed-in]');
  const form = root.querySelector('[data-ride-form]');
  const formStatus = form?.querySelector('[data-form-status]');

  const STATUS_LABELS = {
    pending: 'Waiting for approval',
    approved: 'Approved',
    claimed: 'Supervisor assigned',
    started: 'In progress',
    completed: 'Completed',
    denied: 'Denied',
    cancelled: 'Ended',
    no_show: 'No show',
    unclaimed: 'No supervisor available',
  };

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

  const dateTime = (ms) => new Date(ms).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const timeOnly = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  function windowLabel(startMs, endMs) {
    return `${dateTime(startMs)} – ${timeOnly(endMs)}`;
  }

  function readTimeframe(data) {
    const date = String(data.get('date') || '');
    const start = String(data.get('startTime') || '');
    const end = String(data.get('endTime') || '');
    if (!date || !start || !end) throw new Error('Pick a date, a start time, and an end time.');
    const startAt = new Date(`${date}T${start}`);
    const endAt = new Date(`${date}T${end}`);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) throw new Error('Pick a valid date and time.');
    if (endAt <= startAt) throw new Error('The end time must be after the start time.');
    return { startAt: startAt.toISOString(), endAt: endAt.toISOString(), label: windowLabel(startAt.getTime(), endAt.getTime()) };
  }

  async function portal(action, extra = {}) {
    const response = await fetch('/api/pcso/portal', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'ride-along', action, ...extra }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 401) throw Object.assign(new Error('Sign in with Discord first.'), { status: 401 });
    if (!response.ok) throw new Error(payload.error || 'The ride along request could not be updated.');
    return payload;
  }

  function renderUpcoming(list = []) {
    if (!upcomingEl) return;
    if (!list.length) {
      upcomingEl.innerHTML = '<p class="pcso-ride-empty">No ride alongs are scheduled right now.</p>';
      return;
    }
    upcomingEl.innerHTML = list.map((item) => `
      <article class="pcso-ride-card">
        <div><strong>${escapeHtml(windowLabel(item.scheduledAt, item.endAt))}</strong><span>${escapeHtml(item.meetingPlace)}</span></div>
        <div><span>${escapeHtml(item.roleplayName)}</span><em>${escapeHtml(item.status)}</em></div>
      </article>`).join('');
  }

  function canChange(item) {
    return ['pending', 'approved', 'claimed'].includes(item.status);
  }

  function renderMine(list = []) {
    if (!mineEl) return;
    if (!list.length) {
      mineEl.innerHTML = '<p class="pcso-ride-empty">You have not requested a ride along yet.</p>';
      return;
    }
    mineEl.innerHTML = list.map((item) => {
      const when = item.scheduledAt
        ? `${windowLabel(item.scheduledAt, item.endAt)} · ${item.meetingPlace}`
        : `Requested: ${item.requestedLabel || windowLabel(item.requestedStartAt, item.requestedEndAt)}`;
      const delay = item.delayRequest?.status === 'pending'
        ? `<p class="pcso-ride-note">Delay requested to ${escapeHtml(item.delayRequest.label || windowLabel(item.delayRequest.requestedStartAt, item.delayRequest.requestedEndAt))}. Waiting for approval.</p>`
        : '';
      const actions = canChange(item) ? `
        <div class="pcso-ride-actions">
          <button type="button" class="pcso-button pcso-button-muted" data-ride-delay-toggle>Delay</button>
          <button type="button" class="pcso-button pcso-button-red" data-ride-end>End ride along</button>
        </div>
        <form class="pcso-form pcso-ride-delay" data-ride-delay hidden>
          <fieldset class="pcso-ride-timeframe">
            <legend>New timeframe</legend>
            <label>Date<input type="date" name="date" required /></label>
            <label>From<input type="time" name="startTime" required step="900" /></label>
            <label>To<input type="time" name="endTime" required step="900" /></label>
          </fieldset>
          <button type="submit" class="pcso-button pcso-button-red">${item.status === 'pending' ? 'Change timeframe' : 'Request delay'}</button>
        </form>` : '';
      return `
        <article class="pcso-ride-card pcso-ride-mine" data-ride-id="${escapeHtml(item.id)}">
          <div><strong>${escapeHtml(`${item.firstName} ${item.lastName}`)}</strong><em>${escapeHtml(STATUS_LABELS[item.status] || item.status)}</em></div>
          <p>${escapeHtml(when)}</p>
          ${delay}
          ${actions}
          <p class="pcso-form-status" data-ride-status role="status"></p>
        </article>`;
    }).join('');
  }

  function render(payload) {
    renderUpcoming(payload.upcoming || []);
    renderMine(payload.mine || []);
  }

  async function load() {
    try {
      const session = await fetch('/api/auth/me', { cache: 'no-store' }).then((response) => response.json()).catch(() => ({}));
      if (!session.authenticated) return;
      signinEl.hidden = true;
      signedInEl.hidden = false;
      render(await portal('list'));
    } catch (error) {
      if (upcomingEl) upcomingEl.innerHTML = `<p class="pcso-ride-empty">${escapeHtml(error.message)}</p>`;
    }
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    try {
      const timeframe = readTimeframe(data);
      if (button) button.disabled = true;
      formStatus.textContent = 'Sending your request…';
      render(await portal('request', {
        fields: {
          firstName: data.get('firstName'),
          lastName: data.get('lastName'),
          dob: data.get('dob'),
          ...timeframe,
        },
      }));
      form.reset();
      formStatus.textContent = 'Request sent. You will get a Discord DM once PCSO reviews it.';
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      if (button) button.disabled = false;
    }
  });

  mineEl?.addEventListener('click', async (event) => {
    const card = event.target.closest('[data-ride-id]');
    if (!card) return;
    const status = card.querySelector('[data-ride-status]');
    if (event.target.closest('[data-ride-delay-toggle]')) {
      const delayForm = card.querySelector('[data-ride-delay]');
      delayForm.hidden = !delayForm.hidden;
      return;
    }
    if (event.target.closest('[data-ride-end]')) {
      if (!window.confirm('End this ride along request?')) return;
      try {
        status.textContent = 'Ending…';
        render(await portal('end', { id: card.dataset.rideId }));
      } catch (error) {
        status.textContent = error.message;
      }
    }
  });

  mineEl?.addEventListener('submit', async (event) => {
    const delayForm = event.target.closest('[data-ride-delay]');
    if (!delayForm) return;
    event.preventDefault();
    const card = delayForm.closest('[data-ride-id]');
    const status = card.querySelector('[data-ride-status]');
    try {
      const fields = readTimeframe(new FormData(delayForm));
      status.textContent = 'Sending…';
      render(await portal('delay', { id: card.dataset.rideId, fields }));
    } catch (error) {
      status.textContent = error.message;
    }
  });

  void load();
})();
