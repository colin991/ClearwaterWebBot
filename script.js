const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.site-nav');
const year = document.querySelector('[data-year]');
const updatedTime = document.querySelector('[data-time]');
const discordLogin = document.querySelector('[data-discord-login]');
const discordAccount = document.querySelector('[data-discord-account]');
const discordAvatar = document.querySelector('[data-discord-avatar]');
const discordName = document.querySelector('[data-discord-name]');
const discordRank = document.querySelector('[data-discord-rank]');
const discordProfile = document.querySelector('[data-discord-profile]');
const discordProfileMenu = document.querySelector('[data-discord-profile-menu]');
const discordLogout = document.querySelector('[data-discord-logout]');
const discordCount = document.querySelector('[data-discord-count]');
const botConnection = document.querySelector('[data-bot-connection]');
const botActionButton = document.querySelector('[data-bot-action]');
const botActionResult = document.querySelector('[data-bot-action-result]');
const ownerLink = document.querySelector('[data-owner-link]');
const erlcStatus = document.querySelector('[data-erlc-status]');
const erlcLabel = document.querySelector('[data-erlc-label]');
const erlcCurrent = document.querySelectorAll('[data-erlc-current]');
const erlcMax = document.querySelectorAll('[data-erlc-max]');
const erlcQueue = document.querySelectorAll('[data-erlc-queue]');

const setErlcNumbers = (status) => {
  if (!status?.online) {
    erlcCurrent.forEach((element) => { element.textContent = '—'; });
    erlcMax.forEach((element) => { element.textContent = '—'; });
    erlcQueue.forEach((element) => { element.textContent = '—'; });
    if (erlcStatus) {
      erlcStatus.classList.add('offline');
      erlcStatus.setAttribute('aria-label', 'ER:LC server status unavailable');
    }
    if (erlcLabel) erlcLabel.textContent = 'Server status unavailable';
    return;
  }

  const currentPlayers = Number.isInteger(status?.currentPlayers) ? status.currentPlayers : 0;
  const maxPlayers = Number.isInteger(status?.maxPlayers) ? status.maxPlayers : 50;
  const queue = Number.isInteger(status?.queue) ? status.queue : 0;

  erlcCurrent.forEach((element) => { element.textContent = currentPlayers.toLocaleString(); });
  erlcMax.forEach((element) => { element.textContent = maxPlayers.toLocaleString(); });
  erlcQueue.forEach((element) => { element.textContent = queue.toLocaleString(); });
  if (erlcStatus) {
    erlcStatus.classList.remove('offline');
    erlcStatus.setAttribute(
      'aria-label',
      `ER:LC server online with ${currentPlayers} of ${maxPlayers} players`
    );
  }
  if (erlcLabel) erlcLabel.textContent = 'Server online';
};

const loadDirectErlcStatus = async () => {
  const response = await fetch('/api/erlc/status');
  if (!response.ok) throw new Error('ER:LC status unavailable');
  const status = await response.json();
  if (!status.online) throw new Error('ER:LC server unavailable');
  setErlcNumbers(status);
  if (updatedTime) {
    const timestamp = new Date(status.updatedAt || Date.now());
    updatedTime.textContent = `Updated ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
};

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
if (updatedTime) updatedTime.textContent = 'Checking ER:LC…';

const loadDiscordSession = async () => {
  if (!discordLogin || !discordAccount) return;

  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) return;

    const session = await response.json();
    if (!session.authenticated || !session.user) return;

    if (discordName) discordName.textContent = session.user.displayName || session.user.username;
    if (discordAvatar && session.user.avatarUrl) discordAvatar.src = session.user.avatarUrl;
    if (discordRank && session.user.staffRank) {
      discordRank.textContent = session.user.staffRank;
      discordRank.hidden = false;
    }
    discordLogin.hidden = true;
    discordAccount.hidden = false;
    if (ownerLink && session.user.owner) {
      ownerLink.hidden = false;
    }
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

discordProfile?.addEventListener('click', () => {
  if (!ownerLink || ownerLink.hidden) return;
  const isOpen = discordProfile.getAttribute('aria-expanded') === 'true';
  discordProfile.setAttribute('aria-expanded', String(!isOpen));
  if (discordProfileMenu) discordProfileMenu.hidden = isOpen;
});

document.addEventListener('click', (event) => {
  if (!discordAccount?.contains(event.target)) {
    discordProfile?.setAttribute('aria-expanded', 'false');
    if (discordProfileMenu) discordProfileMenu.hidden = true;
  }
});

const loadBotStatus = async () => {
  if (!discordCount || !botConnection) return;

  try {
    const response = await fetch('/api/bot/status');
    if (!response.ok) throw new Error('Status unavailable');
    const status = await response.json();

    if (!status.online) {
      botConnection.textContent = 'Live data unavailable';
      await loadDirectErlcStatus();
      return;
    }

    botConnection.textContent = Number.isFinite(status.latencyMs)
      ? `Discord bot online · ${status.latencyMs}ms`
      : 'Discord bot online';
    if (Number.isInteger(status.memberCount)) discordCount.textContent = status.memberCount.toLocaleString();
    if (status.erlc) {
      setErlcNumbers(status.erlc);
      if (updatedTime) {
        const updatedAt = status.erlc.updatedAt || status.updatedAt;
        const timestamp = updatedAt ? new Date(updatedAt) : new Date();
        updatedTime.textContent = `Updated ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      }
    }
  } catch {
    try {
      await loadDirectErlcStatus();
      botConnection.textContent = 'Live ER:LC data connected';
    } catch {
      botConnection.textContent = 'Live data unavailable';
      setErlcNumbers({ online: false });
      if (updatedTime) updatedTime.textContent = 'ER:LC status unavailable';
    }
  }
};

loadBotStatus();
window.setInterval(loadBotStatus, 60_000);

botActionButton?.addEventListener('click', async () => {
  botActionButton.disabled = true;
  if (botActionResult) botActionResult.textContent = 'Contacting bot…';

  try {
    const response = await fetch('/api/bot/action', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ping' }),
    });
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || 'Bot unavailable');

    if (botActionResult) botActionResult.textContent = 'Bot responded successfully.';
    await loadBotStatus();
  } catch {
    if (botActionResult) botActionResult.textContent = 'The bot did not respond.';
  } finally {
    botActionButton.disabled = false;
  }
});

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
