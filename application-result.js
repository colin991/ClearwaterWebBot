async function applicationStatus() {
  const response = await fetch('/api/pcso/portal', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'application', action: 'status' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Your result could not be loaded.');
  return payload;
}

async function bootApplicationResult() {
  const copy = document.querySelector('[data-result-copy]');
  const signIn = document.querySelector('[data-result-signin]');
  const reveal = document.querySelector('[data-result-reveal]');
  const outcome = document.querySelector('[data-result-outcome]');
  try {
    const sessionResponse = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
    if (!sessionResponse.ok) return;
    const session = await sessionResponse.json().catch(() => ({}));
    if (!session.authenticated) return;
    signIn.hidden = true;
    const payload = await applicationStatus();
    const application = payload.latest;
    if (!application) {
      copy.textContent = 'You do not have an application result yet.';
      return;
    }
    if (application.status === 'pending') {
      copy.textContent = 'Your application is still under command review. Check back soon.';
      return;
    }
    if (!['approved', 'denied'].includes(application.status)) {
      copy.textContent = `Application status: ${application.status}.`;
      return;
    }
    copy.textContent = 'Command staff has completed its review. Your result is concealed below.';
    reveal.hidden = false;
    reveal.addEventListener('click', () => {
      reveal.hidden = true;
      outcome.hidden = false;
      outcome.className = `pcso-result-outcome is-${application.status}`;
      outcome.innerHTML = application.status === 'approved'
        ? '<p>Application accepted</p><h2>Welcome to PCSO</h2><p>Your department role has been assigned. Complete your training and ride-along as directed by command staff.</p>'
        : '<p>Application denied</p><h2>Not accepted this time</h2><p>Your three-day waiting period is shown below.</p><div class="pcso-result-countdown" data-result-countdown></div><a class="pcso-button pcso-button-muted" href="/careers" data-result-reapply hidden>Apply again</a>';
      localStorage.setItem(`pcso-application-result-${application.id}`, 'revealed');
      if (application.status === 'denied') startReapplyCountdown(payload.reapplyAt, outcome);
    }, { once: true });
  } catch (error) {
    copy.textContent = error.message || 'Your result could not be loaded.';
  }
}

function formatCountdown(milliseconds) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m ${seconds % 60}s`;
}

function startReapplyCountdown(reapplyAt, root) {
  const countdown = root.querySelector('[data-result-countdown]');
  const link = root.querySelector('[data-result-reapply]');
  const deadline = Date.parse(reapplyAt || '');
  const render = () => {
    const remaining = Number.isFinite(deadline) ? deadline - Date.now() : 0;
    if (remaining <= 0) {
      countdown.innerHTML = '<span>Reapplication available</span><strong>You can apply again now.</strong>';
      link.hidden = false;
      return false;
    }
    countdown.innerHTML = `<span>You can reapply in</span><strong>${formatCountdown(remaining)}</strong><small>${new Date(deadline).toLocaleString()}</small>`;
    return true;
  };
  if (!render()) return;
  const timer = window.setInterval(() => {
    if (!render()) window.clearInterval(timer);
  }, 1000);
}

void bootApplicationResult();
