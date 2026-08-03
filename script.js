const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.site-nav');
const year = document.querySelector('[data-year]');
const updatedTime = document.querySelector('[data-time]');
const discordLogin = document.querySelector('[data-discord-login]');
const discordAccount = document.querySelector('[data-discord-account]');
const discordAvatar = document.querySelector('[data-discord-avatar]');
const discordName = document.querySelector('[data-discord-name]');
const discordLogout = document.querySelector('[data-discord-logout]');

const updateHeader = () => {
  header?.classList.toggle('scrolled', window.scrollY > 18);
};

updateHeader();
window.addEventListener('scroll', updateHeader, { passive: true });

menuButton?.addEventListener('click', () => {
  const isOpen = menuButton.getAttribute('aria-expanded') === 'true';
  menuButton.setAttribute('aria-expanded', String(!isOpen));
  navigation?.classList.toggle('open', !isOpen);
});

navigation?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    menuButton?.setAttribute('aria-expanded', 'false');
    navigation.classList.remove('open');
  });
});

if (year) year.textContent = new Date().getFullYear();
if (updatedTime) updatedTime.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

const loadDiscordSession = async () => {
  if (!discordLogin || !discordAccount) return;

  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) return;

    const session = await response.json();
    if (!session.authenticated || !session.user) return;

    if (discordName) discordName.textContent = session.user.displayName || session.user.username;
    if (discordAvatar && session.user.avatarUrl) discordAvatar.src = session.user.avatarUrl;
    discordLogin.hidden = true;
    discordAccount.hidden = false;
  } catch {
    // Keep the login button available if the session endpoint is unavailable.
  }
};

discordLogout?.addEventListener('click', async () => {
  discordLogout.disabled = true;

  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    window.location.href = '/';
  }
});

loadDiscordSession();

const reveals = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.1 }
  );
  reveals.forEach((element) => observer.observe(element));
} else {
  reveals.forEach((element) => element.classList.add('visible'));
}
