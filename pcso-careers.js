function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[character]));
}

function promptInput(question) {
  const name = escapeHtml(question.key);
  if (question.yesNo) return `<select name="${name}" required><option value="">Select</option><option value="Yes">Yes</option><option value="No">No</option></select>`;
  if (question.scale) return `<input name="${name}" type="number" min="1" max="10" required />`;
  if (question.writing) return `<textarea name="${name}" maxlength="1800" required></textarea>`;
  return `<input name="${name}" maxlength="1800" required />`;
}

function statusCopy(payload) {
  if (payload?.alreadyMember) return 'You are already in the Pinellas County Sheriff’s Office and cannot submit another application.';
  if (!payload?.latest) return 'No application on file. Click Apply Now to start.';
  if (payload.latest.status === 'pending') return 'Your application is pending command review.';
  if (payload.latest.status === 'approved') return 'Your application was approved. Complete training and your R/A.';
  if (payload.latest.status === 'denied') return payload.deniedUntil
    ? `Your application was denied. You can re-apply after ${new Date(payload.deniedUntil).toLocaleString()}.`
    : 'Your application was denied.';
  return `Application status: ${payload.latest.status}.`;
}

async function portal(action, extra = {}) {
  const response = await fetch('/api/pcso/portal', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'application', action, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Could not update the application.');
  return payload;
}

async function loadEvents() {
  const mount = document.querySelector('[data-careers-events]');
  if (!mount) return;
  try {
    const content = await fetch('/api/pcso/content').then((res) => res.json());
    const events = Array.isArray(content.events) ? content.events.slice(0, 6) : [];
    mount.innerHTML = events.length ? events.map((event) => (
      `<article class="pcso-mini-event"><h3>${escapeHtml(event.title)}</h3><p>${escapeHtml(event.whenLabel || event.location || '')}</p><p>${escapeHtml(event.description || '')}</p></article>`
    )).join('') : '<p class="pcso-events-empty">None</p>';
  } catch {
    mount.innerHTML = '<p class="pcso-events-empty">Events could not be loaded.</p>';
  }
}

async function boot() {
  void loadEvents();
  const statusCard = document.querySelector('[data-apply-status]');
  const form = document.querySelector('[data-apply-form]');
  const questionsMount = document.querySelector('[data-apply-questions]');
  const alert = document.querySelector('[data-application-alert]');
  const alertCopy = document.querySelector('[data-application-alert-copy]');
  let authenticated = false;
  let questions = [];
  let canApply = false;
  let currentQuestion = 0;
  let testActive = false;
  const violations = [];

  function showQuestion(index) {
    currentQuestion = Math.max(0, Math.min(index, questions.length - 1));
    questionsMount.querySelectorAll('[data-question-index]').forEach((element) => {
      element.hidden = Number(element.dataset.questionIndex) !== currentQuestion;
    });
    document.querySelector('[data-apply-progress]').textContent = `Question ${currentQuestion + 1}`;
    document.querySelector('[data-apply-progress-count]').textContent = `of ${questions.length}`;
    document.querySelector('[data-apply-previous]').hidden = currentQuestion === 0;
    document.querySelector('[data-apply-next]').hidden = currentQuestion === questions.length - 1;
    document.querySelector('[data-apply-submit]').hidden = currentQuestion !== questions.length - 1;
  }

  async function recordViolation(type, message) {
    if (!testActive) return;
    const entry = { type, createdAt: new Date().toISOString() };
    violations.push(entry);
    alertCopy.textContent = message;
    if (!alert.open) alert.showModal();
    await portal('violation', { violation: entry }).catch(() => {});
  }

  try {
    const session = await fetch('/api/auth/me', { cache: 'no-store' }).then((res) => res.json());
    authenticated = Boolean(session.authenticated);
    if (!authenticated) return;
    const payload = await portal('status');
    questions = payload.questions || [];
    canApply = Boolean(payload.canApply);
    statusCard.innerHTML = `<p><strong>${escapeHtml(statusCopy(payload))}</strong></p>`;
    if (canApply) {
      questionsMount.innerHTML = questions.map((question, index) => (
        `<label data-question-index="${index}" hidden><span>${index + 1}. ${escapeHtml(question.prompt)}</span>${promptInput(question)}</label>`
      )).join('');
    }
  } catch (error) {
    statusCard.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }

  document.querySelector('[data-apply-now]')?.addEventListener('click', () => {
    if (!authenticated) {
      window.location.href = '/signin?next=/careers';
      return;
    }
    if (!canApply || !questions.length) {
      form.hidden = true;
      statusCard.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    form.hidden = false;
    testActive = true;
    showQuestion(0);
    form.scrollIntoView({ behavior: 'smooth' });
  });

  document.querySelector('[data-apply-previous]')?.addEventListener('click', () => showQuestion(currentQuestion - 1));
  document.querySelector('[data-apply-next]')?.addEventListener('click', () => {
    const input = questionsMount.querySelector(`[data-question-index="${currentQuestion}"] input, [data-question-index="${currentQuestion}"] textarea, [data-question-index="${currentQuestion}"] select`);
    if (!input?.reportValidity()) return;
    showQuestion(currentQuestion + 1);
  });
  document.querySelector('[data-application-alert-close]')?.addEventListener('click', () => alert.close());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void recordViolation('tab-hidden', 'You have tabbed out. Your reviewer has been notified.');
  });
  for (const type of ['copy', 'cut', 'paste']) {
    form?.addEventListener(type, (event) => {
      event.preventDefault();
      void recordViolation(type, `${type[0].toUpperCase()}${type.slice(1)} is disabled during the application. Your reviewer has been notified.`);
    });
  }

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const status = form.querySelector('[data-apply-form-status]');
    if (status) status.textContent = 'Submitting…';
    try {
      const payload = await portal('submit', {
        answers: Object.fromEntries(new FormData(form).entries()), violations,
      });
      if (status) status.textContent = 'Application submitted for review.';
      statusCard.innerHTML = `<p><strong>${escapeHtml(statusCopy(payload))}</strong></p>`;
      form.hidden = true;
      testActive = false;
      canApply = false;
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });
}

void boot();
