const form = document.querySelector('[data-signin-form]');
const agree = document.querySelector('[data-legal-agree]');
const submit = document.querySelector('[data-signin-submit]');
const errorNote = document.querySelector('[data-signin-error]');

function safeNextPath(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\') || /^[a-z]+:/i.test(raw)) return '';
  const path = (raw.split('?')[0].split('#')[0] || '/').replace(/\/+$/, '') || '/';
  if (path === '/owner.html') return '/owner';
  if (path === '/server-management.html') return '/server-management';
  if (path === '/internet' || path === '/internet.html' || path.startsWith('/internet/') || path.startsWith('/profiles/')) {
    return '/';
  }
  if (
    path === '/'
    || path === '/owner'
    || path === '/server-management'
    || path === '/departments'
    || path === '/docs'
    || path === '/phone-signed-in'
  ) return path;
  return '';
}

const params = new URLSearchParams(location.search);
const destination = safeNextPath(params.get('next') || '');

if (params.get('error') === 'membership' && errorNote) {
  errorNote.hidden = false;
  errorNote.textContent = 'You must be a member of the Clearwater Roleplay Discord server to sign in.';
}
if (params.get('error') === 'vpn' && errorNote) {
  errorNote.hidden = false;
  errorNote.textContent = 'VPNs and proxies are not allowed. Turn off your VPN, then sign in again.';
}

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
