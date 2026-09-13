const form = document.querySelector('[data-signin-form]');
const agree = document.querySelector('[data-legal-agree]');
const submit = document.querySelector('[data-signin-submit]');

function safeNextPath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /^[a-z]+:/i.test(raw)) return '';
  const path = (raw.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
  if (path === '/internet.html') return '/internet';
  if (path === '/owner.html') return '/owner';
  if (path === '/admin.html') return '/admin';
  if (path === '/' || path === '/internet' || path === '/owner' || path === '/admin') return path;
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
