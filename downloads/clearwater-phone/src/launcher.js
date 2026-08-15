const setupEl = document.getElementById('setup');
const welcomeEl = document.getElementById('welcome');
const accountStatus = document.getElementById('setup-account-status');
const loginBtn = document.getElementById('setup-login');

function setToggle(el, on) {
  if (!el) return;
  el.classList.toggle('is-on', on);
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function renderAccount(session) {
  const user = session?.user || session;
  if (session?.authenticated && user?.displayName) {
    if (accountStatus) accountStatus.textContent = `Signed in as ${user.displayName}`;
    if (loginBtn) loginBtn.textContent = 'Signed in';
  } else {
    if (accountStatus) accountStatus.textContent = 'Not signed in';
    if (loginBtn) loginBtn.textContent = 'Sign in with Discord';
  }
}

let lastSession = { authenticated: false };

async function refreshSession() {
  try {
    const next = (await window.anchorPhone?.session?.()) || { authenticated: false };
    if (lastSession?.authenticated && next.authenticated === false) return lastSession;
    lastSession = next;
    renderAccount(next);
  } catch {
    if (lastSession?.authenticated) return lastSession;
    lastSession = { authenticated: false };
    renderAccount(lastSession);
  }
}

async function loadHost() {
  const host = (await window.anchorPhone?.hostSettings?.()) || {};
  setToggle(document.getElementById('setup-login-item'), host.startWithWindows === true);
  setToggle(document.getElementById('setup-watch-app'), host.launchOnApp !== false);
  const input = document.getElementById('setup-watch-process');
  if (input) input.value = host.watchProcess || 'RobloxPlayerBeta.exe';
  return host;
}

function showSetup(on) {
  if (setupEl) setupEl.hidden = !on;
  if (welcomeEl) welcomeEl.hidden = on;
}

document.getElementById('launch')?.addEventListener('click', async () => {
  const btn = document.getElementById('launch');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Launching…';
  }
  try {
    await window.anchorPhone?.launchOverlay?.();
  } catch {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Launch Phone';
    }
  }
});

document.getElementById('setup-finish')?.addEventListener('click', async () => {
  const btn = document.getElementById('setup-finish');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Launching…';
  }
  const processName = document.getElementById('setup-watch-process')?.value.trim() || 'RobloxPlayerBeta.exe';
  try {
    await window.anchorPhone?.saveHostSettings?.({
      setupComplete: true,
      watchProcess: processName,
      startWithWindows: document.getElementById('setup-login-item')?.classList.contains('is-on') === true,
      launchOnApp: document.getElementById('setup-watch-app')?.classList.contains('is-on') !== false,
    });
    await window.anchorPhone?.launchOverlay?.();
  } catch {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Finish and launch';
    }
  }
});

document.getElementById('quit')?.addEventListener('click', () => {
  window.anchorPhone?.quit?.();
});
document.getElementById('setup-quit')?.addEventListener('click', () => {
  window.anchorPhone?.quit?.();
});

document.getElementById('setup-login')?.addEventListener('click', async () => {
  if (accountStatus) accountStatus.textContent = 'Finish signing in in the window that opened, then return here.';
  await window.anchorPhone?.login?.();
  window.setTimeout(() => void refreshSession(), 2500);
});

document.getElementById('setup-login-item')?.addEventListener('click', async () => {
  const on = !document.getElementById('setup-login-item').classList.contains('is-on');
  const host = await window.anchorPhone?.saveHostSettings?.({ startWithWindows: on });
  setToggle(document.getElementById('setup-login-item'), host?.startWithWindows === true);
});

document.getElementById('setup-watch-app')?.addEventListener('click', async () => {
  const on = !document.getElementById('setup-watch-app').classList.contains('is-on');
  const host = await window.anchorPhone?.saveHostSettings?.({ launchOnApp: on });
  setToggle(document.getElementById('setup-watch-app'), host?.launchOnApp !== false);
});

window.anchorPhone?.onAuth?.((payload) => {
  const next = payload && typeof payload === 'object' ? payload : { authenticated: false };
  if (lastSession?.authenticated && next.authenticated === false) return;
  lastSession = next;
  renderAccount(next);
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') event.preventDefault();
});

void (async () => {
  const host = await loadHost();
  showSetup(host.setupComplete !== true);
  await refreshSession();
})();
