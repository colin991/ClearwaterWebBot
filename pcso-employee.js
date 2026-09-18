const BRIEFS = {
  patrol: 'Regular Patrol Training is a placeholder course for now. Click Start training, run the scenario when it is written, then Start quiz.',
  srt: 'SRT Training is a placeholder course for now. Click Start training, run the team brief when it is written, then Start quiz.',
  teu: 'TEU Training is a placeholder course for now. Click Start training, run the traffic block when it is written, then Start quiz.',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function employeeRequest(action, payload = {}) {
  const isGet = action === 'bootstrap' || action === 'session';
  const url = isGet
    ? `/api/pcso/employee?${new URLSearchParams({ action, ...payload })}`
    : '/api/pcso/employee';
  const response = await fetch(url, {
    method: isGet ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: isGet ? undefined : { 'Content-Type': 'application/json' },
    body: isGet ? undefined : JSON.stringify({ action, ...payload }),
    cache: 'no-store',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || 'Employee request failed.');
  return body;
}

function setStatus(text) {
  const node = document.querySelector('[data-employee-status]');
  if (node) node.textContent = text || '';
}

function showSignedIn(on) {
  const signin = document.querySelector('[data-employee-signin]');
  if (signin) signin.hidden = on;
  const app = document.querySelector('[data-employee-app]');
  if (app && app.hasAttribute('hidden')) app.hidden = !on;
}

function renderSessionList(sessions) {
  const list = document.querySelector('[data-session-list]');
  if (!list) return;
  if (!sessions?.length) {
    list.innerHTML = '<p>No open sessions yet.</p>';
    return;
  }
  list.innerHTML = sessions.map((session) => `
    <article class="employee-session-card">
      <h3>${escapeHtml(session.typeLabel)}</h3>
      <p>Code <span class="employee-code">${escapeHtml(session.code)}</span> · ${escapeHtml(session.status)} · Instructor ${escapeHtml(session.createdBy?.name)}</p>
      <div class="employee-actions">
        <button type="button" class="pcso-button pcso-button-red" data-open-session="${escapeHtml(session.id)}">Open</button>
      </div>
    </article>
  `).join('');
}

function renderInstructor(session) {
  const board = document.querySelector('[data-instructor-board]');
  if (!board || !session?.stats) return;
  board.hidden = false;
  const rows = (session.stats.participants || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${row.submitted ? `${row.percent}%` : 'In progress'}</td>
      <td>${(row.missed || []).map((miss) => escapeHtml(miss.prompt)).join('<br>') || '—'}</td>
    </tr>
  `).join('');
  const top = (session.stats.topMissed || []).map((item, index) => `
    <article class="employee-missed">
      <p><strong>#${index + 1} missed ${item.count} time${item.count === 1 ? '' : 's'}</strong></p>
      <p>${escapeHtml(item.prompt)}</p>
      <p>${escapeHtml(item.explanation)}</p>
    </article>
  `).join('') || '<p>No missed questions yet.</p>';
  board.innerHTML = `
    <h3>Instructor board</h3>
    <p>Joined ${session.stats.joined} · Submitted ${session.stats.submitted} · Overall ${session.stats.overallPercent}%</p>
    <div class="admin-table-wrap">
      <table class="employee-table">
        <thead><tr><th>Trainee</th><th>Score</th><th>Missed</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3">Nobody has joined yet.</td></tr>'}</tbody>
      </table>
    </div>
    <h3>Top 5 most missed</h3>
    ${top}
  `;
}

function renderQuiz(session) {
  const form = document.querySelector('[data-quiz-form]');
  const result = document.querySelector('[data-quiz-result]');
  if (!form || !result) return;
  const joined = session.you?.joined;
  const quizOpen = session.status === 'quiz';
  const submitted = session.you?.submitted;
  form.hidden = !(joined && quizOpen && !submitted && session.quiz?.length);
  result.hidden = !submitted;
  if (form.hidden === false) {
    form.innerHTML = session.quiz.map((question, index) => `
      <fieldset>
        <legend>${index + 1}. ${escapeHtml(question.prompt)}</legend>
        ${(question.choices || []).map((choice, choiceIndex) => `
          <label>
            <input type="radio" name="${escapeHtml(question.id)}" value="${choiceIndex}" required />
            ${escapeHtml(choice)}
          </label>
        `).join('')}
      </fieldset>
    `).join('') + '<button class="pcso-button pcso-button-red" type="submit">Submit quiz</button>';
  }
  if (submitted) {
    const missed = (session.you.missed || []).map((item) => `
      <article class="employee-missed">
        <p><strong>${escapeHtml(item.prompt)}</strong></p>
        <p>Your answer: ${escapeHtml(item.picked)}</p>
        <p>Correct: ${escapeHtml(item.correct)}</p>
        <p>${escapeHtml(item.explanation)}</p>
      </article>
    `).join('') || '<p>You missed none of the questions.</p>';
    result.innerHTML = `<p>Your score: <strong>${session.you.percent}%</strong></p>${missed}`;
  }
}

function paintActiveSession(session) {
  const card = document.querySelector('[data-active-session]');
  if (!card || !session) return;
  card.hidden = false;
  sessionStorage.setItem('pcso-training-session', session.id);
  document.querySelector('[data-session-title]').textContent = session.typeLabel;
  document.querySelector('[data-session-code]').textContent = session.code;
  document.querySelector('[data-session-status]').textContent = `Status: ${session.status}`;
  document.querySelector('[data-training-brief]').textContent = BRIEFS[session.type] || BRIEFS.patrol;
  renderInstructor(session);
  renderQuiz(session);
}

async function loadSession(sessionId) {
  const data = await employeeRequest('session', { sessionId });
  paintActiveSession(data.session);
  return data.session;
}

function renderReports(reports) {
  const body = document.querySelector('[data-report-body]');
  if (!body) return;
  if (!reports?.length) {
    body.innerHTML = '<tr><td colspan="6">No training reports yet.</td></tr>';
    return;
  }
  body.innerHTML = reports.map((report) => `
    <tr>
      <td>${escapeHtml(report.trainee?.name)}</td>
      <td>${escapeHtml(report.typeLabel)} (${escapeHtml(report.sessionCode)})</td>
      <td>${report.percent}%</td>
      <td>${escapeHtml(report.status)}</td>
      <td>${report.api?.ok ? 'Sent' : (report.api?.reason === 'not_configured' ? 'PCSOERLCAPI not configured' : escapeHtml(report.api?.error || '—'))}</td>
      <td class="employee-actions">
        ${report.status === 'pending' ? `
          <button type="button" class="pcso-button pcso-button-red" data-decide="${escapeHtml(report.id)}" data-decision="approved">Approve</button>
          <button type="button" class="pcso-button pcso-button-red" data-decide="${escapeHtml(report.id)}" data-decision="denied">Deny</button>
        ` : ''}
      </td>
    </tr>
  `).join('');
}

async function bootEmployeePage() {
  const signin = document.querySelector('[data-employee-signin]');
  const app = document.querySelector('[data-employee-app]');
  if (!signin && !app) return;

  const me = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
    .then((response) => response.json())
    .catch(() => ({ authenticated: false }));
  if (!me.authenticated) {
    showSignedIn(false);
    return;
  }
  showSignedIn(true);

  let data;
  try {
    data = await employeeRequest('bootstrap');
    setStatus(`Signed in as ${data.viewer?.name || me.user?.displayName}. Open access is on until role IDs are set.`);
  } catch (error) {
    setStatus(error.message);
    return;
  }

  const department = document.querySelector('[data-department-viewer]');
  if (department) {
    department.textContent = `Logged in as ${data.viewer?.name || 'employee'}. Department tools will be added here.`;
  }

  renderSessionList(data.sessions);
  renderReports(data.reports);

  const params = new URLSearchParams(location.search);
  const saved = params.get('session') || sessionStorage.getItem('pcso-training-session');
  if (saved && document.querySelector('[data-active-session]')) {
    try { await loadSession(saved); } catch (error) { setStatus(error.message); }
  }

  document.querySelector('[data-create-training]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const type = new FormData(event.target).get('type');
    try {
      const result = await employeeRequest('create-session', { type });
      paintActiveSession(result.session);
      setStatus(`Session ${result.session.code} created.`);
      const list = await employeeRequest('bootstrap');
      renderSessionList(list.sessions);
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.querySelector('[data-join-training]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const code = new FormData(event.target).get('code');
    try {
      const result = await employeeRequest('join-session', { code });
      paintActiveSession(result.session);
      setStatus(`Joined ${result.session.code}.`);
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.querySelector('[data-start-training]')?.addEventListener('click', async () => {
    const sessionId = sessionStorage.getItem('pcso-training-session');
    try { paintActiveSession((await employeeRequest('start-training', { sessionId })).session); } catch (error) { setStatus(error.message); }
  });
  document.querySelector('[data-start-quiz]')?.addEventListener('click', async () => {
    const sessionId = sessionStorage.getItem('pcso-training-session');
    try { paintActiveSession((await employeeRequest('start-quiz', { sessionId })).session); } catch (error) { setStatus(error.message); }
  });
  document.querySelector('[data-review-quiz]')?.addEventListener('click', async () => {
    const sessionId = sessionStorage.getItem('pcso-training-session');
    try { paintActiveSession((await employeeRequest('review-quiz', { sessionId })).session); } catch (error) { setStatus(error.message); }
  });

  document.querySelector('[data-quiz-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const sessionId = sessionStorage.getItem('pcso-training-session');
    const answers = {};
    new FormData(event.target).forEach((value, key) => { answers[key] = Number(value); });
    try {
      paintActiveSession((await employeeRequest('submit-quiz', { sessionId, answers })).session);
      setStatus('Quiz submitted. Missed questions include the explanation.');
    } catch (error) {
      setStatus(error.message);
    }
  });

  document.querySelector('[data-session-list]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-open-session]');
    if (!button) return;
    try { await loadSession(button.getAttribute('data-open-session')); } catch (error) { setStatus(error.message); }
  });

  document.querySelector('[data-report-body]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-decide]');
    if (!button) return;
    try {
      await employeeRequest('decide-report', {
        reportId: button.getAttribute('data-decide'),
        decision: button.getAttribute('data-decision'),
      });
      const list = await employeeRequest('bootstrap');
      renderReports(list.reports);
      setStatus('Decision saved and sent to PCSOERLCAPI if that API URL is configured.');
    } catch (error) {
      setStatus(error.message);
    }
  });

  if (document.querySelector('[data-active-session]')) {
    window.setInterval(() => {
      const sessionId = sessionStorage.getItem('pcso-training-session');
      if (!sessionId) return;
      loadSession(sessionId).catch(() => {});
    }, 4000);
  }
}

bootEmployeePage();
