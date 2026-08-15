(() => {
  const SITE = 'https://cwrpvc.lol';
  const VERSION_URL = SITE + '/downloads/clearwater-phone-version.json';
  const WEB = {
    wallet: '/internet/wallet',
    marketplace: '/internet/marketplace',
    messages: '/internet/messages',
    findmy: '/internet',
    maps: '/internet',
    settings: '/internet/phone'
  };

  const settings = {
    openAppsOnWeb: false,
    showWebButtons: true,
    autoUpdate: true
  };

  let appVersion = '1.1.0';
  let latestInfo = null;
  let updateInFlight = false;

  function loadSettings() {
    try {
      const raw = localStorage.getItem('cw.phone.settings');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.openAppsOnWeb === 'boolean') settings.openAppsOnWeb = parsed.openAppsOnWeb;
      if (typeof parsed.showWebButtons === 'boolean') settings.showWebButtons = parsed.showWebButtons;
      if (typeof parsed.autoUpdate === 'boolean') settings.autoUpdate = parsed.autoUpdate;
    } catch {}
  }

  function saveSettings() {
    localStorage.setItem('cw.phone.settings', JSON.stringify(settings));
  }

  function openWeb(path) {
    const href = SITE + path;
    if (window.anchorPhone?.openUrl) return window.anchorPhone.openUrl(href);
    window.open(href, '_blank', 'noopener');
  }

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

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  function tick() {
    const el = $('#status-time');
    if (!el) return;
    const d = new Date();
    el.textContent = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  tick();
  setInterval(tick, 15000);

  const views = $$('.view');

  function showView(id) {
    views.forEach((v) => {
      const on = v.dataset.view === id;
      v.classList.toggle('is-active', on);
      if (on) v.hidden = false;
      else if (v.dataset.view !== 'home') v.hidden = true;
    });
    const home = $('#view-home');
    if (home) home.hidden = id !== 'home';
    if (id === 'settings') renderSettings();
  }

  $$('[data-open]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.open;
      if (settings.openAppsOnWeb && WEB[key] && key !== 'settings') {
        openWeb(WEB[key]);
        return;
      }
      showView(key);
    });
  });

  $$('[data-home]').forEach((btn) => {
    btn.addEventListener('click', () => showView('home'));
  });

  function syncWebButtons() {
    document.body.classList.toggle('hide-open-web', !settings.showWebButtons);
  }

  $$('[data-web]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = btn.dataset.web;
      const path = WEB[key];
      if (path) openWeb(path);
    });
  });

  function setToggle(el, on) {
    if (!el) return;
    el.classList.toggle('is-on', on);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
  }

  function renderSettings() {
    setToggle($('#setting-open-web'), settings.openAppsOnWeb);
    setToggle($('#setting-show-web-btn'), settings.showWebButtons);
    setToggle($('#setting-auto-update'), settings.autoUpdate);
    const label = $('#settings-version-label');
    if (!label) return;
    if (latestInfo && compareVersions(appVersion, latestInfo.version) < 0) {
      label.textContent = `v${appVersion} · outdated (latest v${latestInfo.version})`;
      const btn = $('#settings-update-now');
      if (btn) btn.hidden = false;
    } else {
      label.textContent = `v${appVersion} · up to date`;
      const btn = $('#settings-update-now');
      if (btn) btn.hidden = true;
    }
  }

  function bindToggle(id, key) {
    const el = $(id);
    if (!el) return;
    el.addEventListener('click', () => {
      settings[key] = !settings[key];
      saveSettings();
      setToggle(el, settings[key]);
      if (key === 'showWebButtons') syncWebButtons();
    });
  }

  async function installUpdate() {
    if (!latestInfo?.downloadUrl || updateInFlight) return;
    updateInFlight = true;
    const status = $('#settings-update-status');
    const bannerCopy = $('#update-copy');
    if (status) {
      status.hidden = false;
      status.textContent = 'Downloading update…';
    }
    if (bannerCopy) bannerCopy.textContent = 'Downloading update…';
    try {
      if (!window.anchorPhone?.installUpdate) {
        openWeb('/internet/phone');
        updateInFlight = false;
        return;
      }
      const result = await window.anchorPhone.installUpdate(latestInfo.downloadUrl);
      if (!result?.ok) {
        if (status) status.textContent = result?.error || 'Update failed.';
        if (bannerCopy) bannerCopy.textContent = 'Update failed — try again';
        updateInFlight = false;
      }
    } catch {
      if (status) status.textContent = 'Update failed.';
      updateInFlight = false;
    }
  }

  function showOutdated(info) {
    latestInfo = info;
    const banner = $('#update-banner');
    const copy = $('#update-copy');
    if (banner) banner.hidden = false;
    if (copy) copy.textContent = `Outdated version · v${appVersion} → v${info.version}`;
    const updateBtn = $('#settings-update-now');
    if (updateBtn) updateBtn.hidden = false;
    renderSettings();
    if (settings.autoUpdate) void installUpdate();
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
    const end = () => {
      dragging = false;
    };
    dragEl.addEventListener('pointerup', end);
    dragEl.addEventListener('pointercancel', end);
  }

  const store = {
    load(key, fallback) {
      try {
        const raw = localStorage.getItem(`anchor.${key}`);
        return raw ? JSON.parse(raw) : fallback;
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      localStorage.setItem(`anchor.${key}`, JSON.stringify(value));
    }
  };

  let balance = store.load('balance', 12450);
  let txns = store.load('txns', [
    { title: 'Received from Maya', sub: 'Today · Request paid', amt: 500, dir: 'in' },
    { title: 'Sent to Panel Bank', sub: 'Yesterday', amt: 1200, dir: 'out' },
    { title: 'Marketplace payout', sub: 'Gulf Coast Customs', amt: 840, dir: 'in' }
  ]);
  let walletMode = null;

  function formatMoney(n) {
    return `C$${Number(n).toLocaleString('en-US')}`;
  }

  function renderWallet() {
    const bal = $('#wallet-balance');
    if (bal) bal.textContent = formatMoney(balance);
    const list = $('#wallet-txns');
    if (!list) return;
    list.innerHTML = txns
      .map(
        (t) => `<li>
        <div class="avatar">${t.title.slice(0, 1)}</div>
        <div><p class="item-title">${escapeHtml(t.title)}</p><p class="item-sub">${escapeHtml(t.sub)}</p></div>
        <span class="amt ${t.dir}">${t.dir === 'in' ? '+' : '−'}${formatMoney(t.amt)}</span>
      </li>`
      )
      .join('');
  }

  $$('[data-wallet-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      walletMode = btn.dataset.walletAction;
      $$('[data-wallet-action]').forEach((b) => b.classList.toggle('is-active', b === btn));
      const panel = $('#wallet-panel');
      if (!panel) return;
      panel.hidden = false;
      $('#wallet-submit').textContent =
        walletMode === 'send' ? 'Send funds' : walletMode === 'request' ? 'Send request' : 'Show receive code';
      $('#wallet-note-field').hidden = walletMode === 'receive';
      $('#wallet-member').parentElement.hidden = walletMode === 'receive';
      $('#wallet-amount').parentElement.hidden = walletMode === 'receive';
      $('#wallet-status').hidden = true;
      if (walletMode === 'receive') {
        $('#wallet-status').hidden = false;
        $('#wallet-status').textContent = 'Your receive tag: @you · share with panel members';
      }
    });
  });

  $('#wallet-submit')?.addEventListener('click', () => {
    const status = $('#wallet-status');
    if (walletMode === 'receive') {
      status.hidden = false;
      status.textContent = 'Share @you or your Discord ID to receive funds.';
      return;
    }
    const member = $('#wallet-member').value.trim();
    const amount = Math.floor(Number($('#wallet-amount').value));
    const note = $('#wallet-note').value.trim();
    if (!member || !amount || amount < 1) {
      status.hidden = false;
      status.textContent = 'Enter a member and amount.';
      return;
    }
    if (walletMode === 'send') {
      if (amount > balance) {
        status.hidden = false;
        status.textContent = 'Insufficient balance.';
        return;
      }
      balance -= amount;
      txns.unshift({ title: `Sent to ${member}`, sub: note || 'Just now', amt: amount, dir: 'out' });
      status.textContent = `Sent ${formatMoney(amount)} to ${member}.`;
    } else {
      txns.unshift({ title: `Requested from ${member}`, sub: note || 'Pending', amt: amount, dir: 'in' });
      status.textContent = `Request for ${formatMoney(amount)} sent to ${member}.`;
    }
    store.save('balance', balance);
    store.save('txns', txns.slice(0, 40));
    status.hidden = false;
    renderWallet();
    $('#wallet-member').value = '';
    $('#wallet-amount').value = '';
    $('#wallet-note').value = '';
  });

  let products = store.load('products', [
    { name: 'Custom wrap package', price: 2500 },
    { name: 'Performance tune', price: 1800 },
    { name: 'Detailing — full', price: 450 }
  ]);
  let employees = store.load('employees', [
    { name: 'Riley Chen', role: 'Manager' },
    { name: 'Sam Ortiz', role: 'Sales' },
    { name: 'Casey Brooks', role: 'Tech' }
  ]);
  let payouts = store.load('payouts', [
    { title: 'Riley Chen', sub: 'Weekly share', amt: 620, dir: 'out' },
    { title: 'Sam Ortiz', sub: 'Commission', amt: 310, dir: 'out' }
  ]);

  function renderMarket() {
    const productList = $('#product-list');
    if (!productList) return;
    productList.innerHTML = products
      .map(
        (p) => `<li>
        <div class="avatar">▣</div>
        <div><p class="item-title">${escapeHtml(p.name)}</p><p class="item-sub">Listed · Clearwater storefront</p></div>
        <span class="price-tag">${formatMoney(p.price)}</span>
      </li>`
      )
      .join('');
    $('#employee-list').innerHTML = employees
      .map(
        (e) => `<li>
        <div class="avatar">${escapeHtml(e.name.slice(0, 1))}</div>
        <div><p class="item-title">${escapeHtml(e.name)}</p><p class="item-sub">${escapeHtml(e.role)}</p></div>
      </li>`
      )
      .join('');
    $('#payout-list').innerHTML = payouts
      .map(
        (t) => `<li>
        <div class="avatar">${escapeHtml(t.title.slice(0, 1))}</div>
        <div><p class="item-title">${escapeHtml(t.title)}</p><p class="item-sub">${escapeHtml(t.sub)}</p></div>
        <span class="amt out">−${formatMoney(t.amt)}</span>
      </li>`
      )
      .join('');
  }

  $$('[data-market-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.marketTab;
      $$('[data-market-tab]').forEach((b) => b.classList.toggle('is-active', b === btn));
      $$('.market-pane').forEach((pane) => {
        const on = pane.dataset.pane === tab;
        pane.classList.toggle('is-active', on);
        pane.hidden = !on;
      });
    });
  });

  $('#add-product')?.addEventListener('click', () => {
    const name = window.prompt('Product name');
    if (!name) return;
    const price = Math.floor(Number(window.prompt('Price (C$)', '500')));
    if (!price) return;
    products.unshift({ name, price });
    store.save('products', products);
    renderMarket();
  });

  $('#add-employee')?.addEventListener('click', () => {
    const name = window.prompt('Employee name');
    if (!name) return;
    const role = window.prompt('Role', 'Staff') || 'Staff';
    employees.push({ name, role });
    store.save('employees', employees);
    renderMarket();
    const meta = $('.store-meta');
    if (meta) meta.textContent = `Your storefront · ${employees.length} employees`;
  });

  $('#store-edit')?.addEventListener('click', () => {
    const el = $('#store-name');
    const name = window.prompt('Storefront name', el?.textContent || '');
    if (!name || !el) return;
    el.textContent = name;
    store.save('storeName', name);
  });

  const savedStore = store.load('storeName', null);
  if (savedStore && $('#store-name')) $('#store-name').textContent = savedStore;

  let contacts = store.load('findmy', [
    { name: 'Alex Rivera', sharing: true },
    { name: 'Jordan Lee', sharing: true },
    { name: 'Morgan Blake', sharing: false },
    { name: 'Taylor Quinn', sharing: false }
  ]);

  function renderFindMy() {
    const list = $('#findmy-list');
    if (!list) return;
    list.innerHTML = contacts
      .map(
        (c, i) => `<li>
        <div class="avatar">${escapeHtml(c.name.slice(0, 1))}</div>
        <div><p class="item-title">${escapeHtml(c.name)}</p><p class="item-sub">${c.sharing ? 'Sharing location' : 'Hidden'}</p></div>
        <button type="button" class="toggle ${c.sharing ? 'is-on' : ''}" data-findmy-toggle="${i}" aria-label="Toggle sharing for ${escapeHtml(c.name)}"></button>
      </li>`
      )
      .join('');
    $$('[data-findmy-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const i = Number(btn.dataset.findmyToggle);
        contacts[i].sharing = !contacts[i].sharing;
        store.save('findmy', contacts);
        renderFindMy();
      });
    });
  }

  let threads = store.load('threads', [
    { name: 'Alex Rivera', last: 'On my way to the pier.', when: 'now' },
    { name: 'Marketplace Bot', last: 'Order #482 confirmed.', when: '12m' },
    { name: 'Jordan Lee', last: 'Location shared ✓', when: '1h' }
  ]);

  function renderThreads() {
    const list = $('#thread-list');
    if (!list) return;
    list.innerHTML = threads
      .map(
        (t) => `<li>
        <div class="avatar">${escapeHtml(t.name.slice(0, 1))}</div>
        <div style="flex:1"><p class="item-title">${escapeHtml(t.name)}</p><p class="item-sub">${escapeHtml(t.last)}</p></div>
        <span class="item-sub">${escapeHtml(t.when)}</span>
      </li>`
      )
      .join('');
  }

  $('#new-message')?.addEventListener('click', () => {
    const c = $('#msg-composer');
    if (c) c.hidden = !c.hidden;
  });

  $('#msg-send')?.addEventListener('click', () => {
    const to = $('#msg-to').value.trim();
    const body = $('#msg-body').value.trim();
    if (!to || !body) return;
    threads.unshift({ name: to, last: body, when: 'now' });
    store.save('threads', threads);
    $('#msg-to').value = '';
    $('#msg-body').value = '';
    $('#msg-composer').hidden = true;
    renderThreads();
  });

  $('#maps-go')?.addEventListener('click', () => {
    const dest = $('#maps-dest').value.trim() || 'destination';
    const el = $('#route-status');
    el.hidden = false;
    el.textContent = `Routing to ${dest}… Fastest path · ~4 min drive`;
    const pathEl = $('.route-line path');
    if (pathEl) {
      pathEl.style.animation = 'none';
      void pathEl.offsetWidth;
      pathEl.style.animation = '';
    }
  });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  loadSettings();
  syncWebButtons();
  bindToggle('#setting-open-web', 'openAppsOnWeb');
  bindToggle('#setting-show-web-btn', 'showWebButtons');
  bindToggle('#setting-auto-update', 'autoUpdate');

  $('#settings-check-update')?.addEventListener('click', () => {
    void checkForUpdates(true);
  });
  $('#settings-update-now')?.addEventListener('click', () => {
    void installUpdate();
  });
  $('#update-now')?.addEventListener('click', () => {
    void installUpdate();
  });

  window.anchorPhone?.onUpdateProgress?.((pct) => {
    const status = $('#settings-update-status');
    const copy = $('#update-copy');
    const msg = `Downloading update… ${pct}%`;
    if (status) {
      status.hidden = false;
      status.textContent = msg;
    }
    if (copy) copy.textContent = msg;
  });

  void (async () => {
    try {
      const info = await window.anchorPhone?.getVersion?.();
      if (info?.version) appVersion = info.version;
    } catch {}
    renderSettings();
    await checkForUpdates(false);
  })();

  renderWallet();
  renderMarket();
  renderFindMy();
  renderThreads();

  window.openWeb = openWeb;
  window.ClearwaterPhone = { SITE, WEB, openWeb, showView, checkForUpdates, settings };
})();
