const notice = document.querySelector('[data-owner-notice]');
const tabs = document.querySelector('[data-owner-tabs]');
const form = document.querySelector('[data-owner-form]');
const salaryForm = document.querySelector('[data-owner-salary-form]');
const saveStatus = document.querySelector('[data-save-status]');
const salarySaveStatus = document.querySelector('[data-owner-salary-save-status]');
const salaryRows = document.querySelector('[data-owner-salary-rows]');
const salaryMeta = document.querySelector('[data-owner-salary-meta]');
const salaryRunStatus = document.querySelector('[data-owner-salary-run-status]');
let guilds = [];
let settings = {};
let salaryConfig = { weekday: 0, time: '00:00', departments: [] };
let salaryStatus = { schedule: {}, departments: [] };
let activeOwnerTab = 'bot';

const option = (value, label) => new Option(label, value);
const selectedGuild = (id) => guilds.find((guild) => guild.id === id);

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

function setOwnerTab(tab = 'bot') {
  activeOwnerTab = tab === 'salaries' ? 'salaries' : 'bot';
  document.querySelectorAll('[data-owner-tab]').forEach((button) => {
    button.classList.toggle('selected', button.dataset.ownerTab === activeOwnerTab);
  });
  document.querySelectorAll('[data-owner-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.ownerPanel !== activeOwnerTab;
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

function fillSalaryGuildSelect(select, savedGuildId = '') {
  select.replaceChildren(option('', 'Choose a server'), ...guilds.map((guild) => option(guild.id, guild.name)));
  select.value = savedGuildId || '';
}

function fillSalaryRoleSelect(select, guildId, savedRoleId = '') {
  const roles = selectedGuild(guildId)?.roles || [];
  select.replaceChildren(option('', 'Choose a role'), ...roles.map((role) => option(role.id, role.name)));
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
  const count = Array.isArray(salaryConfig.departments) ? salaryConfig.departments.length : 0;
  salaryMeta.textContent = `${count} department${count === 1 ? '' : 's'} saved. Next payout: ${next}. Last payout: ${last}. Times use Eastern Time.`;
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

function newId(prefix = 'id') {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function departmentRoles(department = {}) {
  if (Array.isArray(department.roles) && department.roles.length) return department.roles;
  if (department.employeeRoleId) {
    return [{
      id: newId('role'),
      roleId: department.employeeRoleId,
      label: 'Employee',
      amount: Number(department.weeklyAmount || 0),
    }];
  }
  return [{ id: newId('role'), roleId: '', label: '', amount: 500 }];
}

function salaryRoleTemplate(role = {}) {
  return `<div class="owner-salary-payrole" data-owner-salary-payrole data-role-row-id="${escapeAttr(role.id || '')}">
    <label>Pay role<select data-salary-role><option value="">Choose a role</option></select></label>
    <label>Weekly amount (C$)<input data-salary-amount type="number" min="0" max="1000000" step="1" value="${Number(role.amount || 0)}" inputmode="numeric" /></label>
    <button class="owner-salary-remove" type="button" data-owner-salary-remove-role>Remove role</button>
  </div>`;
}

function salaryRowTemplate(department = {}, index = 0) {
  const status = salaryStatus.departments?.find((entry) => entry.id === department.id) || department;
  const botLabel = status.guildId
    ? (status.botInGuild ? `Bot connected${status.guildName ? ` · ${status.guildName}` : ''}` : 'Bot not in this server yet')
    : 'Pick a department Discord server';
  const roles = departmentRoles(department);
  return `<article class="owner-salary-row" data-owner-salary-row data-department-id="${escapeAttr(department.id || '')}">
    <div class="owner-salary-row-head">
      <strong>Department ${index + 1}</strong>
      <label class="owner-salary-toggle"><input type="checkbox" data-salary-enabled ${department.enabled === false ? '' : 'checked'} /><span>Enabled</span></label>
    </div>
    <label>Display name<input data-salary-name maxlength="80" value="${escapeAttr(department.name || '')}" placeholder="Florida Highway Patrol" /></label>
    <label>Discord server<select data-salary-guild><option value="">Choose a server</option></select></label>
    <div class="owner-salary-payroles" data-owner-salary-payroles>
      <p class="owner-salary-payroles-label">Pay roles</p>
      ${roles.map((role) => salaryRoleTemplate(role)).join('')}
    </div>
    <button class="button owner-salary-add" type="button" data-owner-salary-add-role>Add pay role</button>
    <p class="owner-salary-row-status">${escapeHtml(botLabel)}</p>
    <button class="owner-salary-remove" type="button" data-owner-salary-remove>Remove department</button>
  </article>`;
}

function wireSalaryRow(row, department = {}) {
  const guildSelect = row.querySelector('[data-salary-guild]');
  if (!guildSelect) return;
  fillSalaryGuildSelect(guildSelect, department.guildId || '');
  const roles = departmentRoles(department);
  row.querySelectorAll('[data-owner-salary-payrole]').forEach((roleRow, index) => {
    fillSalaryRoleSelect(roleRow.querySelector('[data-salary-role]'), guildSelect.value, roles[index]?.roleId || '');
  });
  guildSelect.addEventListener('change', () => {
    row.querySelectorAll('[data-salary-role]').forEach((roleSelect) => {
      fillSalaryRoleSelect(roleSelect, guildSelect.value, '');
    });
  });
}

function readPayRolesFromRow(row) {
  const guildId = row.querySelector('[data-salary-guild]')?.value || '';
  const guild = selectedGuild(guildId);
  return [...row.querySelectorAll('[data-owner-salary-payrole]')].map((roleRow, index) => {
    const roleId = roleRow.querySelector('[data-salary-role]')?.value || '';
    const roleName = guild?.roles?.find((role) => role.id === roleId)?.name || '';
    return {
      id: roleRow.dataset.roleRowId || newId('role'),
      roleId,
      label: roleName || `Role ${index + 1}`,
      amount: Number(roleRow.querySelector('[data-salary-amount]')?.value || 0),
    };
  });
}

function readSalaryPayload() {
  const weekday = Number(salaryForm?.querySelector('[data-salary-weekday]')?.value ?? salaryConfig.weekday ?? 0);
  const time = String(salaryForm?.querySelector('[data-salary-time]')?.value || salaryConfig.time || '00:00').slice(0, 5);
  const departments = [...(salaryRows?.querySelectorAll('[data-owner-salary-row]') || [])].map((row, index) => ({
    id: row.dataset.departmentId || newId('dept'),
    name: row.querySelector('[data-salary-name]')?.value?.trim() || `Department ${index + 1}`,
    guildId: row.querySelector('[data-salary-guild]')?.value || '',
    roles: readPayRolesFromRow(row),
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

function syncSalaryConfigFromDom() {
  salaryConfig = { ...salaryConfig, ...readSalaryPayload() };
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

function applySalaryState(result) {
  if (!result?.salary?.config) return;
  salaryConfig = { ...salaryConfig, ...result.salary.config };
  salaryStatus = result.salary.status || salaryStatus;
  const weekday = salaryForm?.querySelector('[data-salary-weekday]');
  const time = salaryForm?.querySelector('[data-salary-time]');
  if (weekday) weekday.value = String(salaryConfig.weekday ?? 0);
  if (time) time.value = salaryConfig.time || '00:00';
  renderSalaryMeta();
  renderSalaryRows();
}

async function saveSalaryConfig() {
  const payload = readSalaryPayload();
  const response = await fetch('/api/owner/config', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ salary: payload }),
  });
  const result = await response.json().catch(() => ({}));
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
    for (const field of ['prefix', 'syncIntervalSeconds']) {
      if (form.elements[field]) form.elements[field].value = settings[field] ?? form.elements[field].value;
    }
    const weekday = salaryForm?.querySelector('[data-salary-weekday]');
    const time = salaryForm?.querySelector('[data-salary-time]');
    if (weekday) weekday.value = String(salaryConfig.weekday ?? 0);
    if (time) time.value = salaryConfig.time || '00:00';
    renderSalaryMeta();
    renderSalaryRows();
    notice.hidden = true;
    tabs.hidden = false;
    setOwnerTab(activeOwnerTab);
  } catch (error) {
    notice.textContent = error.message;
  }
}

tabs?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-owner-tab]');
  if (!button) return;
  setOwnerTab(button.dataset.ownerTab);
});

form?.querySelectorAll('[data-guild-select]').forEach((select) => {
  select.addEventListener('change', () => {
    form.querySelectorAll(`[data-role-select][data-guild-field="${select.name}"]`).forEach((roleSelect) => {
      settings[roleSelect.name] = '';
      fillRoles(roleSelect);
    });
  });
});

document.querySelector('[data-owner-salary-add]')?.addEventListener('click', () => {
  syncSalaryConfigFromDom();
  salaryConfig.departments = Array.isArray(salaryConfig.departments) ? salaryConfig.departments : [];
  salaryConfig.departments.push({
    id: newId('dept'),
    name: '',
    guildId: '',
    roles: [{ id: newId('role'), roleId: '', label: '', amount: 500 }],
    enabled: true,
    payMode: 'flat',
  });
  renderSalaryRows();
});

salaryRows?.addEventListener('click', (event) => {
  const addRole = event.target.closest('[data-owner-salary-add-role]');
  if (addRole) {
    const row = addRole.closest('[data-owner-salary-row]');
    const guildId = row?.querySelector('[data-salary-guild]')?.value || '';
    const payroles = row?.querySelector('[data-owner-salary-payroles]');
    if (!payroles) return;
    payroles.insertAdjacentHTML('beforeend', salaryRoleTemplate({ id: newId('role'), amount: 500 }));
    const roleRow = payroles.querySelector('[data-owner-salary-payrole]:last-child');
    fillSalaryRoleSelect(roleRow.querySelector('[data-salary-role]'), guildId, '');
    return;
  }
  const removeRole = event.target.closest('[data-owner-salary-remove-role]');
  if (removeRole) {
    const row = removeRole.closest('[data-owner-salary-row]');
    const roleRow = removeRole.closest('[data-owner-salary-payrole]');
    const count = row?.querySelectorAll('[data-owner-salary-payrole]').length || 0;
    if (count <= 1) return;
    roleRow?.remove();
    return;
  }
  const removeDepartment = event.target.closest('[data-owner-salary-remove]');
  if (!removeDepartment) return;
  syncSalaryConfigFromDom();
  const row = removeDepartment.closest('[data-owner-salary-row]');
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
    const result = await response.json().catch(() => ({}));
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

salaryForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = salaryForm.querySelector('[data-owner-salary-save]');
  if (button) button.disabled = true;
  if (salarySaveStatus) salarySaveStatus.textContent = 'Saving salaries…';
  try {
    await saveSalaryConfig();
    if (salarySaveStatus) salarySaveStatus.textContent = 'Department salaries saved to the bot.';
  } catch (error) {
    if (salarySaveStatus) salarySaveStatus.textContent = error.message;
  } finally {
    if (button) button.disabled = false;
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
    saveStatus.textContent = 'Bot configuration saved.';
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadPanel();
