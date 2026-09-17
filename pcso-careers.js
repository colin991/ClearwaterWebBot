function promptInput(question) {
  if (question.yesNo) {
    return `<select name="${question.key}" required><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>`;
  }
  if (question.scale) {
    return `<input name="${question.key}" type="number" min="1" max="10" required />`;
  }
  if (question.writing) {
    return `<textarea name="${question.key}" maxlength="1800" required></textarea>`;
  }
  return `<input name="${question.key}" maxlength="1800" required />`;
}

function statusCopy(payload) {
  if (!payload?.latest) return 'No application on file. Click Apply Now to start.';
  if (payload.latest.status === 'pending') return 'Your application is pending command review.';
  if (payload.latest.status === 'approved') return 'Your application was approved. Complete training and your R/A.';
  if (payload.latest.status === 'denied') {
    return payload.deniedUntil
      ? `Your application was denied. You can re-apply after ${new Date(payload.deniedUntil).toLocaleString()}.`
      : 'Your application was denied.';
  }
  return `Application status: ${payload.latest.status}.`;
}

async function loadEvents() {
  const mount = document.querySelector('[data-careers-events]');
  if (!mount) return;
  try {
    const content = await fetch('/api/pcso/content').then((res) => res.json());
    const events = Array.isArray(content.events) ? content.events.slice(0, 6) : [];
    if (!events.length) {
      mount.innerHTML = '<p class="pcso-events-empty">None</p>';
      return;
    }
    mount.innerHTML = events.map((event) => (
      `<article class="pcso-mini-event"><h3>${event.title}</h3><p>${event.whenLabel || event.location || ''}</p><p>${event.description || ''}</p></article>`
    )).join('');
  } catch {
    mount.innerHTML = '<p class="pcso-events-empty">Events could not be loaded.</p>';
  }
}

async function boot() {
  loadEvents();
  const statusCard = document.querySelector('[data-apply-status]');
  const form = document.querySelector('[data-apply-form]');
  const questionsMount = document.querySelector('[data-apply-questions]');
  let questions = [];
  let canApply = false;

  try {
    const session = await fetch('/api/auth/me', { cache: 'no-store' }).then((res) => res.json());
    if (!session.authenticated) return;
    const payload = await fetch('/api/pcso/portal', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'application', action: 'status' }),
    }).then(async (res) => {
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not load application status.');
      return body;
    });
    questions = payload.questions || [];
    canApply = Boolean(payload.canApply);
    statusCard.innerHTML = `<p><strong>${statusCopy(payload)}</strong></p>`;
    questionsMount.innerHTML = questions.map((question, index) => (
      `<label>${index + 1}. ${question.prompt}${promptInput(question)}</label>`
    )).join('');
  } catch (error) {
    statusCard.innerHTML = `<p>${error.message}</p>`;
  }

  document.querySelector('[data-apply-now]')?.addEventListener('click', () => {
    if (!questions.length) {
      window.location.href = '/signin?next=/careers';
      return;
    }
    if (!canApply) {
      form.hidden = true;
      statusCard.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    form.hidden = false;
    form.scrollIntoView({ behavior: 'smooth' });
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = form.querySelector('[data-apply-form-status]');
    const data = Object.fromEntries(new FormData(form).entries());
    if (status) status.textContent = 'Submitting…';
    try {
      const response = await fetch('/api/pcso/portal', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'application', action: 'submit', answers: data }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Could not submit.');
      if (status) status.textContent = 'Application submitted for review.';
      statusCard.innerHTML = `<p><strong>${statusCopy(payload)}</strong></p>`;
      form.hidden = true;
      canApply = false;
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
}

boot();
