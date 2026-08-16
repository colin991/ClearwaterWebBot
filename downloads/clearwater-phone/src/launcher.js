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
      launchOnApp: true,
      startWithWindows: false,
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

document.getElementById('setup-next-1')?.addEventListener('click', () => setSetupStep(2));
document.getElementById('setup-next-2')?.addEventListener('click', () => setSetupStep(3));
document.getElementById('setup-back-2')?.addEventListener('click', () => setSetupStep(1));
document.getElementById('setup-back-3')?.addEventListener('click', () => setSetupStep(2));

document.querySelectorAll('[data-phone-model]').forEach((card) => {
  card.addEventListener('click', () => selectPhoneModel(card.dataset.phoneModel));
});

document.querySelectorAll('.wallpaper-swatch[data-wallpaper]').forEach((swatch) => {
  swatch.addEventListener('click', () => selectWallpaper(swatch.dataset.wallpaper));
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
