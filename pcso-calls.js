async function loadCalls() {
  const status = document.querySelector('[data-calls-status]');
  const list = document.querySelector('[data-calls-list]');
  try {
    const response = await fetch('/api/pcso/calls', { cache: 'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Active calls could not be loaded.');
    const calls = payload.calls || [];
    status.textContent = payload.message || (calls.length ? `${calls.length} active call(s).` : 'No active calls.');
    list.innerHTML = calls.map((call) => (
      `<article class="pcso-call-card">
        <h3>${call.title || 'Call'}</h3>
        <p>${call.code || ''} ${call.status || ''}</p>
        <p>${call.location || ''}</p>
        <p>${(call.units || []).join(', ')}</p>
      </article>`
    )).join('');
  } catch (error) {
    if (status) status.textContent = error.message;
  }
}

loadCalls();
