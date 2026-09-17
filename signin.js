const form = document.querySelector('[data-signin-form]');
const agree = document.querySelector('[data-legal-agree]');
const submit = document.querySelector('[data-signin-submit]');

function safeNextPath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /^[a-z]+:/i.test(raw)) return '';
  const path = (raw.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
  if (path === '/internet.html') return '/internet';
  if (path === '/admin.html') return '/admin';
  if (path === '/public-records.html') return '/public-records';
  if (path === '/complaint.html') return '/complaint';
  if (path === '/police-report.html') return '/police-report';
  if (path === '/contact.html') return '/contact';
  if (path === '/careers.html') return '/careers';
  if (path === '/jail.html') return '/jail';
  if (path === '/active-calls.html') return '/active-calls';
  const allowed = new Set([
    '/', '/internet', '/admin', '/news', '/events', '/public-records', '/complaint',
    '/police-report', '/contact', '/careers', '/jail', '/active-calls',
  ]);
  if (allowed.has(path)) return path;
  if (/^\/internet\/(post|member|sponsored)\/[A-Za-z0-9._-]{1,120}$/.test(path)) return path;
  if (/^\/internet\/(messages|notifications|settings|profile|wallet|staff|sponsored)$/.test(path)) return path;
  return '';
}

const destination = safeNextPath(new URLSearchParams(location.search).get('next') || '');

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
