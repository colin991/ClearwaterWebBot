(() => {
  const SITE = 'https://www.cwrpvc.lol';
  const VERSION_URL = SITE + '/downloads/clearwater-phone-version.json';
  const MAP_IMG = SITE + '/assets/liberty-county-map.jpg';

  let appVersion = '1.3.23';
  let latestInfo = null;
  let sessionUser = null;
  let walletMode = 'send';
  let walletData = null;
  let mapState = { me: null, places: [], dest: null, friends: [], roads: [], route: [], navigating: false, rerouting: false };
  let mapTimer = null;
  let mapCam = { zoom: 1.4, x: 0, y: 0 };
  let findCam = { zoom: 1.4, x: 0, y: 0 };
  let findmyState = { payload: null, query: '' };
  const PHONE_MODELS = new Set(['z', 'x']);
  const WALLPAPERS = new Set(['gulf', 'midnight', 'ocean', 'ember', 'forest', 'violet']);

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function currentPhoneModel() {
    return document.body.classList.contains('phone-model-x') ? 'x' : 'z';
  }

  function applyAppearance(host = {}) {
    const model = PHONE_MODELS.has(host.phoneModel) ? host.phoneModel : currentPhoneModel();
    const wallpaper = WALLPAPERS.has(host.wallpaperColor)
      ? host.wallpaperColor
      : (WALLPAPERS.has(document.body.dataset.wallpaper) ? document.body.dataset.wallpaper : 'gulf');
    document.body.classList.remove('phone-model-x', 'phone-model-z');
    document.body.classList.add(`phone-model-${model}`);
    document.body.dataset.wallpaper = wallpaper;
    $$('[data-setting-phone]').forEach((btn) => {
      const on = btn.dataset.settingPhone === model;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    $$('[data-setting-wallpaper]').forEach((btn) => {
      const on = btn.dataset.settingWallpaper === wallpaper;
      btn.classList.toggle('is-selected', on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

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

  function avatarSrc(user) {
    const url = String(user?.avatarUrl || user?.avatar || '').trim();
    if (/^https:\/\/cdn\.discordapp\.com\//i.test(url) || /^https?:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(url)) return url;
    if (/^https?:\/\//i.test(url) && !/cwrpvc\.lol\/assets\/clearwater-logo/i.test(url)) return url;
    const id = String(user?.id || user?.discordId || '').replace(/\D/g, '');
    if (id.length >= 16) {
      try {
        return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;
      } catch { /* ignore */ }
    }
    if (url.startsWith('assets/') || url.startsWith('/')) return SITE + (url.startsWith('/') ? url : `/${url}`);
    return '';
  }

  function avatarHtml(user, fallbackName) {
    const name = user?.displayName || user?.username || fallbackName || 'C';
    const url = avatarSrc(user);
    if (url) {
      return `<img class="avatar" src="${escapeHtml(url)}" alt="" />`;
    }
    return `<div class="avatar">${escapeHtml(String(name).slice(0, 1))}</div>`;
  }

  function signedIn() {
    return sessionUser?.authenticated === true;
  }

  async function api(action, extra = {}) {
    try {
      if (!window.anchorPhone?.api) return { ok: false, status: 0, body: { error: 'Phone API unavailable' } };
      return await window.anchorPhone.api({ action, ...extra });
    } catch (err) {
      return { ok: false, status: 0, body: { error: err?.message || 'Phone API unavailable' } };
    }
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
    if (id === 'internet') ensureSiteWebview('#internet-webview', '/internet?embed=phone');
    if (id === 'messages') ensureSiteWebview('#messages-webview', '/internet/messages?embed=phone', true);
    if (id === 'wallet') void loadWallet();
    if (id === 'maps') {
      void loadMap('maps');
      sizeLibertyScene($('#maps-scene'));
      applyMapCamera(mapCam, '#maps-scene');
      if (mapTimer) window.clearInterval(mapTimer);
      mapTimer = window.setInterval(() => void loadMap('maps'), 1000);
    } else if (id === 'findmy') {
      void loadMap('findmy');
      sizeLibertyScene($('#findmy-scene'));
      applyMapCamera(findCam, '#findmy-scene');
      if (mapTimer) window.clearInterval(mapTimer);
      mapTimer = window.setInterval(() => void loadMap('findmy'), 2500);
    } else if (mapTimer) {
      window.clearInterval(mapTimer);
      mapTimer = null;
    }
  }

  $$('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => showView(btn.dataset.open));
  });
  $$('[data-home]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const internetOn = $('#view-internet')?.classList.contains('is-active');
      const messagesOn = $('#view-messages')?.classList.contains('is-active');
      const wv = internetOn ? $('#internet-webview') : messagesOn ? $('#messages-webview') : null;
      if (wv && typeof wv.canGoBack === 'function' && wv.canGoBack()) {
        wv.goBack();
        return;
      }
      showView('home');
    });
  });
  $('#home-indicator')?.addEventListener('click', () => showView('home'));

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
      const shortcut = $('#setting-toggle-shortcut');
      if (shortcut) shortcut.value = host.toggleShortcut || 'F8';
      applyAppearance(host);
    } catch {}
  }

  $$('[data-setting-phone]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const host = await window.anchorPhone?.saveHostSettings?.({ phoneModel: btn.dataset.settingPhone });
      applyAppearance(host || { phoneModel: btn.dataset.settingPhone });
    });
  });

  $$('[data-setting-wallpaper]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const host = await window.anchorPhone?.saveHostSettings?.({ wallpaperColor: btn.dataset.settingWallpaper });
      applyAppearance(host || { wallpaperColor: btn.dataset.settingWallpaper });
    });
  });

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

  $('#setting-shortcut-capture')?.addEventListener('click', () => {
    const input = $('#setting-toggle-shortcut');
    const status = $('#setting-shortcut-status');
    if (input) input.value = 'Press a key…';
    if (status) {
      status.hidden = false;
      status.textContent = 'Press the key you want to show or hide the phone.';
    }
    const onKey = async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const accel = acceleratorFromEvent(event);
      if (!accel) return;
      window.removeEventListener('keydown', onKey, true);
      const host = await window.anchorPhone?.saveHostSettings?.({ toggleShortcut: accel });
      if (input) input.value = host?.toggleShortcut || accel;
      if (status) status.textContent = `Show / hide is now ${host?.toggleShortcut || accel}.`;
    };
    window.addEventListener('keydown', onKey, true);
  });

  $('#setting-shortcut-reset')?.addEventListener('click', async () => {
    const host = await window.anchorPhone?.saveHostSettings?.({ toggleShortcut: 'F8' });
    const input = $('#setting-toggle-shortcut');
    if (input) input.value = host?.toggleShortcut || 'F8';
  });

  $('#setting-show-phone')?.addEventListener('click', () => {
    void window.anchorPhone?.showOverlay?.();
  });

  function ensureSiteWebview(selector, path, reload = false) {
    const wv = $(selector);
    if (!wv) return;
    const dest = SITE + path;
    if (reload || !wv.getAttribute('src')) wv.setAttribute('src', dest);
    if (wv.dataset.bound === '1') return;
    wv.dataset.bound = '1';
    wv.addEventListener('will-navigate', (event) => {
      const href = String(event.url || '');
      if (!/^https:\/\/(www\.)?cwrpvc\.lol\//i.test(href) && !/^https:\/\/discord\.com\//i.test(href)) {
        event.preventDefault();
      }
    });
  }

  async function loadInternetFeed() {
    ensureSiteWebview('#internet-webview', '/internet?embed=phone');
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

  function renderPins(container, pins) {
    if (!container) return;
    container.innerHTML = pins.map((pin) => {
      if (!pin || !Number.isFinite(Number(pin.left)) || !Number.isFinite(Number(pin.top))) return '';
      const cls = pin.self ? 'pin self' : pin.dest ? 'pin dest' : 'pin other';
      const face = avatarSrc(pin);
      const photo = face ? `<img src="${escapeHtml(face)}" alt="" />` : '';
      return `<span class="${cls}${face ? ' has-face' : ''}" style="left:${Number(pin.left) * 100}%;top:${Number(pin.top) * 100}%">${photo}${escapeHtml(pin.label || '')}</span>`;
    }).join('');
  }

  function distToSegment(p, a, b) {
    const ax = Number(a.left);
    const ay = Number(a.top);
    const bx = Number(b.left);
    const by = Number(b.top);
    const px = Number(p.left);
    const py = Number(p.top);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = (dx * dx) + (dy * dy);
    if (len2 < 1e-12) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.min(1, Math.max(0, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distToPath(p, path) {
    if (!p || !Array.isArray(path) || path.length < 2) return Infinity;
    let best = Infinity;
    for (let i = 1; i < path.length; i += 1) best = Math.min(best, distToSegment(p, path[i - 1], path[i]));
    return best;
  }

  function followOrReroute() {
    if (!mapState.navigating || !mapState.me || !mapState.dest) return;
    const previous = Array.isArray(mapState.route) ? mapState.route : [];
    const offTrack = previous.length > 1 && distToPath(mapState.me, previous) > 0.028;
    if (offTrack || previous.length < 2) {
      mapState.route = shortestRoadPath(mapState.roads, mapState.me, mapState.dest);
      mapState.rerouting = offTrack;
      return;
    }
    mapState.rerouting = false;
    let next = previous.slice();
    while (next.length > 2 && ptDist(mapState.me, next[1]) <= ptDist(mapState.me, next[0]) + 0.004) {
      next = next.slice(1);
    }
    next[0] = { left: Number(mapState.me.left), top: Number(mapState.me.top) };
    mapState.route = next;
  }

  function ptDist(a, b) {
    return Math.hypot(Number(a.left) - Number(b.left), Number(a.top) - Number(b.top));
  }

  function studsBetween(a, b) {
    return Math.round(ptDist(a, b) * 3120);
  }

  function pathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i += 1) total += studsBetween(points[i - 1], points[i]);
    return total;
  }

  function buildRoadGraph(roads) {
    const nodes = [];
    const addNode = (p) => {
      const hit = nodes.findIndex((n) => ptDist(n, p) < 0.004);
      if (hit >= 0) return hit;
      nodes.push({ left: Number(p.left), top: Number(p.top) });
      return nodes.length - 1;
    };
    const adj = [];
    const link = (a, b) => {
      if (a === b) return;
      const w = ptDist(nodes[a], nodes[b]);
      adj[a] = adj[a] || [];
      adj[b] = adj[b] || [];
      adj[a].push({ to: b, w });
      adj[b].push({ to: a, w });
    };
    (roads || []).forEach((road) => {
      let prev = -1;
      (road.points || []).forEach((p) => {
        const i = addNode(p);
        adj[i] = adj[i] || [];
        if (prev >= 0) link(prev, i);
        prev = i;
      });
    });
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        if (ptDist(nodes[i], nodes[j]) < 0.012) link(i, j);
      }
    }
    return { nodes, adj: nodes.map((_, i) => adj[i] || []) };
  }

  function nearestNode(nodes, p) {
    let best = 0;
    let bestD = Infinity;
    nodes.forEach((n, i) => {
      const d = ptDist(n, p);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  function shortestRoadPath(roads, from, to) {
    const graph = buildRoadGraph(roads);
    if (graph.nodes.length < 2) return [from, to];
    const start = nearestNode(graph.nodes, from);
    const end = nearestNode(graph.nodes, to);
    const dist = graph.nodes.map(() => Infinity);
    const prev = graph.nodes.map(() => -1);
    const used = graph.nodes.map(() => false);
    dist[start] = 0;
    for (let k = 0; k < graph.nodes.length; k += 1) {
      let u = -1;
      for (let i = 0; i < graph.nodes.length; i += 1) {
        if (!used[i] && (u < 0 || dist[i] < dist[u])) u = i;
      }
      if (u < 0 || dist[u] === Infinity) break;
      used[u] = true;
      if (u === end) break;
      graph.adj[u].forEach((edge) => {
        const next = dist[u] + edge.w;
        if (next < dist[edge.to]) {
          dist[edge.to] = next;
          prev[edge.to] = u;
        }
      });
    }
    if (dist[end] === Infinity) return [from, to];
    const path = [];
    for (let x = end; x !== -1; x = prev[x]) path.push(graph.nodes[x]);
    path.reverse();
    return [from, ...path, to];
  }

  function drawRoadsOverlay() {}

  function drawRoute(from, to) {
    const svg = $('#maps-route');
    if (!svg) return;
    const points = (mapState.route && mapState.route.length > 1)
      ? mapState.route
      : (from && to ? [from, to] : []);
    if (points.length < 2) {
      svg.innerHTML = '';
      return;
    }
    const d = points.map((p, i) => `${i ? 'L' : 'M'} ${(p.left * 100).toFixed(2)} ${(p.top * 100).toFixed(2)}`).join(' ');
    svg.innerHTML = `<path d="${d}" fill="none" stroke="#76adff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />`;
  }

  function applyMapCamera(cam = mapCam, sceneId = '#maps-scene') {
    const scene = $(sceneId);
    if (!scene) return;
    scene.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})`;
  }

  function sizeLibertyScene(scene) {
    const view = scene?.parentElement;
    const img = scene?.querySelector('.liberty-map');
    if (!view || !img) return;
    const ar = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 16 / 10;
    const h = Math.max(1, view.clientHeight);
    scene.style.width = `${Math.round(h * ar)}px`;
    scene.style.height = `${h}px`;
  }

  function panMapTo(point, cam = mapCam, viewId = '#maps-map', sceneId = '#maps-scene') {
    const view = $(viewId);
    const scene = $(sceneId);
    if (!view || !scene || !point) return;
    sizeLibertyScene(scene);
    const w = scene.offsetWidth || view.clientWidth;
    const h = scene.offsetHeight || view.clientHeight;
    cam.x = view.clientWidth / 2 - Number(point.left) * w * cam.zoom;
    cam.y = view.clientHeight / 2 - Number(point.top) * h * cam.zoom;
    applyMapCamera(cam, sceneId);
  }

  function refreshMapsPins() {
    renderPins($('#maps-pins'), [
      mapState.me ? { ...mapState.me, self: true, label: 'You', avatarUrl: (sessionUser?.user || sessionUser)?.avatarUrl, id: (sessionUser?.user || sessionUser)?.id } : null,
      mapState.dest ? { ...mapState.dest, dest: true, label: mapState.dest.label || '★' } : null,
    ].filter(Boolean));
    drawRoadsOverlay();
    drawRoute(mapState.me, mapState.dest);
  }

  function applyMapPayload(kind, payload) {
    if (payload.me) mapState.me = payload.me;
    else if (!mapState.navigating) mapState.me = null;
    mapState.places = payload.places || mapState.places || [];
    mapState.friends = payload.friends || [];
    if (Array.isArray(payload.roads)) mapState.roads = payload.roads;
    const list = $('#maps-places');
    if (list) {
      list.innerHTML = mapState.places.map((p) => `<option value="${escapeHtml(p.label)}"></option>`).join('');
    }
    if (kind === 'maps') {
      if (mapState.navigating && mapState.me && mapState.dest) {
        followOrReroute();
        panMapTo(mapState.me);
        const status = $('#route-status');
        if (status) {
          status.hidden = false;
          const left = pathLength(mapState.route);
          if (left < 40) {
            status.textContent = 'You have arrived.';
            mapState.navigating = false;
            mapState.rerouting = false;
          } else if (mapState.rerouting) {
            status.textContent = `Rerouting to ${mapState.dest.label || 'pin'} · ${left} studs via roads`;
          } else {
            status.textContent = `Navigating to ${mapState.dest.label || 'pin'} · ${left} studs via roads`;
          }
        }
      }
      refreshMapsPins();
      const status = $('#route-status');
      if (status && !payload.me && !mapState.navigating) {
        status.hidden = false;
        status.textContent = 'Join the Clearwater ER:LC server to place yourself on the map.';
      }
    }
    if (kind === 'findmy') {
      findmyState.payload = payload;
      renderFindMy();
    }
  }

  function renderFindMy() {
    const payload = findmyState.payload || {};
    const meUser = sessionUser?.user || sessionUser || {};
    renderPins($('#findmy-pins'), [
      payload.me ? { ...payload.me, self: true, label: 'You', avatarUrl: meUser.avatarUrl, id: meUser.id } : null,
      ...(payload.friends || []).filter((f) => f.location).map((f) => ({
        ...f.location,
        label: f.displayName,
        avatarUrl: f.avatarUrl,
        id: f.id,
      })),
    ].filter(Boolean));
    const people = $('#findmy-list');
    if (!people) return;
    const query = String(findmyState.query || '').trim().toLowerCase();
    const contacts = (payload.contacts || []).filter((c) => {
      if (!query) return true;
      const hay = `${c.displayName || ''} ${c.username || ''}`.toLowerCase();
      return hay.includes(query);
    });
    people.innerHTML = contacts.length
      ? contacts.map((c) => {
        const friend = (payload.friends || []).find((f) => String(f.id) === String(c.id));
        const loc = friend?.location?.label
          || (friend?.online ? 'In Liberty County' : null)
          || (c.sharesWithYou ? 'Online location hidden until they join' : 'Not sharing with you');
        return `<li>
            ${avatarHtml({ id: c.id, displayName: c.displayName, avatarUrl: c.avatarUrl || friend?.avatarUrl }, c.displayName)}
            <div><p class="item-title">${escapeHtml(c.displayName)}</p><p class="item-sub">${escapeHtml(loc)}</p></div>
            <button type="button" class="toggle ${c.sharing ? 'is-on' : ''}" data-findmy-id="${escapeHtml(c.id)}" aria-label="Share with ${escapeHtml(c.displayName)}"></button>
          </li>`;
      }).join('')
      : `<li><p class="item-sub">${query ? 'No names match that search.' : 'Follow friends on Internet to share locations.'}</p></li>`;
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
    if (payload.me && !findCam._placed) {
      panMapTo(payload.me, findCam, '#findmy-map', '#findmy-scene');
      findCam._placed = true;
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
    if (kind === 'maps' && !Array.isArray(result.body?.roads)) {
      const roads = await api('liberty-roads-get');
      if (roads.ok && Array.isArray(roads.body?.roads)) result.body.roads = roads.body.roads;
    }
    applyMapPayload(kind, result.body || {});
  }

  function mapPointFromPointer(event, cam = mapCam, viewId = '#maps-map', sceneId = '#maps-scene') {
    const view = $(viewId);
    const scene = $(sceneId);
    if (!view || !scene) return null;
    const rect = view.getBoundingClientRect();
    const w = scene.offsetWidth || rect.width;
    const h = scene.offsetHeight || rect.height;
    const x = (event.clientX - rect.left - cam.x) / (w * cam.zoom);
    const y = (event.clientY - rect.top - cam.y) / (h * cam.zoom);
    return {
      left: Math.min(1, Math.max(0, x)),
      top: Math.min(1, Math.max(0, y)),
    };
  }

  function bindGmap(viewId, sceneId, cam, onTap) {
    const view = $(viewId);
    const scene = $(sceneId);
    if (!view || !scene) return;
    sizeLibertyScene(scene);
    let pan = null;
    view.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      pan = { id: event.pointerId, x: event.clientX, y: event.clientY, camX: cam.x, camY: cam.y, moved: 0 };
      view.classList.add('is-panning');
      view.setPointerCapture?.(event.pointerId);
    });
    view.addEventListener('pointermove', (event) => {
      if (!pan || event.pointerId !== pan.id) return;
      const dx = event.clientX - pan.x;
      const dy = event.clientY - pan.y;
      pan.moved = Math.hypot(dx, dy);
      cam.x = pan.camX + dx;
      cam.y = pan.camY + dy;
      applyMapCamera(cam, sceneId);
    });
    const endPan = (event) => {
      if (!pan || event.pointerId !== pan.id) return;
      const moved = pan.moved;
      pan = null;
      view.classList.remove('is-panning');
      if (moved > 8 || !onTap) return;
      onTap(event);
    };
    view.addEventListener('pointerup', endPan);
    view.addEventListener('pointercancel', () => { pan = null; view.classList.remove('is-panning'); });
    view.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = view.getBoundingClientRect();
      const prev = cam.zoom;
      const next = Math.min(5, Math.max(1, prev * (event.deltaY > 0 ? 0.9 : 1.12)));
      const cx = event.clientX - rect.left;
      const cy = event.clientY - rect.top;
      cam.x = cx - ((cx - cam.x) / prev) * next;
      cam.y = cy - ((cy - cam.y) / prev) * next;
      cam.zoom = next;
      applyMapCamera(cam, sceneId);
    }, { passive: false });
    applyMapCamera(cam, sceneId);
  }

  function startRoute() {
    const status = $('#route-status');
    const stop = $('#maps-stop');
    if (status) status.hidden = false;
    const query = $('#maps-dest')?.value.trim();
    const place = mapState.places.find((p) => String(p.label).toLowerCase() === query.toLowerCase());
    if (place) mapState.dest = place;
    if (!mapState.me) {
      if (status) status.textContent = 'Join the server so Maps can see where you are.';
      return;
    }
    if (!mapState.dest) {
      if (status) status.textContent = 'Tap the map or pick a destination.';
      return;
    }
    mapState.route = shortestRoadPath(mapState.roads, mapState.me, mapState.dest);
    mapState.navigating = true;
    mapState.rerouting = false;
    mapCam.zoom = Math.max(mapCam.zoom, 2.2);
    panMapTo(mapState.me);
    refreshMapsPins();
    if (stop) stop.hidden = false;
    const viaRoads = (mapState.roads || []).length > 0;
    if (status) {
      status.textContent = viaRoads
        ? `Navigating to ${mapState.dest.label || 'pin'} · ${pathLength(mapState.route)} studs via roads`
        : `Straight-line fallback · paint roads in Server Management, then save. ${pathLength(mapState.route)} studs`;
    }
  }

  $('#maps-go')?.addEventListener('click', (event) => {
    event.preventDefault();
    startRoute();
  });
  $('#maps-stop')?.addEventListener('click', () => {
    mapState.navigating = false;
    mapState.rerouting = false;
    const stop = $('#maps-stop');
    if (stop) stop.hidden = true;
    const status = $('#route-status');
    if (status) status.textContent = 'Route stopped.';
  });

  $('#findmy-search')?.addEventListener('input', (event) => {
    findmyState.query = event.target.value || '';
    if (findmyState.payload) renderFindMy();
  });

  bindGmap('#maps-map', '#maps-scene', mapCam, (event) => {
    const point = mapPointFromPointer(event);
    if (!point) return;
    mapState.dest = { ...point, label: 'Dropped pin' };
    const destInput = $('#maps-dest');
    if (destInput) destInput.value = 'Dropped pin';
    if (mapState.navigating && mapState.me) mapState.route = shortestRoadPath(mapState.roads, mapState.me, mapState.dest);
    refreshMapsPins();
  });
  bindGmap('#findmy-map', '#findmy-scene', findCam);

  $('#maps-zoom-in')?.addEventListener('click', () => {
    mapCam.zoom = Math.min(5, mapCam.zoom * 1.2);
    if (mapState.me) panMapTo(mapState.me);
    else applyMapCamera();
  });
  $('#maps-zoom-out')?.addEventListener('click', () => {
    mapCam.zoom = Math.max(1, mapCam.zoom / 1.2);
    applyMapCamera();
  });
  $('#findmy-zoom-in')?.addEventListener('click', () => {
    findCam.zoom = Math.min(5, findCam.zoom * 1.2);
    const me = findmyState.payload?.me;
    if (me) panMapTo(me, findCam, '#findmy-map', '#findmy-scene');
    else applyMapCamera(findCam, '#findmy-scene');
  });
  $('#findmy-zoom-out')?.addEventListener('click', () => {
    findCam.zoom = Math.max(1, findCam.zoom / 1.2);
    applyMapCamera(findCam, '#findmy-scene');
  });

  $$('.liberty-map').forEach((img) => {
    img.src = MAP_IMG;
    img.addEventListener('load', () => {
      const scene = img.closest('.gmap-scene');
      if (scene) sizeLibertyScene(scene);
    });
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

  function hideUpdateModal() {
    const modal = $('#update-modal');
    if (modal) modal.hidden = true;
  }

  function showUpdateModal(info) {
    const modal = $('#update-modal');
    const copy = $('#update-modal-copy');
    const download = $('#update-modal-download');
    if (!modal) return;
    const latest = String(info?.version || latestInfo?.version || '').trim() || 'latest';
    if (copy) {
      copy.textContent = `You’re on v${appVersion}. Download v${latest} to keep Clearwater Phone up to date.`;
    }
    if (download) download.textContent = `Download v${latest}`;
    modal.hidden = false;
  }

  async function openLatestDownload() {
    const href = latestDownloadUrl();
    const status = $('#settings-update-status');
    const downloadBtn = $('#update-modal-download');
    const latest = String(latestInfo?.version || '').trim();
    if (downloadBtn && latest) downloadBtn.textContent = `Downloading v${latest}…`;
    try {
      if (typeof window.anchorPhone?.installUpdate === 'function') {
        const result = await window.anchorPhone.installUpdate(href);
        if (result?.ok) {
          if (status) {
            status.hidden = false;
            status.textContent = result.message || 'Update downloaded. Restart Clearwater Phone when prompted.';
          }
          hideUpdateModal();
          return;
        }
      }
      const opened = await window.anchorPhone?.openUrl?.(href);
      if (status) {
        status.hidden = false;
        status.textContent = opened === false
          ? 'Could not open the download. Visit cwrpvc.lol and use Download Phone.'
          : `Opened the installer. Finish setup, then you can delete the downloaded file.`;
      }
      if (opened !== false) hideUpdateModal();
    } catch {
      if (status) {
        status.hidden = false;
        status.textContent = 'Could not open the download. Visit cwrpvc.lol and use Download Phone.';
      }
    } finally {
      if (downloadBtn && latest) downloadBtn.textContent = `Download v${latest}`;
    }
  }

  function showOutdated(info) {
    latestInfo = info;
    const banner = $('#update-banner');
    const copy = $('#update-copy');
    const bannerBtn = $('#update-download');
    const latest = String(info.version || '').trim() || 'latest';
    if (banner) banner.hidden = false;
    if (copy) copy.textContent = `You’re on v${appVersion}. Download v${latest}.`;
    if (bannerBtn) bannerBtn.textContent = `Download v${latest}`;
    showUpdateModal(info);
    renderSettings();
  }

  async function checkForUpdates(manual = false) {
    const status = $('#settings-update-status');
    try {
      const res = await window.anchorPhone?.checkUpdate?.();
      if (!res?.ok || !res.body?.version) throw new Error('version check failed');
      const info = res.body;
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
      hideUpdateModal();
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
  $('#update-modal-download')?.addEventListener('click', () => void openLatestDownload());
  $('#update-modal-dismiss')?.addEventListener('click', () => hideUpdateModal());
  $('#update-modal')?.addEventListener('click', (event) => {
    if (event.target === event.currentTarget) hideUpdateModal();
  });

  void (async () => {
    try {
      const info = await window.anchorPhone?.getVersion?.();
      if (info?.version) appVersion = info.version;
    } catch {}
    await loadHostSettings();
    await refreshSession();
    renderSettings();
    await checkForUpdates(false);
    window.setInterval(() => void refreshSession(), 60_000);
  })();
})();
