(() => {
  const path = location.pathname.replace(/\.html$/i, '') || '/';
  const publicPaths = new Set([
    '/',
    '/coming-soon',
    '/signin',
    '/terms',
    '/privacy',
    '/departments',
  ]);
  const unlock = () => document.documentElement.classList.add('site-unlocked');

  if (publicPaths.has(path)) {
    document.documentElement.classList.add('site-public');
    unlock();
    return;
  }

  // Clearwater Internet and tools: any signed-in Discord member (not staff-only).
  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((session) => {
      if (session?.authenticated === true && session?.siteAccess === true) {
        unlock();
        return;
      }
      const next = encodeURIComponent(`${path}${location.search || ''}`);
      if (session?.denied === true) {
        location.replace(`/signin?error=membership&next=${next}`);
        return;
      }
      location.replace(`/signin?next=${next}`);
    })
    .catch(() => {
      const next = encodeURIComponent(`${path}${location.search || ''}`);
      location.replace(`/signin?next=${next}`);
    });
})();
