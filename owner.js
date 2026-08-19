const notice = document.querySelector('[data-owner-notice]');
const form = document.querySelector('[data-owner-form]');
const saveStatus = document.querySelector('[data-save-status]');
const salaryRows = document.querySelector('[data-owner-salary-rows]');
const salaryMeta = document.querySelector('[data-owner-salary-meta]');
const salaryRunStatus = document.querySelector('[data-owner-salary-run-status]');
let guilds = [];
let settings = {};
let salaryConfig = { weekday: 0, time: '00:00', departments: [] };
let salaryStatus = { schedule: {}, departments: [] };

const option = (value, label) => new Option(label, value);
const selectedGuild = (id) => guilds.find((guild) => guild.id === id);
const weekdayLabels = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatSalaryTime(iso) {
  if (!iso) return 'Not scheduled yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Not scheduled yet';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function fillGuilds() {
  form.querySelectorAll('[data-guild-select]').forEach((select) => {
    const first = select.options[0];
    select.replaceChildren(first, ...guilds.map((guild) => option(guild.id, guild.name)));
    select.value = settings[select.name] || '';
  });
}

function fillRoles(select) {
  const guildId = form.elements[select.dataset.guildField]?.value;
  const roles = selectedGuild(guildId)?.roles || [];
  const first = select.options[0];
  const saved = settings[select.name] || select.value;
  select.replaceChildren(first, ...roles.map((role) => option(role.id, role.name)));
  select.value = saved;
}

function fillSalaryRoles(select, guildId, savedRoleId = '') {
  const roles = selectedGuild(guildId)?.roles || [];
  const first = select.options[0];
  select.replaceChildren(first, ...roles.map((role) => option(role.id, role.name)));
  select.value = savedRoleId || '';
}

function fillChannels() {
  const allChannels = guilds.flatMap((guild) => guild.channels.map((channel) => ({ ...channel, guildName: guild.name })));
  form.querySelectorAll('[data-channel-select]').forEach((select) => {
    const first = select.options[0];
    select.replaceChildren(first, ...allChannels.map((channel) => option(channel.id, `${channel.guildName} · #${channel.name}`)));
    select.value = settings[select.name] || '';
  });
}

function renderSalaryMeta() {
  if (!salaryMeta) return;
  const schedule = salaryStatus.schedule || salaryConfig;
  const next = formatSalaryTime(schedule.nextPayoutAt);
  const last = schedule.lastPayoutAt ? formatSalaryTime(schedule.lastPayoutAt) : 'No payout recorded yet';
  salaryMeta.textContent = `Next payout: ${next}. Last payout: ${last}. Times use Eastern Time.`;
}

function salaryRowTemplate(department = {}, index = 0) {
  const status = salaryStatus.departments?.find((entry) => entry.id === department.id) || department;
  const botLabel = status.guildId
    ? (status.botInGuild ? `Bot connected${status.guildName ? ` · ${status.guildName}` : ''}` : 'Bot not in this server yet')
    : 'Pick a department Discord server';
  return `<article class="owner-salary-row" data-owner-salary-row data-department-id="${department.id || ''}">
    <div class="owner-salary-row-head">
      <strong>Department ${index + 1}</strong>
      <label class="owner-salary-toggle"><input type="checkbox" data-salary-enabled ${department.enabled === false ? '' : 'checked'} /><span>Enabled</span></label>
    </div>
    <label>Display name<input data-salary-name maxlength="80" value="${escapeAttr(department.name || '')}" placeholder="Florida Highway Patrol" /></label>
    <label>Discord server<select data-salary-guild><option value="">Choose a server</option></select></label>
    <label>Employee role<select data-salary-role><option value="">Choose a role</option></select></label>
    <label>Weekly amount (C$)<input data-salary-amount type="number" min="0" max="1000000" step="1" value="${Number(department.weeklyAmount || 0)}" inputmode="numeric" /></label>
    <p class="owner-salary-row-status">${escapeHtml(botLabel)}</p>
    <button class="owner-salary-remove" type="button" data-owner-salary-remove>Remove</button>
  </article>`;
}

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function newDepartmentId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `dept-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function wireSalaryRow(row, department = {}) {
  const guildSelect = row.querySelector('[data-salary-guild]');
  const roleSelect = row.querySelector('[data-salary-role]');
  if (!guildSelect || !roleSelect) return;
  guildSelect.replaceChildren(option('', 'Choose a server'), ...guilds.map((guild) => option(guild.id, guild.name)));
  guildSelect.value = department.guildId || '';
  fillSalaryRoles(roleSelect, guildSelect.value, department.employeeRoleId || '');
  guildSelect.addEventListener('change', () => {
    fillSalaryRoles(roleSelect, guildSelect.value, '');
  });
}

function renderSalaryRows() {
  if (!salaryRows) return;
  const departments = Array.isArray(salaryConfig.departments) ? salaryConfig.departments : [];
  if (!departments.length) {
    salaryRows.innerHTML = '<p class="owner-salary-empty">No departments yet. Add one for each unit after inviting the bot to its Discord.</p>';
    return;
  }
  salaryRows.innerHTML = departments.map((department, index) => salaryRowTemplate(department, index)).join('');
  salaryRows.querySelectorAll('[data-owner-salary-row]').forEach((row, index) => {
    wireSalaryRow(row, departments[index]);
  });
}

function readSalaryPayload() {
  const weekday = Number(form.elements.salaryWeekday?.value ?? salaryConfig.weekday ?? 0);
  const time = String(form.elements.salaryTime?.value || salaryConfig.time || '00:00').slice(0, 5);
  const departments = [...(salaryRows?.querySelectorAll('[data-owner-salary-row]') || [])].map((row, index) => ({
    id: row.dataset.departmentId || newDepartmentId(),
    name: row.querySelector('[data-salary-name]')?.value?.trim() || `Department ${index + 1}`,
    guildId: row.querySelector('[data-salary-guild]')?.value || '',
    employeeRoleId: row.querySelector('[data-salary-role]')?.value || '',
    weeklyAmount: Number(row.querySelector('[data-salary-amount]')?.value || 0),
    enabled: row.querySelector('[data-salary-enabled]')?.checked !== false,
    payMode: 'flat',
  }));
  return {
    timezone: 'America/New_York',
    weekday: Number.isInteger(weekday) ? weekday : 0,
    time,
    departments,
  };
}

function applySalaryState(result) {
  if (!result?.salary?.config) return;
  salaryConfig = {
    ...salaryConfig,
    ...result.salary.config,
    payoutReceipts: salaryConfig.payoutReceipts || {},
  };
  salaryStatus = result.salary.status || salaryStatus;
  if (form.elements.salaryWeekday) form.elements.salaryWeekday.value = String(salaryConfig.weekday ?? 0);
  if (form.elements.salaryTime) form.elements.salaryTime.value = salaryConfig.time || '00:00';
  renderSalaryMeta();
  renderSalaryRows();
}

async function saveSalaryConfig() {
  const response = await fetch('/api/owner/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salary: readSalaryPayload() }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Could not save department salaries');
  applySalaryState(result);
  return result;
}

async function loadPanel() {
  try {
    const sessionResponse = await fetch('/api/auth/me');
    const session = await sessionResponse.json();
    if (!session.authenticated) {
      notice.innerHTML = 'Please <a href="/signin?next=/owner">sign in with Discord</a> to continue.';
      return;
    }
    if (!session.user?.owner) {
      notice.textContent = 'This page is restricted to the configured Clearwater owner.';
      return;
    }

    const response = await fetch('/api/owner/config');
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not reach the bot');
    guilds = result.guilds || [];
    settings = result.settings || {};
    salaryConfig = {
      weekday: 0,
      time: '00:00',
      departments: [],
      ...(result.salary?.config || {}),
    };
    salaryStatus = result.salary?.status || { schedule: result.salary?.config || {}, departments: [] };
    fillGuilds();
    form.querySelectorAll('[data-role-select]').forEach(fillRoles);
    fillChannels();
    for (const field of ['prefix', 'syncIntervalSeconds']) form.elements[field].value = settings[field] ?? form.elements[field].value;
    if (form.elements.salaryWeekday) form.elements.salaryWeekday.value = String(salaryConfig.weekday ?? 0);
    if (form.elements.salaryTime) form.elements.salaryTime.value = salaryConfig.time || '00:00';
    renderSalaryMeta();
    renderSalaryRows();
    notice.hidden = true;
    form.hidden = false;
  } catch (error) {
    notice.textContent = error.message;
  }
}

form?.querySelectorAll('[data-guild-select]').forEach((select) => {
  select.addEventListener('change', () => {
    form.querySelectorAll(`[data-role-select][data-guild-field="${select.name}"]`).forEach((roleSelect) => {
      settings[roleSelect.name] = '';
      fillRoles(roleSelect);
    });
  });
});

document.querySelector('[data-owner-salary-add]')?.addEventListener('click', () => {
  salaryConfig.departments = Array.isArray(salaryConfig.departments) ? salaryConfig.departments : [];
  salaryConfig.departments.push({
    id: newDepartmentId(),
    name: '',
    guildId: '',
    employeeRoleId: '',
    weeklyAmount: 500,
    enabled: true,
    payMode: 'flat',
  });
  renderSalaryRows();
});

salaryRows?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-owner-salary-remove]');
  if (!button) return;
  const row = button.closest('[data-owner-salary-row]');
  const id = row?.dataset.departmentId;
  salaryConfig.departments = (salaryConfig.departments || []).filter((department) => department.id !== id);
  renderSalaryRows();
});

document.querySelector('[data-owner-salary-run]')?.addEventListener('click', async () => {
  const button = document.querySelector('[data-owner-salary-run]');
  if (!button || !salaryRunStatus) return;
  button.disabled = true;
  salaryRunStatus.textContent = 'Saving and running payout…';
  try {
    await saveSalaryConfig();
    const response = await fetch('/api/owner/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salaryRunNow: true }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Payout failed');
    applySalaryState(result);
    const run = result.salaryRun || {};
    salaryRunStatus.textContent = run.ran
      ? `Paid ${Number(run.paidMembers || 0).toLocaleString()} member payment(s) · C$${Number(run.totalCredits || 0).toLocaleString()} total.`
      : (run.reason === 'already-paid-week'
        ? 'This week was already paid. Receipts prevent double pay.'
        : 'Payout did not run — check schedule and enabled departments.');
  } catch (error) {
    salaryRunStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  saveStatus.textContent = 'Saving…';
  try {
    const payload = Object.fromEntries(new FormData(form));
    const response = await fetch('/api/owner/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Save failed');
    settings = result.settings;
    await saveSalaryConfig();
    saveStatus.textContent = 'Configuration saved. The bot will use it on its next check.';
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadPanel();
