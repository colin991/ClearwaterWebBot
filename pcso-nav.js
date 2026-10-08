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
  mountPcsoFloatingSearch();
  mountPcsoChatbot();
  showApplicationResultNotice();
  showRideAlongNotices();
  document.dispatchEvent(new Event('pcso-nav-ready'));
})();

function mountPcsoFloatingSearch() {
  if (document.querySelector('[data-pcso-floating-search]')) return;
  const links = [
    ['Live Operations Dashboard', '/operations', 'server weather staffing districts watch commanders'],
    ['Deputy Directory', '/deputy-directory', 'staff callsign rank division'],
    ['Community Events Calendar', '/calendar', 'events recruitment training reminders'],
    ['Awards and Promotions', '/awards', 'commendations certifications recognition'],
    ['Recruitment Progress', '/recruitment-progress', 'application orientation training ride along'],
    ['Crime and Incident Map', '/incident-map', 'active calls public safety map'],
    ['Policies and SOPs', '/policies', 'patrol traffic investigations radio discipline'],
    ['Ride Along Program', '/ride-along', 'request waiver supervisor reviews'],
    ['News and Press Releases', '/news', 'news announcements photos'],
    ['Careers', '/careers', 'apply application deputy'],
    ['Public Records', '/public-records', 'records request documents'],
    ['File a Police Report', '/police-report', 'report incident'],
    ['Contact PCSO', '/contact', 'ticket help complaint'],
  ];
  const widget = document.createElement('aside');
  widget.className = 'pcso-floating-search';
  widget.dataset.pcsoFloatingSearch = '';
  widget.innerHTML = '<button class="pcso-floating-search-button" type="button" aria-expanded="false" aria-label="Search the PCSO website"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.25 4.25"></path></svg><span class="pcso-visually-hidden">Search</span></button><div class="pcso-floating-search-panel"><label for="pcso-floating-search-input">Search this website</label><input id="pcso-floating-search-input" type="search" placeholder="What are you looking for?" autocomplete="off"><div class="pcso-floating-search-results" role="listbox"></div></div>';
  document.body.append(widget);
  const button = widget.querySelector('button');
  const input = widget.querySelector('input');
  const results = widget.querySelector('.pcso-floating-search-results');
  const open = () => { widget.classList.add('is-open'); button.setAttribute('aria-expanded', 'true'); };
  const close = () => { widget.classList.remove('is-open'); button.setAttribute('aria-expanded', 'false'); };
  const paint = () => {
    const query = input.value.trim().toLowerCase();
    const matches = links.filter((item) => !query || item.join(' ').toLowerCase().includes(query)).slice(0, 8);
    results.replaceChildren(...matches.map(([title, href]) => {
      const link = document.createElement('a');
      link.href = href;
      link.textContent = title;
      link.setAttribute('role', 'option');
      return link;
    }));
    if (!matches.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No matching pages.';
      results.append(empty);
    }
  };
  widget.addEventListener('mouseenter', open);
  widget.addEventListener('mouseleave', () => { if (!widget.contains(document.activeElement)) close(); });
  widget.addEventListener('focusin', open);
  widget.addEventListener('focusout', () => setTimeout(() => { if (!widget.contains(document.activeElement)) close(); }, 0));
  button.addEventListener('click', () => { if (widget.classList.contains('is-open')) close(); else { open(); input.focus(); } });
  input.addEventListener('input', paint);
  input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { close(); button.focus(); } });
  paint();
  Promise.allSettled([
    fetch('/api/pcso/content', { cache: 'no-store' }).then((response) => response.json()),
    fetch('/api/pcso/portal?kind=operations', { cache: 'no-store' }).then((response) => response.json()),
  ]).then(([contentResult, operationsResult]) => {
    if (contentResult.status === 'fulfilled') {
      const content = contentResult.value || {};
      for (const item of content.news || []) links.push([item.title || 'News', '/news', `news press release ${item.summary || ''} ${item.body || ''}`]);
      for (const item of content.events || []) links.push([item.title || 'Event', '/calendar', `event ${item.location || ''} ${item.description || ''}`]);
    }
    if (operationsResult.status === 'fulfilled') {
      for (const deputy of operationsResult.value?.deputies || []) {
        links.push([`${deputy.callsign} · ${deputy.name}`, '/deputy-directory', `deputy staff ${deputy.rank} ${deputy.district}`]);
      }
    }
    paint();
  });
}

function mountPcsoChatbot() {
  if (document.querySelector('[data-pcso-chatbot]')) return;
  const widget = document.createElement('aside');
  widget.className = 'pcso-chatbot';
  widget.dataset.pcsoChatbot = '';
  widget.innerHTML = `
    <button class="pcso-chatbot-button" type="button" aria-expanded="false" aria-label="Open the PCSO website assistant">
      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 5.5h14v10H9l-4 3v-13Z"></path><path d="M8.5 9.5h7M8.5 12.5h4"></path></svg>
      <span class="pcso-visually-hidden">Website assistant</span>
    </button>
    <section class="pcso-chatbot-panel" aria-label="PCSO website assistant">
      <header><div><strong>PCSO Assistant</strong><span>Automated website help</span></div><button type="button" data-chat-close aria-label="Close assistant">×</button></header>
      <div class="pcso-chatbot-messages" data-chat-messages aria-live="polite"></div>
      <form class="pcso-chatbot-form"><label class="pcso-visually-hidden" for="pcso-chatbot-input">Ask a question</label><input id="pcso-chatbot-input" maxlength="500" autocomplete="off" placeholder="Ask a question…" required><button type="submit">Send</button></form>
    </section>`;
  document.body.append(widget);
  const launcher = widget.querySelector('.pcso-chatbot-button');
  const panel = widget.querySelector('.pcso-chatbot-panel');
  const form = widget.querySelector('form');
  const input = widget.querySelector('input');
  const messages = widget.querySelector('[data-chat-messages]');
  const addMessage = (text, kind = 'assistant') => {
    const bubble = document.createElement('p');
    bubble.className = `pcso-chatbot-message is-${kind}`;
    bubble.textContent = text;
    messages.append(bubble);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  };
  const addSupportButton = (question) => {
    const action = document.createElement('div');
    action.className = 'pcso-chatbot-support';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Open a support ticket';
    action.append(button);
    messages.append(action);
    button.addEventListener('click', () => {
      action.innerHTML = '<strong>How can we help?</strong><textarea maxlength="1800" aria-label="How can we help?"></textarea><button type="button">Continue to ticket</button>';
      const textarea = action.querySelector('textarea');
      textarea.value = question;
      action.querySelector('button').addEventListener('click', () => {
        const details = textarea.value.trim();
        if (!details) { textarea.focus(); return; }
        window.location.href = `/contact?support=${encodeURIComponent(details)}`;
      });
      textarea.focus();
      messages.scrollTop = messages.scrollHeight;
    });
    messages.scrollTop = messages.scrollHeight;
  };
  const open = () => {
    widget.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    input.focus();
  };
  const close = () => {
    widget.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
    launcher.focus();
  };
  launcher.addEventListener('click', () => widget.classList.contains('is-open') ? close() : open());
  widget.querySelector('[data-chat-close]').addEventListener('click', close);
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') close(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    addMessage(question, 'user');
    input.value = '';
    const pending = addMessage('Checking my answers…', 'status');
    form.querySelector('button').disabled = true;
    try {
      const response = await fetch('/api/pcso/chatbot', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'The assistant is unavailable right now.');
      pending.remove();
      addMessage(payload.reply || 'I do not have an answer for that yet.');
      if (payload.matched === false) addSupportButton(question);
    } catch (error) {
      pending.textContent = error.message || 'The assistant is unavailable right now.';
      pending.className = 'pcso-chatbot-message is-status';
    } finally {
      form.querySelector('button').disabled = false;
      input.focus();
    }
  });
  fetch('/api/pcso/chatbot', { cache: 'no-store' })
    .then((response) => response.json())
    .then((payload) => addMessage(payload.greeting || 'Hi! How can I help?'))
    .catch(() => addMessage('Hi! Ask me a question about the PCSO website.'));
}

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
