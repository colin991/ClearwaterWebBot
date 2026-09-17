async function portal(kind, action, extra = {}) {
  const response = await fetch('/api/pcso/portal', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, action, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error(payload.error || 'Sign in with Discord first.');
  if (!response.ok) throw new Error(payload.error || 'Request failed.');
  return payload;
}

function fieldControl(field) {
  if (field.multiline) {
    return `<textarea name="${field.id}" maxlength="${field.maxLength}" placeholder="${field.placeholder || ''}" required></textarea>`;
  }
  return `<input name="${field.id}" maxlength="${field.maxLength}" placeholder="${field.placeholder || ''}" required />`;
}

function renderFields(container, fields) {
  container.innerHTML = fields.map((field) => (
    `<label>${field.label}${fieldControl(field)}</label>`
  )).join('');
}

function renderTicketTabs(tabs, payload, selectedId) {
  const tickets = payload.tickets || [];
  if (!tabs) return;
  if (!tickets.length) {
    tabs.hidden = true;
    tabs.innerHTML = '';
    return;
  }
  tabs.hidden = false;
  tabs.innerHTML = tickets.map((ticket) => {
    const current = String(ticket.channelId) === String(selectedId);
    const label = `${ticket.title}${ticket.open ? '' : ' (closed)'}`;
    return `<button type="button" class="${ticket.open ? '' : 'is-closed'}" data-ticket-id="${ticket.channelId}" aria-current="${current ? 'true' : 'false'}">${label}</button>`;
  }).join('');
}

function renderMessages(log, payload) {
  const empty = document.querySelector('[data-thread-empty]');
  const reply = document.querySelector('[data-ticket-reply]');
  const tabs = document.querySelector('[data-ticket-tabs]');
  const selectedId = payload.channelId;
  renderTicketTabs(tabs, payload, selectedId);
  if (!payload.tickets?.length && !payload.open) {
    log.hidden = true;
    if (empty) empty.hidden = false;
    if (reply) reply.hidden = true;
    return;
  }
  if (empty) empty.hidden = true;
  log.hidden = false;
  if (reply) reply.hidden = !payload.open;
  log.innerHTML = (payload.messages || []).map((message) => (
    `<article class="${message.fromWeb ? 'from-web' : 'from-staff'}">
      <strong>${message.author}</strong>
      <time>${new Date(message.createdAt).toLocaleString()}</time>
      <p>${String(message.content || '').replace(/</g, '&lt;')}</p>
    </article>`
  )).join('') || '<p>Ticket is open. Send a reply below.</p>';
}

function renderRecords(list, records) {
  if (!records.length) {
    list.innerHTML = '<p class="pcso-form-status">No public records requests yet.</p>';
    return;
  }
  list.innerHTML = `<ul class="pcso-status-list">${records.map((record) => (
    `<li><strong>${record.status}</strong> — ${record.subjectType}: ${record.subject}<br /><small>${record.createdAt || ''}</small></li>`
  )).join('')}</ul>`;
}

async function boot() {
  const signin = document.querySelector('[data-portal-signin]');
  const app = document.querySelector('[data-portal-app]');
  if (!signin || !app) return;
  try {
    const session = await fetch('/api/auth/me', { cache: 'no-store' }).then((res) => res.json());
    if (!session.authenticated) return;
    signin.hidden = true;
    app.hidden = false;
  } catch {
    return;
  }

  const typeSelect = document.querySelector('[data-ticket-type]');
  const fieldsWrap = document.querySelector('[data-ticket-fields]');
  const meta = await fetch('/api/pcso/portal?kind=ticket-meta').then((res) => res.json());
  const types = meta.types || [];
  typeSelect.innerHTML = types.map((entry) => (
    `<option value="${entry.type}">${entry.title}</option>`
  )).join('');

  const fieldsFor = (type) => types.find((entry) => entry.type === type)?.fields || [];
  renderFields(fieldsWrap, fieldsFor(typeSelect.value));
  typeSelect.addEventListener('change', () => {
    renderFields(fieldsWrap, fieldsFor(typeSelect.value));
  });

  const log = document.querySelector('[data-ticket-log]');
  let selectedChannelId = '';
  let refreshBusy = false;

  async function refreshTickets() {
    if (refreshBusy) return;
    refreshBusy = true;
    try {
      const payload = await portal('ticket', 'list', selectedChannelId ? { channelId: selectedChannelId } : {});
      if (payload.channelId) selectedChannelId = payload.channelId;
      renderMessages(log, payload);
    } catch {
      // keep the last rendered thread if Discord is briefly unavailable
    } finally {
      refreshBusy = false;
    }
  }

  await refreshTickets();
  try {
    const records = await portal('records', 'list');
    renderRecords(document.querySelector('[data-records-list]'), records.records || []);
  } catch (error) {
    document.querySelector('[data-records-list]').textContent = error.message;
  }

  document.querySelector('[data-ticket-tabs]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-ticket-id]');
    if (!button) return;
    selectedChannelId = button.getAttribute('data-ticket-id') || '';
    await refreshTickets();
  });

  document.querySelector('[data-ticket-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('[data-ticket-status]');
    const data = new FormData(form);
    const fields = {};
    data.forEach((value, key) => {
      if (key !== 'type') fields[key] = value;
    });
    if (status) status.textContent = 'Opening ticket…';
    try {
      const result = await portal('ticket', 'open', { type: data.get('type'), fields });
      selectedChannelId = result.channelId || selectedChannelId;
      if (status) {
        status.textContent = result.existing
          ? 'You already have that ticket open in Discord. Replies go there.'
          : 'Ticket opened in Discord and synced here.';
      }
      renderMessages(log, result);
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });

  document.querySelector('[data-ticket-reply]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('[data-reply-status]');
    const content = String(new FormData(form).get('content') || '');
    if (status) status.textContent = 'Sending…';
    try {
      const result = await portal('ticket', 'reply', { content, channelId: selectedChannelId });
      form.reset();
      if (status) status.textContent = 'Reply posted in Discord as you.';
      if (result.channelId) selectedChannelId = result.channelId;
      renderMessages(log, result);
    } catch (error) {
      if (status) status.textContent = error.message;
    }
  });

  window.setInterval(() => {
    if (document.hidden) return;
    void refreshTickets();
  }, 8000);
}

boot();
