const { ipcRenderer } = require('electron');

function onClearwater() {
  try {
    return /^https:\/\/(www\.)?cwrpvc\.lol$/i.test(location.origin);
  } catch {
    return false;
  }
}

async function reportAuth() {
  if (!onClearwater()) return;
  try {
    const me = await fetch('/api/auth/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    }).then((response) => response.json());
    ipcRenderer.send('phone-login-auth', me && typeof me === 'object' ? me : { authenticated: false });
  } catch {
    ipcRenderer.send('phone-login-auth', { authenticated: false });
  }
}

setInterval(() => { void reportAuth(); }, 800);
window.addEventListener('DOMContentLoaded', () => { void reportAuth(); });
window.addEventListener('load', () => { void reportAuth(); });
