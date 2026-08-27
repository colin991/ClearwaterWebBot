const header = document.querySelector('[data-header]');
const menuButton = document.querySelector('.menu-button');
const navigation = document.querySelector('.site-nav');
const year = document.querySelector('[data-year]');
const discordLogin = document.querySelector('[data-discord-login]');
const discordAccount = document.querySelector('[data-discord-account]');
const discordAvatar = document.querySelector('[data-discord-avatar]');
const discordName = document.querySelector('[data-discord-name]');
const discordRank = document.querySelector('[data-discord-rank]');
const discordProfileMenuRank = document.querySelector('[data-discord-profile-menu-rank]');
const discordProfile = document.querySelector('[data-discord-profile]');
const discordProfileMenu = document.querySelector('[data-discord-profile-menu]');
const discordLogout = document.querySelector('[data-discord-logout]');
const discordCount = document.querySelectorAll('[data-discord-count]');
const ownerLink = document.querySelector('[data-owner-link]');
const serverManagementLinks = document.querySelectorAll('[data-server-management]');
const erlcCurrent = document.querySelectorAll('[data-erlc-current]');
const erlcMax = document.querySelectorAll('[data-erlc-max]');
const erlcQueue = document.querySelectorAll('[data-erlc-queue]');

const setLiveNumber = (element, display, numeric, offline) => {
  if (element.hasAttribute('data-aui-live')) {
    element.dataset.auiValue = offline ? '' : String(numeric);
    element.dataset.auiOffline = offline ? '1' : '';
    element.dispatchEvent(new Event('aui-value'));
    if (!element.classList.contains('aui-live-source')) {
      element.textContent = display;
    }
    return;
  }
  element.textContent = display;
};

const setErlcNumbers = (status) => {
  if (!status?.online) {
    erlcCurrent.forEach((element) => { setLiveNumber(element, '—', 0, true); });
    erlcMax.forEach((element) => { setLiveNumber(element, '—', 0, true); });
    erlcQueue.forEach((element) => { setLiveNumber(element, '—', 0, true); });
    return;
  }
  const currentPlayers = Number.isInteger(status?.currentPlayers) ? status.currentPlayers : 0;
  const maxPlayers = Number.isInteger(status?.maxPlayers) ? status.maxPlayers : 50;
  const queue = Number.isInteger(status?.queue) ? status.queue : 0;
  erlcCurrent.forEach((element) => { setLiveNumber(element, currentPlayers.toLocaleString(), currentPlayers, false); });
  erlcMax.forEach((element) => { setLiveNumber(element, maxPlayers.toLocaleString(), maxPlayers, false); });
  erlcQueue.forEach((element) => { setLiveNumber(element, queue.toLocaleString(), queue, false); });
};

const loadDirectErlcStatus = async () => {
  const response = await fetch('/api/erlc/status', { credentials: 'same-origin' });
  if (!response.ok) throw new Error('ER:LC status unavailable');
  const status = await response.json();
  if (!status.online) throw new Error('ER:LC server unavailable');
  setErlcNumbers(status);
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

const loadDiscordSession = async () => {
  if (!discordLogin || !discordAccount) return;
  try {
    const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!response.ok) return;
    const session = await response.json();
    if (!session.authenticated || !session.user) {
      return;
    }
    if (discordName) discordName.textContent = session.user.displayName || session.user.username;
    if (discordAvatar && session.user.avatarUrl) discordAvatar.src = session.user.avatarUrl;
    if (discordRank && session.user.staffRank) {
      discordRank.textContent = session.user.staffRank;
      discordRank.classList.add('is-visible');
      discordRank.removeAttribute('hidden');
    }
    if (discordProfileMenuRank && session.user.staffRank) {
      discordProfileMenuRank.textContent = session.user.staffRank;
      discordProfileMenuRank.classList.add('is-visible');
      discordProfileMenuRank.removeAttribute('hidden');
    }
    discordLogin.hidden = true;
    discordAccount.hidden = false;
    if (ownerLink && session.user.owner) {
      ownerLink.classList.add('is-visible');
      ownerLink.removeAttribute('hidden');
    }
    if (session.user.owner || session.user.serverManagement || session.user.staffPanel) {
      serverManagementLinks.forEach((link) => {
        link.classList.add('is-visible');
        link.removeAttribute('hidden');
      });
    }
  } catch {
    // Keep login available if session check fails.
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

if (window.history.replaceState && /[?&]login=/.test(window.location.search)) {
  window.history.replaceState({}, '', window.location.pathname + window.location.hash);
}

discordProfile?.addEventListener('click', () => {
  const canOpen = Boolean(
    (ownerLink && ownerLink.classList.contains('is-visible'))
    || (discordProfileMenuRank && discordProfileMenuRank.classList.contains('is-visible'))
    || [...serverManagementLinks].some((link) => link.classList.contains('is-visible'))
  );
  if (!canOpen) return;
  const open = discordProfile.getAttribute('aria-expanded') === 'true';
  discordProfile.setAttribute('aria-expanded', String(!open));
  if (discordProfileMenu) discordProfileMenu.hidden = open;
});

document.addEventListener('click', (event) => {
  if (!discordAccount?.contains(event.target)) {
    discordProfile?.setAttribute('aria-expanded', 'false');
    if (discordProfileMenu) discordProfileMenu.hidden = true;
  }
});

const setDiscordCount = (count) => {
  discordCount.forEach((element) => { element.textContent = count; });
};

const loadBotStatus = async () => {
  if (!discordCount.length && !erlcCurrent.length) return;
  try {
    const response = await fetch('/api/bot/status', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Status unavailable');
    const status = await response.json();
    if (!status.online) {
      await loadDirectErlcStatus();
      await loadDiscordMemberCount();
      return;
    }
    if (Number.isInteger(status.memberCount)) setDiscordCount(status.memberCount.toLocaleString());
    else await loadDiscordMemberCount();
    if (status.erlc?.online) {
      setErlcNumbers(status.erlc);
    } else {
      await loadDirectErlcStatus();
    }
  } catch {
    try {
      await loadDirectErlcStatus();
    } catch {
      setErlcNumbers({ online: false });
    }
    await loadDiscordMemberCount();
  }
};

const loadDiscordMemberCount = async () => {
  if (!discordCount.length) return;
  try {
    const response = await fetch('/api/discord/count', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Member count unavailable');
    const result = await response.json();
    if (Number.isInteger(result.memberCount)) setDiscordCount(result.memberCount.toLocaleString());
  } catch {
    // Bot status remains the fallback.
  }
};

loadBotStatus();
window.setInterval(loadBotStatus, 300_000);

const siteBannerDismissedId = () => {
  try { return localStorage.getItem('cw-site-banner-dismissed') || ''; } catch { return ''; }
};

const applySiteBanner = (banner) => {
  const root = document.querySelector('[data-site-banner]');
  if (!root) return;
  const message = document.querySelector('[data-site-banner-message]');
  const details = document.querySelector('[data-site-banner-details]');
  const link = document.querySelector('[data-site-banner-link]');
  const active = banner && banner.message && siteBannerDismissedId() !== String(banner.id || '');
  if (!active) {
    root.hidden = true;
    document.body.classList.remove('has-site-banner');
    document.body.style.removeProperty('--site-banner-height');
    return;
  }
  if (message) message.textContent = banner.message;
  if (details) {
    const detailText = String(banner.details || '').trim();
    details.textContent = detailText;
    details.hidden = !detailText || Boolean(banner.linkUrl);
  }
  if (link) {
    if (banner.linkUrl) {
      link.hidden = false;
      link.href = banner.linkUrl;
      link.textContent = banner.linkLabel || 'Learn more';
    } else {
      link.hidden = true;
      link.removeAttribute('href');
    }
  }
  root.dataset.bannerId = String(banner.id || '');
  root.hidden = false;
  document.body.classList.add('has-site-banner');
  requestAnimationFrame(() => {
    document.body.style.setProperty('--site-banner-height', `${Math.max(36, root.offsetHeight)}px`);
  });
};

document.addEventListener('click', (event) => {
  if (event.target.closest('[data-site-banner-dismiss]')) {
    const root = document.querySelector('[data-site-banner]');
    try {
      if (root?.dataset.bannerId) localStorage.setItem('cw-site-banner-dismissed', root.dataset.bannerId);
    } catch {
      // Ignore storage failures.
    }
    applySiteBanner(null);
  }
});

const revealNodes = document.querySelectorAll('.reveal');
if (revealNodes.length) {
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -8% 0px' });
    revealNodes.forEach((node) => revealObserver.observe(node));
  } else {
    revealNodes.forEach((node) => node.classList.add('is-visible'));
  }
}
