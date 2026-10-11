/* cwpcso.com/radio-staff: who is on the radio, force-mute, unmute and kick. Admins only; the bot checks. */
(() => {
  const $ = (id) => document.getElementById(id);
  const gate = $('gate');
  const gateCard = gate.querySelector('.rs-gate-card');
  const main = $('main');
  const REFRESH_MS = 5000;
  const discordIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.3 5.2A19.1 19.1 0 0 0 15.6 4l-.3.6c1.8.4 2.7.9 3.8 1.6-1.6-.8-3.2-1.3-5-1.6-.9-.1-1.8-.1-2.7 0-1.8.3-3.4.8-5 1.6 1.1-.7 2.2-1.2 3.8-1.6L9.9 4A19.2 19.2 0 0 0 5.2 5.2C2.4 9.3 1.7 13.3 2 17.2A19.5 19.5 0 0 0 8 20l.8-1.1a12.7 12.7 0 0 1-1.3-.6l.3-.2c2.6 1.2 5.4 1.2 8 0l.3.2c-.4.3-.8.5-1.3.7L17.5 20a19.4 19.4 0 0 0 6-2.8c.5-4.3-.4-8.2-3.2-12zm-11 9.6c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.7 1.7-1.5 1.7m5.4 0c-.8 0-1.5-.8-1.5-1.7s.7-1.7 1.5-1.7 1.5.8 1.5 1.7-.6 1.7-1.5 1.7"/></svg>';

  let busy = false;
  let timer = null;
  let toastTimer = null;
  let lastFound = [];
  let mutedIds = new Set();

  async function call(body) {
    try {
      const response = await fetch('/api/bot/radio-staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      return { status: response.status, data };
    } catch {
      return { status: 0, data: { error: 'Could not reach the website. Check your connection.' } };
    }
  }

  function showGate(html) {
    gateCard.innerHTML = html;
    gate.hidden = false;
    main.hidden = true;
  }

  function toast(text, bad = false) {
    const box = $('toast');
    box.textContent = text;
    box.classList.toggle('bad', bad);
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { box.hidden = true; }, 3500);
  }

  function minutesSince(at) {
    const minutes = Math.max(0, Math.round((Date.now() - Number(at)) / 60000));
    if (!at || !Number.isFinite(minutes)) return '';
    if (minutes < 1) return 'just joined';
    if (minutes < 60) return `on for ${minutes} min`;
    return `on for ${Math.floor(minutes / 60)} h ${minutes % 60} min`;
  }

  function button(label, kind, onClick) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = `rs-btn rs-${kind}`;
    node.textContent = label;
    node.addEventListener('click', onClick);
    return node;
  }

  /** One member row. Names come from Discord, so they only ever go in as text. */
  function row(member, detail, actions) {
    const item = document.createElement('li');
    item.className = `rs-row${member.muted ? ' muted' : ''}`;
    const who = document.createElement('div');
    who.className = 'rs-who';
    const name = document.createElement('b');
    name.textContent = member.name || `Member ${member.userId}`;
    const sub = document.createElement('span');
    sub.textContent = detail;
    who.append(name, sub);
    item.append(who);
    if (member.muted) {
      const tag = document.createElement('span');
      tag.className = 'rs-tag';
      tag.textContent = 'MUTED';
      item.append(tag);
    }
    const box = document.createElement('div');
    box.className = 'rs-actions';
    box.append(...actions);
    item.append(box);
    return item;
  }

  function empty(list, text) {
    const item = document.createElement('li');
    item.className = 'rs-empty';
    item.textContent = text;
    list.replaceChildren(item);
  }

  function muteButtons(member, withKick) {
    const name = member.name || 'this member';
    const actions = [member.muted
      ? button('Unmute', 'unmute', () => act('unmute', member.userId, name))
      : button('Force mute', 'mute', () => act('mute', member.userId, name))];
    if (withKick) actions.push(button('Kick', 'kick', () => act('kick', member.userId, name)));
    return actions;
  }

  function render(data) {
    gate.hidden = true;
    main.hidden = false;
    if (data.admin?.name) $('who').textContent = `Signed in as ${data.admin.name}`;
    const users = Array.isArray(data.users) ? data.users : [];
    const muted = Array.isArray(data.muted) ? data.muted : [];
    $('onCount').textContent = String(users.length);
    $('mutedCount').textContent = String(muted.length);

    const onList = $('onList');
    if (!data.running) empty(onList, 'The radio is not running on the bot host right now.');
    else if (!users.length) empty(onList, 'Nobody is on a radio.');
    else {
      onList.replaceChildren(...users.map((user) => row(user,
        [user.channel, minutesSince(user.since)].filter(Boolean).join(' · '),
        muteButtons(user, true))));
    }

    const mutedList = $('mutedList');
    if (!muted.length) empty(mutedList, 'Nobody else is muted.');
    else mutedList.replaceChildren(...muted.map((member) => row({ ...member, muted: true }, 'Not on a radio', muteButtons({ ...member, muted: true }, false))));

    // Keep search results' mute state in step with the latest list.
    mutedIds = new Set([...muted.map((member) => member.userId), ...users.filter((user) => user.muted).map((user) => user.userId)]);
    if (lastFound.length) renderFound(lastFound);
  }

  function renderFound(members) {
    const ids = mutedIds;
    lastFound = members;
    const list = $('found');
    if (!members.length) return empty(list, 'No members found.');
    list.replaceChildren(...members.map((member) => {
      const entry = { ...member, muted: ids.has(member.userId) };
      return row(entry, member.username ? `@${member.username}` : member.userId, muteButtons(entry, false));
    }));
  }

  function handleError(status, data) {
    if (status === 401 || data.signIn) {
      showGate(`<h1>Radio staff panel</h1><p>Sign in with the Discord account you use in the Clearwater server. Only Clearwater admins can use this page.</p>
        <a class="rs-discord" href="/api/auth/discord?agreed=1&amp;next=%2Fradio-staff">${discordIcon}Sign in with Discord</a>
        <p class="rs-fine">By signing in you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>`);
      return;
    }
    if (status === 403) {
      showGate('<h1>Admins only</h1><p></p><a class="rs-power" href="/radio">Open the radio instead</a>');
      gateCard.querySelector('p').textContent = data.error || 'Only Clearwater admins can use the radio staff panel.';
      return;
    }
    showGate('<h1>Radio offline</h1><p></p><button type="button" class="rs-power">Try again</button>');
    gateCard.querySelector('p').textContent = data.error || 'The radio is offline right now.';
    gateCard.querySelector('button').addEventListener('click', () => { void refresh(); });
  }

  async function refresh() {
    if (busy) return;
    busy = true;
    const { status, data } = await call({ view: true });
    busy = false;
    if (status === 200) render(data);
    else if (main.hidden || status === 401 || status === 403) handleError(status, data);
    // A failed background refresh keeps the last list on screen.
  }

  async function act(action, userId, name) {
    if (busy) return;
    if (action === 'kick' && !window.confirm(`Kick ${name} off the radio? They can't come back for 5 minutes.`)) return;
    busy = true;
    for (const node of main.querySelectorAll('.rs-actions button')) node.disabled = true;
    const { status, data } = await call({ action, userId });
    busy = false;
    if (status !== 200) {
      for (const node of main.querySelectorAll('.rs-actions button')) node.disabled = false;
      if (status === 401 || status === 403) return handleError(status, data);
      return toast(data.error || 'That did not work. Try again.', true);
    }
    if (action === 'mute') toast(`${name} is force-muted.`);
    else if (action === 'unmute') toast(`${name} can talk again.`);
    else toast(data.closed ? `${name} was kicked off the radio for 5 minutes.` : `${name} wasn't on a radio, but can't sign in for 5 minutes.`);
    render(data);
  }

  $('refresh').addEventListener('click', () => { void refresh(); });
  $('searchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = $('search').value.trim();
    if (!query) return;
    const { status, data } = await call({ search: query });
    if (status !== 200) {
      if (status === 401 || status === 403) return handleError(status, data);
      return toast(data.error || 'Search did not work. Try again.', true);
    }
    renderFound(Array.isArray(data.members) ? data.members : []);
  });

  function schedule() {
    clearInterval(timer);
    timer = document.hidden ? null : setInterval(() => { void refresh(); }, REFRESH_MS);
  }
  document.addEventListener('visibilitychange', () => {
    schedule();
    if (!document.hidden) void refresh();
  });

  void refresh();
  schedule();
})();
