(() => {
  const SITE = 'https://cwrpvc.lol';
  const VERSION_URL = SITE + '/downloads/clearwater-phone-version.json';
  const MAP_IMG = SITE + '/assets/liberty-county-map.jpg';

  let appVersion = '1.3.11';
  let latestInfo = null;
  let sessionUser = null;
  let walletMode = 'send';
  let walletData = null;
  let mapState = { me: null, places: [], dest: null, friends: [] };
  let openThread = null;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(n) {
    return `C$${Number(n || 0).toLocaleString('en-US')}`;
  }

  function timeAgo(value) {
    const then = new Date(value).getTime();
    if (!Number.isFinite(then)) return '';
    const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.round(hours / 24)}d`;
  }

  function signedIn() {
    return sessionUser?.authenticated === true;
  }

  async function api(action, extra = {}) {
    if (!window.anchorPhone?.api) return { ok: false, status: 0, body: { error: 'Phone API unavailable' } };
    return window.anchorPhone.api({ action, ...extra });
  }

  function needSignIn(el, copy) {
    if (!el) return;
    el.innerHTML = `<li class="cw-app-empty"><p class="item-sub">${escapeHtml(copy || 'Sign in with Discord in Settings.')}</p></li>`;
  }

  function tick() {
    const el = $('#status-time');
    if (!el) return;
    el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 15000);

  const views = $$('.view');

  function showView(id) {
    views.forEach((v) => {
      const on = v.dataset.view === id;
      v.classList.toggle('is-active', on);
      v.hidden = !on;
    });
    if (id === 'settings') {
      renderSettings();
      void loadHostSettings();
    }
    if (id === 'internet') void loadInternetFeed();
    if (id === 'wallet') void loadWallet();
    if (id === 'messages') {
      openThread = null;
      showInbox();
      void loadMessages();
    }
    if (id === 'maps') void loadMap('maps');
    if (id === 'findmy') void loadMap('findmy');
  }

  $$('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.open));
  });
  $$('[data-home]').forEach((btn) => {
    btn.addEventListener('click', () => showView('home'));
  });

  function setToggle(el, on) {
    if (!el) return;
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function renderAccount() {
    const status = $('#account-status');
    const login = $('#account-login');
    const logout = $('#account-logout');
    const user = sessionUser?.user || sessionUser;
    if (sessionUser?.authenticated && user?.displayName) {
      if (status) status.textContent = `Signed in as ${user.displayName}`;
      if (login) login.hidden = true;
      if (logout) logout.hidden = false;
    } else {
      if (status) status.textContent = 'Not signed in';
      if (login) login.hidden = false;
      if (logout) logout.hidden = true;
    }
  }

  function renderSettings() {
    renderAccount();
    const label = $('#settings-version-label');
    const download = $('#settings-download-latest');
    if (!label) return;
    if (latestInfo && compareVersions(appVersion, latestInfo.version) < 0) {
      label.textContent = `v${appVersion} is out of date · latest v${latestInfo.version}`;
      if (download) download.hidden = false;
    } else {
      label.textContent = `v${appVersion} · up to date`;
      if (download) download.hidden = true;
    }
  }

  async function loadHostSettings() {
    try {
      const host = await window.anchorPhone?.hostSettings?.();
      if (!host) return;
      setToggle($('#setting-login-item'), host.startWithWindows === true);
      setToggle($('#setting-watch-app'), host.launchOnApp !== false);
      const input = $('#setting-watch-process');
      if (input) input.value = host.watchProcess || 'RobloxPlayerBeta.exe';
    } catch {}
  }

  $('#setting-login-item')?.addEventListener('click', async () => {
    const on = !$('#setting-login-item').classList.contains('is-on');
    const host = await window.anchorPhone?.saveHostSettings?.({ startWithWindows: on });
    setToggle($('#setting-login-item'), host?.startWithWindows === true);
  });

  $('#setting-watch-app')?.addEventListener('click', async () => {
    const on = !$('#setting-watch-app').classList.contains('is-on');
    const host = await window.anchorPhone?.saveHostSettings?.({ launchOnApp: on });
    setToggle($('#setting-watch-app'), host?.launchOnApp !== false);
  });

  $('#setting-watch-save')?.addEventListener('click', async () => {
    const name = $('#setting-watch-process')?.value.trim() || 'RobloxPlayerBeta.exe';
    const host = await window.anchorPhone?.saveHostSettings?.({ watchProcess: name });
    const input = $('#setting-watch-process');
    if (input && host?.watchProcess) input.value = host.watchProcess;
  });

  async function loadInternetFeed() {
    const list = $('#net-feed');
    if (!list) return;
    if (!signedIn()) {
      list.innerHTML = '<li><p class="item-sub">Sign in with Discord in Settings to post.</p></li>';
      return;
    }
    const result = await window.anchorPhone?.feed?.();
    if (!result?.ok) {
      list.innerHTML = `<li><p class="item-sub">${escapeHtml(result?.body?.error || 'Could not load the feed.')}</p></li>`;
      return;
    }
    const posts = (result.body.posts || []).slice(0, 40);
    const users = new Map((result.body.users || []).map((u) => [String(u.id), u]));
    list.innerHTML = posts.length
      ? posts.map((post) => {
        const author = users.get(String(post.authorId)) || {};
        const name = author.displayName || author.username || 'Member';
        const body = post.content || (post.location ? 'Dropped a location' : 'Post');
        return `<li>
          <div class="avatar">${escapeHtml(String(name).slice(0, 1))}</div>
          <div style="flex:1"><p class="item-title">${escapeHtml(name)}</p><p class="item-sub">${escapeHtml(body)}</p></div>
          <span class="item-sub">${escapeHtml(timeAgo(post.createdAt))}</span>
        </li>`;
      }).join('')
      : '<li><p class="item-sub">No posts yet.</p></li>';
  }

  $('#net-post')?.addEventListener('click', async () => {
    const status = $('#net-status');
    const content = $('#net-body')?.value.trim();
    if (!content) {
      if (status) { status.hidden = false; status.textContent = 'Write something first.'; }
      return;
    }
    if (status) { status.hidden = false; status.textContent = 'Posting…'; }
    const result = await api('post', { content });
    if (!result.ok) {
      if (status) status.textContent = result.body?.error || 'Could not post.';
      return;
    }
    if ($('#net-body')) $('#net-body').value = '';
    if (status) status.textContent = 'Posted to Clearwater Internet.';
    void loadInternetFeed();
  });

  $('#account-login')?.addEventListener('click', async () => {
    await window.anchorPhone?.login?.();
    const status = $('#account-status');
    if (status) status.textContent = 'Finish signing in in the window that opened, then return here.';
    window.setTimeout(() => void refreshSession(), 2500);
  });

  $('#account-logout')?.addEventListener('click', async () => {
    await window.anchorPhone?.logout?.();
    sessionUser = null;
    renderAccount();
  });

  async function refreshSession() {
    try {
      const next = (await window.anchorPhone?.session?.()) || { authenticated: false };
      if (sessionUser?.authenticated && next.authenticated === false) return sessionUser;
      sessionUser = next;
    } catch {
      if (sessionUser?.authenticated) return sessionUser;
      sessionUser = { authenticated: false };
    }
    renderAccount();
    return sessionUser;
  }

  window.anchorPhone?.onAuth?.((payload) => {
    const next = payload && typeof payload === 'object' ? payload : { authenticated: false };
    if (sessionUser?.authenticated && next.authenticated === false) return;
    sessionUser = next;
    renderAccount();
  });

  function compareVersions(a, b) {
    const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
    const len = Math.max(pa.length, pb.length);
    for (let i = 0; i < len; i += 1) {
      const x = pa[i] || 0;
      const y = pb[i] || 0;
      if (x < y) return -1;
      if (x > y) return 1;
    }
    return 0;
  }

  function renderWallet(wallet) {
    walletData = wallet || null;
    const bal = $('#wallet-balance');
    const note = $('#wallet-note-line');
    if (bal) bal.textContent = wallet ? formatMoney(wallet.balance) : 'C$—';
    if (note) note.textContent = wallet ? 'Synced with Clearwater Internet' : 'Sign in to load your wallet';
    const pending = $('#wallet-pending');
    const list = $('#wallet-txns');
    if (pending) {
      const items = wallet?.pendingTransfers || [];
      pending.innerHTML = items.length
        ? items.map((t) => {
          const mine = t.actionable;
          return `<li>
            <div class="avatar">$</div>
            <div><p class="item-title">${escapeHtml(t.type === 'request' ? 'Request' : 'Send')} · ${formatMoney(t.amount)}</p><p class="item-sub">${escapeHtml(t.note || 'Pending')}</p></div>
            ${mine ? `<button type="button" class="btn-ghost" data-transfer="${escapeHtml(t.id)}" data-decision="accept">Accept</button>` : ''}
          </li>`;
        }).join('')
        : '<li><p class="item-sub">No pending transfers.</p></li>';
      pending.querySelectorAll('[data-transfer]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const result = await api('wallet-transfer-respond', { transferId: btn.dataset.transfer, decision: btn.dataset.decision });
          if (result.ok && result.body?.wallet) renderWallet(result.body.wallet);
          else void loadWallet();
        });
      });
    }
    if (list) {
      const txns = wallet?.transactions || [];
      list.innerHTML = txns.length
        ? txns.map((t) => {
          const amt = Number(t.amount || 0);
          const dir = amt >= 0 ? 'in' : 'out';
          return `<li>
            <div class="avatar">${escapeHtml(String(t.type || 'C').slice(0, 1).toUpperCase())}</div>
            <div><p class="item-title">${escapeHtml(t.note || t.type || 'Transaction')}</p><p class="item-sub">${escapeHtml(timeAgo(t.createdAt))}</p></div>
            <span class="amt ${dir}">${amt >= 0 ? '+' : '−'}${formatMoney(Math.abs(amt))}</span>
          </li>`;
        }).join('')
        : '<li><p class="item-sub">No transactions yet.</p></li>';
    }
  }

  async function loadWallet() {
    if (!signedIn()) {
      renderWallet(null);
      return;
    }
    const result = await api('wallet');
    if (!result.ok) {
      const note = $('#wallet-note-line');
      if (note) note.textContent = result.body?.error || 'Could not load wallet.';
      return;
    }
    renderWallet(result.body.wallet);
  }

  $$('[data-wallet-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      walletMode = btn.dataset.walletAction;
      $$('[data-wallet-action]').forEach((b) => b.classList.toggle('is-active', b === btn));
      const panel = $('#wallet-panel');
      if (panel) panel.hidden = false;
      $('#wallet-submit').textContent = walletMode === 'request' ? 'Send request' : 'Send funds';
      $('#wallet-status').hidden = true;
    });
  });

  $('#wallet-submit')?.addEventListener('click', async () => {
    const status = $('#wallet-status');
    const member = $('#wallet-member').value.trim().replace(/^@/, '');
    const amount = Math.floor(Number($('#wallet-amount').value));
    const note = $('#wallet-note').value.trim();
    if (!member || !amount || amount < 1) {
      status.hidden = false;
      status.textContent = 'Enter a member and amount.';
      return;
    }
    status.hidden = false;
    status.textContent = 'Sending…';
    const result = await api('wallet-transfer', {
      type: walletMode === 'request' ? 'request' : 'send',
      username: member,
      amount,
      note,
    });
    if (!result.ok) {
      status.textContent = result.body?.error || 'Could not create this transfer.';
      return;
    }
    status.textContent = walletMode === 'request' ? 'Request sent.' : 'Transfer sent.';
    if (result.body?.wallet) renderWallet(result.body.wallet);
    else void loadWallet();
    $('#wallet-member').value = '';
    $('#wallet-amount').value = '';
    $('#wallet-note').value = '';
  });

  function showInbox() {
    $('#inbox-pane').hidden = false;
    $('#thread-pane').hidden = true;
    const title = $('#messages-title');
    if (title) title.textContent = 'Messages';
  }

  function showThread(name) {
    $('#inbox-pane').hidden = true;
    $('#thread-pane').hidden = false;
    const title = $('#messages-title');
    if (title) title.textContent = name || 'Chat';
  }

  async function loadMessages() {
    const list = $('#thread-list');
    if (!signedIn()) {
      needSignIn(list);
      return;
    }
    const result = await api('messages');
    if (!result.ok) {
      needSignIn(list, result.body?.error || 'Could not load messages.');
      return;
    }
    const items = result.body.conversations || result.body.messages || [];
    list.innerHTML = items.length
      ? items.map((m) => `<li data-open-thread="${escapeHtml(m.otherId || '')}" data-thread-name="${escapeHtml(m.otherDisplayName || m.otherUsername || 'Member')}">
          <div class="avatar">${escapeHtml(String(m.otherDisplayName || 'C').slice(0, 1))}</div>
          <div style="flex:1"><p class="item-title">${escapeHtml(m.otherDisplayName || 'Member')}</p><p class="item-sub">${escapeHtml(m.content || 'New message')}</p></div>
          <span class="item-sub">${escapeHtml(timeAgo(m.createdAt))}</span>
        </li>`).join('')
      : '<li><p class="item-sub">No messages yet.</p></li>';
    list.querySelectorAll('[data-open-thread]').forEach((row) => {
      row.addEventListener('click', () => void openConversation(row.dataset.openThread, row.dataset.threadName));
    });
  }

  async function openConversation(id, name) {
    openThread = { id, name };
    showThread(name);
    const log = $('#chat-log');
    const result = await api('conversation', { withUserId: id });
    const messages = result.body?.messages || [];
    log.innerHTML = messages.map((m) => `<li>
      <div><p class="item-title">${escapeHtml(m.content || (m.gifUrl ? 'GIF' : ''))}</p><p class="item-sub">${escapeHtml(timeAgo(m.createdAt))}</p></div>
    </li>`).join('') || '<li><p class="item-sub">No messages yet.</p></li>';
    log.scrollTop = log.scrollHeight;
  }

  $('#new-message')?.addEventListener('click', () => {
    if (openThread) {
      openThread = null;
      showInbox();
      return;
    }
    const c = $('#msg-composer');
    if (c) c.hidden = !c.hidden;
  });

  $('#msg-send')?.addEventListener('click', async () => {
    const to = $('#msg-to').value.trim().replace(/^@/, '');
    const content = $('#msg-body').value.trim();
    if (!to || !content) return;
    const result = await api('message-send', { username: to, content });
    if (!result.ok) {
      window.alert(result.body?.error || 'Could not send.');
      return;
    }
    $('#msg-to').value = '';
    $('#msg-body').value = '';
    $('#msg-composer').hidden = true;
    void loadMessages();
  });

  $('#chat-send')?.addEventListener('click', async () => {
    if (!openThread) return;
    const content = $('#chat-body').value.trim();
    if (!content) return;
    const result = await api('message-send', { to: openThread.id, content });
    if (!result.ok) {
      window.alert(result.body?.error || 'Could not send.');
      return;
    }
    $('#chat-body').value = '';
    void openConversation(openThread.id, openThread.name);
  });

  function renderPins(container, pins) {
    if (!container) return;
    container.innerHTML = pins.map((pin) => {
      if (!pin || !Number.isFinite(Number(pin.left)) || !Number.isFinite(Number(pin.top))) return '';
      const cls = pin.self ? 'pin self' : pin.dest ? 'pin dest' : 'pin other';
      return `<span class="${cls}" style="left:${Number(pin.left) * 100}%;top:${Number(pin.top) * 100}%">${escapeHtml(pin.label || '')}</span>`;
    }).join('');
  }

  function drawRoute(from, to) {
    const svg = $('#maps-route');
    if (!svg || !from || !to) {
      if (svg) svg.innerHTML = '';
      return;
    }
    const x1 = from.left * 100;
    const y1 = from.top * 100;
    const x2 = to.left * 100;
    const y2 = to.top * 100;
    svg.innerHTML = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#76adff" stroke-width="1.6" stroke-linecap="round" stroke-dasharray="3 2" />`;
  }

  function studsBetween(a, b) {
    const dx = (Number(b.left) - Number(a.left)) * 3120;
    const dz = (Number(b.top) - Number(a.top)) * 3120;
    return Math.round(Math.hypot(dx, dz));
  }

  function applyMapPayload(kind, payload) {
    mapState.me = payload.me || null;
    mapState.places = payload.places || [];
    mapState.friends = payload.friends || [];
    const list = $('#maps-places');
    if (list) {
      list.innerHTML = mapState.places.map((p) => `<option value="${escapeHtml(p.label)}"></option>`).join('');
    }
    if (kind === 'maps') {
      renderPins($('#maps-pins'), [
        mapState.me ? { ...mapState.me, self: true, label: 'You' } : null,
        mapState.dest ? { ...mapState.dest, dest: true, label: mapState.dest.label || '★' } : null,
      ].filter(Boolean));
      drawRoute(mapState.me, mapState.dest);
      const status = $('#route-status');
      if (!payload.me) {
        status.hidden = false;
        status.textContent = 'Join the Clearwater ER:LC server to place yourself on the map.';
      }
    }
    if (kind === 'findmy') {
      renderPins($('#findmy-pins'), [
        payload.me ? { ...payload.me, self: true, label: 'You' } : null,
        ...(payload.friends || []).filter((f) => f.location).map((f) => ({ ...f.location, label: f.displayName })),
      ].filter(Boolean));
      const people = $('#findmy-list');
      const contacts = payload.contacts || [];
      people.innerHTML = contacts.length
        ? contacts.map((c) => {
          const friend = (payload.friends || []).find((f) => f.id === c.id);
          const loc = friend?.location?.label || (c.sharesWithYou ? 'Online location hidden until they join' : 'Not sharing with you');
          return `<li>
            <div class="avatar">${escapeHtml(String(c.displayName || 'C').slice(0, 1))}</div>
            <div><p class="item-title">${escapeHtml(c.displayName)}</p><p class="item-sub">${escapeHtml(loc)}</p></div>
            <button type="button" class="toggle ${c.sharing ? 'is-on' : ''}" data-findmy-id="${escapeHtml(c.id)}" aria-label="Share with ${escapeHtml(c.displayName)}"></button>
          </li>`;
        }).join('')
        : '<li><p class="item-sub">Follow friends on Internet to share locations.</p></li>';
      people.querySelectorAll('[data-findmy-id]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const on = !btn.classList.contains('is-on');
          await api('findmy-share', { targetId: btn.dataset.findmyId, enabled: on });
          void loadMap('findmy');
        });
      });
      const status = $('#findmy-status');
      if (status) {
        status.hidden = false;
        status.textContent = payload.me
          ? `You are in-game${payload.me.label ? ` · ${payload.me.label}` : ''}.`
          : 'Join the Clearwater ER:LC server to appear on Find My.';
      }
    }
  }

  async function loadMap(kind) {
    if (!signedIn()) {
      const status = $(kind === 'findmy' ? '#findmy-status' : '#route-status');
      if (status) {
        status.hidden = false;
        status.textContent = 'Sign in with Discord in Settings.';
      }
      return;
    }
    const result = await api('erlc-phone-map');
    if (!result.ok) {
      const status = $(kind === 'findmy' ? '#findmy-status' : '#route-status');
      if (status) {
        status.hidden = false;
        status.textContent = result.body?.error || 'Could not load the map.';
      }
      return;
    }
    applyMapPayload(kind, result.body || {});
  }

  $('#maps-map')?.addEventListener('click', (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const left = (event.clientX - box.left) / box.width;
    const top = (event.clientY - box.top) / box.height;
    mapState.dest = { left, top, label: 'Dropped pin' };
    $('#maps-dest').value = 'Dropped pin';
    renderPins($('#maps-pins'), [
      mapState.me ? { ...mapState.me, self: true, label: 'You' } : null,
      { ...mapState.dest, dest: true, label: '★' },
    ].filter(Boolean));
    drawRoute(mapState.me, mapState.dest);
  });

  $('#maps-go')?.addEventListener('click', () => {
    const query = $('#maps-dest').value.trim();
    const place = mapState.places.find((p) => String(p.label).toLowerCase() === query.toLowerCase());
    if (place) mapState.dest = place;
    const status = $('#route-status');
    status.hidden = false;
    if (!mapState.me) {
      status.textContent = 'Join the server so Maps can see where you are.';
      return;
    }
    if (!mapState.dest) {
      status.textContent = 'Tap the map or pick a destination.';
      return;
    }
    drawRoute(mapState.me, mapState.dest);
    renderPins($('#maps-pins'), [
      { ...mapState.me, self: true, label: 'You' },
      { ...mapState.dest, dest: true, label: mapState.dest.label || '★' },
    ]);
    const dist = studsBetween(mapState.me, mapState.dest);
    status.textContent = `Route to ${mapState.dest.label || 'pin'} · about ${dist} studs from your in-game position.`;
  });

  $$('.liberty-map').forEach((img) => {
    img.src = MAP_IMG;
  });

  const dragEl = $('[data-drag]');
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  if (dragEl) {
    dragEl.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.screenX;
      lastY = e.screenY;
      dragEl.setPointerCapture?.(e.pointerId);
    });
    dragEl.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.screenX - lastX;
      const dy = e.screenY - lastY;
      lastX = e.screenX;
      lastY = e.screenY;
      window.anchorPhone?.drag?.(dx, dy);
    });
    const end = () => { dragging = false; };
    dragEl.addEventListener('pointerup', end);
    dragEl.addEventListener('pointercancel', end);
  }

  function latestDownloadUrl() {
    return latestInfo?.downloadUrl || SITE + '/downloads/ClearwaterPhone.exe';
  }

  async function openLatestDownload() {
    const href = latestDownloadUrl();
    const status = $('#settings-update-status');
    try {
      const opened = await window.anchorPhone?.openUrl?.(href);
      if (status) {
        status.hidden = false;
        status.textContent = opened === false
          ? 'Could not open the download. Visit cwrpvc.lol and use Download Phone.'
          : 'Opened the latest download. Replace this app with the new file.';
      }
    } catch {
      if (status) {
        status.hidden = false;
        status.textContent = 'Could not open the download. Visit cwrpvc.lol and use Download Phone.';
      }
    }
  }

  function showOutdated(info) {
    latestInfo = info;
    const banner = $('#update-banner');
    const copy = $('#update-copy');
    if (banner) banner.hidden = false;
    if (copy) copy.textContent = `v${appVersion} → v${info.version}. Download the newest build from the site.`;
    renderSettings();
  }

  async function checkForUpdates(manual = false) {
    const status = $('#settings-update-status');
    try {
      const res = await fetch(VERSION_URL + '?t=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('version check failed');
      const info = await res.json();
      latestInfo = info;
      if (compareVersions(appVersion, info.version) < 0) {
        showOutdated(info);
        if (manual && status) {
          status.hidden = false;
          status.textContent = `Update available: v${info.version}`;
        }
        return info;
      }
      const banner = $('#update-banner');
      if (banner) banner.hidden = true;
      if (status) {
        status.hidden = !manual;
        if (manual) status.textContent = 'You are on the latest version.';
      }
      renderSettings();
      return info;
    } catch {
      if (manual && status) {
        status.hidden = false;
        status.textContent = 'Could not check for updates.';
      }
      return null;
    }
  }

  $('#settings-check-update')?.addEventListener('click', () => void checkForUpdates(true));
  $('#settings-download-latest')?.addEventListener('click', () => void openLatestDownload());
  $('#update-download')?.addEventListener('click', () => void openLatestDownload());

  void (async () => {
    try {
      const info = await window.anchorPhone?.getVersion?.();
      if (info?.version) appVersion = info.version;
    } catch {}
    await refreshSession();
    renderSettings();
    await checkForUpdates(false);
    window.setInterval(() => void refreshSession(), 60_000);
  })();
})();
