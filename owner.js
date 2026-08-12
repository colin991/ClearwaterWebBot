const notice = document.querySelector('[data-owner-notice]');
const form = document.querySelector('[data-owner-form]');
const saveStatus = document.querySelector('[data-save-status]');
let guilds = [];
let settings = {};

const option = (value, label) => new Option(label, value);
const selectedGuild = (id) => guilds.find((guild) => guild.id === id);

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

function fillChannels() {
  const allChannels = guilds.flatMap((guild) => guild.channels.map((channel) => ({ ...channel, guildName: guild.name })));
  form.querySelectorAll('[data-channel-select]').forEach((select) => {
    const first = select.options[0];
    select.replaceChildren(first, ...allChannels.map((channel) => option(channel.id, `${channel.guildName} · #${channel.name}`)));
    select.value = settings[select.name] || '';
  });
}

async function loadPanel() {
  try {
    const sessionResponse = await fetch('/api/auth/me');
    const session = await sessionResponse.json();
    if (!session.authenticated) {
      notice.innerHTML = 'Please <a href="/signin.html?next=/owner.html">sign in with Discord</a> to continue.';
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
    fillGuilds();
    form.querySelectorAll('[data-role-select]').forEach(fillRoles);
    fillChannels();
    for (const field of ['prefix', 'syncIntervalSeconds']) form.elements[field].value = settings[field] ?? form.elements[field].value;
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
    saveStatus.textContent = 'Configuration saved. The bot will use it on its next check.';
  } catch (error) {
    saveStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

loadPanel();
