const denied = document.querySelector('[data-coming-soon-denied]');
const params = new URLSearchParams(location.search);

if (params.get('denied') === '1' && denied) {
  denied.hidden = false;
}

fetch('/api/auth/me', { credentials: 'same-origin' })
  .then((response) => (response.ok ? response.json() : null))
  .then((session) => {
    if (session?.siteAccess === true && session?.authenticated === true) {
      location.replace('/');
    }
  })
  .catch(() => {});
