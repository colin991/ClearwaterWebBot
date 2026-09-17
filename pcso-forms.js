window.submitPcsoForm = async function submitPcsoForm(kind, fields) {
  const response = await fetch('/api/pcso/forms', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, fields }),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) {
    throw new Error(payload.error || 'Sign in with Discord first.');
  }
  if (!response.ok) {
    throw new Error(payload.error || 'The form could not be submitted.');
  }
  return payload;
};

function bindForm(form, kind, getFields) {
  if (!form) return;
  const status = form.querySelector('[data-form-status]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;
    if (status) status.textContent = 'Submitting…';
    try {
      const payload = await window.submitPcsoForm(kind, getFields(form));
      form.reset();
      const pin = form.querySelector('[data-map-pin]');
      if (pin) pin.hidden = true;
      if (status) status.textContent = payload.message || 'Submitted.';
    } catch (error) {
      if (status) status.textContent = error.message || 'Could not submit.';
    } finally {
      if (button) button.disabled = false;
    }
  });
}

function bindMapPicker() {
  const picker = document.querySelector('[data-map-picker]');
  if (!picker) return;
  const pin = picker.querySelector('[data-map-pin]');
  const leftInput = document.querySelector('input[name="mapLeft"]');
  const topInput = document.querySelector('input[name="mapTop"]');
  const hint = document.querySelector('[data-map-hint]');
  picker.addEventListener('click', (event) => {
    const img = picker.querySelector('img');
    const rect = img.getBoundingClientRect();
    const left = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const top = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    if (leftInput) leftInput.value = String(left);
    if (topInput) topInput.value = String(top);
    if (pin) {
      pin.hidden = false;
      pin.style.left = `${left * 100}%`;
      pin.style.top = `${top * 100}%`;
    }
    if (hint) hint.textContent = 'Location marked. Submit when the report is ready.';
  });
}

async function revealPublicRecordsForm() {
  const signin = document.querySelector('[data-records-signin]');
  const wrap = document.querySelector('[data-records-form-wrap]');
  if (!signin || !wrap) return;
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store' });
    const session = await response.json().catch(() => ({}));
    if (session.authenticated) {
      signin.hidden = true;
      wrap.hidden = false;
    }
  } catch {
    // keep sign-in
  }
}

bindMapPicker();
bindForm(document.querySelector('[data-police-report]'), 'police-report', (form) => {
  const data = new FormData(form);
  return {
    name: data.get('name'),
    incident: data.get('incident'),
    description: data.get('description'),
    mapLeft: data.get('mapLeft'),
    mapTop: data.get('mapTop'),
  };
});
bindForm(document.querySelector('[data-crime-stoppers]'), 'crime-stoppers', (form) => ({
  tip: new FormData(form).get('tip'),
}));
bindForm(document.querySelector('[data-complaint]'), 'complaint', (form) => {
  const data = new FormData(form);
  return {
    trooperName: data.get('trooperName'),
    badgeNumber: data.get('badgeNumber'),
    location: data.get('location'),
    reason: data.get('reason'),
    description: data.get('description'),
    witnesses: data.get('witnesses'),
  };
});
bindForm(document.querySelector('[data-public-records]'), 'public-records', (form) => {
  const data = new FormData(form);
  return {
    subjectType: data.get('subjectType'),
    subject: data.get('subject'),
    details: data.get('details'),
  };
});
void revealPublicRecordsForm();
