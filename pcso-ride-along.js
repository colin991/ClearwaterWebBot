(() => {
  const root = document.querySelector('[data-ride-along]');
  if (!root) return;
  const upcomingEl = root.querySelector('[data-ride-upcoming]');
  const mineEl = root.querySelector('[data-ride-mine]');
  const signinEl = root.querySelector('[data-ride-signin]');
  const signedInEl = root.querySelector('[data-ride-signed-in]');
  const form = root.querySelector('[data-ride-form]');
  const formStatus = form?.querySelector('[data-form-status]');
  const summaryEl = form?.querySelector('[data-ride-summary]');
  const openNoteEl = root.querySelector('[data-ride-open-note]');
  const DURATION_MS = 40 * 60_000;
  const SUMMARY_DEFAULT = summaryEl?.textContent || '';

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
  const OPEN_STATUSES = new Set(['pending', 'approved', 'claimed', 'started']);
  const waiverHtml = root.querySelector('.pcso-ride-waiver')?.innerHTML || '';
  const normalizeName = (value) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

  function readWaiver(data, firstName, lastName) {
    if (!data.get('waiverAgree')) throw new Error('Read and agree to the liability waiver.');
    const signature = String(data.get('waiverSignature') || '').trim();
    if (!signature) throw new Error('Type your roleplay name to sign the liability waiver.');
    const expected = `${firstName || ''} ${lastName || ''}`.trim();
    if (expected && normalizeName(signature) !== normalizeName(expected)) {
      throw new Error(`Sign the waiver with your roleplay name exactly: ${expected}.`);
    }
    return { waiverAgree: true, waiverSignature: signature };
  }

  const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

  const dateTime = (ms) => new Date(ms).toLocaleString([], {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const timeOnly = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });

  function windowLabel(startMs, endMs = Number(startMs) + DURATION_MS) {
    return `${dateTime(startMs)} – ${timeOnly(endMs)}`;
  }

  function localDate(ms) {
    const date = new Date(ms);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function readStart(data) {
    const date = String(data.get('date') || '');
    const start = String(data.get('startTime') || '');
    if (!date || !start) return null;
    const startAt = new Date(`${date}T${start}`);
    return Number.isNaN(startAt.getTime()) ? null : startAt;
  }

  function readTimeframe(data) {
    const startAt = readStart(data);
    if (!startAt) throw new Error('Pick a date and a start time.');
    if (startAt.getTime() < Date.now() + 60 * 60_000) throw new Error('Pick a start time at least 1 hour from now.');
    return { startAt: startAt.toISOString(), label: windowLabel(startAt.getTime()) };
  }

  function setMinDates(scope) {
    const today = localDate(Date.now());
    const max = localDate(Date.now() + 60 * 24 * 60 * 60_000);
    scope.querySelectorAll('input[name="date"]').forEach((input) => {
      input.min = today;
      input.max = max;
    });
  }

  function updateSummary() {
    if (!summaryEl || !form) return;
    const startAt = readStart(new FormData(form));
    summaryEl.classList.toggle('is-set', Boolean(startAt));
    summaryEl.textContent = startAt
      ? `Your ride along: ${windowLabel(startAt.getTime())} (40 minutes)`
      : SUMMARY_DEFAULT;
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

  const stars = (rating) => `<span class="pcso-ride-stars-read" aria-label="${rating} out of 5 stars">${'★'.repeat(rating)}<span>${'★'.repeat(5 - rating)}</span></span>`;

  function reviewHtml(item) {
    if (item.review) {
      return `
        <div class="pcso-ride-review-done">
          <p><strong>Your review</strong> ${stars(item.review.rating)}</p>
          ${item.review.feedback ? `<p>${escapeHtml(item.review.feedback)}</p>` : ''}
        </div>`;
    }
    if (!item.canReview) return '';
    const inputs = [5, 4, 3, 2, 1].map((value) => `
      <input type="radio" id="ride-star-${escapeHtml(item.id)}-${value}" name="rating" value="${value}" required />
      <label for="ride-star-${escapeHtml(item.id)}-${value}" title="${value} star${value === 1 ? '' : 's'}"><span class="sr-only">${value} star${value === 1 ? '' : 's'}</span>★</label>`).join('');
    return `
      <form class="pcso-form pcso-ride-review" data-ride-review>
        <p class="pcso-ride-review-title"><strong>How was your ride along?</strong> Your review goes to PCSO command staff.</p>
        <fieldset class="pcso-ride-stars"><legend class="sr-only">Rating</legend>${inputs}</fieldset>
        <label>Feedback<textarea name="feedback" maxlength="1500" placeholder="What went well? What could the deputy do better?"></textarea></label>
        <button type="submit" class="pcso-button pcso-button-red">Send review</button>
      </form>`;
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
        : `Requested start: ${windowLabel(item.requestedStartAt)}`;
      const delay = item.delayRequest?.status === 'pending'
        ? `<p class="pcso-ride-note">Delay requested to ${escapeHtml(windowLabel(item.delayRequest.requestedStartAt))}. Waiting for approval.</p>`
        : '';
      const waiver = item.waiverSigned
        ? `<p class="pcso-ride-note pcso-ride-waiver-ok">Liability waiver signed ${escapeHtml(dateTime(item.waiverSignedAt))}.</p>`
        : (canChange(item) ? `
        <form class="pcso-form pcso-ride-sign" data-ride-sign>
          <p class="pcso-ride-review-title"><strong>Sign the liability waiver</strong> Your supervisor needs it before the ride along starts.</p>
          <div class="pcso-ride-waiver" tabindex="0" role="region" aria-label="Liability waiver">${waiverHtml}</div>
          <label class="pcso-ride-check"><input type="checkbox" name="waiverAgree" required /> I have read and agree to the waiver.</label>
          <label>Signature (type ${escapeHtml(`${item.firstName} ${item.lastName}`)})<input name="waiverSignature" required maxlength="90" autocomplete="off" class="pcso-ride-signature" /></label>
          <button type="submit" class="pcso-button pcso-button-red">Sign waiver</button>
        </form>` : '');
      const reason = item.endedReason ? `<p class="pcso-ride-note">${escapeHtml(item.endedReason)}</p>` : '';
      const actions = canChange(item) ? `
        <div class="pcso-ride-actions">
          <button type="button" class="pcso-button pcso-button-muted" data-ride-delay-toggle>${item.status === 'pending' ? 'Change time' : 'Delay'}</button>
          <button type="button" class="pcso-button pcso-button-red" data-ride-end>End ride along</button>
        </div>
        <form class="pcso-form pcso-ride-delay" data-ride-delay hidden>
          <div class="pcso-ride-row">
            <label>New date<input type="date" name="date" required /></label>
            <label>New start time<input type="time" name="startTime" required step="900" /></label>
          </div>
          <button type="submit" class="pcso-button pcso-button-red">${item.status === 'pending' ? 'Change time' : 'Request delay'}</button>
        </form>` : '';
      return `
        <article class="pcso-ride-card pcso-ride-mine pcso-ride-${escapeHtml(item.status)}" data-ride-id="${escapeHtml(item.id)}" data-ride-name="${escapeHtml(`${item.firstName} ${item.lastName}`)}">
          <div><strong>${escapeHtml(`${item.firstName} ${item.lastName}`)}</strong><em>${escapeHtml(STATUS_LABELS[item.status] || item.status)}</em></div>
          <p>${escapeHtml(when)}</p>
          ${item.supervisorName ? `<p class="pcso-ride-note"><strong>Supervisor:</strong> ${escapeHtml(item.supervisorName)}</p>` : ''}
          ${delay}
          ${waiver}
          ${reason}
          ${actions}
          ${reviewHtml(item)}
          <p class="pcso-form-status" data-ride-status role="status"></p>
        </article>`;
    }).join('');
    setMinDates(mineEl);
  }

  function render(payload) {
    const mine = payload.mine || [];
    renderUpcoming(payload.upcoming || []);
    renderMine(mine);
    const hasOpen = mine.some((item) => OPEN_STATUSES.has(item.status));
    if (form) form.hidden = hasOpen;
    if (openNoteEl) openNoteEl.hidden = !hasOpen;
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

  if (form) {
    setMinDates(form);
    form.addEventListener('input', updateSummary);
    form.addEventListener('change', updateSummary);
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    const data = new FormData(form);
    try {
      const timeframe = readTimeframe(data);
      const waiver = readWaiver(data, data.get('firstName'), data.get('lastName'));
      if (button) button.disabled = true;
      formStatus.textContent = 'Sending your request…';
      render(await portal('request', {
        fields: {
          firstName: data.get('firstName'),
          lastName: data.get('lastName'),
          dob: data.get('dob'),
          ...timeframe,
          ...waiver,
        },
      }));
      form.reset();
      updateSummary();
      formStatus.textContent = '';
      if (openNoteEl) openNoteEl.textContent = 'Request sent. You will get a notice here and a Discord DM once PCSO reviews it.';
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
    const reviewForm = event.target.closest('[data-ride-review]');
    const signForm = event.target.closest('[data-ride-sign]');
    if (!delayForm && !reviewForm && !signForm) return;
    event.preventDefault();
    const card = event.target.closest('[data-ride-id]');
    const status = card.querySelector('[data-ride-status]');
    const submit = event.target.querySelector('button[type="submit"]');
    try {
      if (submit) submit.disabled = true;
      status.textContent = 'Sending…';
      if (delayForm) {
        render(await portal('delay', { id: card.dataset.rideId, fields: readTimeframe(new FormData(delayForm)) }));
      } else if (signForm) {
        const [firstName, ...rest] = String(card.dataset.rideName || '').split(' ');
        render(await portal('sign-waiver', { id: card.dataset.rideId, fields: readWaiver(new FormData(signForm), firstName, rest.join(' ')) }));
      } else {
        const data = new FormData(reviewForm);
        if (!data.get('rating')) throw new Error('Pick a star rating first.');
        render(await portal('review', {
          id: card.dataset.rideId,
          fields: { rating: Number(data.get('rating')), feedback: data.get('feedback') },
        }));
        mineEl.querySelector(`[data-ride-id="${CSS.escape(card.dataset.rideId)}"] [data-ride-status]`)
          ?.replaceChildren('Thanks! Your review was sent to PCSO.');
        document.querySelectorAll('.pcso-result-notice.is-review').forEach((notice) => notice.remove());
      }
    } catch (error) {
      status.textContent = error.message;
      if (submit) submit.disabled = false;
    }
  });

  void load();
})();
