const setupEl = document.getElementById('setup');
const welcomeEl = document.getElementById('welcome');
const accountStatus = document.getElementById('setup-account-status');
const loginBtn = document.getElementById('setup-login');
const wallpaperPreview = document.getElementById('wallpaper-preview');

const PHONE_MODELS = new Set(['z', 'x']);
const WALLPAPERS = new Set(['gulf', 'midnight', 'ocean', 'ember', 'forest', 'violet']);

let setupStep = 1;
let phoneModel = 'z';
let wallpaperColor = 'gulf';
let startWithWindows = false;
let launchOnApp = true;
let watchProcess = 'RobloxPlayerBeta.exe';
let toggleShortcut = 'F8';

function setToggle(el, on) {
  if (!el) return;
  el.classList.toggle('is-on', on);
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

function showSetup(on) {
  if (setupEl) setupEl.hidden = !on;
  if (welcomeEl) welcomeEl.hidden = on;
}

function setSetupStep(step) {
  setupStep = step;
  document.querySelectorAll('[data-setup-step]').forEach((panel) => {
    const active = Number(panel.dataset.setupStep) === step;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
  document.querySelectorAll('[data-step-dot]').forEach((dot) => {
    const n = Number(dot.dataset.stepDot);
    dot.classList.toggle('is-active', n === step);
    dot.classList.toggle('is-done', n < step);
  });
}

function selectPhoneModel(model) {
  if (!PHONE_MODELS.has(model)) return;
  phoneModel = model;
  document.querySelectorAll('[data-phone-model]').forEach((card) => {
    const on = card.dataset.phoneModel === model;
    card.classList.toggle('is-selected', on);
    card.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}

function selectWallpaper(color) {
  if (!WALLPAPERS.has(color)) return;
  wallpaperColor = color;
  document.querySelectorAll('[data-wallpaper].wallpaper-swatch').forEach((swatch) => {
    const on = swatch.dataset.wallpaper === color;
    swatch.classList.toggle('is-selected', on);
    swatch.setAttribute('aria-checked', on ? 'true' : 'false');
  });
  if (wallpaperPreview) wallpaperPreview.dataset.wallpaper = color;
}

async function loadHost() {
  const host = (await window.anchorPhone?.hostSettings?.()) || {};
  if (PHONE_MODELS.has(host.phoneModel)) selectPhoneModel(host.phoneModel);
  else selectPhoneModel('z');
  if (WALLPAPERS.has(host.wallpaperColor)) selectWallpaper(host.wallpaperColor);
  else selectWallpaper('gulf');
  startWithWindows = host.startWithWindows === true;
  launchOnApp = host.launchOnApp !== false;
  watchProcess = host.watchProcess || 'RobloxPlayerBeta.exe';
  toggleShortcut = host.toggleShortcut || 'F8';
  setToggle(document.getElementById('setup-login-item'), startWithWindows);
  setToggle(document.getElementById('setup-watch-app'), launchOnApp);
  const watchInput = document.getElementById('setup-watch-process');
  if (watchInput) watchInput.value = watchProcess;
  const shortcutInput = document.getElementById('setup-toggle-shortcut');
  if (shortcutInput) shortcutInput.value = toggleShortcut;
  return host;
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
  try {
    await window.anchorPhone?.saveHostSettings?.({
      setupComplete: true,
      phoneModel,
      wallpaperColor,
      launchOnApp,
      startWithWindows,
      watchProcess: document.getElementById('setup-watch-process')?.value.trim() || watchProcess,
      toggleShortcut,
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

document.getElementById('setup-next-1')?.addEventListener('click', () => {
  if (!lastSession?.authenticated) {
    if (accountStatus) accountStatus.textContent = 'Sign in with Discord to continue.';
    return;
  }
  setSetupStep(2);
});
document.getElementById('setup-next-2')?.addEventListener('click', () => setSetupStep(3));
document.getElementById('setup-back-2')?.addEventListener('click', () => setSetupStep(1));
document.getElementById('setup-back-3')?.addEventListener('click', () => setSetupStep(2));

document.querySelectorAll('[data-phone-model]').forEach((card) => {
  card.addEventListener('click', () => selectPhoneModel(card.dataset.phoneModel));
});

document.querySelectorAll('.wallpaper-swatch[data-wallpaper]').forEach((swatch) => {
  swatch.addEventListener('click', () => selectWallpaper(swatch.dataset.wallpaper));
});

document.getElementById('setup-login-item')?.addEventListener('click', () => {
  startWithWindows = !startWithWindows;
  setToggle(document.getElementById('setup-login-item'), startWithWindows);
});
document.getElementById('setup-watch-app')?.addEventListener('click', () => {
  launchOnApp = !launchOnApp;
  setToggle(document.getElementById('setup-watch-app'), launchOnApp);
});

function acceleratorFromEvent(event) {
  if (['Shift', 'Control', 'Alt', 'Meta', 'OS'].includes(event.key)) return null;
  const parts = [];
  if (event.ctrlKey) parts.push('Control');
  if (event.altKey) parts.push('Alt');
  if (event.metaKey) parts.push('Command');
  if (event.shiftKey && !/^F\d{1,2}$/i.test(event.key)) parts.push('Shift');
  const key = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key;
  parts.push(key);
  return parts.join('+');
}

document.getElementById('setup-shortcut-capture')?.addEventListener('click', () => {
  const input = document.getElementById('setup-toggle-shortcut');
  const status = document.getElementById('setup-step3-status');
  if (input) input.value = 'Press a key…';
  if (status) {
    status.hidden = false;
    status.textContent = 'Press the key you want to show or hide the phone.';
  }
  const onKey = (event) => {
    event.preventDefault();
    const accel = acceleratorFromEvent(event);
    if (!accel) return;
    window.removeEventListener('keydown', onKey, true);
    toggleShortcut = accel;
    if (input) input.value = accel;
    if (status) status.textContent = `Show / hide is ${accel}.`;
  };
  window.addEventListener('keydown', onKey, true);
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
  setSetupStep(1);
  await refreshSession();
})();
