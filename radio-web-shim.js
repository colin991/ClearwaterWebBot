'use strict';

/**
 * Web radio (cwpcso.com/radio): runs the desktop radio's own screen and code (radio.js) in a browser.
 * This stands in for the Electron bridge (window.radioApp): settings live in localStorage, Discord
 * sign-in is the website's, and the relay address comes from /api/bot/radio. It also scales the
 * handheld to fit a phone and adds a big hold-to-talk bar under it.
 */
(() => {
  const STORE = 'cw-radio-web';
  const RADIO_W = 232;
  const RADIO_H = 620;
  const listeners = { ptt: [], pttBound: [], update: [] };
  let session = null;

  const load = () => {
    try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; }
  };
  const store = (patch) => {
    try {
      const next = { ...load(), ...patch };
      // The key and relay address come fresh from the website each visit.
      delete next.key;
      delete next.webRelay;
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch { /* private mode: settings last for this visit */ }
  };

  async function fetchSession() {
    const response = await fetch('/api/bot/radio', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) return { signIn: true };
    if (!response.ok || !body.key || !body.url) return { error: body.error || 'The radio is offline right now.' };
    return body;
  }

  /* ---------- page around the radio ---------- */

  const discordIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 5.2A19.1 19.1 0 0 0 15.6 4l-.3.6c1.8.4 2.7.9 3.8 1.6-1.6-.8-3.2-1.3-5-1.6-.9-.1-1.8-.1-2.7 0-1.8.3-3.4.8-5 1.6 1.1-.7 2.2-1.2 3.8-1.6L9.9 4A19.2 19.2 0 0 0 5.2 5.2C2.4 9.3 1.7 13.3 2 17.2A19.5 19.5 0 0 0 8 20l.8-1.1a12.7 12.7 0 0 1-1.3-.6l.3-.2c2.6 1.2 5.4 1.2 8 0l.3.2c-.4.3-.8.5-1.3.7L17.5 20a19.4 19.4 0 0 0 6-2.8c.5-4.3-.4-8.2-3.2-12zm-11 9.6c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7m5.4 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7"/></svg>';

  // Move the handheld into a stage that scales it to the screen.
  const stage = document.createElement('div');
  stage.className = 'web-stage';
  const frame = document.createElement('div');
  frame.className = 'web-frame';
  stage.appendChild(frame);
  for (const node of [...document.body.children]) {
    if (node.tagName !== 'SCRIPT') frame.appendChild(node);
  }
  const header = document.createElement('header');
  header.className = 'web-top';
  header.innerHTML = '<img src="assets/clearwater-logo.png" alt="" draggable="false"><div><strong>Clearwater Radio</strong><span id="webWho">Clearwater Roleplay</span></div>';
  const ptt = document.createElement('button');
  ptt.type = 'button';
  ptt.className = 'web-ptt';
  ptt.textContent = 'HOLD TO TALK';
  const gate = document.createElement('section');
  gate.className = 'web-gate';
  gate.hidden = true;
  document.body.prepend(header, stage, ptt, gate);
  document.body.classList.add('web');

  function fit() {
    const width = window.innerWidth - 16;
    const height = window.innerHeight - header.offsetHeight - ptt.offsetHeight - 28;
    // SIZE on the radio's menu shrinks it below the fitted size.
    const size = Math.min(100, Math.max(50, Number(load().size) || 100)) / 100;
    const scale = Math.max(0.6, Math.min(width / RADIO_W, height / RADIO_H, 1.8)) * size;
    frame.style.transform = `scale(${scale})`;
    stage.style.width = `${Math.round(RADIO_W * scale)}px`;
    stage.style.height = `${Math.round(RADIO_H * scale)}px`;
  }
  window.addEventListener('resize', fit);
  fit();

  function showGate(html) {
    gate.innerHTML = `<div class="web-card">${html}</div>`;
    gate.hidden = false;
  }

  function waitForGate() {
    return new Promise((resolve) => {
      if (new URLSearchParams(window.location.search).has('off')) {
        showGate('<h1>Radio off</h1><p>The radio turned itself off.</p><button type="button" class="web-power">Turn on radio</button>');
        gate.querySelector('button').onclick = () => window.location.replace('/radio');
        return;
      }
      const attempt = async () => {
        let result;
        try {
          result = await fetchSession();
        } catch {
          result = { error: 'Could not reach the website. Check your connection.' };
        }
        if (result.signIn) {
          showGate(`<h1>Clearwater Radio</h1><p>Sign in with the Discord account you use in the Clearwater server.</p>
            <a class="web-discord" href="/api/auth/discord?agreed=1&amp;next=%2Fradio">${discordIcon}Sign in with Discord</a>
            <p class="web-fine">By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>`);
          return;
        }
        if (result.error) {
          showGate(`<h1>Radio offline</h1><p></p><button type="button" class="web-power">Try again</button>`);
          gate.querySelector('p').textContent = result.error;
          gate.querySelector('button').onclick = () => { void attempt(); };
          return;
        }
        if (typeof AudioEncoder !== 'function' || typeof AudioDecoder !== 'function') {
          showGate('<h1>Browser not supported</h1><p>This browser cannot run the radio. Use a recent Chrome, Edge or Samsung Internet, or Safari on iOS 26 or newer.</p>');
          return;
        }
        session = result;
        document.getElementById('webWho').textContent = result.name ? `Signed in as ${result.name}` : 'Signed in';
        // A tap first, so the phone lets the radio play sound and use the mic.
        showGate(`<h1>Radio ready</h1><p>Tap to turn the radio on.</p><button type="button" class="web-power">Turn on radio</button>
          <p class="web-fine">Signing in here signs your desktop radio out, and the other way round.</p>`);
        gate.querySelector('button').onclick = () => {
          gate.hidden = true;
          void navigator.wakeLock?.request('screen').catch(() => {});
          // Lets the radio show who is talking while the page is in the background.
          try { void window.Notification?.requestPermission?.()?.catch?.(() => {}); } catch { /* not supported */ }
          resolve({ ...load(), hook: false, web: true, key: result.key, webRelay: result.url });
        };
      };
      void attempt();
    });
  }

  // Big hold-to-talk bar for phones; same as holding the radio's side PTT.
  const press = (down) => listeners.ptt.forEach((callback) => callback(down));
  ptt.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    ptt.setPointerCapture?.(event.pointerId);
    ptt.classList.add('held');
    press(true);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    ptt.addEventListener(type, () => {
      if (!ptt.classList.contains('held')) return;
      ptt.classList.remove('held');
      press(false);
    });
  }
  ptt.addEventListener('contextmenu', (event) => event.preventDefault());
  // Keep the phone awake while the radio is open.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && session) void navigator.wakeLock?.request('screen').catch(() => {});
  });

  // Who is talking while the page is hidden: the tab title, plus a notification when allowed.
  const baseTitle = document.title;
  let notice = null;
  function talkPopup(text) {
    if (!text || document.visibilityState === 'visible') {
      document.title = baseTitle;
      try { notice?.close(); } catch { /* ignore */ }
      notice = null;
      return;
    }
    document.title = `\u25CF ${text}`;
    try {
      if (window.Notification?.permission === 'granted') {
        notice = new Notification('Clearwater Radio', { body: text, tag: 'radio-talk', silent: true });
      }
    } catch { /* phones need a service worker for notifications: the title still shows it */ }
  }

  window.radioApp = {
    talkPopup,
    getSettings: waitForGate,
    setSettings: async (patch) => {
      store(patch || {});
      if (patch && 'size' in patch) fit();
    },
    capturePtt: async () => {},
    version: async () => 'WEB',
    checkForUpdates: async () => {
      setTimeout(() => listeners.update.forEach((callback) => callback({ state: 'current' })), 300);
      return { state: 'checking' };
    },
    // Sign-in expired: the website's Discord sign-in hands out a fresh key.
    signIn: () => {
      window.location.assign('/api/auth/discord?agreed=1&next=%2Fradio');
      return new Promise(() => {});
    },
    cancelSignIn: async () => {},
    refreshRelay: async () => {
      const result = await fetchSession().catch(() => null);
      return result?.url || '';
    },
    // QUIT or 20 minutes idle: drop the link and audio by leaving for the "radio off" page.
    quit: () => window.location.replace('/radio?off=1'),
    onPtt: (callback) => listeners.ptt.push(callback),
    onPttBound: (callback) => listeners.pttBound.push(callback),
    onUpdate: (callback) => listeners.update.push(callback),
  };
})();
