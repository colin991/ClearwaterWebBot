async function portal(kind, action, extra = {}) {
  const response = await fetch('/api/pcso/portal', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, action, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || (response.status === 401 ? 'Sign in with Discord first.' : 'Request failed.'));
  return payload;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));
}

function fieldControl(field) {
  const attributes = `name="${escapeHtml(field.id)}" maxlength="${Number(field.maxLength)}" placeholder="${escapeHtml(field.placeholder || '')}" required`;
  return field.multiline ? `<textarea ${attributes}></textarea>` : `<input ${attributes} />`;
}

function renderFields(container, fields) {
  container.innerHTML = fields.map((field) => `<label>${escapeHtml(field.label)}${fieldControl(field)}</label>`).join('');
}

function renderMessages(log, payload) {
  const empty = document.querySelector('[data-thread-empty]');
  const reply = document.querySelector('[data-ticket-reply]');
  const close = document.querySelector('[data-ticket-close]');
  const tabs = document.querySelector('[data-ticket-tabs]');
  const transcript = document.querySelector('[data-ticket-transcript]');
  const tickets = payload.tickets || [];
  tabs.hidden = !tickets.length;
  tabs.innerHTML = tickets.map((ticket) => {
    const current = String(ticket.channelId) === String(payload.channelId);
    const date = ticket.closedAt || ticket.createdAt;
    return `<button type="button" class="${ticket.open ? '' : 'is-closed'}" data-ticket-id="${escapeHtml(ticket.channelId)}" aria-current="${current}"><strong>${escapeHtml(ticket.title)}</strong><small>${ticket.open ? 'Open' : 'Closed'}${date ? ` · ${new Date(date).toLocaleDateString()}` : ''}</small></button>`;
  }).join('');
  const url = payload.transcriptUrl || payload.transcript?.url;
  transcript.hidden = Boolean(payload.open || !payload.channelId);
  transcript.innerHTML = !payload.open && /^https:\/\//i.test(url || '')
    ? `<a class="pcso-button pcso-button-muted" href="${escapeHtml(url)}" target="_blank" rel="noopener">Open official transcript</a>`
    : (!payload.open && payload.channelId ? 'The saved conversation is shown below.' : '');
  const hasTicket = Boolean(tickets.length || payload.open);
  empty.hidden = hasTicket;
  log.hidden = !hasTicket;
  reply.hidden = !payload.open;
  close.hidden = !payload.open;
  log.innerHTML = (payload.messages || []).map((message) => {
    const avatar = /^https:\/\//i.test(message.avatarUrl || '')
      ? `<img src="${escapeHtml(message.avatarUrl)}" alt="" />`
      : `<span class="pcso-ticket-avatar" aria-hidden="true">${escapeHtml((message.author || '?').slice(0, 1).toUpperCase())}</span>`;
    return `<article class="${message.fromWeb ? 'from-web' : 'from-staff'}"><div class="pcso-ticket-author">${avatar}<div><strong>${escapeHtml(message.author || 'Unknown')}</strong><span>${message.fromWeb ? 'You' : 'PCSO staff'}</span></div><time>${new Date(message.createdAt).toLocaleString()}</time></div><p>${escapeHtml(message.content).replace(/\n/g, '<br />')}</p></article>`;
  }).join('') || '<p>Ticket is open. Send a reply below.</p>';
  log.querySelectorAll('img').forEach((image) => image.addEventListener('error', () => {
    const fallback = document.createElement('span');
    fallback.className = 'pcso-ticket-avatar';
    fallback.setAttribute('aria-hidden', 'true');
    fallback.textContent = image.closest('article')?.querySelector('strong')?.textContent?.slice(0, 1).toUpperCase() || '?';
    image.replaceWith(fallback);
  }, { once: true }));
  log.scrollTop = log.scrollHeight;
}

function renderRecords(list, records) {
  list.innerHTML = records.length ? `<ul class="pcso-status-list">${records.map((record) => (
    `<li><strong>${escapeHtml(record.status)}</strong> — ${escapeHtml(record.subjectType)}: ${escapeHtml(record.subject)}<br /><small>${escapeHtml(record.createdAt || '')}</small></li>`
  )).join('')}</ul>` : '<p class="pcso-form-status">No public records requests yet.</p>';
}

async function boot() {
  const signin = document.querySelector('[data-portal-signin]');
  const app = document.querySelector('[data-portal-app]');
  if (!signin || !app) return;
  const session = await fetch('/api/auth/me', { cache: 'no-store' }).then((res) => res.json()).catch(() => ({}));
  const supportDraft = new URLSearchParams(location.search).get('support')?.slice(0, 1800) || '';
  if (!session.authenticated) {
    const signinLink = signin.querySelector('a[href^="/signin"]');
    if (signinLink) signinLink.href = `/signin?next=${encodeURIComponent(location.pathname + location.search)}`;
    return;
  }
  signin.hidden = true;
  app.hidden = false;

  document.querySelectorAll('[data-contact-tab]').forEach((button) => button.addEventListener('click', () => {
    const selected = button.dataset.contactTab;
    document.querySelectorAll('[data-contact-tab]').forEach((tab) => tab.setAttribute('aria-selected', String(tab === button)));
    document.querySelectorAll('[data-contact-panel]').forEach((panel) => { panel.hidden = panel.dataset.contactPanel !== selected; });
    history.replaceState(null, '', selected === 'records' ? '#records' : location.pathname);
  }));
  if (location.hash === '#records') document.querySelector('[data-contact-tab="records"]')?.click();

  const typeSelect = document.querySelector('[data-ticket-type]');
  const fieldsWrap = document.querySelector('[data-ticket-fields]');
  const meta = await fetch('/api/pcso/portal?kind=ticket-meta').then((res) => res.json());
  const types = meta.types || [];
  typeSelect.innerHTML = types.map((entry) => `<option value="${escapeHtml(entry.type)}">${escapeHtml(entry.title)}</option>`).join('');
  const fieldsFor = (type) => types.find((entry) => entry.type === type)?.fields || [];
  renderFields(fieldsWrap, fieldsFor(typeSelect.value));
  if (supportDraft) {
    const firstMessageField = fieldsWrap.querySelector('textarea, input');
    if (firstMessageField) firstMessageField.value = supportDraft;
  }
  typeSelect.addEventListener('change', () => renderFields(fieldsWrap, fieldsFor(typeSelect.value)));

  const log = document.querySelector('[data-ticket-log]');
  let selectedChannelId = '';
  let refreshBusy = false;
  async function refreshTickets() {
    if (refreshBusy) return;
    refreshBusy = true;
    try {
      const payload = await portal('ticket', 'list', selectedChannelId ? { channelId: selectedChannelId } : {});
      selectedChannelId = payload.channelId || '';
      renderMessages(log, payload);
    } finally { refreshBusy = false; }
  }
  await refreshTickets().catch(() => {});
  portal('records', 'list').then((result) => renderRecords(document.querySelector('[data-records-list]'), result.records || []))
    .catch((error) => { document.querySelector('[data-records-list]').textContent = error.message; });

  document.querySelector('[data-ticket-tabs]')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-ticket-id]');
    if (!button) return;
    selectedChannelId = button.dataset.ticketId || '';
    await refreshTickets();
  });
  document.querySelector('[data-ticket-form]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('[data-ticket-status]');
    const data = new FormData(form);
    const fields = Object.fromEntries([...data.entries()].filter(([key]) => key !== 'type'));
    status.textContent = 'Opening ticket…';
    try {
      const result = await portal('ticket', 'open', { type: data.get('type'), fields });
      selectedChannelId = result.channelId || selectedChannelId;
      status.textContent = result.existing ? 'That ticket is already open. It is selected below.' : 'Ticket opened and synced with Discord.';
      renderMessages(log, result);
    } catch (error) { status.textContent = error.message; }
  });
  document.querySelector('[data-ticket-reply]')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector('[data-reply-status]');
    status.textContent = 'Sending…';
    try {
      const result = await portal('ticket', 'reply', { content: new FormData(form).get('content'), channelId: selectedChannelId });
      form.reset(); status.textContent = 'Reply posted in Discord as you.'; renderMessages(log, result);
    } catch (error) { status.textContent = error.message; }
  });
  document.querySelector('[data-ticket-close]')?.addEventListener('click', async () => {
    if (!selectedChannelId || !window.confirm('Close this ticket? A transcript will be saved.')) return;
    const button = document.querySelector('[data-ticket-close]');
    button.disabled = true;
    button.textContent = 'Closing…';
    try {
      const result = await portal('ticket', 'close', { channelId: selectedChannelId });
      selectedChannelId = result.channelId || '';
      renderMessages(log, result);
    } catch (error) {
      window.alert(error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'Close ticket';
    }
  });
  window.setInterval(() => { if (!document.hidden) void refreshTickets(); }, 8000);
}

void boot();
