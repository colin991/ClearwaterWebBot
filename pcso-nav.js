(function initPcsoNav() {
  const nav = document.getElementById('pcso-navigation');
  if (!nav) return;

  const next = encodeURIComponent(location.pathname.replace(/\.html$/, '') || '/');
  nav.innerHTML = `
    <a href="/">Home</a>
    <div class="pcso-drop">
      <button class="pcso-drop-toggle" type="button" aria-expanded="false">About</button>
      <div class="pcso-drop-menu" role="menu">
        <a href="/sheriff">Sheriff Noah Richards</a>
        <a href="/inside-the-star">Inside the Star</a>
        <a href="/missions-values">Missions and Values</a>
        <a href="/public-notices">Public Notices</a>
      </div>
    </div>
    <div class="pcso-drop">
      <button class="pcso-drop-toggle" type="button" aria-expanded="false">Law Enforcement</button>
      <div class="pcso-drop-menu" role="menu">
        <a href="/patrol-operations">Patrol Operations</a>
        <a href="/active-calls">Active Calls</a>
        <a href="/ride-along">Patrol Ride Along Program</a>
      </div>
    </div>
    <div class="pcso-drop">
      <button class="pcso-drop-toggle" type="button" aria-expanded="false">Divisions</button>
      <div class="pcso-drop-menu" role="menu">
        <a href="/public-information">Public Information Office</a>
        <a href="/special-response">Special Response Team</a>
        <a href="/traffic-enforcement">Traffic Enforcement Unit</a>
        <a href="/criminal-investigations">Criminal Investigations Division</a>
        <a href="/field-training">Field Training Operations</a>
      </div>
    </div>
    <div class="pcso-drop">
      <button class="pcso-drop-toggle" type="button" aria-expanded="false">Contact</button>
      <div class="pcso-drop-menu" role="menu">
        <a href="/contact">Open a Ticket</a>
        <a href="/contact#records">Public Records</a>
        <a href="/public-records">Records request form</a>
      </div>
    </div>
    <a href="/employee">Employee</a>
    <a class="pcso-careers-btn" href="/careers">Careers</a>
    <a class="pcso-button pcso-button-red" href="/signin?next=${next}" data-pcso-login>Log In</a>
  `;

  const menu = document.querySelector('.pcso-menu');
  menu?.addEventListener('click', () => {
    const open = menu.getAttribute('aria-expanded') === 'true';
    menu.setAttribute('aria-expanded', String(!open));
    nav.classList.toggle('open', !open);
  });

  document.querySelector('.pcso-alert-close')?.addEventListener('click', () => {
    document.querySelector('.pcso-alert')?.remove();
  });

  nav.querySelectorAll('.pcso-drop').forEach((drop) => {
    const toggle = drop.querySelector('.pcso-drop-toggle');
    let hideTimer = 0;
    const openMenu = () => {
      window.clearTimeout(hideTimer);
      nav.querySelectorAll('.pcso-drop').forEach((other) => {
        if (other === drop) return;
        other.classList.remove('open');
        other.querySelector('.pcso-drop-toggle')?.setAttribute('aria-expanded', 'false');
      });
      drop.classList.add('open');
      toggle?.setAttribute('aria-expanded', 'true');
    };
    const closeMenu = () => {
      drop.classList.remove('open');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    drop.addEventListener('mouseenter', openMenu);
    drop.addEventListener('mouseleave', () => {
      hideTimer = window.setTimeout(closeMenu, 200);
    });
    toggle?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (drop.classList.contains('open')) closeMenu();
      else openMenu();
    });
    drop.querySelectorAll('.pcso-drop-menu a').forEach((link) => {
      link.addEventListener('click', (event) => {
        event.stopPropagation();
      });
    });
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.pcso-drop') || event.target.closest('.pcso-menu')) return;
    nav.querySelectorAll('.pcso-drop-toggle').forEach((toggle) => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.parentElement?.classList.remove('open');
    });
  });

  refreshPcsoLoginButton();
  showApplicationResultNotice();
  document.dispatchEvent(new Event('pcso-nav-ready'));
})();

async function showApplicationResultNotice() {
  if (location.pathname.replace(/\.html$/, '') === '/application-result') return;
  try {
    const session = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' }).then((response) => response.json());
    if (!session.authenticated) return;
    const response = await fetch('/api/pcso/portal', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'application', action: 'status' }),
    });
    const payload = await response.json().catch(() => ({}));
    const application = payload.latest;
    if (!response.ok || !application || !['approved', 'denied'].includes(application.status)) return;
    const reapplyReady = application.status === 'denied'
      && payload.canApply
      && payload.reapplyAt
      && Date.parse(payload.reapplyAt) <= Date.now();
    const reapplyNoticeKey = `pcso-application-reapply-${application.id}`;
    if (reapplyReady && localStorage.getItem(reapplyNoticeKey) !== 'dismissed') {
      const notice = document.createElement('aside');
      notice.className = 'pcso-result-notice';
      notice.setAttribute('role', 'status');
      notice.innerHTML = '<span>Applications</span><strong>You can now reapply to PCSO.</strong><a href="/careers">Start a new application →</a><button type="button" aria-label="Dismiss reapplication notice">×</button>';
      notice.querySelector('button').addEventListener('click', () => {
        localStorage.setItem(reapplyNoticeKey, 'dismissed');
        notice.remove();
      });
      document.body.append(notice);
      return;
    }
    if (localStorage.getItem(`pcso-application-result-${application.id}`) === 'revealed') return;
    const notice = document.createElement('aside');
    notice.className = 'pcso-result-notice';
    notice.setAttribute('role', 'status');
    notice.innerHTML = '<span>Application update</span><strong>Your application has been reviewed.</strong><a href="/application-result">Click to reveal result →</a><button type="button" aria-label="Dismiss application notice">×</button>';
    notice.querySelector('button').addEventListener('click', () => notice.remove());
    document.body.append(notice);
  } catch {
    // Do not interrupt public pages when application status is unavailable.
  }
}

async function refreshPcsoLoginButton() {
  const loginLinks = document.querySelectorAll('[data-pcso-login]');
  if (!loginLinks.length) return;
  try {
    const response = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!payload?.authenticated) return;
    for (const link of loginLinks) {
      if (payload.user?.admin) {
        link.textContent = 'Admin';
        link.setAttribute('href', '/admin');
      } else {
        link.textContent = 'Signed in';
        link.setAttribute('href', '/employee');
      }
      link.removeAttribute('target');
      link.removeAttribute('rel');
    }
  } catch {
    // Keep Log In if the session check fails.
  }
}
