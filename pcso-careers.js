function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  }[character]));
}

function plainPrompt(value) {
  return String(value || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^\d+\.\s*/, '')
    .trim();
}

function promptInput(question) {
  const name = escapeHtml(question.key);
  if (question.yesNo) return `<div class="pcso-quiz-choice-grid pcso-quiz-choice-grid-short"><label><input name="${name}" type="radio" value="Yes" required /><span>Yes</span></label><label><input name="${name}" type="radio" value="No" required /><span>No</span></label></div>`;
  if (question.scale) return `<div class="pcso-quiz-choice-grid pcso-quiz-scale">${Array.from({ length: 10 }, (_, index) => `<label><input name="${name}" type="radio" value="${index + 1}" required /><span>${index + 1}</span></label>`).join('')}</div><p class="pcso-quiz-scale-copy"><span>Needs improvement</span><span>Excellent</span></p>`;
  if (question.writing) return `<textarea name="${name}" maxlength="1800" placeholder="Type your answer here…" required></textarea>`;
  return `<input name="${name}" maxlength="1800" placeholder="Type your answer here…" required />`;
}

function statusCopy(payload) {
  if (payload?.alreadyMember) {
    const role = payload.memberRole?.name;
    return role
      ? `You are already in the Pinellas County Sheriff’s Office (your PCSO Discord has the ${role} role) and cannot submit another application.`
      : 'You are already in the Pinellas County Sheriff’s Office and cannot submit another application.';
  }
  if (!payload?.latest) return 'No application on file. Click Apply Now to start.';
  if (payload.latest.status === 'pending') return 'Your application is pending command review.';
  if (payload.latest.status === 'approved' && payload.canApply) return 'Your current Discord roles do not show PCSO membership. You can submit a new application.';
  if (payload.latest.status === 'approved') return 'Your application was approved. Complete training and your R/A.';
  if (payload.latest.status === 'denied') return payload.deniedUntil
    ? 'Your application was denied. You must wait three days before applying again.'
    : 'Your application was denied. Your three-day waiting period has ended.';
  return `Application status: ${payload.latest.status}.`;
}

function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
}

function reapplyCountdownMarkup(deniedUntil) {
  const deadline = Date.parse(deniedUntil || '');
  if (!Number.isFinite(deadline) || deadline <= Date.now()) return '';
  return `<div class="pcso-result-countdown" data-reapply-countdown data-deadline="${deadline}"><span>You can reapply in</span><strong>${formatCountdown(deadline - Date.now())}</strong><small>${escapeHtml(new Date(deadline).toLocaleString())}</small></div>`;
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

  function renderApplicationStatus(payload) {
    questions = payload.questions || questions;
    canApply = Boolean(payload.canApply);
    const countdown = payload.latest?.status === 'denied' ? reapplyCountdownMarkup(payload.deniedUntil) : '';
    statusCard.innerHTML = `<p><strong>${escapeHtml(statusCopy(payload))}</strong></p>${countdown}`;
    if (canApply && !questionsMount.children.length) {
      questionsMount.innerHTML = questions.map((question, index) => (
        `<section class="pcso-quiz-question" data-question-index="${index}" hidden><div class="pcso-quiz-question-number">${String(index + 1).padStart(2, '0')}</div><label><span>${escapeHtml(plainPrompt(question.prompt))}</span>${promptInput(question)}</label></section>`
      )).join('');
    }
    if (!canApply && !testActive) form.hidden = true;
  }

  async function refreshApplicationStatus() {
    if (!authenticated || testActive) return;
    const payload = await portal('status');
    renderApplicationStatus(payload);
  }

  function showQuestion(index) {
    currentQuestion = Math.max(0, Math.min(index, questions.length - 1));
    questionsMount.querySelectorAll('[data-question-index]').forEach((element) => {
      element.hidden = Number(element.dataset.questionIndex) !== currentQuestion;
    });
    document.querySelector('[data-apply-progress]').textContent = `Question ${currentQuestion + 1}`;
    document.querySelector('[data-apply-progress-count]').textContent = `of ${questions.length}`;
    const progressBar = document.querySelector('[data-apply-progress-bar]');
    if (progressBar) progressBar.style.width = `${((currentQuestion + 1) / questions.length) * 100}%`;
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
    renderApplicationStatus(payload);
    window.setInterval(() => {
      void refreshApplicationStatus().catch(() => {});
    }, 15_000);
    window.setInterval(() => {
      const countdown = statusCard.querySelector('[data-reapply-countdown]');
      if (!countdown) return;
      const remaining = Number(countdown.dataset.deadline) - Date.now();
      if (remaining <= 0) {
        countdown.remove();
        void refreshApplicationStatus().catch(() => {});
        return;
      }
      countdown.querySelector('strong').textContent = formatCountdown(remaining);
    }, 1_000);
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
