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
    <div class="pcso-drop">
      <button class="pcso-drop-toggle" type="button" aria-expanded="false">Resources</button>
      <div class="pcso-drop-menu" role="menu">
        <a href="/search">Website Search</a>
        <a href="/calendar">Community Calendar</a>
        <a href="/operations">Live Operations</a>
        <a href="/deputy-directory">Deputy Directory</a>
        <a href="/incident-map">Incident Map</a>
        <a href="/policies">Policies &amp; SOPs</a>
        <a href="/awards">Awards &amp; Promotions</a>
      </div>
    </div>
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
  showRideAlongNotices();
  document.dispatchEvent(new Event('pcso-nav-ready'));
})();

function pcsoSession() {
  pcsoSession.promise ||= fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' })
    .then((response) => response.json())
    .catch(() => ({}));
  return pcsoSession.promise;
}

function pcsoNoticeStack() {
  let stack = document.querySelector('.pcso-notice-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'pcso-notice-stack';
    document.body.append(stack);
  }
  return stack;
}

function pcsoPortalPost(body, options = {}) {
  return fetch('/api/pcso/portal', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body), ...options,
  });
}

async function showRideAlongNotices() {
  try {
    const session = await pcsoSession();
    if (!session.authenticated) return;
    const response = await pcsoPortalPost({ kind: 'ride-along', action: 'notices' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(payload.notices)) return;
    const onRidePage = location.pathname.replace(/\.html$/, '') === '/ride-along';
    for (const item of payload.notices) {
      const notice = document.createElement('aside');
      notice.className = `pcso-result-notice is-${item.kind === 'approved' || item.kind === 'review' ? item.kind : 'denied'}`;
      notice.setAttribute('role', 'status');
      const label = document.createElement('span');
      label.textContent = 'Ride along';
      const title = document.createElement('strong');
      title.textContent = item.title || 'Your ride along was updated.';
      notice.append(label, title);
      const details = [];
      if (item.scheduledAt) {
        details.push(new Date(item.scheduledAt).toLocaleString([], {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        }));
      }
      if (item.meetingPlace) details.push(`Meet at ${item.meetingPlace}`);
      if (item.text) details.push(item.text);
      if (details.length) {
        const text = document.createElement('p');
        text.textContent = details.join(' · ');
        notice.append(text);
      }
      const markSeen = () => pcsoPortalPost({ kind: 'ride-along', action: 'notice-seen', noticeId: item.id }, { keepalive: true }).catch(() => {});
      const link = document.createElement('a');
      link.href = '/ride-along#ride-requests';
      link.textContent = item.kind === 'review' ? 'Leave a review →' : (onRidePage ? 'Got it' : 'View your ride along →');
      link.addEventListener('click', (event) => {
        markSeen();
        if (onRidePage) {
          event.preventDefault();
          notice.remove();
          document.getElementById('ride-requests')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      const close = document.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss ride along notice');
      close.textContent = '×';
      close.addEventListener('click', () => {
        markSeen();
        notice.remove();
      });
      notice.append(link, close);
      pcsoNoticeStack().append(notice);
    }
  } catch {
    // Ride along notices are optional on public pages.
  }
}

async function showApplicationResultNotice() {
  if (location.pathname.replace(/\.html$/, '') === '/application-result') return;
  try {
    const session = await pcsoSession();
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
    const payload = await pcsoSession();
    if (!payload?.authenticated) return;
    const nav = document.getElementById('pcso-navigation');
    for (const link of loginLinks) {
      if (payload.user?.admin) {
        const careersLink = nav?.querySelector('.pcso-careers-btn');
        if (careersLink && !nav.querySelector('[data-pcso-employee-link]')) {
          careersLink.insertAdjacentHTML('beforebegin', '<a href="/employee" data-pcso-employee-link>Employee</a>');
        }
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
