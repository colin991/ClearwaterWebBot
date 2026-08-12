const form = document.querySelector('[data-signin-form]');
const agree = document.querySelector('[data-legal-agree]');
const submit = document.querySelector('[data-signin-submit]');
const next = new URLSearchParams(location.search).get('next') || '';
const allowed = new Set(['/', '/internet', '/internet.html', '/owner', '/owner.html']);
const destination = allowed.has(next) ? (next === '/internet.html' ? '/internet' : next === '/owner.html' ? '/owner' : next) : '';

function syncSubmitState() {
  submit.disabled = !agree.checked;
}

agree.addEventListener('change', syncSubmitState);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!agree.checked) return;

  const url = new URL('/api/auth/discord', location.origin);
  url.searchParams.set('agreed', '1');
  if (destination) url.searchParams.set('next', destination);
  location.href = url.toString();
});

syncSubmitState();
