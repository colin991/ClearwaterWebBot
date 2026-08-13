(() => {
  const path = location.pathname.replace(/\.html$/i, '') || '/';
  const publicPaths = new Set(['/coming-soon', '/signin', '/terms', '/privacy']);
  if (publicPaths.has(path)) {
    document.documentElement.classList.add('site-public');
    return;
  }

  const unlock = () => document.documentElement.classList.add('site-unlocked');

  fetch('/api/auth/me', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((session) => {
      if (session?.siteAccess === true && session?.authenticated === true) {
        unlock();
        return;
      }
      const denied = session?.denied === true ? '?denied=1' : '';
      location.replace(`/coming-soon${denied}`);
    })
    .catch(() => {
      location.replace('/coming-soon');
    });
})();
