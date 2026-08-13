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
const discordProfileMenuRank = document.querySelector('[data-discord-profile-menu-rank]');
const discordProfile = document.querySelector('[data-discord-profile]');
const discordProfileMenu = document.querySelector('[data-discord-profile-menu]');
const discordLogout = document.querySelector('[data-discord-logout]');
const discordCount = document.querySelectorAll('[data-discord-count]');
const botConnection = document.querySelectorAll('[data-bot-connection]');
const ownerLink = document.querySelector('[data-owner-link]');
const erlcCurrent = document.querySelectorAll('[data-erlc-current]');
const erlcMax = document.querySelectorAll('[data-erlc-max]');
const erlcQueue = document.querySelectorAll('[data-erlc-queue]');
let homepageInternetReady = false;
let homepageSignedIn = false;

const setErlcNumbers = (status) => {
  if (!status?.online) {
    erlcCurrent.forEach((element) => { element.textContent = '—'; });
    erlcMax.forEach((element) => { element.textContent = '—'; });
    erlcQueue.forEach((element) => { element.textContent = '—'; });
    return;
  }
  const currentPlayers = Number.isInteger(status?.currentPlayers) ? status.currentPlayers : 0;
  const maxPlayers = Number.isInteger(status?.maxPlayers) ? status.maxPlayers : 50;
  const queue = Number.isInteger(status?.queue) ? status.queue : 0;
  erlcCurrent.forEach((element) => { element.textContent = currentPlayers.toLocaleString(); });
  erlcMax.forEach((element) => { element.textContent = maxPlayers.toLocaleString(); });
  erlcQueue.forEach((element) => { element.textContent = queue.toLocaleString(); });
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
    if (!session.authenticated || !session.user) {
      homepageSignedIn = false;
      homepageInternetReady = true;
      return;
    }
    if (discordName) discordName.textContent = session.user.displayName || session.user.username;
    if (discordAvatar && session.user.avatarUrl) discordAvatar.src = session.user.avatarUrl;
    if (discordRank && session.user.staffRank) {
      discordRank.textContent = session.user.staffRank;
      discordRank.hidden = false;
    }
    if (discordProfileMenuRank && session.user.staffRank) {
      discordProfileMenuRank.textContent = session.user.staffRank;
      discordProfileMenuRank.hidden = false;
    }
    discordLogin.hidden = true;
    discordAccount.hidden = false;
    homepageSignedIn = true;
    homepageInternetReady = true;
    if (ownerLink && session.user.owner) ownerLink.hidden = false;
    void loadWalletBalance();
  } catch {
    // Keep login available if session check fails.
  }
};

const cashAmount = document.querySelector('[data-cash-amount]');
const cashBalance = document.querySelector('[data-cash-balance]');

const setCashBalance = (balance) => {
  const amount = Math.trunc(Number(balance) || 0);
  const label = `C$${amount.toLocaleString()}`;
  if (cashAmount) cashAmount.textContent = label;
  if (cashBalance) cashBalance.setAttribute('aria-label', `Clearwater credits balance: ${label}`);
};

const loadWalletBalance = async () => {
  if (!cashAmount) return;
  try {
    const response = await fetch('/api/internet', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'wallet' }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Wallet unavailable');
    setCashBalance(result.wallet?.balance);
  } catch {
    // Keep the chip visible if the bot host is briefly unavailable.
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
  if (ownerLink?.hidden && discordProfileMenuRank?.hidden) return;
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

const setBotConnection = (text) => {
  botConnection.forEach((element) => { element.textContent = text; });
};

const setDiscordCount = (count) => {
  discordCount.forEach((element) => { element.textContent = count; });
};

const loadBotStatus = async () => {
  if (!discordCount.length || !botConnection.length) return;
  try {
    const response = await fetch('/api/bot/status');
    if (!response.ok) throw new Error('Status unavailable');
    const status = await response.json();
    if (!status.online) {
      setBotConnection('Live data unavailable');
      await loadDirectErlcStatus();
      return;
    }
    setBotConnection(Number.isFinite(status.latencyMs)
      ? `Discord bot online · ${status.latencyMs}ms`
      : 'Discord bot online');
    if (Number.isInteger(status.memberCount)) setDiscordCount(status.memberCount.toLocaleString());
    if (status.erlc?.online) {
      setErlcNumbers(status.erlc);
      if (updatedTime) {
        const updatedAt = status.erlc.updatedAt || status.updatedAt;
        const timestamp = updatedAt ? new Date(updatedAt) : new Date();
        updatedTime.textContent = `Updated ${timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
      }
    } else {
      await loadDirectErlcStatus();
    }
  } catch {
    try {
      await loadDirectErlcStatus();
      setBotConnection('Live ER:LC data connected');
    } catch {
      setBotConnection('Live data unavailable');
      setErlcNumbers({ online: false });
      if (updatedTime) updatedTime.textContent = 'ER:LC status unavailable';
    }
  }
};

const loadDiscordMemberCount = async () => {
  if (!discordCount.length) return;
  try {
    const response = await fetch('/api/discord/count');
    if (!response.ok) throw new Error('Member count unavailable');
    const result = await response.json();
    if (Number.isInteger(result.memberCount)) setDiscordCount(result.memberCount.toLocaleString());
  } catch {
    // Bot status remains the fallback.
  }
};

loadBotStatus();
loadDiscordMemberCount();
window.setInterval(loadBotStatus, 60_000);
window.setInterval(loadDiscordMemberCount, 60_000);

const goToInternet = () => {
  if (!homepageSignedIn) {
    window.location.href = '/signin?next=/internet';
    return;
  }
  document.documentElement.classList.add('leaving-for-internet');
  window.setTimeout(() => {
    window.location.href = '/internet';
  }, 220);
};

document.querySelectorAll('a[href="/internet"]').forEach((link) => {
  link.addEventListener('click', async (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.target === '_blank') return;
    event.preventDefault();
    if (!homepageInternetReady) {
      try {
        const response = await fetch('/api/auth/me', { credentials: 'same-origin' });
        const session = await response.json();
        homepageSignedIn = Boolean(session.authenticated && session.user);
      } catch {
        homepageSignedIn = false;
      }
      homepageInternetReady = true;
    }
    goToInternet();
  });
});
