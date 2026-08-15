(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* —— Clock —— */
  function tick() {
    const el = $("#status-time");
    if (!el) return;
    const d = new Date();
    el.textContent = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  tick();
  setInterval(tick, 15000);

  /* —— Navigation —— */
  const views = $$(".view");

  function showView(id) {
    views.forEach((v) => {
      const on = v.dataset.view === id;
      v.classList.toggle("is-active", on);
      if (on) v.hidden = false;
      else if (v.dataset.view !== "home") v.hidden = true;
    });
    const home = $("#view-home");
    if (home) home.hidden = id !== "home";
  }

  $$("[data-open]").forEach((btn) => {
    btn.addEventListener("click", () => showView(btn.dataset.open));
  });

  $$("[data-home]").forEach((btn) => {
    btn.addEventListener("click", () => showView("home"));
  });

  /* —— Drag window —— */
  const dragEl = $("[data-drag]");
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  if (dragEl) {
    dragEl.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      lastX = e.screenX;
      lastY = e.screenY;
      dragEl.setPointerCapture?.(e.pointerId);
    });
    dragEl.addEventListener("pointermove", (e) => {
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
    dragEl.addEventListener("pointerup", end);
    dragEl.addEventListener("pointercancel", end);
  }

  /* —— Persist —— */
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

  /* —— Wallet —— */
  let balance = store.load("balance", 12450);
  let txns = store.load("txns", [
    { title: "Received from Maya", sub: "Today · Request paid", amt: 500, dir: "in" },
    { title: "Sent to Panel Bank", sub: "Yesterday", amt: 1200, dir: "out" },
    { title: "Marketplace payout", sub: "Gulf Coast Customs", amt: 840, dir: "in" }
  ]);
  let walletMode = null;

  function formatMoney(n) {
    return `C$${Number(n).toLocaleString("en-US")}`;
  }

  function renderWallet() {
    $("#wallet-balance").textContent = formatMoney(balance);
    const list = $("#wallet-txns");
    list.innerHTML = txns
      .map(
        (t) => `<li>
        <div class="avatar">${t.title.slice(0, 1)}</div>
        <div><p class="item-title">${escapeHtml(t.title)}</p><p class="item-sub">${escapeHtml(t.sub)}</p></div>
        <span class="amt ${t.dir}">${t.dir === "in" ? "+" : "−"}${formatMoney(t.amt)}</span>
      </li>`
      )
      .join("");
  }

  $$("[data-wallet-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      walletMode = btn.dataset.walletAction;
      $$("[data-wallet-action]").forEach((b) => b.classList.toggle("is-active", b === btn));
      const panel = $("#wallet-panel");
      panel.hidden = false;
      $("#wallet-submit").textContent =
        walletMode === "send" ? "Send funds" : walletMode === "request" ? "Send request" : "Show receive code";
      $("#wallet-note-field").hidden = walletMode === "receive";
      $("#wallet-member").parentElement.hidden = walletMode === "receive";
      $("#wallet-amount").parentElement.hidden = walletMode === "receive";
      $("#wallet-status").hidden = true;
      if (walletMode === "receive") {
        $("#wallet-status").hidden = false;
        $("#wallet-status").textContent = "Your receive tag: @you · share with panel members";
      }
    });
  });

  $("#wallet-submit")?.addEventListener("click", () => {
    const status = $("#wallet-status");
    if (walletMode === "receive") {
      status.hidden = false;
      status.textContent = "Share @you or your Discord ID to receive funds.";
      return;
    }
    const member = $("#wallet-member").value.trim();
    const amount = Math.floor(Number($("#wallet-amount").value));
    const note = $("#wallet-note").value.trim();
    if (!member || !amount || amount < 1) {
      status.hidden = false;
      status.textContent = "Enter a member and amount.";
      return;
    }
    if (walletMode === "send") {
      if (amount > balance) {
        status.hidden = false;
        status.textContent = "Insufficient balance.";
        return;
      }
      balance -= amount;
      txns.unshift({
        title: `Sent to ${member}`,
        sub: note || "Just now",
        amt: amount,
        dir: "out"
      });
      status.textContent = `Sent ${formatMoney(amount)} to ${member}.`;
    } else {
      txns.unshift({
        title: `Requested from ${member}`,
        sub: note || "Pending",
        amt: amount,
        dir: "in"
      });
      status.textContent = `Request for ${formatMoney(amount)} sent to ${member}.`;
    }
    store.save("balance", balance);
    store.save("txns", txns.slice(0, 40));
    status.hidden = false;
    renderWallet();
    $("#wallet-member").value = "";
    $("#wallet-amount").value = "";
    $("#wallet-note").value = "";
  });

  /* —— Marketplace —— */
  let products = store.load("products", [
    { name: "Custom wrap package", price: 2500 },
    { name: "Performance tune", price: 1800 },
    { name: "Detailing — full", price: 450 }
  ]);
  let employees = store.load("employees", [
    { name: "Riley Chen", role: "Manager" },
    { name: "Sam Ortiz", role: "Sales" },
    { name: "Casey Brooks", role: "Tech" }
  ]);
  let payouts = store.load("payouts", [
    { title: "Riley Chen", sub: "Weekly share", amt: 620, dir: "out" },
    { title: "Sam Ortiz", sub: "Commission", amt: 310, dir: "out" }
  ]);

  function renderMarket() {
    $("#product-list").innerHTML = products
      .map(
        (p) => `<li>
        <div class="avatar">▣</div>
        <div><p class="item-title">${escapeHtml(p.name)}</p><p class="item-sub">Listed · Anchor storefront</p></div>
        <span class="price-tag">${formatMoney(p.price)}</span>
      </li>`
      )
      .join("");
    $("#employee-list").innerHTML = employees
      .map(
        (e) => `<li>
        <div class="avatar">${escapeHtml(e.name.slice(0, 1))}</div>
        <div><p class="item-title">${escapeHtml(e.name)}</p><p class="item-sub">${escapeHtml(e.role)}</p></div>
      </li>`
      )
      .join("");
    $("#payout-list").innerHTML = payouts
      .map(
        (t) => `<li>
        <div class="avatar">${escapeHtml(t.title.slice(0, 1))}</div>
        <div><p class="item-title">${escapeHtml(t.title)}</p><p class="item-sub">${escapeHtml(t.sub)}</p></div>
        <span class="amt out">−${formatMoney(t.amt)}</span>
      </li>`
      )
      .join("");
  }

  $$("[data-market-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.marketTab;
      $$("[data-market-tab]").forEach((b) => b.classList.toggle("is-active", b === btn));
      $$(".market-pane").forEach((pane) => {
        const on = pane.dataset.pane === tab;
        pane.classList.toggle("is-active", on);
        pane.hidden = !on;
      });
    });
  });

  $("#add-product")?.addEventListener("click", () => {
    const name = window.prompt("Product name");
    if (!name) return;
    const price = Math.floor(Number(window.prompt("Price (C$)", "500")));
    if (!price) return;
    products.unshift({ name, price });
    store.save("products", products);
    renderMarket();
  });

  $("#add-employee")?.addEventListener("click", () => {
    const name = window.prompt("Employee name");
    if (!name) return;
    const role = window.prompt("Role", "Staff") || "Staff";
    employees.push({ name, role });
    store.save("employees", employees);
    renderMarket();
    $(".store-meta").textContent = `Your storefront · ${employees.length} employees`;
  });

  $("#store-edit")?.addEventListener("click", () => {
    const name = window.prompt("Storefront name", $("#store-name").textContent);
    if (!name) return;
    $("#store-name").textContent = name;
    store.save("storeName", name);
  });

  const savedStore = store.load("storeName", null);
  if (savedStore) $("#store-name").textContent = savedStore;

  /* —— Find My —— */
  let contacts = store.load("findmy", [
    { name: "Alex Rivera", sharing: true },
    { name: "Jordan Lee", sharing: true },
    { name: "Morgan Blake", sharing: false },
    { name: "Taylor Quinn", sharing: false }
  ]);

  function renderFindMy() {
    $("#findmy-list").innerHTML = contacts
      .map(
        (c, i) => `<li>
        <div class="avatar">${escapeHtml(c.name.slice(0, 1))}</div>
        <div><p class="item-title">${escapeHtml(c.name)}</p><p class="item-sub">${c.sharing ? "Sharing location" : "Hidden"}</p></div>
        <button type="button" class="toggle ${c.sharing ? "is-on" : ""}" data-findmy-toggle="${i}" aria-label="Toggle sharing for ${escapeHtml(c.name)}"></button>
      </li>`
      )
      .join("");
    $$("[data-findmy-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.findmyToggle);
        contacts[i].sharing = !contacts[i].sharing;
        store.save("findmy", contacts);
        renderFindMy();
      });
    });
  }

  /* —— Mail —— */
  let mails = store.load("mails", [
    {
      from: "Marketplace Receipts",
      subject: "Receipt · Performance tune",
      preview: "You paid C$1,800 to Gulf Coast Customs.",
      unread: true,
      when: "2m"
    },
    {
      from: "Anchor Panel",
      subject: "Wallet request paid",
      preview: "Maya sent you C$500.",
      unread: true,
      when: "1h"
    },
    {
      from: "Clearwater Dispatch",
      subject: "Weekly briefing",
      preview: "Shift notes for civilian businesses…",
      unread: false,
      when: "Mon"
    }
  ]);

  function renderMail() {
    $("#mail-list").innerHTML = mails
      .map(
        (m, i) => `<li class="${m.unread ? "mail-unread" : ""}" data-mail="${i}">
        <div class="avatar">✉</div>
        <div style="flex:1;min-width:0">
          <p class="item-title">${escapeHtml(m.subject)}</p>
          <p class="item-sub">${escapeHtml(m.from)} · ${escapeHtml(m.preview)}</p>
        </div>
        <span class="item-sub">${escapeHtml(m.when)}</span>
      </li>`
      )
      .join("");
    $$("[data-mail]").forEach((li) => {
      li.addEventListener("click", () => {
        const i = Number(li.dataset.mail);
        mails[i].unread = false;
        store.save("mails", mails);
        window.alert(`${mails[i].subject}\n\nFrom: ${mails[i].from}\n\n${mails[i].preview}`);
        renderMail();
      });
    });
  }

  $("#compose-mail")?.addEventListener("click", () => {
    $("#mail-sheet").hidden = false;
  });

  $$("[data-close-sheet]").forEach((b) =>
    b.addEventListener("click", () => {
      $("#mail-sheet").hidden = true;
    })
  );

  $("#mail-send")?.addEventListener("click", () => {
    const to = $("#mail-to").value.trim();
    const subject = $("#mail-subject").value.trim() || "(No subject)";
    const body = $("#mail-body").value.trim();
    if (!to) return;
    mails.unshift({
      from: "Me",
      subject: `To ${to}: ${subject}`,
      preview: body || "Sent via Anchor Mail",
      unread: false,
      when: "Now"
    });
    store.save("mails", mails);
    $("#mail-to").value = "";
    $("#mail-subject").value = "";
    $("#mail-body").value = "";
    $("#mail-sheet").hidden = true;
    renderMail();
  });

  /* —— Messages —— */
  let threads = store.load("threads", [
    { name: "Alex Rivera", last: "On my way to the pier.", when: "now" },
    { name: "Marketplace Bot", last: "Order #482 confirmed.", when: "12m" },
    { name: "Jordan Lee", last: "Location shared ✓", when: "1h" }
  ]);

  function renderThreads() {
    $("#thread-list").innerHTML = threads
      .map(
        (t) => `<li>
        <div class="avatar">${escapeHtml(t.name.slice(0, 1))}</div>
        <div style="flex:1"><p class="item-title">${escapeHtml(t.name)}</p><p class="item-sub">${escapeHtml(t.last)}</p></div>
        <span class="item-sub">${escapeHtml(t.when)}</span>
      </li>`
      )
      .join("");
  }

  $("#new-message")?.addEventListener("click", () => {
    const c = $("#msg-composer");
    c.hidden = !c.hidden;
  });

  $("#msg-send")?.addEventListener("click", () => {
    const to = $("#msg-to").value.trim();
    const body = $("#msg-body").value.trim();
    if (!to || !body) return;
    threads.unshift({ name: to, last: body, when: "now" });
    store.save("threads", threads);
    $("#msg-to").value = "";
    $("#msg-body").value = "";
    $("#msg-composer").hidden = true;
    renderThreads();
  });

  /* —— Maps —— */
  $("#maps-go")?.addEventListener("click", () => {
    const dest = $("#maps-dest").value.trim() || "destination";
    const el = $("#route-status");
    el.hidden = false;
    el.textContent = `Routing to ${dest}… Fastest path · ~4 min drive`;
    const path = $(".route-line path");
    if (path) {
      path.style.animation = "none";
      void path.offsetWidth;
      path.style.animation = "";
    }
  });

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  renderWallet();
  renderMarket();
  renderFindMy();
  renderMail();
  renderThreads();
})();
