/* cwpcso.com/radio-staff: who is on the radio, mute, kick and warn, plus staff tools. Admins only; the bot checks. */
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
  const coverageMap = window.createCoverageMap({
    toast: (text, bad) => toast(text, bad),
    async save(coverage) {
      const { status, data } = await call({ action: 'coverage', coverage });
      if (status !== 200) {
        if (status === 401 || status === 403) handleError(status, data);
        else toast(data.error || 'Could not save the coverage map. Try again.', true);
        return null;
      }
      toast('Coverage saved. Radios update within a few seconds.');
      render(data);
      return data.coverage;
    },
  });

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

  function signalText(signal) {
    if (!Number.isFinite(signal)) return '';
    const bars = signal >= 0.8 ? 4 : signal >= 0.55 ? 3 : signal >= 0.3 ? 2 : 1;
    return `signal ${bars}/4`;
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
    if (member.monitor) {
      const tag = document.createElement('span');
      tag.className = 'rs-tag live';
      tag.textContent = 'MONITOR';
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
    if (withKick) {
      actions.unshift(button('Warn', 'warn', () => warn(member.userId, name)));
      actions.push(button('Kick', 'kick', () => act('kick', member.userId, name)));
    }
    return actions;
  }

  /* ---------- staff tools ---------- */

  async function tool(body, done) {
    if (busy) return null;
    busy = true;
    const { status, data } = await call(body);
    busy = false;
    if (status !== 200) {
      if (status === 401 || status === 403) handleError(status, data);
      else toast(data.error || 'That did not work. Try again.', true);
      return null;
    }
    if (done) toast(done);
    if (data.running !== undefined) render(data);
    return data;
  }

  async function warn(userId, name) {
    const text = window.prompt(`Warning for ${name} (shows on their radio until they press OK):`, '');
    if (!text?.trim()) return;
    await tool({ action: 'warn', userId, text: text.trim() }, `Warning sent to ${name}.`);
  }

  $('shoutForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = $('shoutText').value.trim();
    if (!text) return;
    if (await tool({ action: 'shout', text }, 'Playing on every radio.')) $('shoutText').value = '';
  });
  $('eventForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const name = $('eventName').value.trim() || 'Server Event';
    await tool({ action: 'event-open', name }, `Event channel "${name}" is open as CH 6.`);
  });
  $('eventClose').addEventListener('click', async () => {
    if (!window.confirm('Close the event channel? Everyone on it goes back to CH 1.')) return;
    const data = await tool({ action: 'event-close' });
    if (data) toast(`Event channel closed${data.moved ? `; ${data.moved} radio${data.moved === 1 ? '' : 's'} moved to CH 1` : ''}.`);
  });

  function renderEvent(event) {
    $('eventState').textContent = event ? `Event channel: open as CH 6 · ${event.name}` : 'Event channel: closed';
    $('eventOpen').textContent = event ? 'Rename' : 'Open event channel';
    $('eventClose').hidden = !event;
  }

  function durationText(seconds) {
    const total = Math.max(0, Math.round(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h ? `${h} h ${m} min` : `${m}:${String(s).padStart(2, '0')}`;
  }

  let scenes = [];
  let scenesAt = 0;
  function renderScenes() {
    $('sceneCount').textContent = String(scenes.length);
    const list = $('sceneList');
    if (!scenes.length) return empty(list, 'Nobody is in a Scene or Traffic Stop voice channel.');
    const extra = (Date.now() - scenesAt) / 1000;
    list.replaceChildren(...scenes.map((scene) => row({ name: scene.name, userId: scene.id }, `${scene.channel} · ${durationText(scene.seconds + extra)}`, [])));
    return undefined;
  }
  setInterval(() => { if (scenes.length && !document.hidden) renderScenes(); }, 1000);

  function renderCrashes(crashes) {
    $('crashCount').textContent = String(crashes.length);
    const list = $('crashList');
    if (!crashes.length) return empty(list, 'No crash reports.');
    list.replaceChildren(...crashes.map((crash) => {
      const when = new Date(crash.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const item = row({ name: crash.name, userId: crash.userId }, `${when} · ${crash.version ? `v${crash.version} · ` : ''}${crash.where || ''} · ${crash.message}`, []);
      item.classList.add('crash');
      if (crash.stack || crash.platform) {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Details';
        const pre = document.createElement('pre');
        pre.textContent = [crash.platform, crash.stack].filter(Boolean).join('\n');
        details.append(summary, pre);
        item.append(details);
      }
      return item;
    }));
    return undefined;
  }

  /* ---------- recordings ---------- */

  let recordings = [];
  function renderRecordings() {
    const list = $('recList');
    const query = $('recSearch').value.trim().toLowerCase();
    const shown = recordings.filter((rec) => !query || `${rec.name} ${rec.channel}`.toLowerCase().includes(query)).slice(0, 150);
    if (!shown.length) return empty(list, recordings.length ? 'No recordings match.' : 'No recordings in the last 24 hours.');
    list.replaceChildren(...shown.map((rec) => {
      const when = new Date(rec.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const item = row({ name: rec.name, userId: rec.userId }, `${when} · ${rec.channel} · ${rec.seconds}s${rec.source === 'discord' ? ' · Discord' : ''}`, [
        button('Play', 'ghost', async (event) => {
          const target = event.currentTarget;
          target.disabled = true;
          const { status, data } = await call({ action: 'recording', id: rec.id });
          target.disabled = false;
          if (status !== 200 || !data.audio) return toast(data.error || 'Could not load that recording.', true);
          const bytes = Uint8Array.from(atob(data.audio), (char) => char.charCodeAt(0));
          const audio = document.createElement('audio');
          audio.controls = true;
          audio.src = URL.createObjectURL(new Blob([bytes], { type: data.type || 'audio/ogg' }));
          item.querySelector('audio')?.remove();
          item.append(audio);
          void audio.play().catch(() => {});
          return undefined;
        }),
      ]);
      return item;
    }));
    return undefined;
  }
  $('recLoad').addEventListener('click', async () => {
    const data = await tool({ action: 'recordings' });
    if (!data) return;
    recordings = Array.isArray(data.recordings) ? data.recordings : [];
    $('recFilter').hidden = false;
    $('recLoad').textContent = 'Reload';
    renderRecordings();
  });
  $('recSearch').addEventListener('input', () => renderRecordings());
  $('recFilter').addEventListener('submit', (event) => event.preventDefault());

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
        [user.label, user.channel, minutesSince(user.since), signalText(user.signal)].filter(Boolean).join(' · '),
        muteButtons(user, true))));
    }

    const mutedList = $('mutedList');
    if (!muted.length) empty(mutedList, 'Nobody else is muted.');
    else mutedList.replaceChildren(...muted.map((member) => row({ ...member, muted: true }, 'Not on a radio', muteButtons({ ...member, muted: true }, false))));

    // Keep search results' mute state in step with the latest list.
    mutedIds = new Set([...muted.map((member) => member.userId), ...users.filter((user) => user.muted).map((user) => user.userId)]);
    if (lastFound.length) renderFound(lastFound);
    coverageMap.update(data.coverage, data.positions);
    renderFlags(Array.isArray(data.flags) ? data.flags : []);
    renderCrashes(Array.isArray(data.crashes) ? data.crashes : []);
    scenes = Array.isArray(data.scenes) ? data.scenes : [];
    scenesAt = Date.now();
    renderScenes();
    renderEvent(data.event || null);
    access = data.access || {};
    melonlyReady = Boolean(data.melonly);
    renderAccessSummary();
  }

  /* ---------- channel access by Melonly rank ---------- */

  const ACCESS_CHANNELS = [
    { id: 'fire', name: 'CH 2 · Fire Radio' },
    { id: 'dot', name: 'CH 3 · DOT Radio' },
    { id: 'freq', name: 'CH 4 · Frequency Change' },
    { id: 'srt', name: 'CH 5 · Special Response Team' },
    { id: 'event', name: 'CH 6 · Event channel' },
  ];
  let access = {};
  let melonlyReady = false;
  let catalog = null;
  const rankName = (key) => {
    const [deptId, rankId] = key.split(':');
    const dept = catalog?.find((entry) => entry.id === deptId);
    const rank = dept?.ranks.find((entry) => entry.id === rankId);
    return rank ? `${dept.short} ${rank.name}` : null;
  };

  function renderAccessSummary() {
    const box = $('accessSummary');
    if (!melonlyReady) {
      box.textContent = 'Melonly is not set up on the bot host (MELONLY_API_KEY), so every channel is open.';
      $('accessLoad').hidden = true;
      return;
    }
    $('accessLoad').hidden = false;
    box.textContent = ACCESS_CHANNELS.map((channel) => {
      const ranks = access[channel.id]?.ranks || [];
      if (!ranks.length) return `${channel.name}: everyone`;
      const names = catalog ? ranks.map(rankName).filter(Boolean) : [];
      return `${channel.name}: ${names.length ? names.join(', ') : `${ranks.length} rank${ranks.length === 1 ? '' : 's'}`}`;
    }).join(' · ');
  }

  function renderAccessEditor() {
    const editor = $('accessEditor');
    editor.hidden = false;
    editor.replaceChildren();
    if (!catalog.length) {
      const empty = document.createElement('p');
      empty.className = 'rs-fine';
      empty.textContent = 'No Melonly departments found for this API key.';
      editor.append(empty);
      return;
    }
    for (const channel of ACCESS_CHANNELS) {
      const chosen = new Set(access[channel.id]?.ranks || []);
      const box = document.createElement('details');
      box.className = 'rs-access-channel';
      box.open = chosen.size > 0;
      const summary = document.createElement('summary');
      summary.textContent = channel.name;
      const count = document.createElement('span');
      count.textContent = chosen.size ? `${chosen.size} rank${chosen.size === 1 ? '' : 's'}` : 'open to everyone';
      summary.append(count);
      box.append(summary);
      for (const dept of catalog) {
        const group = document.createElement('div');
        group.className = 'rs-access-dept';
        const title = document.createElement('b');
        title.textContent = dept.name;
        const ranks = document.createElement('div');
        ranks.className = 'rs-access-ranks';
        for (const rank of dept.ranks) {
          const label = document.createElement('label');
          const input = document.createElement('input');
          input.type = 'checkbox';
          input.dataset.channel = channel.id;
          input.value = `${dept.id}:${rank.id}`;
          input.checked = chosen.has(input.value);
          input.addEventListener('change', () => {
            const ticked = editor.querySelectorAll(`input[data-channel="${channel.id}"]:checked`).length;
            count.textContent = ticked ? `${ticked} rank${ticked === 1 ? '' : 's'}` : 'open to everyone';
          });
          label.append(input, document.createTextNode(rank.name));
          ranks.append(label);
        }
        group.append(title, ranks);
        box.append(group);
      }
      editor.append(box);
    }
    const save = document.createElement('div');
    save.className = 'rs-save';
    const cancel = button('Cancel', 'ghost', () => { editor.hidden = true; });
    const store = button('Save channel access', 'go', async () => {
      const next = {};
      for (const channel of ACCESS_CHANNELS) {
        const ranks = [...editor.querySelectorAll(`input[data-channel="${channel.id}"]:checked`)].map((input) => input.value);
        if (ranks.length) next[channel.id] = { ranks };
      }
      const data = await tool({ action: 'access', access: next }, 'Channel access saved. Radios update straight away.');
      if (data) editor.hidden = true;
    });
    save.append(cancel, store);
    editor.append(save);
  }

  $('accessLoad').addEventListener('click', async () => {
    const data = await tool({ action: 'ranks' });
    if (!data) return;
    catalog = Array.isArray(data.departments) ? data.departments : [];
    renderAccessSummary();
    renderAccessEditor();
  });

  const FLAG_LABELS = { 'off-team': 'OFF TEAM', 'talk-over': 'TALK-OVER' };
  function renderFlags(flags) {
    $('flagCount').textContent = String(flags.length);
    const list = $('flagList');
    if (!flags.length) return empty(list, 'Nothing flagged.');
    list.replaceChildren(...flags.map((flag) => {
      const when = new Date(flag.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const item = row({ name: flag.name, userId: flag.userId }, `${when} · ${flag.detail || ''}`, []);
      item.classList.add('flag');
      const tag = document.createElement('span');
      tag.className = 'rs-tag warn';
      tag.textContent = FLAG_LABELS[flag.kind] || 'FLAG';
      item.insertBefore(tag, item.lastChild);
      return item;
    }));
    return undefined;
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
